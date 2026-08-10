"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n";

const ORDER = ["light", "dark", "system"] as const;

/** Cycles light -> dark -> system. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useT();

  // The stored theme is unknown during server render, so the icon must not be
  // drawn until the client has hydrated or it flashes the wrong one.
  // useSyncExternalStore reports that without a setState-in-effect.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const current = (theme ?? "system") as (typeof ORDER)[number];
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!;

  const Icon = current === "dark" ? Moon : current === "light" ? Sun : Monitor;
  const label =
    current === "dark"
      ? t("theme.dark")
      : current === "light"
        ? t("theme.light")
        : t("theme.system");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${t("settings.theme")}: ${label}`}
          onClick={() => setTheme(next)}
        >
          {mounted ? <Icon className="size-5" /> : <span className="size-5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {t("settings.theme")}: {label}
      </TooltipContent>
    </Tooltip>
  );
}
