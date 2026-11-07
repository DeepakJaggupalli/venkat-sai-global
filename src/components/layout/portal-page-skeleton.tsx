"use client";

import { Skeleton } from "@/components/ui/skeleton";

import { useShellT } from "./shell-i18n";

/**
 * Loading placeholder for portal pages (used by each portal's loading.tsx). Mirrors the common page
 * shape — header, a row of summary cards and a list — so content does not jump when it arrives.
 */
export function PortalPageSkeleton({ cards = 4, rows = 5 }: { cards?: number; rows?: number }) {
  const t = useShellT();
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-8">
      <span className="sr-only">{t("state.loading")}</span>
      <div aria-hidden className="space-y-3">
        <Skeleton className="h-4 w-28 bg-border/70" />
        <Skeleton className="h-8 w-64 max-w-full bg-border/70" />
        <Skeleton className="h-4 w-96 max-w-full bg-border/60" />
      </div>
      {cards > 0 && (
        <div aria-hidden className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: cards }, (_, index) => (
            <div key={index} className="rounded-xl border border-border bg-white p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-7 w-16" />
              <Skeleton className="mt-3 h-3 w-32 max-w-full" />
            </div>
          ))}
        </div>
      )}
      <div aria-hidden className="rounded-xl border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
        <ul className="divide-y divide-border">
          {Array.from({ length: rows }, (_, index) => (
            <li key={index} className="flex items-center gap-4 p-5">
              <Skeleton className="size-10 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
