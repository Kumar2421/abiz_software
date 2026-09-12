"use client";

import Link from "next/link";
import { Lock, MessageSquareMore } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown in place of the whole inbox while the account is unpaid.
 *
 * Messages keep arriving and are stored safely; what is withheld is the right
 * to read them. The count is deliberately the one concrete thing on screen —
 * "3 customers are waiting" is the argument for paying, and it is true.
 */
export function InboxLocked({
  waiting,
}: {
  waiting: { messages: number; conversations: number };
}) {
  const { messages, conversations } = waiting;
  const hasWaiting = messages > 0;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 p-6 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-warn/10">
            <Lock className="size-6 text-warn" />
          </div>

          {hasWaiting ? (
            <div className="space-y-1">
              <p className="text-3xl font-semibold tabular-nums">{messages}</p>
              <p className="text-sm font-medium">
                {messages === 1 ? "message is" : "messages are"} waiting for you
              </p>
              <p className="text-xs text-muted-foreground">
                from {conversations}{" "}
                {conversations === 1 ? "customer" : "customers"}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-base font-medium">Your inbox is locked</p>
              <p className="text-sm text-muted-foreground">
                Messages your customers send will be saved here.
              </p>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {hasWaiting
              ? "Complete your payment to read and reply to them. Nothing has been lost — every message is saved."
              : "Complete your payment to start receiving and replying to messages."}
          </p>

          <Button asChild size="lg" className="w-full">
            <Link href="/settings?tab=billing">
              <MessageSquareMore className="size-4" />
              Complete payment to read messages
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
