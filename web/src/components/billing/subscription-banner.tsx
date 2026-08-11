"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api, canSend, type Subscription } from "@/lib/api";
import { cn } from "@/lib/utils";

function hoursLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 3_600_000));
}

/**
 * Thin strip above the app shell. Silent while the account is paid, so it only
 * appears when the owner needs to act.
 */
export function SubscriptionBanner() {
  const [subscription, setSubscription] = React.useState<Subscription | null>(
    null,
  );

  const [billable, setBillable] = React.useState(true);
  const [trialDays, setTrialDays] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await api.billingStatus();
        if (cancelled) return;
        setSubscription(status.subscription);
        setBillable(status.billable);
        setTrialDays(status.trialDays);
      } catch {
        // Billing is not critical to rendering the app; stay quiet.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Platform admins are never nagged to pay.
  if (!billable) return null;
  if (!subscription || subscription.status === "ACTIVE") return null;

  const blocked = !canSend(subscription.status);
  const trialHours = subscription.trialEndsAt
    ? hoursLeft(subscription.trialEndsAt)
    : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b px-4 py-2 text-sm",
        blocked
          ? "border-destructive/40 bg-destructive/10"
          : "border-warn/40 bg-warn/10",
      )}
    >
      {blocked ? (
        <AlertTriangle className="size-4 shrink-0 text-destructive" />
      ) : (
        <Clock className="size-4 shrink-0" />
      )}

      <span className="min-w-0 flex-1">
        {blocked ? (
          <>
            <span className="font-medium">Sending is paused.</span>{" "}
            {trialDays > 0
              ? "Your trial has ended"
              : "Activate your account to start sending"}{" "}
            — incoming messages are still being received and saved.
          </>
        ) : (
          <>
            <span className="font-medium">Free trial</span> — about{" "}
            {trialHours} hour{trialHours === 1 ? "" : "s"} left.
          </>
        )}
      </span>

      <Button asChild size="sm" variant={blocked ? "default" : "outline"}>
        <Link href="/settings?tab=billing">
          {blocked ? "Activate account" : "Upgrade"}
        </Link>
      </Button>
    </div>
  );
}
