"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, CircleCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/app-shell/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ApiError,
  api,
  type AdminAccount,
  type AdminUser,
  type AdminWebhookLog,
} from "@/lib/api";
import { formatPhone } from "@/lib/format";

const stamp = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function TableShell({
  head,
  children,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-card">
          <tr className="border-b text-left text-xs text-muted-foreground">
            {head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = React.useState<AdminUser[] | null>(null);
  const [accounts, setAccounts] = React.useState<AdminAccount[] | null>(null);
  const [logs, setLogs] = React.useState<AdminWebhookLog[] | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [u, a, l] = await Promise.all([
          api.adminUsers(),
          api.adminAccounts(),
          api.adminWebhookLogs(),
        ]);
        if (cancelled) return;
        setUsers(u.users);
        setAccounts(a.accounts);
        setLogs(l.logs);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login");
          return;
        }
        if (error instanceof ApiError && error.status === 403) {
          toast.error("Admin access required");
          router.replace("/inbox");
          return;
        }
        toast.error("Could not load admin data");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const setStatus = async (user: AdminUser) => {
    const next = user.status === "active" ? "suspended" : "active";
    try {
      await api.adminSetUserStatus(user.id, next);
      setUsers(
        (prev) =>
          prev?.map((u) => (u.id === user.id ? { ...u, status: next } : u)) ??
          null,
      );
      toast.success(next === "suspended" ? "User suspended" : "User restored");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Update failed");
    }
  };

  const remove = async (user: AdminUser) => {
    if (
      !window.confirm(
        `Delete ${user.email}? This permanently removes their company, contacts, and every message. This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await api.adminDeleteUser(user.id);
      setUsers((prev) => prev?.filter((u) => u.id !== user.id) ?? null);
      toast.success("User deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Accounts, connections, and webhook activity across every company.
        </p>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Users", value: users?.length },
          {
            label: "Connected numbers",
            value: accounts?.filter((a) => a.status === "connected").length,
          },
          {
            label: "Webhook errors",
            value: logs?.filter((l) => l.error).length,
          },
        ].map((tile) => (
          <Card key={tile.label}>
            <CardContent>
              <p className="text-xs text-muted-foreground">{tile.label}</p>
              {tile.value === undefined ? (
                <Skeleton className="mt-2 h-8 w-16" />
              ) : (
                <p className="mt-2 text-3xl font-semibold tabular-nums">
                  {tile.value}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="accounts">WhatsApp numbers</TabsTrigger>
          <TabsTrigger value="logs">Webhook logs</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <TableShell
            head={
              <>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="w-24 px-4 py-2" />
              </>
            }
          >
            {users?.map((user) => (
              <tr key={user.id} className="border-b last:border-0">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </td>
                <td className="px-4 py-2.5">{user.company_name}</td>
                <td className="px-4 py-2.5">
                  <Badge variant="secondary">{user.role}</Badge>
                </td>
                <td className="px-4 py-2.5">
                  <Badge
                    variant={
                      user.status === "active" ? "outline" : "destructive"
                    }
                  >
                    {user.status}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {stamp(user.created_at)}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setStatus(user)}
                      aria-label={
                        user.status === "active" ? "Suspend user" : "Restore user"
                      }
                    >
                      {user.status === "active" ? (
                        <Ban className="size-4" />
                      ) : (
                        <CircleCheck className="size-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(user)}
                      aria-label="Delete user"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </TableShell>
        </TabsContent>

        <TabsContent value="accounts">
          <TableShell
            head={
              <>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Phone Number ID</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Updated</th>
              </>
            }
          >
            {accounts?.map((account) => (
              <tr key={account.company_id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium">
                  {account.company_name}
                </td>
                <td className="px-4 py-2.5">
                  {account.display_number
                    ? formatPhone(account.display_number)
                    : "—"}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">
                  {account.phone_number_id ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill status={account.status} />
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {stamp(account.updated_at)}
                </td>
              </tr>
            ))}
          </TableShell>
        </TabsContent>

        <TabsContent value="logs">
          <TableShell
            head={
              <>
                <th className="px-4 py-2 font-medium">Event</th>
                <th className="px-4 py-2 font-medium">Error</th>
                <th className="px-4 py-2 font-medium">When</th>
              </>
            }
          >
            {logs?.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No webhook activity yet.
                </td>
              </tr>
            )}
            {logs?.map((log) => (
              <React.Fragment key={log.id}>
                <tr
                  className="cursor-pointer border-b last:border-0 hover:bg-accent"
                  onClick={() =>
                    setExpanded(expanded === log.id ? null : log.id)
                  }
                >
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {log.event_type}
                  </td>
                  <td className="px-4 py-2.5 text-destructive">
                    {log.error ?? ""}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {stamp(log.created_at)}
                  </td>
                </tr>
                {expanded === log.id && (
                  <tr className="border-b bg-shell">
                    <td colSpan={3} className="px-4 py-3">
                      <pre className="max-h-64 overflow-auto text-xs">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </TableShell>
        </TabsContent>
      </Tabs>
    </div>
  );
}
