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
      <div className="flex flex-1 items-center justify-center p-10">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}
