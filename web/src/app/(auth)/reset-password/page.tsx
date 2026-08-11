"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";

/**
 * One card, two steps.
 *
 *   1. Enter the account email.
 *   2. Once the account is found, the same card swaps to new password +
 *      confirm and completes the reset.
 *
 * The server decides how step 1 resolves. With PASSWORD_RESET_MODE=direct it
 * returns the reset token immediately, which is what makes this single-card
 * flow possible — and also means anyone who knows a registered address can
 * take the account over. Setting the mode to "link" emails the token instead
 * and this page falls back to asking for it from the URL.
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
const cardClass =
  "w-full max-w-100 rounded-xl border border-white/10 bg-neutral-950 p-8";
const fieldClass = "border-white/15 bg-black text-white";

function ResetPasswordView() {
  const router = useRouter();
  const params = useSearchParams();

  // A token in the URL means the emailed-link flow; skip straight to step 2.
  const [token, setToken] = React.useState(params.get("token") ?? "");
  const [email, setEmail] = React.useState(params.get("email") ?? "");
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [sentByEmail, setSentByEmail] = React.useState(false);

  /* ---------------- step 1: find the account ---------------- */

  const findAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    try {
      const result = await api.forgotPassword(email);

      if (result.resetToken) {
        setToken(result.resetToken);
        return;
      }

      if (result.exists === false) {
        toast.error(result.message ?? "No account uses that email address.");
        return;
      }

      // Emailed-link mode.
      setSentByEmail(true);
      toast.success(result.message ?? "Check your email for the reset link.");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not start the reset",
      );
    } finally {
      setPending(false);
    }
  };

  /* ---------------- step 2: set the new password ---------------- */

  const setPassword = async (event: React.FormEvent<HTMLFormElement>) => {
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
      toast.success("Password updated");
      setTimeout(() => router.push("/login"), 1200);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not reset password",
      );
    } finally {
      setPending(false);
    }
  };

  /* ---------------- render ---------------- */

  if (done) {
    return (
      <div className={shell}>
        <div className={`${cardClass} text-center`}>
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-ok/15">
            <CheckCircle2 className="size-6 text-ok" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Password updated
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Signing you back in… use your new password.
          </p>
        </div>
      </div>
    );
  }

  if (sentByEmail) {
    return (
      <div className={shell}>
        <div className={`${cardClass} text-center`}>
          <h1 className="text-xl font-semibold tracking-tight">
            Check your email
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            If that account exists, we have sent a reset link. It expires in 30
            minutes.
          </p>
          <Button
            asChild
            className="mt-5 w-full bg-neutral-100 text-black hover:bg-white"
          >
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className={cardClass}>
        <h1 className="text-xl font-semibold tracking-tight">Reset password</h1>
        <p className="mt-2 text-sm text-neutral-400">
          {token
            ? `Choose a new password${email ? ` for ${email}` : ""}.`
            : "Enter the email address on your Abiz account."}
        </p>

        {token ? (
          <form onSubmit={setPassword} className="mt-5 grid gap-3">
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
                autoFocus
                required
                className={fieldClass}
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
                className={fieldClass}
              />
            </div>

            <Button
              type="submit"
              disabled={pending}
              className="w-full bg-neutral-100 text-black hover:bg-white"
            >
              {pending ? "Updating…" : "Update password"}
            </Button>
          </form>
        ) : (
          <form onSubmit={findAccount} className="mt-5 grid gap-3">
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
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className={fieldClass}
              />
            </div>

            <Button
              type="submit"
              disabled={pending || !email.trim()}
              className="w-full bg-neutral-100 text-black hover:bg-white"
            >
              {pending ? "Checking…" : "Continue"}
            </Button>
          </form>
        )}

        <Link
          href="/login"
          className="mt-4 block text-center text-xs text-neutral-400 hover:text-white"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
