"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { api, type SessionUser } from "@/lib/api";

interface SessionState {
  user: SessionUser;
  company: { name: string; address: string };
}

const SessionContext = React.createContext<SessionState | null>(null);

/** Current signed-in user. Only valid inside the authenticated app shell. */
export function useSession() {
  const session = React.useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside AuthGuard");
  return session;
}

/**
 * Every page under (app) requires a session. Without one the API returns 401
 * and the visitor is sent to /login — each account only ever sees its own
 * company's data.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = React.useState<SessionState | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const me = await api.me();
        if (!cancelled) setSession(me);
      } catch {
        if (cancelled) return;
        const next = encodeURIComponent(pathname);
        router.replace(`/login?next=${next}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  if (!session) {
    return (
      <div className="flex h-svh w-full overflow-hidden bg-shell">
        {/* Mirrors the icon rail so the shell does not shift when it appears. */}
        <div className="flex w-16 shrink-0 flex-col items-center gap-2 border-r bg-card py-3">
          <Skeleton className="size-9 rounded-lg" />
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="size-10 rounded-lg" />
          ))}
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-48" />
        </div>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}
