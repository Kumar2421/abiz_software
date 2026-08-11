import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The Abiz mark, used in the sign-in card, the icon rail, and page headers.
 *
 * Sourced from public/logo.png — the 256px PNG extracted out of
 * src/app/favicon.ico. The .ico itself is left to the browser tab: its other
 * entries top out at 48px, so rendering it at logo size upscales a small
 * bitmap and looks soft on any retina screen.
 */
export function BrandLogo({
  size = 40,
  className,
  priority,
}: {
  size?: number;
  className?: string;
  /** Set on the sign-in card, where the logo is the largest paint. */
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt="Abiz"
      width={size}
      height={size}
      priority={priority}
      className={cn("object-contain", className)}
    />
  );
}
