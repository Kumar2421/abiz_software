"use client";

import { Archive, Inbox, MailOpen, Search } from "lucide-react";

import { StatusPill } from "@/components/app-shell/status-pill";
import { Input } from "@/components/ui/input";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InboxFolder, WhatsAppAccount } from "@/lib/types";

const FOLDERS: { key: InboxFolder; label: string; icon: typeof Inbox }[] = [
  { key: "all", label: "All", icon: Inbox },
  { key: "unread", label: "Unread", icon: MailOpen },
  { key: "archived", label: "Archived", icon: Archive },
];

export function FolderNav({
  account,
  active,
  counts,
  onSelect,
  query,
  onQueryChange,
}: {
  account: WhatsAppAccount;
  active: InboxFolder;
  counts: Record<InboxFolder, number>;
  onSelect: (folder: InboxFolder) => void;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-4 border-r bg-card p-3 md:flex">
      <div className="rounded-lg border p-3">
        <StatusPill status={account.status} className="border-0 px-0" />
        <p className="mt-1 text-sm font-medium">
          {account.displayNumber
            ? formatPhone(account.displayNumber)
            : "No number connected"}
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search"
          className="pl-8"
          aria-label="Search conversations"
        />
      </div>

      <div>
        <p className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Inbox
        </p>
        <ul className="space-y-0.5">
          {FOLDERS.map(({ key, label, icon: Icon }) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSelect(key)}
                aria-current={active === key ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                  active === key &&
                    "bg-selected font-medium text-primary hover:bg-selected",
                )}
              >
                <Icon className="size-4" />
                <span className="flex-1 text-left">{label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {counts[key]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
