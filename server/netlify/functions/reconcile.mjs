import { ready } from "../../dist/app.js";
import { reconcilePendingPayments } from "../../dist/services/billing.js";
import { cleanupStalePendingStatuses } from "../../dist/services/messaging.js";

/**
 * Two unrelated pieces of periodic housekeeping, every 15 minutes.
 *
 * Payments — settles payments that were taken but never confirmed. Both
 * confirmation paths can fail without anyone noticing: the browser one if
 * the customer closes the tab before verification returns, the webhook if it
 * is misconfigured or the gateway stops retrying. Either leaves a payment at
 * `created` after the money has moved — the customer has paid and is still
 * locked out, and nothing records it. This asks the gateway directly.
 *
 * Message statuses — drops buffered delivery/read events old enough that
 * they will never be claimed (see `applyStatusUpdate` in messaging.ts for why
 * they exist at all). Pure housekeeping, not customer-facing, so it is fine
 * alongside a payments job.
 *
 * Both call their service in-process rather than hitting /api/automation/cron.
 * That endpoint needs a CRON_SECRET, and calling your own public URL from
 * inside a function adds a network hop, a cold start, and a shared secret for
 * no benefit. The reminder scheduler (`runDueMessages`) sends real WhatsApp
 * messages and is deliberately not started as a side effect of either job.
 *
 * Netlify runs scheduled functions on the published production deploy only,
 * and cuts them off at 30 seconds — hence the small payments batch.
 */
export default async () => {
  await ready();

  const payments = await reconcilePendingPayments({ limit: 25 });
  const statuses = await cleanupStalePendingStatuses();

  // The log line is the only evidence this ran at all, and a run that found
  // nothing is exactly what a healthy system looks like — so it is written
  // every time, not only when something was rescued.
  console.log(`[reconcile] payments=${JSON.stringify(payments)} statuses=${JSON.stringify(statuses)}`);

  return new Response(JSON.stringify({ payments, statuses }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const config = { schedule: "*/15 * * * *" };
