"use client";

import * as React from "react";
import { toast } from "sonner";

import { PaymentSuccess } from "@/components/billing/payment-success";
import { ModernPaymentForm } from "@/components/ui/modern-payment-form";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  api,
  type BillingStatus,
  type PlanOption,
  type Subscription,
} from "@/lib/api";

/** Razorpay injects itself onto window; only the bits we use are typed. */
interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

/**
 * An API that predates the plan picker answers with `plan` but no `plans`.
 * Treating that single plan as the only option keeps the panel working against
 * a function that has not been redeployed yet.
 */
function planOptions(billing: BillingStatus): PlanOption[] {
  if (billing.plans?.length) return billing.plans;
  return [{ ...billing.plan, availability: billing.paymentWindow }];
}

export function CheckoutPanel({
  onActivated,
}: {
  onActivated?: (subscription: Subscription) => void;
}) {
  const [billing, setBilling] = React.useState<BillingStatus | null>(null);
  const [planCode, setPlanCode] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [paid, setPaid] = React.useState<{
    subscription: Subscription;
    paymentId?: string;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await api.billingStatus();
        if (cancelled) return;
        setBilling(status);
        // Land on something the customer can actually buy: a monthly term that
        // is still running leaves only the lifetime upgrade open.
        const options = planOptions(status);
        const open = options.find((plan) => plan.availability.open);
        setPlanCode((open ?? options[0])?.code ?? null);
        if (status.billable && status.subscription.status === "ACTIVE") {
          setPaid({ subscription: status.subscription });
        }
      } catch {
        if (!cancelled) toast.error("Could not load billing details");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pay = async (code: string) => {
    setPending(true);
    try {
      const ready = await loadRazorpay();
      if (!ready || !window.Razorpay) {
        toast.error("Could not reach Razorpay checkout. Check your connection.");
        return;
      }

      const order = await api.createOrder(code);

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: "Abiz",
        description: order.planName,
        order_id: order.orderId,
        theme: { color: "#5B5BD6" },
        // The server re-derives the signature and is the only thing that can
        // mark the account active — this callback is never trusted on its own.
        handler: async (response) => {
          try {
            const { subscription } = await api.verifyPayment(response);
            setPaid({
              subscription,
              paymentId: response.razorpay_payment_id,
            });
            onActivated?.(subscription);
            toast.success("Payment confirmed");
          } catch (error) {
            toast.error(
              error instanceof ApiError
                ? error.message
                : "We could not verify that payment",
            );
          } finally {
            setPending(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPending(false);
            toast.info("Checkout closed — no payment was taken");
          },
        },
      });

      checkout.open();
      return; // pending clears in the handler or on dismiss
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not start checkout",
      );
      setPending(false);
    }
  };

  if (!billing) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-72 w-full max-w-md" />
      </div>
    );
  }

  if (!billing.billable) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        This is a platform administrator account. Abiz subscriptions apply to
        business accounts, not to the operator.
      </p>
    );
  }

  if (paid) {
    return (
      <PaymentSuccess
        subscription={paid.subscription}
        paymentId={paid.paymentId}
      />
    );
  }

  const plans = planOptions(billing);
  const selected = plans.find((plan) => plan.code === planCode) ?? plans[0];
  if (!selected) return null;

  // Closed payment window wins over the unconfigured message: it is the one
  // the customer can act on. The window is the selected plan's, not the
  // account's — one plan can be open while another is not.
  const blocked = !selected.availability.open || !billing.configured;
  const reason = !selected.availability.open
    ? selected.availability.reason
    : "Payments are not configured on the server yet — add the Razorpay keys to enable checkout.";

  return (
    <ModernPaymentForm
      plans={plans}
      selectedCode={selected.code}
      onSelect={setPlanCode}
      pending={pending}
      disabled={blocked}
      disabledReason={reason}
      onPay={() => pay(selected.code)}
    />
  );
}
