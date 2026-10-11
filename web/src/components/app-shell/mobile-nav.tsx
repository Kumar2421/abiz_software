"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, MessagesSquare, Settings, Shield, Users } from "lucide-react";

import { useSession } from "@/components/app-shell/auth-guard";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const BASE_ITEMS = [
  { href: "/inbox", key: "nav.inbox", icon: MessagesSquare },
  { href: "/contacts", key: "nav.contacts", icon: Users },
  { href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/settings", key: "nav.settings", icon: Settings },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useSession();
  const t = useT();

  // Give an open conversation the full viewport; the chat header provides
  // its own back action to return to the conversation list.
  if (pathname.startsWith("/inbox") && searchParams.has("conversation")) {
    return null;
  }

  const items =
    user.role === "admin"
      ? [...BASE_ITEMS, { href: "/admin", key: "nav.admin", icon: Shield }]
      : BASE_ITEMS;

  return (
    <nav
      aria-label="Primary navigation"
      className="shrink-0 border-t bg-card px-1 pt-1 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex min-h-14 max-w-lg items-stretch justify-around">
        {items.map(({ href, key, icon: Icon }) => {
          const active = pathname.startsWith(href);
          const label = t(key);

          return (
            <li key={href} className="flex min-w-0 flex-1">
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-md px-1 text-[10px] leading-none text-muted-foreground transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active && "font-medium text-primary",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span className="max-w-full truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
