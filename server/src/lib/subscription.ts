import type { NextFunction, Request, Response } from "express";

import {
  canSend,
  getSubscription,
  trialDays,
  type SubscriptionStatus,
} from "../services/billing.js";
import { ApiError } from "./http.js";

/**
 * Blocks actions that cost money or leave the platform once a subscription has
 * lapsed.
 *
 * The WhatsApp webhook itself is never gated — Meta delivers whether or not
 * the account is paid, and refusing to store the message would destroy a real
 * customer enquiry that cannot be recovered. Inbound is therefore always
 * written; what payment controls is whether the owner may *read* it. See
 * `inboxLocked`.
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

export interface InboxLock {
  /** True when message content must be withheld until the account is paid. */
  locked: boolean;
  status: SubscriptionStatus;
}

/**
 * Whether this account may read the messages it has received.
 *
 * Unpaid accounts keep receiving and storing inbound messages, but the content
 * is withheld until they pay — they are told how many are waiting instead.
 * Withholding happens on the server, never by hiding text in the browser,
 * which anyone could read back out of the network tab.
 */
export async function inboxLocked(user: {
  role: string;
  companyId: string;
}): Promise<InboxLock> {
  // Platform admins operate Abiz rather than subscribe to it.
  if (user.role === "admin") return { locked: false, status: "ACTIVE" };

  const subscription = await getSubscription(user.companyId);
  return {
    locked: !canSend(subscription.status),
    status: subscription.status,
  };
}
