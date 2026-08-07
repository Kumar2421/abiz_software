"use client";

import * as React from "react";
import { Download, FileText, Play } from "lucide-react";

import { API_URL } from "@/lib/api";
import type { Message } from "@/lib/types";

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Media is served behind the session cookie, so it is fetched as a blob and
 * shown from an object URL — a plain <img src> would be an anonymous request
 * and come back 401.
 */
function useAuthedBlobUrl(path: string | undefined) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!path) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`${API_URL}${path}`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return { url, failed };
}

export function MessageMedia({ message }: { message: Message }) {
  const media = message.media;
  const { url, failed } = useAuthedBlobUrl(media?.url);

  if (!media) return null;

  if (failed) {
    return (
      <p className="rounded-lg bg-background/60 px-3 py-2 text-xs text-muted-foreground">
        Attachment unavailable
      </p>
    );
  }

  if (message.type === "image") {
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={media.fileName}
        className="max-h-80 w-full rounded-lg object-cover"
      />
    ) : (
      <div className="h-48 w-64 animate-pulse rounded-lg bg-background/60" />
    );
  }

  if (message.type === "video") {
    return url ? (
      <video
        src={url}
        controls
        className="max-h-80 w-full rounded-lg"
        preload="metadata"
      />
    ) : (
      <div className="flex h-48 w-64 items-center justify-center rounded-lg bg-background/60">
        <Play className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (message.type === "audio") {
    return url ? (
      <audio src={url} controls className="w-64 max-w-full" preload="metadata" />
    ) : (
      <div className="h-10 w-64 animate-pulse rounded-full bg-background/60" />
    );
  }

  return (
    <a
      href={url ?? undefined}
      download={media.fileName}
      className="flex items-center gap-3 rounded-lg bg-background/60 px-3 py-2 transition-colors hover:bg-background"
    >
      <FileText className="size-8 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {media.fileName}
        </span>
        <span className="block text-xs text-muted-foreground">
          {prettySize(media.sizeBytes)}
        </span>
      </span>
      <Download className="size-4 shrink-0 text-muted-foreground" />
    </a>
  );
}
