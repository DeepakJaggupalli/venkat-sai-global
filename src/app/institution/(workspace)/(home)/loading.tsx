import { Skeleton } from "@/components/ui/skeleton";

const card = "rounded-[22px] border border-border bg-white shadow-card";

/** Loading placeholder shaped like the Institution Portal dashboard, so nothing jumps when the figures arrive. */
export default function InstitutionLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading your dashboard…</span>

      <div aria-hidden="true" className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-3.5 w-32 bg-border/70" />
          <Skeleton className="h-9 w-72 max-w-full bg-border/70" />
          <Skeleton className="h-4 w-80 max-w-full bg-border/60" />
          <Skeleton className="h-6 w-40 rounded-full bg-border/60" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-11 w-36 rounded-full bg-border/70" />
          <Skeleton className="h-11 w-32 rounded-full bg-border/60" />
        </div>
      </div>

      <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={`${card} p-4 sm:p-5`}>
            <Skeleton className="size-9 rounded-xl" />
            <Skeleton className="mt-4 h-8 w-16" />
            <Skeleton className="mt-3 h-4 w-28 max-w-full" />
            <Skeleton className="mt-2 h-3 w-36 max-w-full" />
          </div>
        ))}
      </div>

      <div aria-hidden="true" className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={`${card} p-4`}>
              <Skeleton className="size-9 rounded-xl" />
              <Skeleton className="mt-4 h-4 w-28 max-w-full" />
              <Skeleton className="mt-2 h-3 w-36 max-w-full" />
            </div>
          ))}
        </div>
      </div>

      <div aria-hidden="true" className={`${card} p-5`}>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>

      <div aria-hidden="true" className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className={card}>
            <div className="p-5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-4 w-56 max-w-full" />
            </div>
            <ul className="divide-y divide-border border-t border-border">
              {Array.from({ length: 3 }, (_, j) => (
                <li key={j} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-48 max-w-full" />
                    <Skeleton className="h-3 w-32 max-w-full" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
