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
 * Razorpay, behind the shared gateway interface.
 *
 * Lifted verbatim out of services/billing.ts when a second gateway was added;
 * the request shapes and signature checks are unchanged, so live payments
 * behave exactly as before.
 */

const API = "https://api.razorpay.com/v1";

/** Constant-time compare so a wrong signature leaks nothing through timing. */
function signatureMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function authHeader(): string {
  const raw = `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

interface PaymentEntity {
  id?: string;
  order_id?: string;
  method?: string;
  status?: string;
  error_description?: string;
}

export const razorpayGateway: PaymentGateway = {
  name: "razorpay",

  configured() {
    return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  },

  async createOrder(params: CreateOrderParams): Promise<GatewayOrder> {
    const response = await fetch(`${API}/orders`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Razorpay works in paise, which is how amounts already travel.
        amount: params.amountPaise,
        currency: params.currency,
        // Lets Razorpay reject an accidental double-submit for the same company.
        receipt: params.orderId,
        notes: params.notes,
      }),
    });

    const payload = (await response.json()) as {
      id?: string;
      error?: { description?: string };
    };

    if (!response.ok || !payload.id) {
      throw new ApiError(
        502,
        payload.error?.description ?? "Razorpay rejected the order",
        "gateway_error",
      );
    }

    return {
      // Razorpay mints its own order id; ours only rides along as the receipt.
      orderId: payload.id,
      amountPaise: params.amountPaise,
      currency: params.currency,
      checkout: {
        gateway: "razorpay",
        keyId: env.RAZORPAY_KEY_ID!,
        orderId: payload.id,
      },
    };
  },

  async fetchStatus(orderId: string): Promise<GatewayStatus> {
    const response = await fetch(`${API}/orders/${orderId}/payments`, {
      headers: { Authorization: authHeader() },
    });

    const payload = (await response.json()) as {
      items?: PaymentEntity[];
      error?: { description?: string };
    };

    if (!response.ok) {
      throw new ApiError(
        502,
        payload.error?.description ?? "Razorpay would not report the order",
        "gateway_error",
      );
    }

    // An order can hold several attempts; a captured one settles it.
    const captured = payload.items?.find((item) => item.status === "captured");
    const latest = captured ?? payload.items?.[payload.items.length - 1];

    return {
      paid: Boolean(captured),
      paymentId: latest?.id ?? null,
      method: latest?.method ?? null,
      error: latest?.error_description ?? null,
    };
  },

  /** Razorpay signs the webhook body with the webhook secret, not the API key. */
  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
    const signature = headers["x-razorpay-signature"] ?? "";
    const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
    return signatureMatches(expected, signature);
  },

  parseWebhook(rawBody: string): WebhookEvent {
    const event = JSON.parse(rawBody) as {
      event?: string;
      payload?: { payment?: { entity?: PaymentEntity } };
    };

    const entity = event.payload?.payment?.entity;

    const outcome: WebhookEvent["outcome"] =
      event.event === "payment.captured"
        ? "captured"
        : event.event === "payment.authorized"
          ? "authorized"
          : event.event === "payment.failed"
            ? "failed"
            : "ignored";

    return {
      orderId: entity?.order_id ?? "",
      paymentId: entity?.id ?? null,
      method: entity?.method ?? null,
      outcome,
      error: entity?.error_description ?? null,
    };
  },
};

/**
 * Verifies the browser callback: HMAC-SHA256 of "<order_id>|<payment_id>"
 * keyed with the Razorpay secret. Proves the values were not fabricated by
 * whoever controls the page.
 *
 * Razorpay-only, so it sits outside the interface: Cashfree hands the browser
 * nothing to verify and is confirmed by `fetchStatus` instead.
 */
export function razorpayCheckoutSignatureValid(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const expected = createHmac("sha256", env.RAZORPAY_KEY_SECRET!)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");
  return signatureMatches(expected, params.signature);
}
