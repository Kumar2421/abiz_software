import { Router, type Request } from "express";
import { z } from "zod";

import { queryOne } from "../db/index.js";
import { requireAuth } from "../lib/auth.js";
import { asyncHandler, parseBody } from "../lib/http.js";
import {
  activePlan,
  createOrder,
  getSubscription,
  listPlans,
  markFailed,
  markPaid,
  paymentHistory,
  paymentWindow,
  planShape,
  paymentsConfigured,
  trialDays,
  verifyByStatus,
  verifyCheckout,
} from "../services/billing.js";
import {
  describeWebhookRejection,
  gatewayForWebhook,
} from "../services/gateways/index.js";

export const billingRouter = Router();

/* ------------------------------------------------------------------ */
/* Webhook — mounted before requireAuth: a gateway has no session.     */
/* ------------------------------------------------------------------ */

/**
 * The signature covers the exact bytes the gateway sent. `express.json()`
 * stashes them on `req.rawBody` (see app.ts) because re-serialising the parsed
 * object would not reproduce them byte for byte.
 */
billingRouter.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const stashed = (req as Request & { rawBody?: Buffer }).rawBody;
    const rawBody = stashed ? stashed.toString("utf8") : JSON.stringify(req.body);

    // Header names differ per gateway, so hand over all of them rather than
    // picking one here.
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers[name.toLowerCase()] = value;
    }

    // Whichever gateway signed this, not whichever one is currently selling.
    // Events for orders placed before a switch keep arriving for days.
    const gateway = gatewayForWebhook(rawBody, headers);

    if (!gateway) {
      // Gateways retry a 400 for hours, so a misconfiguration here is silent
      // and repeated. Say which of the three causes it is.
      console.warn(
        `[billing] webhook rejected — ${describeWebhookRejection(headers, rawBody)}`,
      );
      // 400, not 200: an unsigned call is not a gateway event at all.
      res.status(400).json({ error: "invalid_signature" });
      return;
    }

    // Acknowledge before doing the work — gateways retry on slow responses.
    res.json({ ok: true });

    const event = gateway.parseWebhook(rawBody);

    // A signed event we cannot read means the provider changed its payload
    // shape — the one failure here that is silent and expensive, since the
    // account never activates and nothing else records why. Gateways version
    // webhooks separately from the API, so this can start happening without
    // any deploy on our side.
    if (!event.orderId && event.outcome !== "ignored") {
      console.warn(
        `[billing] ${gateway.name} webhook verified but no order id could be read from it`,
      );
      return;
    }

    if (!event.orderId || event.outcome === "ignored") return;

    const row = await queryOne<{ company_id: string }>(
      `SELECT company_id FROM payments WHERE gateway_order_id = $1`,
      [event.orderId],
    );
    if (!row) return; // Not an order we created.

    const parsed: unknown = JSON.parse(rawBody);

    if (event.outcome === "failed") {
      await markFailed(event.orderId, event.error ?? "Payment failed", parsed);
      return;
    }

    await markPaid(
      row.company_id,
      event.orderId,
      event.paymentId,
      event.outcome,
      parsed,
    );
  }),
);

/* ------------------------------------------------------------------ */
/* Everything below needs a session.                                   */
/* ------------------------------------------------------------------ */

billingRouter.use(requireAuth);

billingRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    const [subscription, plan, plans] = await Promise.all([
      getSubscription(req.user!.companyId),
      activePlan(),
      listPlans(),
    ]);

    res.json({
      subscription,
      // The default plan, for the sake of clients that predate the picker.
      plan: planShape(plan),
      // Each plan carries its own window: a monthly term that is still running
      // blocks a renewal but not an upgrade to lifetime.
      plans: plans.map((row) => ({
        ...planShape(row),
        availability: paymentWindow(subscription, row),
      })),
      configured: paymentsConfigured(),
      // Platform admins run Abiz rather than subscribe to it, so the UI hides
      // billing for them instead of asking the operator to pay.
      billable: req.user!.role !== "admin",
      // Lets the UI disable the pay button with a reason, instead of letting
      // the customer click through to a 409.
      paymentWindow: paymentWindow(subscription),
      // 0 means pay upfront, so the UI must not mention a free trial.
      trialDays: trialDays(),
    });
  }),
);

billingRouter.post(
  "/order",
  asyncHandler(async (req, res) => {
    // Optional: an older client sends no body and gets the default plan.
    const input = parseBody(
      z.object({ planCode: z.string().trim().min(1).max(40).optional() }),
      req.body ?? {},
    );

    res
      .status(201)
      .json(await createOrder(req.user!.companyId, input.planCode));
  }),
);

billingRouter.post(
  "/verify",
  asyncHandler(async (req, res) => {
    // Two shapes, because the gateways confirm differently. Razorpay's
    // checkout hands the browser a signed receipt, so those wire names stay as
    // they are. Cashfree hands it nothing, so the client sends only the order
    // id and the server asks Cashfree directly.
    const input = parseBody(
      z.union([
        z.object({
          razorpay_order_id: z.string().min(4),
          razorpay_payment_id: z.string().min(4),
          razorpay_signature: z.string().min(16),
        }),
        z.object({ orderId: z.string().min(4).max(120) }),
      ]),
      req.body,
    );

    const subscription =
      "orderId" in input
        ? await verifyByStatus({
            companyId: req.user!.companyId,
            orderId: input.orderId,
          })
        : await verifyCheckout({
            companyId: req.user!.companyId,
            orderId: input.razorpay_order_id,
            paymentId: input.razorpay_payment_id,
            signature: input.razorpay_signature,
          });

    res.json({ subscription });
  }),
);

billingRouter.get(
  "/payments",
  asyncHandler(async (req, res) => {
    res.json({ payments: await paymentHistory(req.user!.companyId) });
  }),
);
