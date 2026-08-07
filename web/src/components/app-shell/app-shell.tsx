import { AuthGuard } from "@/components/app-shell/auth-guard";
import { IconRail } from "@/components/app-shell/icon-rail";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-svh w-full overflow-hidden bg-shell">
        <IconRail />
        <div className="flex min-w-0 flex-1">{children}</div>
      </div>
    </AuthGuard>
  );
}
