"use client";

import * as React from "react";

/**
 * Optional deterrent: blocks the context menu and the usual devtools
 * shortcuts.
 *
 * This is NOT a security control. Anyone can read the page source with
 * `curl`, open devtools from the browser menu, or disable JavaScript — none of
 * which this code can see. It only discourages casual copying, so nothing
 * secret may ever be placed in the frontend on the strength of it.
 *
 * Text fields and selected text are exempt on purpose: an agent still has to
 * copy a customer's phone number and paste replies, and breaking that would
 * cost far more than the deterrent is worth.
 */

const STORAGE_KEY = "abiz.contentGuard";

export function isContentGuardEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

export function setContentGuardEnabled(enabled: boolean) {
  window.localStorage.setItem(STORAGE_KEY, String(enabled));
  window.dispatchEvent(new Event("abiz:content-guard"));
}

/** Editable fields keep their native menu and shortcuts. */
function isEditable(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;
  const tag = element.tagName.toUpperCase();
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    element.isContentEditable
  );
}

export function ContentGuard() {
  // The setting lives in localStorage, outside React.
  const enabled = React.useSyncExternalStore(
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

  React.useEffect(() => {
    if (!enabled) return;

    const onContextMenu = (event: MouseEvent) => {
      if (isEditable(event.target)) return;
      // Right-clicking a selection is usually "copy this", which is allowed.
      if (window.getSelection()?.toString()) return;
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toUpperCase();
      const devtools =
        key === "F12" ||
        (event.ctrlKey && event.shiftKey && ["I", "J", "C"].includes(key)) ||
        (event.metaKey && event.altKey && ["I", "J", "C"].includes(key)) ||
        (event.ctrlKey && key === "U");

      if (devtools) event.preventDefault();
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled]);

  return null;
}
