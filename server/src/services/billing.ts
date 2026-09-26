import { getDb, query, queryOne } from "../db/index.js";
import { env, publicUrl } from "../env.js";
import { ApiError } from "../lib/http.js";
import {
  getGateway,
  razorpayCheckoutSignatureValid,
} from "./gateways/index.js";

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

/** Whether the gateway currently selected has its keys. */
export const paymentsConfigured = () => getGateway().configured();

const PLAN_COLUMNS = `id, code, name, amount_paise, currency, period_days`;

/**
 * The plan used when the caller names none — the oldest active row, which is
 * the lifetime plan. Kept for clients that predate plan selection.
 */
export async function activePlan(): Promise<PlanRow> {
  const plan = await queryOne<PlanRow>(
    `SELECT ${PLAN_COLUMNS} FROM plans WHERE active ORDER BY created_at LIMIT 1`,
  );
  if (!plan) throw new ApiError(500, "No plan is configured", "no_plan");
  return plan;
}

/** Everything on sale, cheapest first — the order the picker renders in. */
export async function listPlans(): Promise<PlanRow[]> {
  return query<PlanRow>(
    `SELECT ${PLAN_COLUMNS} FROM plans WHERE active
      ORDER BY amount_paise, created_at`,
  );
}

/**
 * Resolves the plan the customer chose. An unknown or withdrawn code is a 404
 * rather than a silent fall back to the default — charging for a plan the
 * customer did not pick is worse than an error.
 */
export async function resolvePlan(code?: string | null): Promise<PlanRow> {
  if (!code) return activePlan();

  const plan = await queryOne<PlanRow>(
    `SELECT ${PLAN_COLUMNS} FROM plans WHERE code = $1 AND active`,
    [code],
  );
  if (!plan) throw ApiError.notFound(`No plan is on sale with the code "${code}"`);
  return plan;
}

/** Shape a plan row for the API. */
export const planShape = (plan: PlanRow) => ({
  code: plan.code,
  name: plan.name,
  amountPaise: plan.amount_paise,
  currency: plan.currency,
  periodDays: plan.period_days,
});

/**
 * Creates the subscription row at registration.
 *
 * With TRIAL_DAYS=0 the trial ends the instant it starts, so `getSubscription`
 * settles the row to EXPIRED on the first read: the owner can see the
 * dashboard but cannot send until they pay.
 */
export async function startTrial(companyId: string) {
  await query(
    `INSERT INTO subscriptions (company_id, status, trial_ends_at)
     VALUES ($1, 'TRIAL', now() + ($2 || ' days')::interval)
     ON CONFLICT (company_id) DO NOTHING`,
    [companyId, String(env.TRIAL_DAYS)],
  );
}

/** Zero means the product is pay-upfront rather than try-before-you-buy. */
export const trialDays = () => env.TRIAL_DAYS;

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

  // Deliberately not filtered by `active`: a customer keeps the plan they
  // bought even after it is withdrawn from sale.
  const plan = row!.plan_id
    ? await queryOne<PlanRow>(
        `SELECT ${PLAN_COLUMNS} FROM plans WHERE id = $1`,
        [row!.plan_id],
      )
    : null;

  return {
    status: row!.status,
    trialEndsAt: row!.trial_ends_at,
    activatedAt: row!.activated_at,
    expiresAt: row!.expires_at,
    plan: plan ? planShape(plan) : null,
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
 * Decides whether checkout may be started, for one particular plan.
 *
 * A lifetime purchase can only be made once, so an already-ACTIVE account with
 * no expiry is always refused. Beyond that, ALLOW_EARLY_PAYMENT=false means a
 * customer must wait until their current trial or paid term has actually ended
 * before paying, rather than buying part-way through one.
 *
 * The one exception is buying lifetime while a monthly term is still running:
 * that is an upgrade, not a double charge, so it stays open. Without it a
 * monthly customer would have to let their account lapse before they could
 * buy the bigger plan.
 */
export function paymentWindow(
  subscription: {
    status: SubscriptionStatus;
    trialEndsAt: string | null;
    expiresAt: string | null;
  },
  /** The plan being bought. Omitted means "any plan" — the strictest answer. */
  plan?: Pick<PlanRow, "period_days"> | null,
): PaymentWindow {
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
  const buyingLifetime = plan ? plan.period_days === null : false;

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
    if (buyingLifetime) return { open: true };

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

/**
 * Creates an order with the active gateway and records it as pending.
 *
 * `planCode` comes from the customer's choice in the picker. The amount is
 * always read from the plans table here — never taken from the request — so a
 * tampered client cannot buy lifetime access at the monthly price.
 */
export async function createOrder(companyId: string, planCode?: string | null) {
  const gateway = getGateway();

  if (!gateway.configured()) {
    throw new ApiError(
      503,
      `Payments are not configured yet. Add the ${gateway.name} API keys.`,
      "payments_unconfigured",
    );
  }

  const plan = await resolvePlan(planCode);
  const subscription = await getSubscription(companyId);

  const gate = paymentWindow(subscription, plan);
  if (!gate.open) throw new ApiError(409, gate.reason!, "payment_not_due");

  const customer = await billingCustomer(companyId);

  const order = await gateway.createOrder({
    orderId: `abiz_${companyId.slice(0, 8)}_${Date.now()}`,
    amountPaise: plan.amount_paise,
    currency: plan.currency,
    customer,
    notifyUrl: `${publicUrl}/api/billing/webhook`,
    notes: { company_id: companyId, plan_code: plan.code },
  });

  await query(
    `INSERT INTO payments
       (company_id, plan_id, gateway, gateway_order_id, amount_paise, currency,
        status, raw)
     VALUES ($1, $2, $3, $4, $5, $6, 'created', $7)`,
    [
      companyId,
      plan.id,
      gateway.name,
      order.orderId,
      plan.amount_paise,
      plan.currency,
      JSON.stringify(order),
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
    orderId: order.orderId,
    amountPaise: plan.amount_paise,
    currency: plan.currency,
    // Only meaningful for Razorpay, and only sent when Razorpay made the
    // order. Sending it otherwise hands every signed-in browser the live
    // Razorpay key id for no reason, and would let a stale client open
    // Razorpay's checkout against another gateway's order id — which fails in
    // a far more confusing way than not finding the field at all.
    ...(order.checkout.gateway === "razorpay"
      ? { keyId: order.checkout.keyId }
      : {}),
    checkout: order.checkout,
    planName: plan.name,
    planCode: plan.code,
    periodDays: plan.period_days,
  };
}

/** The buyer, as the gateway wants to see them. */
async function billingCustomer(companyId: string) {
  const row = await queryOne<{
    company_name: string;
    phone: string | null;
    name: string;
    email: string;
  }>(
    `SELECT c.name AS company_name, c.phone, u.name, u.email
       FROM companies c
       JOIN users u ON u.company_id = c.id AND u.role = 'owner'
      WHERE c.id = $1
      ORDER BY u.created_at
      LIMIT 1`,
    [companyId],
  );

  return {
    id: companyId,
    name: row?.name ?? row?.company_name ?? "Customer",
    email: row?.email ?? "",
    phone: row?.phone ?? "",
  };
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
  if (!paymentsConfigured()) {
    throw new ApiError(503, "Payments are not configured", "payments_unconfigured");
  }

  if (!razorpayCheckoutSignatureValid(params)) {
    await query(
      `UPDATE payments SET status = 'failed', error = 'Signature mismatch',
              updated_at = now()
        WHERE gateway_order_id = $1 AND company_id = $2`,
      [params.orderId, params.companyId],
    );
    throw ApiError.badRequest("Payment signature is invalid");
  }

  // The order must belong to this company; otherwise one tenant could activate
  // itself with another tenant's payment.
  const payment = await queryOne<{ id: string }>(
    `SELECT id FROM payments WHERE gateway_order_id = $1 AND company_id = $2`,
    [params.orderId, params.companyId],
  );
  if (!payment) throw ApiError.notFound("Unknown order for this account");

  await markPaid(params.companyId, params.orderId, params.paymentId, "captured");
  return getSubscription(params.companyId);
}

/**
 * Confirms a payment by asking the gateway what happened.
 *
 * Used by gateways that hand the browser nothing to verify. It is strictly
 * safer than trusting a callback — the answer comes from the gateway over an
 * authenticated connection, so there is nothing for a tampered page to forge.
 */
export async function verifyByStatus(params: {
  companyId: string;
  orderId: string;
}) {
  if (!paymentsConfigured()) {
    throw new ApiError(503, "Payments are not configured", "payments_unconfigured");
  }

  // The order must belong to this company; otherwise one tenant could activate
  // itself with another tenant's payment.
  const payment = await queryOne<{ id: string }>(
    `SELECT id FROM payments WHERE gateway_order_id = $1 AND company_id = $2`,
    [params.orderId, params.companyId],
  );
  if (!payment) throw ApiError.notFound("Unknown order for this account");

  const status = await getGateway().fetchStatus(params.orderId);

  if (!status.paid) {
    // Not an error state worth keeping quiet about, but not a failure to shout
    // about either: closing the checkout window lands here.
    throw new ApiError(
      402,
      status.error ?? "That payment was not completed.",
      "payment_incomplete",
    );
  }

  await markPaid(
    params.companyId,
    params.orderId,
    status.paymentId,
    "captured",
    undefined,
    status.method,
  );
  return getSubscription(params.companyId);
}

/** Flips the payment and the subscription together, or neither. */
export async function markPaid(
  companyId: string,
  orderId: string,
  paymentId: string | null,
  status: "captured" | "authorized",
  raw?: unknown,
  /** "upi", "card", "netbanking" — the first thing asked in a dispute. */
  method?: string | null,
) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.query(
      `UPDATE payments
          SET gateway_payment_id = COALESCE($3, gateway_payment_id),
              status = $4,
              raw = COALESCE($5, raw),
              method = COALESCE($6, method),
              updated_at = now()
        -- $1 is the company, $2 the order: matching them the other way round
        -- compares a UUID column against an order id and throws.
        WHERE company_id = $1 AND gateway_order_id = $2`,
      [
        companyId,
        orderId,
        paymentId,
        status,
        raw === undefined ? null : JSON.stringify(raw),
        method ?? null,
      ],
    );

    if (status !== "captured") return;

    const [plan] = await tx.query<{ id: string; period_days: number | null }>(
      `SELECT p.id, p.period_days
         FROM payments pay JOIN plans p ON p.id = pay.plan_id
        WHERE pay.gateway_order_id = $1`,
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
      WHERE gateway_order_id = $1`,
    [orderId, reason, raw === undefined ? null : JSON.stringify(raw)],
  );
}

/**
 * Settles payments that were started but never resolved.
 *
 * Both confirmation paths can fail in ways nobody notices: the browser one if
 * the customer closes the tab before verification returns, the webhook if it
 * is misconfigured or the gateway gives up retrying. Either leaves a row at
 * `created` while the money has actually been taken — the worst failure this
 * system has, because the customer has paid and is still locked out, and
 * nothing anywhere says so.
 *
 * Asking the gateway directly settles it. `graceMinutes` keeps this away from
 * checkouts still in progress; a customer typing an OTP is not a stuck payment.
 */
export async function reconcilePendingPayments(options: {
  graceMinutes?: number;
  limit?: number;
} = {}) {
  const grace = options.graceMinutes ?? 10;
  const limit = options.limit ?? 50;

  const gateway = getGateway();

  // Without keys every lookup fails identically, which would report a wall of
  // errors that say nothing about the payments themselves.
  if (!gateway.configured()) {
    return { checked: 0, activated: 0, failed: 0, errors: 0, skipped: true };
  }

  const pending = await query<{
    company_id: string;
    gateway: string;
    gateway_order_id: string;
  }>(
    `SELECT company_id, gateway, gateway_order_id
       FROM payments
      WHERE status = 'created'
        AND created_at < now() - ($1 || ' minutes')::interval
        -- Abandoned checkouts never resolve, and asking about every one of
        -- them forever would grow without bound.
        AND created_at > now() - interval '7 days'
      ORDER BY created_at DESC
      LIMIT $2`,
    [String(grace), limit],
  );

  const result = { checked: 0, activated: 0, failed: 0, errors: 0, skipped: false };

  for (const row of pending) {
    // Only the gateway that took the order can answer for it.
    if (row.gateway !== gateway.name) continue;
    result.checked += 1;

    try {
      const status = await gateway.fetchStatus(row.gateway_order_id);

      if (status.paid) {
        await markPaid(
          row.company_id,
          row.gateway_order_id,
          status.paymentId,
          "captured",
          undefined,
          status.method,
        );
        result.activated += 1;
        console.warn(
          `[billing] reconciled a paid order neither path settled: ${row.gateway_order_id}`,
        );
      }
      // Anything not paid is left alone: an order can still be completed, and
      // marking it failed early would block a customer mid-payment.
    } catch (error) {
      // One unreachable order must not stop the rest being checked — but a
      // silent count tells nobody which order or why, and this is the last
      // line of defence for a payment that has already been taken.
      result.errors += 1;
      console.warn(
        `[billing] could not reconcile ${row.gateway_order_id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return result;
}

export async function paymentHistory(companyId: string) {
  return query(
    `SELECT gateway_order_id AS "orderId",
            gateway_payment_id AS "paymentId",
            amount_paise AS "amountPaise", currency, status, method, error,
            created_at AS "createdAt"
       FROM payments
      WHERE company_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [companyId],
  );
}
