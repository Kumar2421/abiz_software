"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

// Keep notification detection close to inbox refresh without introducing a
// realtime service. Background tabs may still be throttled by the browser.
const POLL_MS = 5_000;

/**
 * App-wide inbound-message watcher. This intentionally uses the existing
 * authenticated conversations API rather than introducing a realtime server
 * into the serverless deployment.
 */
export function IncomingMessageNotifications() {
  const router = useRouter();
  const previous = React.useRef<Map<string, { at: string; unread: number }>>(new Map());
  const initialized = React.useRef(false);
  const inFlight = React.useRef(false);
  const [permission, setPermission] = React.useState<NotificationPermission | "unsupported">(() =>
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );
  const [unreadCount, setUnreadCount] = React.useState(0);

  const enableNotifications = async () => {
    if (!( "Notification" in window)) {
      toast.error("This browser does not support desktop notifications");
      setPermission("unsupported");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      toast.success("Desktop notifications enabled");
    } else if (result === "denied") {
      toast.error("Notifications are blocked by your browser settings");
    }
  };

  React.useEffect(() => {
    let disposed = false;

    const poll = async () => {
      if (disposed || inFlight.current) return;
      inFlight.current = true;
      try {
        const result = await api.conversations({ folder: "all" });
        if (disposed || result.locked) return;

        const current = new Map<string, { at: string; unread: number }>();
        setUnreadCount(result.conversations.reduce((total, conversation) => total + conversation.unreadCount, 0));
        for (const conversation of result.conversations) {
          const at = conversation.lastMessageAt;
          current.set(conversation.id, { at, unread: conversation.unreadCount });
          const old = previous.current.get(conversation.id);
          const inboundIsNew = conversation.lastMessageDirection === "in" &&
            (!old || (at && at !== old.at && Date.parse(at) > Date.parse(old.at)));

          // The first response establishes a baseline, avoiding alerts for
          // old unread messages when a user opens Abiz.
          if (initialized.current && inboundIsNew) {
            const title = conversation.contact.name || conversation.contact.phone;
            const body = conversation.lastMessage || "New WhatsApp message";
            const openConversation = () => router.push(`/inbox?conversation=${encodeURIComponent(conversation.id)}`);

            toast(title, {
              description: body,
              duration: 8_000,
              action: { label: "Open inbox", onClick: openConversation },
            });

            if ("Notification" in window && Notification.permission === "granted" &&
                (document.visibilityState !== "visible" || !document.hasFocus())) {
              const notification = new Notification(`New message from ${title}`, {
                body,
                icon: "/logo.png",
                tag: `abiz-message-${conversation.id}`,
              });
              notification.onclick = () => {
                window.focus();
                openConversation();
                notification.close();
              };
            }
          }
        }
        previous.current = current;
        initialized.current = true;
      } catch {
        // Authentication transitions and transient network failures should not
        // spam users. The next interval retries automatically.
      } finally {
        inFlight.current = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="relative rounded-full shadow-md"
        onClick={() => router.push("/inbox?folder=unread")}
        aria-label={unreadCount > 0 ? `Inbox, ${unreadCount} unread messages` : "Open inbox"}
        title={unreadCount > 0 ? `${unreadCount} unread messages` : "Open inbox"}
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>
      {permission !== "unsupported" && permission !== "denied" && permission !== "granted" && (
        <Button type="button" size="sm" variant="outline" onClick={enableNotifications}>
          <BellRing className="mr-2 size-4" />
          Enable desktop notifications
        </Button>
      )}
    </div>
  );
}
