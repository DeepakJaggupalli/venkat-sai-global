import { Skeleton } from "@/components/ui/skeleton";

/**
 * People Portal home placeholder, the same shape as the page (greeting, four tiles, the big action buttons, the
 * profile checklist and CV journey beside "How to use", then the lists) so nothing jumps when the data arrives.
 * The pulse stops for reduced motion.
 */
const CARD = "rounded-[22px] border border-border bg-white shadow-card";
const PULSE = "motion-reduce:animate-none";

function ListCard({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`${CARD} ${className}`}>
      <div className="flex items-center justify-between p-5">
        <Skeleton className={`h-5 w-40 ${PULSE}`} />
        <Skeleton className={`h-4 w-16 ${PULSE}`} />
      </div>
      <ul className="divide-y divide-border border-t border-border">
        {Array.from({ length: rows }, (_, j) => (
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
  );
}

export default function TalentHomeLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-8">
      <span className="sr-only">Loading your dashboard</span>

      <div aria-hidden="true" className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <Skeleton className={`h-4 w-28 bg-border/70 ${PULSE}`} />
          <Skeleton className={`h-10 w-80 max-w-full bg-border/70 ${PULSE}`} />
          <Skeleton className={`h-4 w-72 max-w-full bg-border/60 ${PULSE}`} />
          <div className="flex gap-2 pt-1">
            <Skeleton className={`h-6 w-40 rounded-full ${PULSE}`} />
            <Skeleton className={`h-6 w-28 rounded-full ${PULSE}`} />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className={`h-11 w-36 rounded-full bg-border/70 ${PULSE}`} />
          <Skeleton className={`h-11 w-32 rounded-full bg-border/60 ${PULSE}`} />
          <Skeleton className={`h-11 w-40 rounded-full bg-border/60 ${PULSE}`} />
        </div>
      </div>

      <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`${CARD} p-4 sm:p-5`}>
            <Skeleton className={`size-8 rounded-xl ${PULSE}`} />
            <Skeleton className={`mt-3 h-9 w-14 ${PULSE}`} />
            <Skeleton className={`mt-3 h-4 w-32 max-w-full ${PULSE}`} />
            <Skeleton className={`mt-2 h-3 w-24 max-w-full ${PULSE}`} />
          </div>
        ))}
      </div>

      <div aria-hidden="true" className="space-y-3">
        <Skeleton className={`h-5 w-56 ${PULSE}`} />
        <Skeleton className={`h-4 w-64 max-w-full ${PULSE}`} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 11 }, (_, i) => (
            <div key={i} className={`${CARD} min-h-[7.5rem] p-4`}>
              <Skeleton className={`size-10 rounded-xl ${PULSE}`} />
              <Skeleton className={`mt-4 h-4 w-28 max-w-full ${PULSE}`} />
              <Skeleton className={`mt-2 h-3 w-36 max-w-full ${PULSE}`} />
            </div>
          ))}
        </div>
      </div>

      <div aria-hidden="true" className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className={`${CARD} p-5`}>
            <Skeleton className={`h-5 w-44 ${PULSE}`} />
            <Skeleton className={`mt-2 h-3 w-72 max-w-full ${PULSE}`} />
            <Skeleton className={`mt-5 h-2 w-full rounded-full ${PULSE}`} />
            <div className="mt-4 space-y-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className={`size-6 rounded-full ${PULSE}`} />
                  <Skeleton className={`h-4 w-56 max-w-full ${PULSE}`} />
                </div>
              ))}
            </div>
          </div>
          <div className={`${CARD} p-5`}>
            <Skeleton className={`h-5 w-48 ${PULSE}`} />
            <Skeleton className={`mt-2 h-3 w-80 max-w-full ${PULSE}`} />
            <div className="mt-6 grid grid-cols-4 gap-4 sm:grid-cols-8">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <Skeleton className={`size-8 rounded-full ${PULSE}`} />
                  <Skeleton className={`h-3 w-12 ${PULSE}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={`${CARD} p-5`}>
          <Skeleton className={`h-5 w-32 ${PULSE}`} />
          <Skeleton className={`mt-2 h-3 w-48 max-w-full ${PULSE}`} />
          <div className="mt-5 space-y-4">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className={`size-8 rounded-full ${PULSE}`} />
                <div className="flex-1 space-y-2">
                  <Skeleton className={`h-4 w-36 max-w-full ${PULSE}`} />
                  <Skeleton className={`h-3 w-48 max-w-full ${PULSE}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div aria-hidden="true" className="grid items-start gap-6 lg:grid-cols-2">
        <ListCard />
        <ListCard />
      </div>

      <div aria-hidden="true" className="grid items-start gap-6 lg:grid-cols-3">
        <ListCard rows={5} className="lg:col-span-2" />
        <div className={`${CARD} p-5`}>
          <Skeleton className={`h-5 w-40 ${PULSE}`} />
          <Skeleton className={`mt-2 h-3 w-24 ${PULSE}`} />
          <div className="mt-6 flex h-40 items-end gap-3">
            {[30, 55, 40, 70, 50, 65].map((h, j) => (
              <Skeleton key={j} className={`flex-1 rounded-t-md rounded-b-none ${PULSE}`} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>

      <div aria-hidden="true" className="grid items-start gap-6 lg:grid-cols-2">
        <ListCard rows={2} />
        <ListCard rows={3} />
      </div>

      <div aria-hidden="true" className="grid items-start gap-6 lg:grid-cols-2">
        <ListCard rows={3} />
        <ListCard rows={3} />
      </div>
    </div>
  );
}
