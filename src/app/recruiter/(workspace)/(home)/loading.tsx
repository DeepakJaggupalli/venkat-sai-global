import { Skeleton } from "@/components/ui/skeleton";

/**
 * Partner dashboard placeholder: same shape as the page (greeting, tiles, how to use, action cards,
 * charts, lists) so nothing jumps when the real numbers arrive. The pulse stops for reduced motion.
 */
const CARD = "rounded-[22px] border border-border bg-white shadow-card";
const PULSE = "motion-reduce:animate-none";

export default function RecruiterDashboardLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6 lg:space-y-8">
      <span className="sr-only">Loading your dashboard</span>

      <div aria-hidden="true" className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <Skeleton className={`h-4 w-28 bg-border/70 ${PULSE}`} />
          <Skeleton className={`h-9 w-80 max-w-full bg-border/70 ${PULSE}`} />
          <Skeleton className={`h-4 w-64 max-w-full bg-border/60 ${PULSE}`} />
        </div>
        <div className="flex gap-2">
          <Skeleton className={`h-11 w-44 rounded-full bg-border/70 ${PULSE}`} />
          <Skeleton className={`h-11 w-36 rounded-full bg-border/60 ${PULSE}`} />
        </div>
      </div>

      <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={`${CARD} p-4 sm:p-5`}>
            <Skeleton className={`size-8 rounded-xl ${PULSE}`} />
            <Skeleton className={`mt-3 h-9 w-14 ${PULSE}`} />
            <Skeleton className={`mt-3 h-4 w-32 max-w-full ${PULSE}`} />
            <Skeleton className={`mt-2 h-3 w-24 max-w-full ${PULSE}`} />
          </div>
        ))}
      </div>

      <div aria-hidden="true" className={`${CARD} flex items-center gap-3 p-4 sm:p-5`}>
        <Skeleton className={`size-9 rounded-xl ${PULSE}`} />
        <div className="flex-1 space-y-2">
          <Skeleton className={`h-5 w-32 ${PULSE}`} />
          <Skeleton className={`h-3 w-72 max-w-full ${PULSE}`} />
        </div>
      </div>

      <div aria-hidden="true" className="space-y-3">
        <Skeleton className={`h-5 w-40 ${PULSE}`} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={`${CARD} min-h-32 p-4`}>
              <Skeleton className={`size-10 rounded-xl ${PULSE}`} />
              <Skeleton className={`mt-4 h-4 w-28 max-w-full ${PULSE}`} />
              <Skeleton className={`mt-2 h-3 w-36 max-w-full ${PULSE}`} />
            </div>
          ))}
        </div>
      </div>

      <div aria-hidden="true" className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className={`${CARD} p-5`}>
            <Skeleton className={`h-5 w-44 ${PULSE}`} />
            <Skeleton className={`mt-2 h-3 w-64 max-w-full ${PULSE}`} />
            <div className="mt-6 flex h-44 items-end gap-3">
              {[40, 65, 30, 80, 55, 70, 45, 60].map((h, j) => (
                <Skeleton key={j} className={`flex-1 rounded-t-md rounded-b-none ${PULSE}`} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div aria-hidden="true" className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className={CARD}>
            <div className="flex items-center justify-between p-5">
              <Skeleton className={`h-5 w-40 ${PULSE}`} />
              <Skeleton className={`h-4 w-16 ${PULSE}`} />
            </div>
            <ul className="divide-y divide-border border-t border-border">
              {Array.from({ length: 4 }, (_, j) => (
                <li key={j} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className={`h-4 w-40 max-w-full ${PULSE}`} />
                    <Skeleton className={`h-3 w-56 max-w-full ${PULSE}`} />
                  </div>
                  <Skeleton className={`h-6 w-20 rounded-full ${PULSE}`} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
