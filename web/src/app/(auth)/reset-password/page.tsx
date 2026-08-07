"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <ResetPasswordView />
    </React.Suspense>
  );
}

function ResetPasswordView() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
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
    <div className="flex min-h-svh items-center justify-center bg-black px-4 text-white">
      <div className="w-full max-w-100 rounded-xl border border-white/10 bg-neutral-950 p-8">
        <h1 className="text-xl font-semibold tracking-tight">
          Choose a new password
        </h1>

        {!token ? (
          <>
            <p className="mt-2 text-sm text-neutral-400">
              This link is missing its reset token. Request a new one from the
              sign-in page.
            </p>
            <Button asChild className="mt-4 w-full">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </>
        ) : done ? (
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
                className="border-white/15 bg-black text-white"
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
                className="border-white/15 bg-black text-white"
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
