"use client";

import * as React from "react";
import { MessageSquareMore, Send, Users } from "lucide-react";

import { StatusPill } from "@/components/app-shell/status-pill";
import { BrandLogo } from "@/components/brand-logo";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardSkeleton } from "@/components/skeletons";
import { api } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import type { DashboardStats, WhatsAppAccount } from "@/lib/types";

export default function DashboardPage() {
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [account, setAccount] = React.useState<WhatsAppAccount | null>(null);

  React.useEffect(() => {
    api
      .stats()
      .then((payload) => {
        setStats(payload.stats);
        setAccount(payload.whatsapp);
      })
      .catch(() => {
        setStats({
          contacts: 0,
          conversations: 0,
          messagesSent: 0,
          messagesReceived: 0,
        });
      });
  }, []);

  const tiles = [
    { label: "Contacts", value: stats?.contacts, icon: Users },
    {
      label: "Conversations",
      value: stats?.conversations,
      icon: MessageSquareMore,
    },
    { label: "Messages sent", value: stats?.messagesSent, icon: Send },
    {
      label: "Messages received",
      value: stats?.messagesReceived,
      icon: MessageSquareMore,
    },
  ];

  if (!stats) return <DashboardSkeleton />;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-card">
          <BrandLogo size={30} />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overview of your WhatsApp inbox.
          </p>
        </div>
      </header>

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-xs text-muted-foreground">Connected number</p>
            <p className="text-lg font-semibold">
              {account?.displayNumber
                ? formatPhone(account.displayNumber)
                : "Not connected"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Phone Number ID</p>
            <p className="font-mono text-sm">
              {account?.phoneNumberId || "—"}
            </p>
          </div>
          <StatusPill
            status={account?.status ?? "disconnected"}
            className="ml-auto"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{label}</p>
                <Icon className="size-4 text-muted-foreground" />
              </div>
              {value === undefined ? (
                <Skeleton className="mt-2 h-9 w-20" />
              ) : (
                <p className="mt-2 text-3xl font-semibold tabular-nums">
                  {value.toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
