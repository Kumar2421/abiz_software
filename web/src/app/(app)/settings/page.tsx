"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/app-shell/status-pill";
import { CheckoutPanel } from "@/components/billing/checkout-panel";
import { formatMoney } from "@/components/ui/modern-payment-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  api,
  type PaymentRecord,
  type SettingsPayload,
} from "@/lib/api";
import { formatPhone } from "@/lib/format";

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="flex gap-2">
      <Input {...props} type={visible ? "text" : "password"} className="font-mono" />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide value" : "Reveal value"}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  );
}

function Field({
  id,
  name,
  label,
  defaultValue,
  placeholder,
  issue,
  hint,
  mono,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  issue?: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-invalid={Boolean(issue)}
        className={mono ? "font-mono" : undefined}
      />
      {issue ? (
        <p className="text-xs text-destructive">{issue}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function ConnectionNotice({
  whatsapp,
}: {
  whatsapp: SettingsPayload["whatsapp"];
}) {
  if (whatsapp.status === "connected") {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-ok/40 bg-ok/10 p-3 text-sm">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
        <div>
          <p className="font-medium">Verified with Meta</p>
          <p className="text-muted-foreground">
            {whatsapp.verifiedName ?? "This number"}
            {whatsapp.qualityRating
              ? ` · quality ${whatsapp.qualityRating.toLowerCase()}`
              : ""}
            {whatsapp.lastCheckedAt
              ? ` · checked ${new Date(whatsapp.lastCheckedAt).toLocaleString()}`
              : ""}
          </p>
        </div>
      </div>
    );
  }

  if (!whatsapp.lastError) return null;

  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div>
        <p className="font-medium">Not connected</p>
        <p className="text-muted-foreground">{whatsapp.lastError}</p>
      </div>
    </div>
  );
}

/** Plan, payment, and receipts. */
function BillingTab() {
  const [payments, setPayments] = React.useState<PaymentRecord[] | null>(null);

  const loadPayments = React.useCallback(async () => {
    try {
      const { payments: rows } = await api.payments();
      setPayments(rows);
    } catch {
      setPayments([]);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { payments: rows } = await api.payments();
        if (!cancelled) setPayments(rows);
      } catch {
        if (!cancelled) setPayments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <CheckoutPanel onActivated={loadPayments} />

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent>
          {payments === null ? (
            <Skeleton className="h-16 w-full" />
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Amount</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.orderId} className="border-b last:border-0">
                      <td className="py-2">
                        {new Date(payment.createdAt).toLocaleDateString(
                          undefined,
                          { day: "numeric", month: "short", year: "numeric" },
                        )}
                      </td>
                      <td className="py-2 tabular-nums">
                        {formatMoney(payment.amountPaise, payment.currency)}
                      </td>
                      <td className="py-2">
                        <Badge
                          variant={
                            payment.status === "captured"
                              ? "outline"
                              : payment.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {payment.status}
                        </Badge>
                      </td>
                      <td className="py-2 font-mono text-xs text-muted-foreground">
                        {payment.paymentId ?? payment.orderId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <React.Suspense fallback={null}>
      <SettingsView />
    </React.Suspense>
  );
}

function SettingsView() {
  const router = useRouter();
  // Deep link from the subscription banner: /settings?tab=billing
  const initialTab = useSearchParams().get("tab") ?? "whatsapp";
  const [data, setData] = React.useState<SettingsPayload | null>(null);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [issues, setIssues] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    api
      .settings()
      .then(setData)
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login");
          return;
        }
        toast.error("Could not load settings");
      });
  }, [router]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setSaving(key);
    try {
      await action();
      toast.success("Saved");
    } catch (error) {
      if (error instanceof ApiError && error.issues.length) {
        // Field-level messages render under their inputs, not in a toast.
        setIssues(
          Object.fromEntries(
            error.issues.map((issue) => [issue.path, issue.message]),
          ),
        );
        toast.error("Please fix the highlighted fields");
        return;
      }
      toast.error(
        error instanceof Error ? error.message : "Could not save",
      );
    } finally {
      setSaving(null);
    }
  };

  if (!data) {
    return (
      <div className="flex-1 space-y-4 p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full max-w-3xl" />
      </div>
    );
  }

  const resolve = (body: string) =>
    body
      .replaceAll("{{company_name}}", data.company.name)
      .replaceAll("{{phone}}", formatPhone(data.whatsapp.displayNumber))
      .replaceAll("{{address}}", data.company.address || "");

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <header className="mb-6 flex items-center gap-3">
        <h1 className="text-xl font-semibold">Settings</h1>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={async () => {
            await api.logout();
            router.replace("/login");
          }}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </header>

      <Tabs defaultValue={initialTab} className="max-w-3xl">
        <TabsList>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="welcome">Welcome message</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="billing">
          <BillingTab />
        </TabsContent>

        {/* ---------------- WhatsApp ---------------- */}
        <TabsContent value="whatsapp">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-3">
                Cloud API connection
                <StatusPill status={data.whatsapp.status} />
                {data.driver === "mock" && (
                  <span className="text-xs font-normal text-muted-foreground">
                    Demo mode — credentials are not checked against Meta
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ConnectionNotice whatsapp={data.whatsapp} />

              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const accessToken = String(form.get("accessToken") ?? "");
                  void run("whatsapp", async () => {
                    setIssues({});
                    const { connection } = await api.saveWhatsApp({
                      displayNumber: String(form.get("displayNumber") ?? ""),
                      phoneNumberId: String(form.get("phoneNumberId") ?? ""),
                      // Blank means "keep the stored token".
                      accessToken: accessToken || undefined,
                      verifyToken: String(form.get("verifyToken") ?? ""),
                    });
                    setData(await api.settings());
                    if (connection.status !== "connected") {
                      throw new Error(
                        connection.lastError ?? "Connection is not live yet",
                      );
                    }
                  });
                }}
              >
                <Field
                  id="wa-number"
                  name="displayNumber"
                  label="WhatsApp number"
                  defaultValue={data.whatsapp.displayNumber}
                  placeholder="+91 98765 43210"
                  issue={issues.displayNumber}
                />
                <Field
                  id="wa-phone-id"
                  name="phoneNumberId"
                  label="Phone Number ID"
                  defaultValue={data.whatsapp.phoneNumberId}
                  placeholder="109876543210987"
                  mono
                  issue={issues.phoneNumberId}
                  hint="The numeric ID from Meta Business Manager, not the phone number."
                />

                <div className="grid gap-1.5">
                  <Label htmlFor="wa-token">Access token</Label>
                  <PasswordInput
                    id="wa-token"
                    name="accessToken"
                    placeholder={
                      data.whatsapp.accessTokenHint ?? "Paste your token"
                    }
                    aria-invalid={Boolean(issues.accessToken)}
                  />
                  {issues.accessToken ? (
                    <p className="text-xs text-destructive">
                      {issues.accessToken}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Stored tokens are never sent back to the browser. Leave
                      blank to keep the current one.
                    </p>
                  )}
                </div>

                <Field
                  id="wa-verify"
                  name="verifyToken"
                  label="Webhook verify token"
                  defaultValue={data.whatsapp.verifyToken}
                  placeholder="a secret you choose"
                  mono
                  issue={issues.verifyToken}
                />

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={saving === "whatsapp"}>
                    {saving === "whatsapp" ? "Checking…" : "Save and verify"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving === "test"}
                    onClick={() =>
                      run("test", async () => {
                        const { connection } = await api.testWhatsApp();
                        setData(await api.settings());
                        if (connection.status !== "connected") {
                          throw new Error(
                            connection.lastError ?? "Connection is not live",
                          );
                        }
                      })
                    }
                  >
                    <RefreshCw className="size-4" />
                    Test connection
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Welcome ---------------- */}
        <TabsContent value="welcome">
          <Card>
            <CardHeader>
              <CardTitle>Automatic welcome message</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex items-center gap-3">
                <Switch
                  id="welcome-enabled"
                  checked={data.welcome.enabled}
                  onCheckedChange={(enabled) =>
                    setData({ ...data, welcome: { ...data.welcome, enabled } })
                  }
                />
                <Label htmlFor="welcome-enabled">
                  Send automatically on a customer&apos;s first message
                </Label>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="welcome-body">Message</Label>
                <Textarea
                  id="welcome-body"
                  value={data.welcome.body}
                  onChange={(event) =>
                    setData({
                      ...data,
                      welcome: { ...data.welcome, body: event.target.value },
                    })
                  }
                  rows={6}
                  disabled={!data.welcome.enabled}
                />
                <p className="text-xs text-muted-foreground">
                  Placeholders: <code>{"{{company_name}}"}</code>{" "}
                  <code>{"{{phone}}"}</code> <code>{"{{address}}"}</code>
                </p>
              </div>

              <div className="rounded-lg border bg-shell p-4">
                <p className="mb-2 text-xs text-muted-foreground">Preview</p>
                <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-bubble-in px-3 py-2 text-sm whitespace-pre-wrap">
                  {resolve(data.welcome.body)}
                </div>
              </div>

              <Button
                className="w-fit"
                disabled={saving === "welcome"}
                onClick={() =>
                  run("welcome", () =>
                    api.saveWelcome({
                      enabled: data.welcome.enabled,
                      body: data.welcome.body,
                    }),
                  )
                }
              >
                Save message
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Profile ---------------- */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile and company</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="profile-name">Your name</Label>
                <Input
                  id="profile-name"
                  value={data.profile.name}
                  onChange={(event) =>
                    setData({
                      ...data,
                      profile: { ...data.profile, name: event.target.value },
                    })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="profile-email">Email</Label>
                <Input id="profile-email" value={data.profile.email} disabled />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="company-name">Company name</Label>
                <Input
                  id="company-name"
                  value={data.company.name}
                  onChange={(event) =>
                    setData({
                      ...data,
                      company: { ...data.company, name: event.target.value },
                    })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="company-address">Address</Label>
                <Input
                  id="company-address"
                  value={data.company.address}
                  onChange={(event) =>
                    setData({
                      ...data,
                      company: { ...data.company, address: event.target.value },
                    })
                  }
                />
              </div>

              <Button
                className="w-fit"
                disabled={saving === "profile"}
                onClick={() =>
                  run("profile", async () => {
                    await api.saveProfile({ name: data.profile.name });
                    await api.saveCompany({
                      name: data.company.name,
                      address: data.company.address || undefined,
                    });
                  })
                }
              >
                Save
              </Button>

              <form
                className="grid gap-3 border-t pt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void run("password", () =>
                    api.changePassword({
                      currentPassword: String(form.get("currentPassword")),
                      newPassword: String(form.get("newPassword")),
                    }),
                  );
                  event.currentTarget.reset();
                }}
              >
                <p className="text-sm font-medium">Change password</p>
                <div className="grid gap-1.5">
                  <Label htmlFor="current-password">Current password</Label>
                  <Input
                    id="current-password"
                    name="currentPassword"
                    type="password"
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    name="newPassword"
                    type="password"
                    minLength={8}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  className="w-fit"
                  disabled={saving === "password"}
                >
                  Update password
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
