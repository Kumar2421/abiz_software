"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

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

  const handleForgot = async (email: string) => {
    try {
      const result = await api.forgotPassword(email);
      toast.success(result.message);

      // In development the API hands the link back so the flow is testable
      // without an email provider.
      if (result.devResetUrl) {
        const url = new URL(result.devResetUrl);
        router.push(`${url.pathname}${url.search}`);
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not start the reset",
      );
    }
  };

  return (
    <ModernLoginSignup
      onSubmit={handleSubmit}
      onSocial={() => toast.info("Social sign-in is not enabled yet")}
      onForgotPassword={handleForgot}
    />
  );
}
