"use client";

import * as React from "react";
import {
  Building2,
  CreditCard,
  Lock,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Plan summary and pay button.
 *
 * Card and UPI details are captured by Razorpay Checkout in its own hosted
 * modal — deliberately NOT by a form here. Collecting a raw card number or CVV
 * on our own page would put Abiz in PCI DSS SAQ D scope (annual audits,
 * quarterly scans) and Razorpay will not accept raw card data from a server
 * that is not certified. Handing off keeps us at SAQ A.
 */

export interface PaymentPlan {
  name: string;
  amountPaise: number;
  currency: string;
  /** null = one-time purchase with no expiry. */
  periodDays?: number | null;
}

export const formatMoney = (paise: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100);

const METHODS = [
  { icon: Smartphone, label: "UPI" },
  { icon: CreditCard, label: "Card" },
  { icon: Building2, label: "Netbanking" },
];

const INCLUDED = [
  "Unlimited WhatsApp conversations",
  "Automatic welcome message",
  "Contacts and chat history",
  "File and voice attachments",
];

export function ModernPaymentForm({
  plan,
  pending,
  disabled,
  disabledReason,
  onPay,
  className,
}: {
  plan: PaymentPlan;
  pending?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onPay: () => void;
  className?: string;
}) {
  const oneTime = !plan.periodDays;

  return (
    <div className={cn("flex items-center justify-center p-4", className)}>
      <Card className="w-full max-w-md rounded-2xl shadow-lg">
        <CardContent className="space-y-6 p-6">
          <div className="space-y-1 text-center">
            <p className="text-sm text-muted-foreground">{plan.name}</p>
            <p className="text-4xl font-semibold tracking-tight tabular-nums">
              {formatMoney(plan.amountPaise, plan.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {oneTime
                ? "One-time payment · lifetime access · no renewals"
                : `Billed every ${plan.periodDays} days`}
            </p>
          </div>

          <ul className="space-y-2">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm">
                <ShieldCheck className="size-4 shrink-0 text-ok" />
                {item}
              </li>
            ))}
          </ul>

          <Separator />

          <div>
            <p className="mb-3 text-center text-xs font-medium text-muted-foreground">
              Pay securely using
            </p>
            <div className="grid grid-cols-3 gap-3">
              {METHODS.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-xs"
                >
                  <Icon className="size-5 text-muted-foreground" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={onPay}
            disabled={pending || disabled}
          >
            {pending ? (
              "Opening secure checkout…"
            ) : (
              <>
                <Lock className="size-4" />
                Pay {formatMoney(plan.amountPaise, plan.currency)}
              </>
            )}
          </Button>

          {disabled && disabledReason ? (
            <p className="text-center text-xs text-destructive">
              {disabledReason}
            </p>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              Card details are entered on Razorpay&apos;s secure checkout and
              never reach Abiz servers.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ModernPaymentForm;
