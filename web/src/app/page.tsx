"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Static export has no server to issue a redirect, so this bounces on the
 * client instead. AuthGuard sends signed-in users on to their inbox.
 */
export default function Home() {
  const router = useRouter();

  React.useEffect(() => {
    router.replace("/login");
  }, [router]);

  return null;
}
