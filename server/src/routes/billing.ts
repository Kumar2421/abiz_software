import { Router, type Request } from "express";
import { z } from "zod";

import { queryOne } from "../db/index.js";
import { requireAuth } from "../lib/auth.js";
import { asyncHandler, parseBody } from "../lib/http.js";
import {
  activePlan,
  createOrder,
  getSubscription,
  markFailed,
  markPaid,
  paymentHistory,
  paymentWindow,
  razorpayConfigured,
  verifyCheckout,
  webhookSignatureValid,
} from "../services/billing.js";

export const billingRouter = Router();

/* ------------------------------------------------------------------ */
/* Webhook — mounted before requireAuth: Razorpay has no session.      */
/* ------------------------------------------------------------------ */

/**
 * The signature covers the exact bytes Razorpay sent. `express.json()` stashes
 * them on `req.rawBody` (see app.ts) because re-serialising the parsed object
 * would not reproduce them byte for byte.
 */
billingRouter.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const signature = req.header("x-razorpay-signature") ?? "";
    const stashed = (req as Request & { rawBody?: Buffer }).rawBody;
    const rawBody = stashed ? stashed.toString("utf8") : JSON.stringify(req.body);

    if (!webhookSignatureValid(rawBody, signature)) {
      // 400, not 200: an unsigned call is not a Razorpay event at all.
      res.status(400).json({ error: "invalid_signature" });
      return;
    }

    // Acknowledge before doing the work — Razorpay retries on slow responses.
    res.json({ ok: true });

    const event = JSON.parse(rawBody) as {
      event?: string;
      payload?: {
        payment?: {
          entity?: {
            id?: string;
            order_id?: string;
            method?: string;
            error_description?: string;
          };
        };
      };
    };

    const entity = event.payload?.payment?.entity;
    if (!entity?.order_id) return;

    const row = await queryOne<{ company_id: string }>(
      `SELECT company_id FROM payments WHERE razorpay_order_id = $1`,
      [entity.order_id],
    );
    if (!row) return; // Not an order we created.

    switch (event.event) {
      case "payment.captured":
        await markPaid(
          row.company_id,
          entity.order_id,
          entity.id ?? null,
          "captured",
          event,
        );
        break;
      case "payment.authorized":
        await markPaid(
          row.company_id,
          entity.order_id,
          entity.id ?? null,
          "authorized",
          event,
        );
        break;
      case "payment.failed":
        await markFailed(
          entity.order_id,
          entity.error_description ?? "Payment failed",
          event,
        );
        break;
    }
  }),
);

/* ------------------------------------------------------------------ */
/* Everything below needs a session.                                   */
/* ------------------------------------------------------------------ */

billingRouter.use(requireAuth);

billingRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    const [subscription, plan] = await Promise.all([
      getSubscription(req.user!.companyId),
      activePlan(),
    ]);

    res.json({
      subscription,
      plan: {
        code: plan.code,
        name: plan.name,
        amountPaise: plan.amount_paise,
        currency: plan.currency,
        periodDays: plan.period_days,
      },
      configured: razorpayConfigured(),
      // Platform admins run Abiz rather than subscribe to it, so the UI hides
      // billing for them instead of asking the operator to pay.
      billable: req.user!.role !== "admin",
      // Lets the UI disable the pay button with a reason, instead of letting
      // the customer click through to a 409.
      paymentWindow: paymentWindow(subscription),
    });
  }),
);

billingRouter.post(
  "/order",
  asyncHandler(async (req, res) => {
    res.status(201).json(await createOrder(req.user!.companyId));
  }),
);

billingRouter.post(
  "/verify",
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        razorpay_order_id: z.string().min(4),
        razorpay_payment_id: z.string().min(4),
        razorpay_signature: z.string().min(16),
      }),
      req.body,
    );

    const subscription = await verifyCheckout({
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
