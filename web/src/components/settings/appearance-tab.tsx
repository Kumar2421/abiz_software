"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, ShieldOff, Sun } from "lucide-react";

import {
  isContentGuardEnabled,
  setContentGuardEnabled,
} from "@/components/app-shell/content-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LANGUAGES, useLanguage, type LanguageCode } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "light", icon: Sun, key: "theme.light" },
  { value: "dark", icon: Moon, key: "theme.dark" },
  { value: "system", icon: Monitor, key: "theme.system" },
] as const;

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  // Both values live outside React (next-themes storage, localStorage) and are
  // unknown during server render. useSyncExternalStore reads them on the
  // client without a setState-in-effect.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const guard = React.useSyncExternalStore(
    (onChange) => {
      window.addEventListener("abiz:content-guard", onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener("abiz:content-guard", onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    () => isContentGuardEnabled(),
    () => false,
  );

  const current = theme ?? "system";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.theme")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {THEMES.map(({ value, icon: Icon, key }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={mounted && current === value}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors hover:bg-accent",
                  mounted && current === value && "border-primary bg-selected",
                )}
              >
                <Icon className="size-5" />
                {t(key)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("settings.themeHint")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.language")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {LANGUAGES.map((option) => (
              <button
                key={option.code}
                type="button"
                onClick={() => setLanguage(option.code as LanguageCode)}
                aria-pressed={language === option.code}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors hover:bg-accent",
                  language === option.code && "border-primary bg-selected",
                )}
              >
                <span className="font-medium">{option.native}</span>
                <span className="text-xs text-muted-foreground">
                  {option.label}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("settings.languageHint")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldOff className="size-4" />
            {t("settings.privacy")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <Switch
              id="content-guard"
              checked={guard}
              onCheckedChange={setContentGuardEnabled}
            />
            <div className="grid gap-1">
              <Label htmlFor="content-guard">
                Block right-click and developer shortcuts
              </Label>
              <p className="text-xs text-muted-foreground">
                Discourages casual copying of chat content. Text fields and
                selected text still work, so agents can copy phone numbers and
                paste replies.
              </p>
            </div>
          </div>

          <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs">
            <span className="font-medium">This is not a security feature.</span>{" "}
            Anyone can still read the page with browser menus, view-source, or a
            command-line tool. Never treat it as protection for sensitive data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
