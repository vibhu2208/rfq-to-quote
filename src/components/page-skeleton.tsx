function Bar({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-dark-secondary/15 ${className || ""}`}
    />
  );
}

/** Generic app-route skeleton shown while Next.js navigates. */
export function AppPageSkeleton({
  variant = "default",
}: {
  variant?: "default" | "dashboard" | "table" | "detail";
}) {
  if (variant === "dashboard") return <DashboardPageSkeleton />;
  if (variant === "table") return <TablePageSkeleton />;
  if (variant === "detail") return <DetailPageSkeleton />;

  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading page">
      <div className="space-y-2">
        <Bar className="h-7 w-48" />
        <Bar className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-dark-primary/8 bg-white p-4"
          >
            <Bar className="h-3 w-20" />
            <Bar className="mt-3 h-8 w-24" />
            <Bar className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-dark-primary/8 bg-white p-4">
        <Bar className="mb-4 h-5 w-40" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bar key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading dashboard">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Bar className="h-8 w-44" />
          <Bar className="h-4 w-64 max-w-full" />
        </div>
        <Bar className="h-9 w-28" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-dark-primary/8 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <Bar className="h-3 w-24" />
              <Bar className="h-8 w-8 rounded-full" />
            </div>
            <Bar className="mt-4 h-8 w-20" />
            <Bar className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 rounded-2xl border border-dark-primary/8 bg-white p-4 lg:col-span-2">
          <Bar className="h-5 w-36" />
          <div className="grid gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Bar key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-2xl border border-dark-primary/8 bg-white p-4">
          <Bar className="h-5 w-28" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Bar key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-dark-primary/8 bg-white p-4">
        <Bar className="mb-4 h-5 w-40" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bar key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TablePageSkeleton() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3"
      aria-busy="true"
      aria-label="Loading list"
    >
      <div className="space-y-2">
        <Bar className="h-7 w-36" />
        <Bar className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Bar key={i} className="h-9 w-24 rounded-full" />
        ))}
        <Bar className="ml-auto h-9 w-40 rounded-full" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-dark-primary/8 bg-white">
        <div className="border-b border-dark-primary/8 px-3 py-3">
          <div className="flex gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Bar key={i} className="h-4 flex-1" />
            ))}
          </div>
        </div>
        <div className="space-y-0 p-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-dark-primary/5 px-2 py-3"
            >
              <Bar className="h-4 w-4 shrink-0" />
              <Bar className="h-4 w-24" />
              <Bar className="h-4 flex-1" />
              <Bar className="h-4 w-20" />
              <Bar className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading details">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Bar className="h-8 w-56" />
          <Bar className="h-4 w-40" />
        </div>
        <div className="flex gap-2">
          <Bar className="h-9 w-24" />
          <Bar className="h-9 w-20" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 rounded-2xl border border-dark-primary/8 bg-white p-4 lg:col-span-2">
          <Bar className="h-5 w-32" />
          <Bar className="h-40 w-full" />
          <Bar className="h-5 w-40" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Bar key={i} className="h-11 w-full" />
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-2xl border border-dark-primary/8 bg-white p-4">
          <Bar className="h-5 w-28" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Bar key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
