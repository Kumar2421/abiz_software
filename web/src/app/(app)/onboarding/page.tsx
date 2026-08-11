"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { StatusPill } from "@/components/app-shell/status-pill";
import { CheckoutPanel } from "@/components/billing/checkout-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSkeleton } from "@/components/skeletons";
import { API_URL, ApiError, api, type SettingsPayload } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

// Payment comes first: the client's flow is choose plan, pay, then connect
// Meta/WABA. The step is skipped automatically once the account is active.
const STEPS = ["Activate", "Connect", "Verify webhook", "Welcome message"];

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

function OnboardField({
  id,
  name,
  label,
  issue,
  hint,
  ...props
}: React.ComponentProps<typeof Input> & {
  label: string;
  issue?: string;
  hint?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} aria-invalid={Boolean(issue)} {...props} />
      {issue ? (
        <p className="text-xs text-destructive">{issue}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [data, setData] = React.useState<SettingsPayload | null>(null);
  const [qr, setQr] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [issues, setIssues] = React.useState<Record<string, string>>({});
  const [trialActive, setTrialActive] = React.useState(false);

  // An account that already paid should not be asked to pay again.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { subscription, billable } = await api.billingStatus();
        if (cancelled) return;
        setTrialActive(subscription.status === "TRIAL");
        // Paid accounts, and platform admins who never pay, skip straight to
        // the WhatsApp connection step.
        if (!billable || subscription.status === "ACTIVE") setStep(1);
      } catch {
        // Billing is optional to render onboarding.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    api
      .settings()
      .then(setData)
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login");
        }
      });
  }, [router]);

  const digits = (data?.whatsapp.displayNumber ?? "").replace(/\D/g, "");
  const waLink = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent("Hi! I'd like to know more.")}`
    : "";

  React.useEffect(() => {
    if (step !== 2 || !waLink) return;
    QRCode.toDataURL(waLink, { width: 220, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [step, waLink]);

  if (!data) return <FormSkeleton />;

  const saveConnection = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setIssues({});
    try {
      const { connection } = await api.saveWhatsApp({
        displayNumber: String(form.get("displayNumber") ?? ""),
        phoneNumberId: String(form.get("phoneNumberId") ?? ""),
        accessToken: String(form.get("accessToken") ?? "") || undefined,
        verifyToken: String(form.get("verifyToken") ?? "") || undefined,
      });
      setData(await api.settings());

      if (connection.status === "connected") {
        toast.success(
          connection.verifiedName
            ? `Verified with Meta as ${connection.verifiedName}`
            : "Verified with Meta",
        );
      } else {
        // Saved, but Meta has not confirmed it. Say so instead of implying
        // the connection is live.
        toast.warning(connection.lastError ?? "Credentials saved, not verified");
      }
      setStep(2);
    } catch (error) {
      if (error instanceof ApiError && error.issues.length) {
        setIssues(
          Object.fromEntries(
            error.issues.map((issue) => [issue.path, issue.message]),
          ),
        );
        toast.error("Please fix the highlighted fields");
        return;
      }
      toast.error(
        error instanceof ApiError ? error.message : "Could not save connection",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold">Set up Abiz</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Activate your account, connect WhatsApp, and your inbox is live.
        </p>

        <ol className="mb-6 flex items-center gap-2">
          {STEPS.map((label, index) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  index <= step &&
                    "border-primary bg-primary text-primary-foreground",
                )}
              >
                {index < step ? <Check className="size-3" /> : index + 1}
              </span>
              <span
                className={cn(
                  "truncate text-xs",
                  index === step ? "font-medium" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {index < STEPS.length - 1 && (
                <span className="h-px flex-1 bg-border" />
              )}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Activate your account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CheckoutPanel onActivated={() => setStep(1)} />
              <div className="flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                  {trialActive
                    ? "Continue on the free trial"
                    : "Set up WhatsApp first — pay later"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Connect your WhatsApp Business Account</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={saveConnection}>
                <p className="text-sm text-muted-foreground">
                  Paste the credentials from Meta Business Manager. Meta
                  Embedded Signup can fill these automatically once your app is
                  approved.
                </p>

                <OnboardField
                  id="onb-number"
                  name="displayNumber"
                  label="WhatsApp number"
                  placeholder="+91 98765 43210"
                  defaultValue={data.whatsapp.displayNumber}
                  issue={issues.displayNumber}
                  required
                />
                <OnboardField
                  id="onb-phone-id"
                  name="phoneNumberId"
                  label="Phone Number ID"
                  placeholder="109876543210987"
                  defaultValue={data.whatsapp.phoneNumberId}
                  issue={issues.phoneNumberId}
                  hint="The numeric ID from Meta Business Manager, not the phone number."
                />
                <OnboardField
                  id="onb-token"
                  name="accessToken"
                  label="Access token"
                  type="password"
                  placeholder={data.whatsapp.accessTokenHint ?? "EAAG…"}
                  issue={issues.accessToken}
                />
                <OnboardField
                  id="onb-verify"
                  name="verifyToken"
                  label="Webhook verify token"
                  placeholder="at least 8 characters"
                  defaultValue={data.whatsapp.verifyToken}
                  issue={issues.verifyToken}
                />

                <Button type="submit" className="w-fit" disabled={saving}>
                  {saving ? "Saving…" : "Save and continue"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Verify webhook</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">Status</span>
                <StatusPill status={data.whatsapp.status} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const { connection } = await api.testWhatsApp();
                    setData(await api.settings());
                    toast[connection.status === "connected" ? "success" : "warning"](
                      connection.lastError ?? "Verified with Meta",
                    );
                  }}
                >
                  Re-check
                </Button>
              </div>

              {data.whatsapp.lastError && (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  {data.whatsapp.lastError}
                </p>
              )}

              <CopyField
                label="Callback URL"
                value={`${API_URL}/api/whatsapp/webhook`}
              />
              <CopyField
                label="Verify token"
                value={data.whatsapp.verifyToken || "Set one in step 1"}
              />
              <p className="text-xs text-muted-foreground">
                Paste both into Meta&apos;s webhook configuration. The status
                flips to Connected as soon as Meta calls back successfully.
              </p>

              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">Share your chat link</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Print this QR or share the link — scanning opens a WhatsApp
                  chat with your number.
                </p>
                {waLink ? (
                  <div className="flex flex-wrap items-center gap-4">
                    {qr ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qr}
                        alt="QR code linking to your WhatsApp chat"
                        className="size-40 rounded-lg border bg-white p-1"
                      />
                    ) : (
                      <div className="size-40 animate-pulse rounded-lg bg-accent" />
                    )}
                    <div className="min-w-0 flex-1">
                      <CopyField label="Chat link" value={waLink} />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Add your WhatsApp number in step 1 to generate the QR.
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={() => setStep(3)}>Continue</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Welcome message</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Textarea
                value={data.welcome.body}
                onChange={(event) =>
                  setData({
                    ...data,
                    welcome: { ...data.welcome, body: event.target.value },
                  })
                }
                rows={6}
              />
              <div className="rounded-lg border bg-shell p-4">
                <p className="mb-2 text-xs text-muted-foreground">Preview</p>
                <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-bubble-in px-3 py-2 text-sm whitespace-pre-wrap">
                  {data.welcome.body
                    .replaceAll("{{company_name}}", data.company.name)
                    .replaceAll(
                      "{{phone}}",
                      formatPhone(data.whatsapp.displayNumber),
                    )
                    .replaceAll("{{address}}", data.company.address || "")}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await api.saveWelcome({
                        enabled: true,
                        body: data.welcome.body,
                      });
                      toast.success("Setup complete");
                      router.push("/inbox");
                    } catch {
                      toast.error("Could not save the welcome message");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Finish setup
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
