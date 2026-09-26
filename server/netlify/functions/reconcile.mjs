import { ready } from "../../dist/app.js";
import { reconcilePendingPayments } from "../../dist/services/billing.js";

/**
 * Settles payments that were taken but never confirmed, every 15 minutes.
 *
 * Both confirmation paths can fail without anyone noticing: the browser one if
 * the customer closes the tab before verification returns, the webhook if it
 * is misconfigured or the gateway stops retrying. Either leaves a payment at
 * `created` after the money has moved — the customer has paid and is still
 * locked out, and nothing records it. This asks the gateway directly.
 *
 * It calls the service in-process rather than hitting /api/automation/cron.
 * That endpoint needs a CRON_SECRET, and calling your own public URL from
 * inside a function adds a network hop, a cold start, and a shared secret for
 * no benefit. Only payments are reconciled here: the reminder scheduler
 * (`runDueMessages`) sends real WhatsApp messages and is deliberately not
 * started as a side effect.
 *
 * Netlify runs scheduled functions on the published production deploy only,
 * and cuts them off at 30 seconds — hence the small batch.
 */
export default async () => {
  await ready();

  const result = await reconcilePendingPayments({ limit: 25 });

  // The log line is the only evidence this ran at all, and a run that found
  // nothing is exactly what a healthy system looks like — so it is written
  // every time, not only when something was rescued.
  console.log(`[reconcile] ${JSON.stringify(result)}`);

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
};

export const config = { schedule: "*/15 * * * *" };
