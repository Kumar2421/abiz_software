"use client";

import * as React from "react";
import { MessageSquarePlus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import type { Conversation } from "@/lib/types";

export function NewChatDialog({
  onCreated,
}: {
  onCreated: (conversation: Conversation) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      const { conversation } = await api.startConversation({
        phone,
        name: name.trim() || undefined,
      });
      onCreated(conversation);
      setOpen(false);
      setPhone("");
      setName("");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not start chat",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="New chat">
          <MessageSquarePlus className="size-4" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New chat</DialogTitle>
            <DialogDescription>
              Enter a number with its country code. An existing conversation is
              reused if there already is one.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="new-chat-phone">Phone number</Label>
              <Input
                id="new-chat-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+91 98765 43210"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-chat-name">Name (optional)</Label>
              <Input
                id="new-chat-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Maya Chen"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || !phone.trim()}>
              {pending ? "Starting…" : "Start chat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
