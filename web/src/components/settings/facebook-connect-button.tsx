"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api, type SettingsPayload } from "@/lib/api";
import { useFacebookLogin } from "@/lib/facebook-embedded-signup";

/**
 * "Connect with Facebook" — Embedded Signup entry point.
 *
 * Sits above the manual Phone Number ID / access token form in Settings.
 * The manual form stays as-is: App Review (Meta-Setup-Guide.md Part 6)
 * needs test credentials a reviewer can sign in with, and it is the
 * fallback for anyone whose Facebook Login attempt fails.
 *
 * Reads config from NEXT_PUBLIC_META_APP_ID / NEXT_PUBLIC_META_CONFIG_ID —
 * public by design (this is the same app id already visible in the OAuth
 * dialog URL). The app *secret* never leaves the server; see
 * server/src/services/metaOAuth.ts.
 */
export function FacebookConnectButton({
  onConnected,
}: {
  onConnected: (data: SettingsPayload) => void;
}) {
  const [connecting, setConnecting] = React.useState(false);

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
  const configured = Boolean(appId && configId);

  const { connect } = useFacebookLogin({
    appId: appId ?? "",
    configId: configId ?? "",
  });

  const handleClick = async () => {
    setConnecting(true);
    try {
      const { state } = await api.metaAuthStart();
      const signup = await connect();
      const { webhookWarning } = await api.metaAuthCallback({
        code: signup.code,
        state,
        wabaId: signup.wabaId,
        phoneNumberId: signup.phoneNumberId,
        businessId: signup.businessId,
      });

      onConnected(await api.settings());

      if (webhookWarning) {
        toast.warning(
          `Connected, but message notifications need attention: ${webhookWarning}`,
        );
      } else {
        toast.success("WhatsApp connected");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect");
    } finally {
      setConnecting(false);
    }
  };

  if (!configured) {
    // Meta Developer App not created yet (Meta-Setup-Guide.md Part 3) — show
    // nothing rather than a button that can only fail. Manual entry below
    // still works.
    return null;
  }

  return (
    <div className="mb-4 rounded-lg border bg-shell p-4">
      <div className="mb-3 flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Connect with Facebook</p>
          <p className="text-xs text-muted-foreground">
            Log in with your business&apos;s Facebook account to connect
            WhatsApp automatically — no copying IDs or tokens by hand.
          </p>
        </div>
      </div>
      <Button
        type="button"
        onClick={handleClick}
        disabled={connecting}
        className="bg-[#1877F2] text-white hover:bg-[#1877F2]/90"
      >
        {connecting ? "Connecting…" : "Continue with Facebook"}
      </Button>
    </div>
  );
}
