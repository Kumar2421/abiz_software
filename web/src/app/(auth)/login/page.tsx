"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { SiteFooter } from "@/components/site-footer";
import {
  ModernLoginSignup,
  type AuthFormValues,
  type AuthMode,
} from "@/components/ui/modern-login-signup";
import { ApiError, api } from "@/lib/api";

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginView />
    </React.Suspense>
  );
}

function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Set by AuthGuard when an expired session bounced someone off a page.
  const next = searchParams.get("next");

  const handleSubmit = async (mode: AuthMode, values: AuthFormValues) => {
    try {
      if (mode === "login") {
        const { user } = await api.login({
          email: values.email,
          password: values.password,
        });
        // Admins land on the admin console, everyone else on their own inbox.
        router.push(next ?? (user.role === "admin" ? "/admin" : "/inbox"));
      } else {
        await api.register({
          name: values.name ?? "",
          email: values.email,
          password: values.password,
          companyName: values.companyName,
        });
        toast.success("Account created");
        router.push("/onboarding");
      }
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not sign you in",
      );
    }
  };

  // The reset page asks for the email itself, so this only needs to send the
  // user there — prefilling what they already typed.
  const handleForgot = (email: string) => {
    const query = email.includes("@") ? `?email=${encodeURIComponent(email)}` : "";
    router.push(`/reset-password${query}`);
  };

  return (
    <div className="flex min-h-svh flex-col">
      <div className="flex-1">
        <ModernLoginSignup
          onSubmit={handleSubmit}
          onSocial={() => toast.info("Social sign-in is not enabled yet")}
          onForgotPassword={handleForgot}
        />
      </div>
      {/* Terms, privacy and refund policy have to be reachable from the page
          a customer signs up on, not only from inside the app. */}
      <SiteFooter />
    </div>
  );
}
