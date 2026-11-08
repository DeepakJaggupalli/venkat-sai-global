import { Skeleton } from "@/components/ui/skeleton";

/** Loading state for marketing pages: a white hero and a card grid, matching the final layout. */
export function PublicPageSkeleton({ label = "Loading page" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="border-b border-border bg-white">
        <div className="container-page space-y-5 py-16 sm:py-24">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-14 w-full max-w-2xl" />
          <Skeleton className="h-5 w-full max-w-2xl" />
          <Skeleton className="h-5 w-2/3 max-w-xl" />
        </div>
      </div>
      <div className="container-page grid gap-5 py-14 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-border bg-white p-6">
            <Skeleton className="aspect-[16/10] w-full rounded-xl" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ))}
      </div>
    </div>
  );
}
