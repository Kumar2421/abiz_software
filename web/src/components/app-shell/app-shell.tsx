import { AuthGuard } from "@/components/app-shell/auth-guard";
import { ContentGuard } from "@/components/app-shell/content-guard";
import { IconRail } from "@/components/app-shell/icon-rail";
import { SubscriptionBanner } from "@/components/billing/subscription-banner";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ContentGuard />
      <div className="flex h-svh w-full flex-col overflow-hidden bg-shell">
        <SubscriptionBanner />
        <div className="flex min-h-0 flex-1">
          <IconRail />
          <div className="flex min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </AuthGuard>
  );
}
