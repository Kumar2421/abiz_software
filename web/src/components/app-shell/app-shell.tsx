import { AuthGuard } from "@/components/app-shell/auth-guard";
import { ContentGuard } from "@/components/app-shell/content-guard";
import { IconRail } from "@/components/app-shell/icon-rail";
import { SubscriptionBanner } from "@/components/billing/subscription-banner";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { IncomingMessageNotifications } from "@/components/app-shell/incoming-message-notifications";
import { Suspense } from "react";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ContentGuard />
      <IncomingMessageNotifications />
      <div className="flex h-svh w-full flex-col overflow-hidden bg-shell">
        <SubscriptionBanner />
        <div className="flex min-h-0 flex-1">
          <IconRail />
          <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
        </div>
        <Suspense fallback={null}>
          <MobileNav />
        </Suspense>
      </div>
    </AuthGuard>
  );
}
