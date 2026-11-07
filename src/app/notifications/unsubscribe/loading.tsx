import { Skeleton } from "@/components/ui/skeleton";

export default function UnsubscribeLoading() {
  return (
    <div className="flex min-h-dvh items-start justify-center bg-surface-subtle px-4 py-16" aria-busy="true">
      <p role="status" className="sr-only">
        Loading
      </p>
      <div className="w-full max-w-lg space-y-4 rounded-xl border bg-white p-6 sm:p-8">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-40" />
      </div>
    </div>
  );
}
