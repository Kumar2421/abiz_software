"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";

/**
 * Two steps in one page:
 *
 *  1. No token in the URL -> ask for the account email and request a reset.
 *  2. Token present -> set the new password.
 *
 * The token stays mandatory on purpose. Letting someone set a new password
 * from an email address alone would mean anyone who knows a customer's email
 * could take over their WhatsApp inbox.
 */
export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <ResetPasswordView />
    </React.Suspense>
  );
}

const shell =
  "flex min-h-svh items-center justify-center bg-black px-4 text-white";
const card = "w-full max-w-100 rounded-xl border border-white/10 bg-neutral-950 p-8";
const field = "border-white/15 bg-black text-white";

function ResetPasswordView() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  if (!token) return <RequestStep prefill={params.get("email") ?? ""} />;
  return <SetPasswordStep token={token} router={router} />;
}

/* ---------------- Step 1: ask for the email ---------------- */

function RequestStep({ prefill }: { prefill: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email"));

    setPending(true);
    try {
      const result = await api.forgotPassword(email);
      setSent(true);

      // Development only: the API hands the link back because no mail provider
      // is configured, so the flow stays testable.
      if (result.devResetUrl) {
        const url = new URL(result.devResetUrl);
        router.push(`${url.pathname}${url.search}`);
        return;
      }
      toast.success(result.message);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not start the reset",
      );
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <div className={shell}>
        <div className={`${card} text-center`}>
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-white/10">
            <MailCheck className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-2 text-sm text-neutral-400">
            If that account exists, we have sent a link to reset your password.
            It expires in 30 minutes.
          </p>
          <Button asChild className="mt-5 w-full bg-neutral-100 text-black hover:bg-white">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className={card}>
        <h1 className="text-xl font-semibold tracking-tight">Reset password</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Enter the email address on your Abiz account and we will send a reset
          link.
        </p>

        <form onSubmit={submit} className="mt-5 grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="email" className="text-neutral-300">
              Email address
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@work-email.com"
              defaultValue={prefill}
              required
              className={field}
            />
          </div>

          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-neutral-100 text-black hover:bg-white"
          >
            {pending ? "Sending…" : "Send reset link"}
          </Button>

          <Link
            href="/login"
            className="text-center text-xs text-neutral-400 hover:text-white"
          >
            Back to sign in
          </Link>
        </form>
      </div>
    </div>
  );
}

/* ---------------- Step 2: set the new password ---------------- */

function SetPasswordStep({
  token,
  router,
}: {
  token: string;
  router: ReturnType<typeof useRouter>;
}) {
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword"));

    if (newPassword !== String(form.get("confirmPassword"))) {
      toast.error("Passwords do not match");
      return;
    }

    setPending(true);
    try {
      await api.resetPassword({ token, newPassword });
      setDone(true);
      toast.success("Password updated — sign in with your new password");
      setTimeout(() => router.push("/login"), 1200);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not reset password",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={shell}>
      <div className={card}>
        <h1 className="text-xl font-semibold tracking-tight">
          Choose a new password
        </h1>

        {done ? (
          <p className="mt-2 text-sm text-neutral-400">
            Password updated. Redirecting to sign in…
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="newPassword" className="text-neutral-300">
                New password
              </Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
                className={field}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="confirmPassword" className="text-neutral-300">
                Confirm password
              </Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
                className={field}
              />
            </div>

            <Button
              type="submit"
              disabled={pending}
              className="w-full bg-neutral-100 text-black hover:bg-white"
            >
              {pending ? "Updating…" : "Update password"}
            </Button>

            <Link
              href="/login"
              className="text-center text-xs text-neutral-400 hover:text-white"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
