"use client";

import * as React from "react";
import {
  Archive,
  ArrowLeft,
  Ban,
  Info,
  MessagesSquare,
  MoreVertical,
  Trash2,
} from "lucide-react";

import { Composer } from "@/components/inbox/composer";
import { MessageBubble } from "@/components/inbox/message-bubble";
import { SimulateInboundDialog } from "@/components/inbox/simulate-inbound-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { dayLabel, formatPhone, initials } from "@/lib/format";
import type { Conversation, Message } from "@/lib/types";

export function ChatEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-accent">
        <MessagesSquare className="size-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">Select a conversation</p>
      <p className="text-sm text-muted-foreground">
        Pick a chat on the left to start replying.
      </p>
    </div>
  );
}

export function ChatPane({
  conversation,
  messages,
  sendWindowOpen,
  demoMode,
  onSend,
  onSendAttachment,
  onRefresh,
  onToggleContact,
  onArchive,
  onBack,
}: {
  conversation: Conversation;
  messages: Message[];
  /** Comes from the API — the server owns the 24-hour window rule. */
  sendWindowOpen: boolean;
  /** True when WHATSAPP_DRIVER=mock: nothing reaches a real phone. */
  demoMode: boolean;
  onSend: (body: string) => void;
  onSendAttachment: (file: File | Blob, caption?: string) => Promise<void>;
  onRefresh?: () => void;
  onToggleContact: () => void;
  onArchive?: () => void;
  onBack?: () => void;
}) {
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [conversation.id, messages.length]);

  // Group consecutive messages under one date divider.
  const groups: { label: string; items: Message[] }[] = [];
  for (const message of messages) {
    const label = dayLabel(message.createdAt);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(message);
    else groups.push({ label, items: [message] });
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-card">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="lg:hidden"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="size-4" />
          </Button>
        )}

        <Avatar className="size-9">
          <AvatarFallback className="text-xs">
            {initials(conversation.contact.name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {conversation.contact.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {formatPhone(conversation.contact.phone)}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {demoMode && (
            <SimulateInboundDialog
              phone={conversation.contact.phone}
              name={conversation.contact.name}
              onDelivered={onRefresh}
            />
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleContact}
            aria-label="Toggle contact details"
          >
            <Info className="size-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onArchive?.()}>
                <Archive className="size-4" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Ban className="size-4" />
                Block contact
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive">
                <Trash2 className="size-4" />
                Delete conversation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {demoMode && (
        <p className="border-b border-warn/40 bg-warn/10 px-4 py-1.5 text-xs">
          <span className="font-medium">Demo mode.</span> Messages are stored in
          Abiz but not delivered to real WhatsApp. Connect a number in Settings
          and set <code>WHATSAPP_DRIVER=cloud</code> to send for real.
        </p>
      )}

      <ScrollArea className="flex-1 bg-shell">
        <div className="flex flex-col gap-2 p-4">
          {groups.map((group) => (
            <React.Fragment key={group.label}>
              <div className="my-2 flex justify-center">
                <span className="rounded-full bg-card px-3 py-0.5 text-xs text-muted-foreground shadow-xs">
                  {group.label}
                </span>
              </div>
              {group.items.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </React.Fragment>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {!sendWindowOpen && (
        <p className="border-t border-warn/40 bg-warn/10 px-4 py-2 text-xs">
          <span className="font-medium">24-hour window closed.</span>{" "}
          {conversation.contact.name} must send a message before you can reply
          with free-form text. Approved templates only.
        </p>
      )}

      <Composer
        onSend={onSend}
        onSendAttachment={onSendAttachment}
        disabled={!sendWindowOpen}
      />
    </section>
  );
}
