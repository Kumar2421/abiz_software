"use client";

import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/components/ui/modern-payment-form";
import { api, type Plan } from "@/lib/api";

/**
 * Public price list. No account needed to read it.
 *
 * A payment gateway's review checks that the prices charged are published and
 * reachable without signing in, and a customer deciding whether to sign up
 * should not have to sign up first to see what it costs.
 *
 * The prices below are rendered immediately and then replaced by whatever the
 * API reports. Waiting on the fetch would show an empty page to anything that
 * does not run JavaScript — including some reviewers' tooling — while relying
 * on the constants alone would let the page drift from what is actually
 * charged. These must be kept in step with the `plans` table.
 */
const FALLBACK: Plan[] = [
  {
    code: "monthly",
    name: "Abiz Monthly",
    amountPaise: 199900,
    currency: "INR",
    periodDays: 30,
  },
  {
    code: "lifetime",
    name: "Abiz Lifetime",
    amountPaise: 1499900,
    currency: "INR",
    periodDays: null,
  },
];

const INCLUDED = [
  "Unlimited WhatsApp conversations",
  "Automatic welcome message",
  "Contacts and full chat history",
  "Photos, documents and voice notes",
  "Connect your own WhatsApp Business number",
];

function term(plan: Plan): string {
  if (!plan.periodDays) return "one-time payment · lifetime access";
  return plan.periodDays === 30
    ? "for 30 days · renew when it ends"
    : `for ${plan.periodDays} days · renew when it ends`;
}

export default function PricingPage() {
  const [plans, setPlans] = React.useState<Plan[]>(FALLBACK);

  React.useEffect(() => {
    let cancelled = false;
    api
      .publicPlans()
      .then(({ plans: live }) => {
        if (!cancelled && live.length) setPlans(live);
      })
      // The static prices are already on screen; a failed refresh changes
      // nothing the visitor can see.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-svh flex-col bg-shell">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <BrandLogo size={28} />
          <span className="font-semibold">Abiz</span>
        </Link>
        <Button asChild size="sm" variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">Pricing</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            One WhatsApp inbox for your business. Prices include GST where
            applicable. Payment is taken securely by our payment provider.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {plans.map((plan) => (
            <Card key={plan.code}>
              <CardContent className="space-y-5 p-6">
                <div>
                  <p className="text-sm text-muted-foreground">{plan.name}</p>
                  <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
                    {formatMoney(plan.amountPaise, plan.currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {term(plan)}
                  </p>
                </div>

                <ul className="space-y-2">
                  {INCLUDED.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-ok" />
                      {item}
                    </li>
                  ))}
                </ul>

                <Button asChild className="w-full">
                  <Link href="/login">Get started</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8 space-y-2 text-center text-xs text-muted-foreground">
          {/* Stated plainly because nothing auto-renews: these are one-off
              charges, not a mandate, and the copy must not imply otherwise. */}
          <p>
            Nothing is charged automatically. A monthly plan simply ends, and
            you choose whether to pay again.
          </p>
          <p>
            Messages are delivered through WhatsApp. Meta may charge you
            separately for conversations on your own WhatsApp Business account.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
