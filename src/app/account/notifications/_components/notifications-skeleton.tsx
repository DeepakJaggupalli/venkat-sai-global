import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder shared by the inbox and preferences pages. */
export function NotificationsSkeleton({ rows = 4, label = "Loading notifications" }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-6" aria-busy="true">
      <p role="status" className="sr-only">
        {label}
      </p>
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-10 w-full max-w-xs" />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex gap-3 rounded-xl border p-4 sm:p-5">
          <Skeleton className="mt-1 size-2.5 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-5 w-full max-w-lg" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
