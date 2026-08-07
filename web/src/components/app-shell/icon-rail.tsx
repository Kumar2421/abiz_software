"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessagesSquare,
  Settings,
  Shield,
  Users,
} from "lucide-react";

import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSession } from "@/components/app-shell/auth-guard";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/inbox", label: "Inbox", icon: MessagesSquare },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

const ADMIN_NAV = { href: "/admin", label: "Admin", icon: Shield };

export function IconRail() {
  const pathname = usePathname();
  const { user } = useSession();

  const nav = user.role === "admin" ? [...NAV, ADMIN_NAV] : NAV;

  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r bg-card py-3">
      <Link
        href="/inbox"
        className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
      >
        A
      </Link>

      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Tooltip key={href}>
            <TooltipTrigger asChild>
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  active && "bg-selected text-primary",
                )}
              >
                <Icon className="size-5" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/settings"
              aria-label="Settings"
              className={cn(
                "flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                pathname.startsWith("/settings") && "bg-selected text-primary",
              )}
            >
              <Settings className="size-5" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>

        <Avatar className="size-8">
          <AvatarFallback className="text-xs">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
      </div>
    </nav>
  );
}
