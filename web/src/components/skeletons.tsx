import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholders shaped like the page they stand in for.
 *
 * Each mirrors its real layout — same columns, same row heights — so the
 * content does not jump when it arrives. A generic spinner would be less work
 * but every page would visibly reflow on load.
 */

export function InboxSkeleton() {
  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col gap-4 border-r bg-card p-3 md:flex">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-9 w-full" />
        <div className="space-y-2 pt-2">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-8 w-full" />
          ))}
        </div>
      </aside>

      <div className="flex w-full flex-col border-r bg-card lg:w-85">
        <div className="flex h-14 items-center border-b px-4">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="space-y-4 p-4">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex gap-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <section className="hidden min-w-0 flex-1 flex-col bg-card lg:flex">
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex-1 space-y-3 bg-shell p-4">
          {[
            "w-1/2",
            "ml-auto w-2/5",
            "w-3/5",
            "ml-auto w-1/3",
            "w-2/5",
          ].map((width, index) => (
            <Skeleton key={index} className={`h-12 rounded-2xl ${width}`} />
          ))}
        </div>
        <div className="border-t p-3">
          <Skeleton className="h-10 w-full" />
        </div>
      </section>
    </>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <Skeleton key={tile} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="ml-auto h-9 w-64" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="flex-1 rounded-lg border bg-card">
        <div className="border-b p-3">
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="space-y-3 p-3">
          {Array.from({ length: rows }, (_, row) => (
            <Skeleton key={row} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="flex-1 space-y-6 p-6">
      <Skeleton className="h-6 w-32" />
      <div className="flex gap-2">
        {[0, 1, 2, 3, 4].map((tab) => (
          <Skeleton key={tab} className="h-9 w-28" />
        ))}
      </div>
      <div className="max-w-3xl space-y-4 rounded-xl border p-6">
        {[0, 1, 2, 3].map((field) => (
          <div key={field} className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <Skeleton className="h-9 w-32" />
      </div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="flex-1 p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    </div>
  );
}
