"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Infinity as InfinityIcon,
  MessagesSquare,
  Receipt,
} from "lucide-react";

import { formatMoney } from "@/components/ui/modern-payment-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Subscription } from "@/lib/api";

/** Shown once a payment is confirmed by the server. */
export function PaymentSuccess({
  subscription,
  paymentId,
}: {
  subscription: Subscription;
  paymentId?: string;
}) {
  const tiles = [
    {
      icon: Receipt,
      label: "Amount paid",
      value: subscription.plan
        ? formatMoney(subscription.plan.amountPaise, subscription.plan.currency)
        : "—",
    },
    {
      icon: CheckCircle2,
      label: "Status",
      value: subscription.status === "ACTIVE" ? "Active" : subscription.status,
    },
    {
      icon: subscription.expiresAt ? CalendarCheck : InfinityIcon,
      label: subscription.expiresAt ? "Renews on" : "Validity",
      value: subscription.expiresAt
        ? new Date(subscription.expiresAt).toLocaleDateString(undefined, {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "Lifetime",
    },
    {
      icon: MessagesSquare,
      label: "Plan",
      value: subscription.plan?.name ?? "Abiz",
    },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-ok/10">
          <CheckCircle2 className="size-7 text-ok" />
        </div>
        <h2 className="text-xl font-semibold">Payment successful</h2>
        <p className="text-sm text-muted-foreground">
          Your Abiz account is active. Sending is unlocked.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{label}</p>
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-lg font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {paymentId && (
        <p className="text-center text-xs text-muted-foreground">
          Reference: <span className="font-mono">{paymentId}</span>
        </p>
      )}

      <div className="flex justify-center gap-2">
        <Button asChild>
          <Link href="/inbox">
            Go to inbox
            <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/settings">Settings</Link>
        </Button>
      </div>
    </div>
  );
}
