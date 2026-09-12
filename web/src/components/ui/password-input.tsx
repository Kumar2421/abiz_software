"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Password field with a reveal toggle.
 *
 * Typing blind is the main cause of failed sign-ins on phones, where the
 * on-screen keyboard covers the field and autocorrect cannot help. The toggle
 * stays keyboard reachable rather than being pulled out of the tab order — a
 * control that only a mouse can operate is no use to the people who most need
 * to check what they typed.
 *
 * `type` is derived, never passed in: the whole point is that this component
 * owns the masked/revealed state.
 */
export function PasswordInput({
  className,
  toggleClassName,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type"> & {
  /** The login card is hardcoded dark, so it overrides the icon colour. */
  toggleClassName?: string;
}) {
  const [revealed, setRevealed] = React.useState(false);
  const Icon = revealed ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        {...props}
        type={revealed ? "text" : "password"}
        // Room for the button so a long password does not run underneath it.
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setRevealed((shown) => !shown)}
        // Announced rather than shown: the icon alone is ambiguous about
        // which state it represents.
        aria-label={revealed ? "Hide password" : "Show password"}
        aria-pressed={revealed}
        className={cn(
          "absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          toggleClassName,
        )}
      >
        <Icon className="size-4" />
      </button>
    </div>
  );
}
