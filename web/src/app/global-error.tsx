"use client";

/**
 * Replaces the root layout entirely when a render fails at the very top of the
 * tree, so it must not depend on anything the layout provides — no providers,
 * no context, no shared components. Next's generated default pulls in client
 * context that is unavailable during export, which fails the build.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p
            style={{
              margin: "0.5rem 0 1.25rem",
              fontSize: "0.875rem",
              color: "#a1a1a1",
              lineHeight: 1.5,
            }}
          >
            Abiz hit an unexpected error. Try again — if it keeps happening,
            reload the page.
          </p>

          {error.digest && (
            <p
              style={{
                margin: "0 0 1.25rem",
                fontSize: "0.75rem",
                color: "#6b6b6b",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              Reference: {error.digest}
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              padding: "0.6rem 1.25rem",
              borderRadius: 8,
              border: "none",
              background: "#ededed",
              color: "#000",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
