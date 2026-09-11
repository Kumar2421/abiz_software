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
import type { PlanOption } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Plan picker and pay button.
 *
 * Card and UPI details are captured by Razorpay Checkout in its own hosted
 * modal — deliberately NOT by a form here. Collecting a raw card number or CVV
 * on our own page would put Abiz in PCI DSS SAQ D scope (annual audits,
 * quarterly scans) and Razorpay will not accept raw card data from a server
 * that is not certified. Handing off keeps us at SAQ A.
 */

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

/**
 * How long the plan lasts, in the customer's words.
 *
 * Nothing here promises an automatic charge: there is no Razorpay mandate
 * behind the monthly plan, so the term simply ends and the customer chooses
 * whether to pay again.
 */
export function planTerm(periodDays: number | null): string {
  if (periodDays === null) return "One time · lifetime access";
  if (periodDays % 30 === 0) {
    const months = periodDays / 30;
    return months === 1 ? "Every month" : `Every ${months} months`;
  }
  return `Every ${periodDays} days`;
}

function planDetail(plan: PlanOption): string {
  return plan.periodDays === null
    ? "One-time payment · lifetime access · no renewals"
    : `Valid for ${plan.periodDays} days · nothing is charged automatically`;
}

function PlanTile({
  plan,
  selected,
  best,
  onSelect,
}: {
  plan: PlanOption;
  selected: boolean;
  best: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition",
        "hover:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        selected ? "border-primary bg-primary/5" : "border-border",
        !plan.availability.open && "opacity-60",
      )}
    >
      {best && (
        <span className="absolute -top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
          Best value
        </span>
      )}
      <span className="text-xs text-muted-foreground">{plan.name}</span>
      <span className="text-xl font-semibold tabular-nums">
        {formatMoney(plan.amountPaise, plan.currency)}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {planTerm(plan.periodDays)}
      </span>
    </button>
  );
}

export function ModernPaymentForm({
  plans,
  selectedCode,
  onSelect,
  pending,
  disabled,
  disabledReason,
  onPay,
  className,
}: {
  plans: PlanOption[];
  selectedCode: string;
  onSelect: (code: string) => void;
  pending?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onPay: () => void;
  className?: string;
}) {
  const selected = plans.find((plan) => plan.code === selectedCode) ?? plans[0];
  if (!selected) return null;

  // Only worth calling out when there is something to compare it against.
  const bestCode =
    plans.length > 1
      ? plans.find((plan) => plan.periodDays === null)?.code
      : undefined;

  return (
    <div className={cn("flex items-center justify-center p-4", className)}>
      <Card className="w-full max-w-md rounded-2xl shadow-lg">
        <CardContent className="space-y-6 p-6">
          {plans.length > 1 && (
            <div className="grid grid-cols-2 gap-3">
              {plans.map((plan) => (
                <PlanTile
                  key={plan.code}
                  plan={plan}
                  selected={plan.code === selected.code}
                  best={plan.code === bestCode}
                  onSelect={() => onSelect(plan.code)}
                />
              ))}
            </div>
          )}

          <div className="space-y-1 text-center">
            <p className="text-sm text-muted-foreground">{selected.name}</p>
            <p className="text-4xl font-semibold tracking-tight tabular-nums">
              {formatMoney(selected.amountPaise, selected.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {planDetail(selected)}
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
                Pay {formatMoney(selected.amountPaise, selected.currency)}
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
