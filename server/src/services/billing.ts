import { createHmac, timingSafeEqual } from "node:crypto";

import { getDb, query, queryOne } from "../db/index.js";
import { env } from "../env.js";
import { ApiError } from "../lib/http.js";

export type SubscriptionStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAYMENT_PENDING"
  | "PAST_DUE"
  | "EXPIRED"
  | "CANCELLED"
  | "SUSPENDED";

export interface PlanRow {
  id: string;
  code: string;
  name: string;
  amount_paise: number;
  currency: string;
  period_days: number | null;
}

interface SubscriptionRow {
  id: string;
  company_id: string;
  plan_id: string | null;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  activated_at: string | null;
  expires_at: string | null;
}

export const razorpayConfigured = () =>
  Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

export async function activePlan(): Promise<PlanRow> {
  const plan = await queryOne<PlanRow>(
    `SELECT id, code, name, amount_paise, currency, period_days
       FROM plans WHERE active ORDER BY created_at LIMIT 1`,
  );
  if (!plan) throw new ApiError(500, "No plan is configured", "no_plan");
  return plan;
}

/** Called at registration so every company starts on the free trial. */
export async function startTrial(companyId: string) {
  await query(
    `INSERT INTO subscriptions (company_id, status, trial_ends_at)
     VALUES ($1, 'TRIAL', now() + ($2 || ' days')::interval)
     ON CONFLICT (company_id) DO NOTHING`,
    [companyId, String(env.TRIAL_DAYS)],
  );
}

/**
 * Reads the stored row and settles any state that time alone decides — a trial
 * running out, or a periodic plan reaching its end date. Persisting it here
 * means the rest of the app can trust `status` without recomputing dates.
 */
export async function getSubscription(companyId: string) {
  let row = await queryOne<SubscriptionRow>(
    `SELECT id, company_id, plan_id, status, trial_ends_at, activated_at, expires_at
       FROM subscriptions WHERE company_id = $1`,
    [companyId],
  );

  if (!row) {
    await startTrial(companyId);
    row = await queryOne<SubscriptionRow>(
      `SELECT id, company_id, plan_id, status, trial_ends_at, activated_at, expires_at
         FROM subscriptions WHERE company_id = $1`,
      [companyId],
    );
  }

  const now = Date.now();
  const trialOver =
    row!.status === "TRIAL" &&
    row!.trial_ends_at !== null &&
    new Date(row!.trial_ends_at).getTime() <= now;

  const termOver =
    row!.status === "ACTIVE" &&
    row!.expires_at !== null &&
    new Date(row!.expires_at).getTime() <= now;

  if (trialOver || termOver) {
    await query(
      `UPDATE subscriptions SET status = 'EXPIRED', updated_at = now()
        WHERE id = $1`,
      [row!.id],
    );
    row!.status = "EXPIRED";
  }

  const plan = row!.plan_id
    ? await queryOne<PlanRow>(
        `SELECT id, code, name, amount_paise, currency, period_days
           FROM plans WHERE id = $1`,
        [row!.plan_id],
      )
    : null;

  return {
    status: row!.status,
    trialEndsAt: row!.trial_ends_at,
    activatedAt: row!.activated_at,
    expiresAt: row!.expires_at,
    plan: plan
      ? {
          code: plan.code,
          name: plan.name,
          amountPaise: plan.amount_paise,
          currency: plan.currency,
        }
      : null,
  };
}

/** TRIAL and ACTIVE may send; everything else is read-only. */
export function canSend(status: SubscriptionStatus): boolean {
  return status === "TRIAL" || status === "ACTIVE";
}

export interface PaymentWindow {
  open: boolean;
  /** Why it is closed, shown to the customer. */
  reason?: string;
  /** When it opens — the end of the current trial or paid term. */
  opensAt?: string | null;
}

const whenText = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Decides whether checkout may be started.
 *
 * A lifetime purchase can only be made once, so an already-ACTIVE account is
 * always refused. Beyond that, ALLOW_EARLY_PAYMENT=false means a customer must
 * wait until their current trial or paid term has actually ended before
 * paying, rather than buying part-way through one.
 */
export function paymentWindow(subscription: {
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  expiresAt: string | null;
}): PaymentWindow {
  // Lifetime plans never lapse, so paying again would just take money twice.
  if (subscription.status === "ACTIVE" && !subscription.expiresAt) {
    return { open: false, reason: "This account is already active." };
  }

  if (subscription.status === "CANCELLED" || subscription.status === "SUSPENDED") {
    return {
      open: false,
      reason: "This account is suspended. Contact support before paying.",
    };
  }

  if (env.ALLOW_EARLY_PAYMENT) return { open: true };

  const now = Date.now();

  if (
    subscription.status === "TRIAL" &&
    subscription.trialEndsAt &&
    new Date(subscription.trialEndsAt).getTime() > now
  ) {
    return {
      open: false,
      reason: `Your free trial runs until ${whenText(subscription.trialEndsAt)}. Payment opens when it ends.`,
      opensAt: subscription.trialEndsAt,
    };
  }

  if (
    subscription.status === "ACTIVE" &&
    subscription.expiresAt &&
    new Date(subscription.expiresAt).getTime() > now
  ) {
    return {
      open: false,
      reason: `Your current plan runs until ${whenText(subscription.expiresAt)}. Renewal opens when it ends.`,
      opensAt: subscription.expiresAt,
    };
  }

  return { open: true };
}

/* ------------------------------------------------------------------ */
/* Razorpay                                                            */
/* ------------------------------------------------------------------ */

const RAZORPAY_API = "https://api.razorpay.com/v1";

function authHeader(): string {
  const raw = `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

/** Creates a Razorpay order and records it as a pending payment. */
export async function createOrder(companyId: string) {
  if (!razorpayConfigured()) {
    throw new ApiError(
      503,
      "Payments are not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      "payments_unconfigured",
    );
  }

  const plan = await activePlan();
  const subscription = await getSubscription(companyId);

  const gate = paymentWindow(subscription);
  if (!gate.open) throw new ApiError(409, gate.reason!, "payment_not_due");

  const response = await fetch(`${RAZORPAY_API}/orders`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: plan.amount_paise,
      currency: plan.currency,
      // Lets Razorpay reject an accidental double-submit for the same company.
      receipt: `abiz_${companyId.slice(0, 8)}_${Date.now()}`,
      notes: { company_id: companyId, plan_code: plan.code },
    }),
  });

  const payload = (await response.json()) as {
    id?: string;
    amount?: number;
    currency?: string;
    error?: { description?: string };
  };

  if (!response.ok || !payload.id) {
    throw new ApiError(
      502,
      payload.error?.description ?? "Razorpay rejected the order",
      "gateway_error",
    );
  }

  await query(
    `INSERT INTO payments
       (company_id, plan_id, razorpay_order_id, amount_paise, currency, status, raw)
     VALUES ($1, $2, $3, $4, $5, 'created', $6)`,
    [
      companyId,
      plan.id,
      payload.id,
      plan.amount_paise,
      plan.currency,
      JSON.stringify(payload),
    ],
  );

  await query(
    `UPDATE subscriptions
        SET status = CASE WHEN status = 'ACTIVE' THEN status ELSE 'PAYMENT_PENDING' END,
            plan_id = $2, updated_at = now()
      WHERE company_id = $1`,
    [companyId, plan.id],
  );

  return {
    orderId: payload.id,
    amountPaise: plan.amount_paise,
    currency: plan.currency,
    keyId: env.RAZORPAY_KEY_ID!,
    planName: plan.name,
  };
}

/** Constant-time compare so a wrong signature leaks nothing through timing. */
function signatureMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verifies the browser callback: HMAC-SHA256 of "<order_id>|<payment_id>"
 * keyed with the Razorpay secret. Proves the values were not fabricated by
 * whoever controls the page.
 */
export async function verifyCheckout(params: {
  companyId: string;
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  if (!razorpayConfigured()) {
    throw new ApiError(503, "Payments are not configured", "payments_unconfigured");
  }

  const expected = createHmac("sha256", env.RAZORPAY_KEY_SECRET!)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");

  if (!signatureMatches(expected, params.signature)) {
    await query(
      `UPDATE payments SET status = 'failed', error = 'Signature mismatch',
              updated_at = now()
        WHERE razorpay_order_id = $1 AND company_id = $2`,
      [params.orderId, params.companyId],
    );
    throw ApiError.badRequest("Payment signature is invalid");
  }

  // The order must belong to this company; otherwise one tenant could activate
  // itself with another tenant's payment.
  const payment = await queryOne<{ id: string }>(
    `SELECT id FROM payments WHERE razorpay_order_id = $1 AND company_id = $2`,
    [params.orderId, params.companyId],
  );
  if (!payment) throw ApiError.notFound("Unknown order for this account");

  await markPaid(params.companyId, params.orderId, params.paymentId, "captured");
  return getSubscription(params.companyId);
}

/** Flips the payment and the subscription together, or neither. */
export async function markPaid(
  companyId: string,
  orderId: string,
  paymentId: string | null,
  status: "captured" | "authorized",
  raw?: unknown,
) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.query(
      `UPDATE payments
          SET razorpay_payment_id = COALESCE($3, razorpay_payment_id),
              status = $4,
              raw = COALESCE($5, raw),
              updated_at = now()
        WHERE razorpay_order_id = $1 AND company_id = $2`,
      [
        companyId,
        orderId,
        paymentId,
        status,
        raw === undefined ? null : JSON.stringify(raw),
      ],
    );

    if (status !== "captured") return;

    const [plan] = await tx.query<{ id: string; period_days: number | null }>(
      `SELECT p.id, p.period_days
         FROM payments pay JOIN plans p ON p.id = pay.plan_id
        WHERE pay.razorpay_order_id = $1`,
      [orderId],
    );

    await tx.query(
      `UPDATE subscriptions
          SET status = 'ACTIVE',
              plan_id = COALESCE($2, plan_id),
              activated_at = COALESCE(activated_at, now()),
              expires_at = CASE
                WHEN $3::int IS NULL THEN NULL
                ELSE now() + ($3 || ' days')::interval
              END,
              updated_at = now()
        WHERE company_id = $1`,
      [companyId, plan?.id ?? null, plan?.period_days ?? null],
    );
  });
}

export async function markFailed(
  orderId: string,
  reason: string,
  raw?: unknown,
) {
  await query(
    `UPDATE payments
        SET status = 'failed', error = $2, raw = COALESCE($3, raw),
            updated_at = now()
      WHERE razorpay_order_id = $1`,
    [orderId, reason, raw === undefined ? null : JSON.stringify(raw)],
  );
}

/** Razorpay signs the webhook body with the webhook secret, not the API key. */
export function webhookSignatureValid(rawBody: string, signature: string) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return signatureMatches(expected, signature);
}

export async function paymentHistory(companyId: string) {
  return query(
    `SELECT razorpay_order_id AS "orderId",
            razorpay_payment_id AS "paymentId",
            amount_paise AS "amountPaise", currency, status, method, error,
            created_at AS "createdAt"
       FROM payments
      WHERE company_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [companyId],
  );
}
