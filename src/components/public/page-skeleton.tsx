import { Skeleton } from "@/components/ui/skeleton";

/** Loading state for marketing pages: a navy hero band and a card grid, matching the final layout. */
export function PublicPageSkeleton({ label = "Loading page" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="bg-navy-deep">
        <div className="container-page space-y-5 py-16 sm:py-20">
          <Skeleton className="h-4 w-40 bg-white/10" />
          <Skeleton className="h-10 w-full max-w-xl bg-white/10" />
          <Skeleton className="h-5 w-full max-w-2xl bg-white/10" />
          <Skeleton className="h-5 w-2/3 max-w-xl bg-white/10" />
        </div>
      </div>
      <div className="container-page grid gap-5 py-14 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border bg-white p-6">
            <Skeleton className="size-11 rounded-lg" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ))}
      </div>
    </div>
  );
}
