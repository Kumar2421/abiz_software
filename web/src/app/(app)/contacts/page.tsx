"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ExportMenu } from "@/components/export-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TableSkeleton } from "@/components/skeletons";
import { ApiError, api } from "@/lib/api";
import { formatPhone, initials } from "@/lib/format";
import type { Contact } from "@/lib/types";

function EditContactDialog({
  contact,
  onClose,
  onSaved,
}: {
  contact: Contact;
  onClose: () => void;
  onSaved: (contact: Contact) => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [issues, setIssues] = React.useState<Record<string, string>>({});

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setIssues({});
    try {
      const { contact: saved } = await api.updateContact(contact.id, {
        name: String(data.get("name")),
        phone: String(data.get("phone")),
        notes: String(data.get("notes") ?? ""),
      });
      onSaved(saved);
      toast.success("Contact updated");
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.issues.length) {
        setIssues(
          Object.fromEntries(
            error.issues.map((issue) => [issue.path, issue.message]),
          ),
        );
        return;
      }
      toast.error(
        error instanceof ApiError ? error.message : "Could not update contact",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Edit contact</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                name="name"
                defaultValue={contact.name}
                aria-invalid={Boolean(issues.name)}
                required
              />
              {issues.name && (
                <p className="text-xs text-destructive">{issues.name}</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="edit-phone">Phone number</Label>
              <Input
                id="edit-phone"
                name="phone"
                defaultValue={formatPhone(contact.phone)}
                aria-invalid={Boolean(issues.phone)}
                required
              />
              {issues.phone ? (
                <p className="text-xs text-destructive">{issues.phone}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Changing this moves the whole conversation to the new number.
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                name="notes"
                rows={3}
                defaultValue={contact.notes ?? ""}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = React.useState<Contact[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [editing, setEditing] = React.useState<Contact | null>(null);

  const load = React.useCallback(async (search?: string) => {
    try {
      const { contacts: rows } = await api.contacts(search);
      setContacts(rows);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      toast.error("Could not load contacts");
      setContacts([]);
    }
  }, [router]);

  React.useEffect(() => {
    const timer = setTimeout(() => void load(query.trim() || undefined), 250);
    return () => clearTimeout(timer);
  }, [query, load]);

  React.useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load(query.trim() || undefined);
    };
    const timer = window.setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [query, load]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    try {
      await api.createContact({
        name: String(data.get("name")),
        phone: String(data.get("phone")),
        notes: String(data.get("notes") ?? "") || undefined,
      });
      setOpen(false);
      await load(query.trim() || undefined);
      toast.success("Contact added");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not add contact",
      );
    } finally {
      setPending(false);
    }
  };

  const remove = async (contact: Contact) => {
    if (!window.confirm(`Delete ${contact.name}? This also removes their chat.`))
      return;
    try {
      await api.deleteContact(contact.id);
      setContacts((prev) => prev?.filter((c) => c.id !== contact.id) ?? null);
      toast.success("Contact deleted");
    } catch {
      toast.error("Could not delete contact");
    }
  };

  const openChat = async (contact: Contact) => {
    try {
      const { conversation } = await api.startConversation({
        phone: contact.phone,
        name: contact.name,
      });
      router.push(`/inbox?conversation=${conversation.id}`);
    } catch {
      toast.error("Could not open chat");
    }
  };

  if (contacts === null) return <TableSkeleton />;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-6">
      <header className="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div>
          <h1 className="text-xl font-semibold">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            {contacts?.length ?? 0} saved contacts
          </p>
        </div>

        <div className="relative w-full sm:ml-auto sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or number"
            className="pl-8"
          />
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-0 sm:w-auto">
        <ExportMenu
          spec={() => ({
            title: "Contacts",
            fileName: "contacts",
            // What is on screen, so a search filter narrows the download too.
            rows: contacts ?? [],
            columns: [
              { header: "Name", value: (c) => c.name, width: 28, pdfWidth: 130 },
              // "+" and the full number as text: a spreadsheet would otherwise
              // show 9.19E+11 or drop the country code.
              { header: "Phone", value: (c) => `+${c.phone}`, width: 18, pdfWidth: 100 },
              { header: "Notes", value: (c) => c.notes ?? "", width: 44 },
              {
                header: "Added",
                value: (c) => c.firstInteractionAt?.slice(0, 10) ?? "",
                width: 14,
                pdfWidth: 70,
              },
            ],
          })}
        />

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Add contact
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={create}>
              <DialogHeader>
                <DialogTitle>Add contact</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="c-name">Name</Label>
                  <Input id="c-name" name="name" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="c-phone">Phone number</Label>
                  <Input
                    id="c-phone"
                    name="phone"
                    placeholder="+91 98765 43210"
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="c-notes">Notes</Label>
                  <Textarea id="c-notes" name="notes" rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save contact"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </header>

      <div className="hidden min-h-0 flex-1 overflow-auto rounded-lg border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Notes</th>
              <th className="w-24 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {contacts === null &&
              [0, 1, 2].map((row) => (
                <tr key={row} className="border-b">
                  <td colSpan={4} className="px-4 py-3">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}

            {contacts?.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No contacts yet.
                </td>
              </tr>
            )}

            {contacts?.map((contact) => (
              <tr
                key={contact.id}
                className="border-b last:border-0 hover:bg-accent"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-[10px]">
                        {initials(contact.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{contact.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {formatPhone(contact.phone)}
                </td>
                <td className="max-w-xs truncate px-4 py-2.5 text-muted-foreground">
                  {contact.notes ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openChat(contact)}
                      aria-label={`Message ${contact.name}`}
                    >
                      <MessageSquare className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditing(contact)}
                      aria-label={`Edit ${contact.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(contact)}
                      aria-label={`Delete ${contact.name}`}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto md:hidden">
        {contacts.length === 0 ? (
          <div className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            No contacts yet.
          </div>
        ) : (
          contacts.map((contact) => (
            <article key={contact.id} className="rounded-lg border bg-card p-3">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar className="mt-0.5 size-9 shrink-0">
                  <AvatarFallback className="text-xs">
                    {initials(contact.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <h2 className="break-words font-medium">{contact.name}</h2>
                  <p className="mt-1 break-all text-sm text-muted-foreground">
                    {formatPhone(contact.phone)}
                  </p>
                  {contact.notes && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {contact.notes}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-1 border-t pt-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openChat(contact)}
                  aria-label={`Message ${contact.name}`}
                >
                  <MessageSquare className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditing(contact)}
                  aria-label={`Edit ${contact.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(contact)}
                  aria-label={`Delete ${contact.name}`}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </article>
          ))
        )}
      </div>

      {editing && (
        <EditContactDialog
          contact={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) =>
            setContacts(
              (prev) =>
                prev?.map((c) => (c.id === saved.id ? saved : c)) ?? null,
            )
          }
        />
      )}
    </div>
  );
}
