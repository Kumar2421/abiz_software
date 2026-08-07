"use client";

import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";

import { MessageMedia } from "@/components/inbox/message-media";
import { clockTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types";

function StatusTick({ status }: { status: Message["status"] }) {
  switch (status) {
    case "pending":
      return <Clock className="size-3 text-muted-foreground" />;
    case "sent":
      return <Check className="size-3 text-muted-foreground" />;
    case "delivered":
      return <CheckCheck className="size-3 text-muted-foreground" />;
    case "read":
      return <CheckCheck className="size-3 text-primary" />;
    case "failed":
      return <AlertCircle className="size-3 text-destructive" />;
    default:
      return null;
  }
}

export function MessageBubble({
  message,
  onRetry,
}: {
  message: Message;
  onRetry?: (id: string) => void;
}) {
  const outbound = message.direction === "out";
  const failed = message.status === "failed";
  const hasMedia = Boolean(message.media);

  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[65%] rounded-2xl p-1.5 text-sm break-words shadow-xs",
          !hasMedia && "px-3 py-2",
          outbound
            ? "rounded-br-sm bg-bubble-out"
            : "rounded-bl-sm bg-bubble-in",
          message.status === "pending" && "opacity-60",
          failed && "border-l-2 border-destructive",
        )}
      >
        {hasMedia && (
          <div className={cn(message.body && "mb-1.5")}>
            <MessageMedia message={message} />
          </div>
        )}

        {message.body && (
          <p className={cn("whitespace-pre-wrap", hasMedia && "px-1.5")}>
            {message.body}
          </p>
        )}

        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground",
            hasMedia && "px-1.5 pb-0.5",
          )}
        >
          <span>{clockTime(message.createdAt)}</span>
          {outbound && <StatusTick status={message.status} />}
        </div>

        {failed && (
          <button
            type="button"
            onClick={() => onRetry?.(message.id)}
            className="mt-1 text-xs font-medium text-destructive hover:underline"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
