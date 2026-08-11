import type { NextFunction, Request, Response } from "express";

import { canSend, getSubscription, trialDays } from "../services/billing.js";
import { ApiError } from "./http.js";

/**
 * Blocks actions that cost money or leave the platform once a subscription has
 * lapsed. Reading stays open on purpose: the owner can still see the inbox,
 * contacts, and reminders, and the WhatsApp webhook is never gated — inbound
 * customer messages must keep being stored, or messages that arrive during a
 * lapse are lost for good.
 */
export async function requireActiveSubscription(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    // Platform admins operate Abiz; they are not customers of it, so billing
    // never gates them.
    if (req.user!.role === "admin") {
      next();
      return;
    }

    const subscription = await getSubscription(req.user!.companyId);
    if (!canSend(subscription.status)) {
      // With TRIAL_DAYS=0 the account was never on a trial, so saying one
      // "ended" would just confuse someone who has not paid yet.
      const expiredMessage =
        trialDays() > 0
          ? "Your free trial has ended. Complete payment to send messages again."
          : "Activate your account to start sending messages.";

      throw new ApiError(
        402,
        subscription.status === "EXPIRED"
          ? expiredMessage
          : `Sending is disabled while the account is ${subscription.status}.`,
        "subscription_required",
        { status: subscription.status },
      );
    }
    next();
  } catch (error) {
    next(error);
  }
}
