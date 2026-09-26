"use client";

import * as React from "react";

/**
 * Tells the rest of the app that the subscription just changed.
 *
 * Billing state is read independently by several components that never meet —
 * the banner above the shell, the inbox lock, the settings panel. Each fetches
 * it once on mount, so after a payment they keep showing what was true a
 * moment ago: the inbox stays "locked" and the banner still asks for money
 * that has already been paid.
 *
 * A window event rather than shared state or a context: the pieces are far
 * apart in the tree, and this is a notification, not something to store twice.
 */

const EVENT = "abiz:subscription";

// Bumped before the event is dispatched, never in a listener: subscribers read
// this as their snapshot, and a listener could run after theirs and leave them
// with the old value.
let counter = 0;

/** Call after a payment is confirmed by the server. */
export function announceSubscriptionChange(): void {
  counter += 1;
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Re-renders the caller whenever the subscription changes. The returned number
 * is meaningless on its own — use it as an effect dependency to refetch.
 */
export function useSubscriptionChanges(): number {
  return React.useSyncExternalStore(
    (onChange) => {
      window.addEventListener(EVENT, onChange);
      return () => window.removeEventListener(EVENT, onChange);
    },
    () => counter,
    // The server renders before any payment can have happened.
    () => 0,
  );
}
