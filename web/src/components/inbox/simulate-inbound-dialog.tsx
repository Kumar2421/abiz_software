"use client";

import * as React from "react";
import { MessageSquareReply } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";
import { formatPhone } from "@/lib/format";

/**
 * Demo-mode only. With WHATSAPP_DRIVER=mock nothing reaches a real phone, so
 * this stands in for the customer replying — the same path a real webhook
 * would take.
 */
export function SimulateInboundDialog({
  phone,
  name,
  onDelivered,
}: {
  phone: string;
  name: string;
  onDelivered?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      await api.simulateInbound({ phone, body, name });
      setBody("");
      setOpen(false);
      onDelivered?.();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not deliver reply",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Simulate a reply">
          <MessageSquareReply className="size-4" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Reply as {name}</DialogTitle>
            <DialogDescription>
              Demo mode does not deliver to real WhatsApp. This delivers a
              message into your inbox as if {formatPhone(phone)} had sent it —
              the same path Meta&apos;s webhook uses.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5 py-4">
            <Label htmlFor="sim-body">Message</Label>
            <Textarea
              id="sim-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              placeholder="Yes, that works for me!"
              required
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || !body.trim()}>
              {pending ? "Delivering…" : "Deliver to inbox"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
