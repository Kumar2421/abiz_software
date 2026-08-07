"use client";

import * as React from "react";
import { X } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPhone, initials } from "@/lib/format";
import type { Contact } from "@/lib/types";

export function ContactDrawer({
  contact,
  messageCount,
  onClose,
  onSave,
}: {
  contact: Contact;
  messageCount: number;
  onClose: () => void;
  onSave: (contact: Contact) => void;
}) {
  // Parent remounts this via `key={contact.id}`, so plain initial state is
  // enough — no effect needed to resync when the selected contact changes.
  const [name, setName] = React.useState(contact.name);
  const [notes, setNotes] = React.useState(contact.notes ?? "");

  return (
    <aside className="flex w-75 shrink-0 flex-col border-l bg-card">
      <header className="flex h-14 items-center border-b px-4">
        <h2 className="text-sm font-semibold">Contact</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="ml-auto"
          aria-label="Close contact details"
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <Avatar className="size-16">
            <AvatarFallback>{initials(contact.name)}</AvatarFallback>
          </Avatar>
          <p className="text-sm font-semibold">{contact.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatPhone(contact.phone)}
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="contact-name">Name</Label>
          <Input
            id="contact-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="contact-phone">Phone</Label>
          <Input
            id="contact-phone"
            value={formatPhone(contact.phone)}
            readOnly
            disabled
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="contact-notes">Notes</Label>
          <Textarea
            id="contact-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            placeholder="Anything worth remembering about this customer…"
          />
        </div>

        <dl className="grid gap-2 rounded-lg border p-3 text-xs">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">First interaction</dt>
            <dd>
              {new Date(contact.firstInteractionAt).toLocaleDateString(
                undefined,
                { day: "numeric", month: "short", year: "numeric" },
              )}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Messages</dt>
            <dd className="tabular-nums">{messageCount}</dd>
          </div>
        </dl>
      </div>

      <footer className="flex gap-2 border-t p-3">
        <Button
          className="flex-1"
          onClick={() => onSave({ ...contact, name, notes })}
        >
          Save
        </Button>
        <Button variant="outline" className="text-destructive">
          Delete
        </Button>
      </footer>
    </aside>
  );
}
