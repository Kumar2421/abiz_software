import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../../env.js";
import { ApiError } from "../../lib/http.js";
import type {
  CreateOrderParams,
  GatewayOrder,
  GatewayStatus,
  PaymentGateway,
  WebhookEvent,
} from "./types.js";

/**
 * Cashfree Payment Gateway, behind the shared gateway interface.
 *
 * Three things differ from Razorpay in ways that cost money if missed:
 *
 *  - Amounts are **rupees**, not paise. The conversion happens here so the
 *    rest of Abiz keeps working in paise.
 *  - The browser gets no signed receipt to verify. Razorpay hands back a
 *    signature; Cashfree does not, so the only trustworthy answer is asking
 *    Cashfree directly — see `fetchStatus`.
 *  - Sandbox and production are different hosts *and* different key pairs.
 */

const API_VERSION = "2023-08-01";

const base = () =>
  env.CASHFREE_MODE === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";

function headers(): Record<string, string> {
  return {
    "x-api-version": API_VERSION,
    "x-client-id": env.CASHFREE_APP_ID ?? "",
    "x-client-secret": env.CASHFREE_SECRET_KEY ?? "",
    "Content-Type": "application/json",
  };
}

interface CashfreeError {
  message?: string;
  code?: string;
  type?: string;
}

/** Cashfree returns `message` at the top level rather than nesting an error. */
function errorMessage(payload: CashfreeError, fallback: string): string {
  return payload.message ?? fallback;
}

interface PaymentEntity {
  cf_payment_id?: number | string;
  payment_status?: "SUCCESS" | "FAILED" | "PENDING" | "USER_DROPPED" | string;
  payment_amount?: number;
  /** An object keyed by instrument — { upi: {...} }, { card: {...} }. */
  payment_method?: Record<string, unknown> | string;
  payment_message?: string;
}

/**
 * `payment_method` arrives as an object keyed by instrument, but the payments
 * table stores a short label. Take the key.
 */
function methodLabel(method: PaymentEntity["payment_method"]): string | null {
  if (!method) return null;
  if (typeof method === "string") return method;
  return Object.keys(method)[0] ?? null;
}

/** Constant-time compare so a wrong signature leaks nothing through timing. */
function signatureMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const cashfreeGateway: PaymentGateway = {
  name: "cashfree",

  configured() {
    return Boolean(env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY);
  },

  async createOrder(params: CreateOrderParams): Promise<GatewayOrder> {
    // Cashfree rejects an order with no phone, and sends the payment
    // confirmation to it. Fail with something the owner can act on rather than
    // passing an empty string and getting a generic gateway error.
    if (!params.customer.phone) {
      throw new ApiError(
        409,
        "Add a billing phone number in Settings before paying — the payment confirmation is sent to it.",
        "billing_phone_required",
      );
    }

    const response = await fetch(`${base()}/orders`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        // Cashfree accepts our own id, so one id reconciles both sides.
        order_id: params.orderId,
        // Rupees, two decimals. Paise everywhere else in Abiz.
        order_amount: Number((params.amountPaise / 100).toFixed(2)),
        order_currency: params.currency,
        customer_details: {
          customer_id: params.customer.id,
          customer_name: params.customer.name,
          customer_email: params.customer.email,
          customer_phone: params.customer.phone,
        },
        order_meta: { notify_url: params.notifyUrl },
        order_note: params.notes.plan_code,
      }),
    });

    const payload = (await response.json()) as CashfreeError & {
      order_id?: string;
      payment_session_id?: string;
    };

    if (!response.ok || !payload.payment_session_id) {
      throw new ApiError(
        502,
        errorMessage(payload, "Cashfree rejected the order"),
        "gateway_error",
      );
    }

    return {
      orderId: payload.order_id ?? params.orderId,
      amountPaise: params.amountPaise,
      currency: params.currency,
      checkout: {
        gateway: "cashfree",
        paymentSessionId: payload.payment_session_id,
        mode: env.CASHFREE_MODE,
      },
    };
  },

  async fetchStatus(orderId: string): Promise<GatewayStatus> {
    const response = await fetch(`${base()}/orders/${orderId}/payments`, {
      headers: headers(),
    });

    const payload = (await response.json()) as PaymentEntity[] | CashfreeError;

    if (!response.ok) {
      throw new ApiError(
        502,
        errorMessage(payload as CashfreeError, "Cashfree would not report the order"),
        "gateway_error",
      );
    }

    // An order can carry several attempts; one SUCCESS settles it.
    const attempts = Array.isArray(payload) ? payload : [];
    const success = attempts.find((row) => row.payment_status === "SUCCESS");
    const latest = success ?? attempts[attempts.length - 1];

    return {
      paid: Boolean(success),
      paymentId: latest?.cf_payment_id ? String(latest.cf_payment_id) : null,
      method: methodLabel(latest?.payment_method),
      error: success ? null : (latest?.payment_message ?? null),
    };
  },

  /**
   * Signature is Base64(HMAC-SHA256(timestamp + rawBody, webhook secret)).
   *
   * The timestamp is prefixed to the body, and the body must be the exact
   * bytes received — re-serialising the parsed JSON will not reproduce them.
   */
  verifyWebhook(rawBody: string, headerMap: Record<string, string>): boolean {
    if (!env.CASHFREE_WEBHOOK_SECRET) return false;

    const signature = headerMap["x-webhook-signature"] ?? "";
    const timestamp = headerMap["x-webhook-timestamp"] ?? "";
    if (!signature || !timestamp) return false;

    const expected = createHmac("sha256", env.CASHFREE_WEBHOOK_SECRET)
      .update(timestamp + rawBody)
      .digest("base64");

    return signatureMatches(expected, signature);
  },

  parseWebhook(rawBody: string): WebhookEvent {
    const event = JSON.parse(rawBody) as {
      type?: string;
      data?: {
        order?: { order_id?: string };
        payment?: PaymentEntity;
        error_details?: { error_description?: string; error_reason?: string };
      };
    };

    const payment = event.data?.payment;

    // USER_DROPPED means the customer closed checkout without paying. Recorded
    // as failed so the order does not sit "created" forever, but it is not an
    // error worth alarming anyone about.
    const outcome: WebhookEvent["outcome"] =
      event.type === "PAYMENT_SUCCESS_WEBHOOK"
        ? "captured"
        : event.type === "PAYMENT_FAILED_WEBHOOK" ||
            event.type === "PAYMENT_USER_DROPPED_WEBHOOK"
          ? "failed"
          : "ignored";

    return {
      orderId: event.data?.order?.order_id ?? "",
      paymentId: payment?.cf_payment_id ? String(payment.cf_payment_id) : null,
      method: methodLabel(payment?.payment_method),
      outcome,
      // payment_message carries "ok" on success, which is not an error and
      // would read as one wherever this is stored or logged.
      error:
        outcome === "captured"
          ? null
          : (event.data?.error_details?.error_description ??
            payment?.payment_message ??
            null),
    };
  },
};
