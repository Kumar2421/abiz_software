"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { ChatEmptyState, ChatPane } from "@/components/inbox/chat-pane";
import { ContactDrawer } from "@/components/inbox/contact-drawer";
import { ConversationList } from "@/components/inbox/conversation-list";
import { FolderNav } from "@/components/inbox/folder-nav";
import { NewChatDialog } from "@/components/inbox/new-chat-dialog";
import { ApiError, api } from "@/lib/api";
import type {
  Contact,
  Conversation,
  InboxFolder,
  Message,
  WhatsAppAccount,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const EMPTY_ACCOUNT: WhatsAppAccount = {
  displayNumber: "",
  phoneNumberId: "",
  status: "disconnected",
};

/**
 * How often the inbox re-checks for new messages while the tab is visible.
 *
 * There is no websocket: the API runs as a serverless function, so every poll
 * is a billable invocation. 30s keeps a single dashboard under ~30k calls a
 * month. Anything the user does — sending, opening a chat, returning to the
 * tab — refreshes immediately, so this interval only covers idle waiting.
 */
const POLL_MS = 30_000;

export default function InboxPage() {
  return (
    <React.Suspense fallback={null}>
      <InboxView />
    </React.Suspense>
  );
}

function InboxView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The open conversation lives in the URL, so Contacts can deep-link into a
  // chat and a refresh keeps you where you were.
  const selectedId = searchParams.get("conversation");
  const setSelectedId = React.useCallback(
    (id: string | null) => {
      router.replace(id ? `/inbox?conversation=${id}` : "/inbox", {
        scroll: false,
      });
    },
    [router],
  );

  const [account, setAccount] = React.useState<WhatsAppAccount>(EMPTY_ACCOUNT);
  const [demoMode, setDemoMode] = React.useState(false);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [loadedMessages, setMessages] = React.useState<Message[]>([]);
  const [windowOpen, setWindowOpen] = React.useState(true);
  const [folder, setFolder] = React.useState<InboxFolder>("all");
  const [query, setQuery] = React.useState("");
  const [contactOpen, setContactOpen] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  // Bumping this re-runs both fetch effects.
  const [refreshKey, setRefreshKey] = React.useState(0);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const messages = selectedId ? loadedMessages : [];

  const refresh = React.useCallback(() => setRefreshKey((n) => n + 1), []);

  /* ---------------- conversation list ------------------------------------ */

  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        try {
          const { conversations: rows } = await api.conversations({
            folder,
            search: query.trim() || undefined,
          });
          if (!cancelled) setConversations(rows);
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            router.replace("/login");
            return;
          }
          if (!cancelled) toast.error("Could not load conversations");
        } finally {
          if (!cancelled) setLoading(false);
        }
      },
      query ? 300 : 0,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [folder, query, router, refreshKey]);

  /* ---------------- open thread ------------------------------------------ */

  React.useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;
    (async () => {
      try {
        const thread = await api.thread(selectedId);
        if (cancelled) return;
        setMessages(thread.messages);
        setWindowOpen(thread.sendWindow.open);

        // Clearing the badge is only worth a request when there is one.
        if (thread.conversation.unreadCount > 0) {
          const { conversation } = await api.markRead(selectedId);
          if (!cancelled) {
            setConversations((prev) =>
              prev.map((c) => (c.id === conversation.id ? conversation : c)),
            );
          }
        }
      } catch {
        if (!cancelled) toast.error("Could not open conversation");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, refreshKey]);

  /* ---------------- polling ---------------------------------------------- */

  React.useEffect(() => {
    // Only poll while the tab is actually being looked at, and refresh at once
    // when the user comes back to it.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  /* ---------------- connection status ------------------------------------ */

  React.useEffect(() => {
    api
      .stats()
      .then(({ whatsapp, driver }) => {
        setAccount(whatsapp);
        setDemoMode(driver === "mock");
      })
      .catch(() => setAccount(EMPTY_ACCOUNT));
  }, []);

  /* ---------------- actions ---------------------------------------------- */

  const counts = React.useMemo(
    () => ({
      all: folder === "all" ? conversations.length : 0,
      unread: conversations.filter((c) => c.unreadCount > 0).length,
      archived: folder === "archived" ? conversations.length : 0,
    }),
    [conversations, folder],
  );

  const handleSend = async (body: string) => {
    if (!selectedId) return;
    try {
      const { message } = await api.sendMessage(selectedId, body);
      // Show it straight away rather than waiting for the next poll.
      setMessages((prev) => [...prev, message]);
      refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Message failed to send",
      );
    }
  };

  const handleSendAttachment = async (file: File | Blob, caption?: string) => {
    if (!selectedId) return;
    try {
      const { message } = await api.sendAttachment(selectedId, file, caption);
      setMessages((prev) => [...prev, message]);
      refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Attachment failed to send",
      );
    }
  };

  const handleSaveContact = async (contact: Contact) => {
    try {
      await api.updateContact(contact.id, {
        name: contact.name,
        notes: contact.notes,
      });
      setConversations((prev) =>
        prev.map((c) => (c.contact.id === contact.id ? { ...c, contact } : c)),
      );
      toast.success("Contact saved");
    } catch {
      toast.error("Could not save contact");
    }
  };

  const handleArchive = async () => {
    if (!selectedId) return;
    try {
      await api.archive(selectedId, folder !== "archived");
      setSelectedId(null);
      refresh();
      toast.success(folder === "archived" ? "Unarchived" : "Archived");
    } catch {
      toast.error("Could not archive conversation");
    }
  };

  return (
    <>
      <FolderNav
        account={account}
        active={folder}
        counts={counts}
        onSelect={setFolder}
        query={query}
        onQueryChange={setQuery}
      />

      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onRefresh={refresh}
        loading={loading}
        action={
          <NewChatDialog
            onCreated={(conversation) => {
              refresh();
              setSelectedId(conversation.id);
            }}
          />
        }
        className={cn(selected && "hidden lg:flex")}
      />

      {selected ? (
        <ChatPane
          conversation={selected}
          messages={messages}
          sendWindowOpen={windowOpen}
          demoMode={demoMode}
          onSend={handleSend}
          onSendAttachment={handleSendAttachment}
          onRefresh={refresh}
          onToggleContact={() => setContactOpen((open) => !open)}
          onArchive={handleArchive}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <div className="hidden flex-1 lg:flex">
          <ChatEmptyState />
        </div>
      )}

      {selected && contactOpen && (
        <div className="hidden xl:flex">
          <ContactDrawer
            key={selected.contact.id}
            contact={selected.contact}
            messageCount={messages.length}
            onClose={() => setContactOpen(false)}
            onSave={handleSaveContact}
          />
        </div>
      )}
    </>
  );
}
