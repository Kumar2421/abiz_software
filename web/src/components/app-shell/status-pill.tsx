import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/lib/types";

const LABEL: Record<ConnectionStatus, string> = {
  connected: "Connected",
  pending: "Pending verify",
  disconnected: "Disconnected",
};

const DOT: Record<ConnectionStatus, string> = {
  connected: "bg-ok",
  pending: "bg-warn",
  disconnected: "bg-destructive",
};

export function StatusPill({
  status,
  className,
}: {
  status: ConnectionStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT[status])} />
      {LABEL[status]}
    </span>
  );
}
