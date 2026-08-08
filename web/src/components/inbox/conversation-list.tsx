"use client";

import { CornerUpLeft, RefreshCw } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { initials, shortRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/types";

function ConversationRow({
  conversation,
  selected,
  onSelect,
}: {
  conversation: Conversation;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const unread = conversation.unreadCount > 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "relative flex w-full gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent",
        selected && "bg-selected hover:bg-selected",
      )}
    >
      {selected && (
        <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />
      )}

      <Avatar className="size-10">
        <AvatarFallback className="text-xs">
          {initials(conversation.contact.name)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "truncate text-sm",
              unread ? "font-semibold" : "font-medium",
            )}
          >
            {conversation.contact.name}
          </span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {shortRelative(conversation.lastMessageAt)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5">
          {conversation.lastMessageDirection === "out" && (
            <CornerUpLeft className="size-3 shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              "truncate text-[13px] text-muted-foreground",
              unread && "text-foreground",
            )}
          >
            {conversation.lastMessage}
          </span>
          {unread && (
            <span className="ml-auto shrink-0 rounded-full bg-ok px-1.5 text-[11px] leading-4 font-medium text-white tabular-nums">
              {conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onRefresh,
  action,
  loading,
  className,
}: {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  /** Slot for the "new chat" trigger in the list header. */
  action?: React.ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full flex-col border-r bg-card lg:w-85", className)}>
      <div className="flex h-14 items-center border-b px-4">
        <h2 className="text-sm font-semibold">Conversations</h2>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {conversations.length}
        </span>
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            aria-label="Check for new messages"
          >
            <RefreshCw className="size-4" />
          </Button>
        )}
        {action}
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="flex gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No conversations match this filter.
          </p>
        ) : (
          conversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              selected={conversation.id === selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </ScrollArea>
    </div>
  );
}
