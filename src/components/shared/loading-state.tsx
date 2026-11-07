import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Skeleton presets for `loading.tsx` files and Suspense fallbacks. Each preset announces a single
 * polite "Loading…" message to screen readers; the skeleton shapes themselves are hidden from AT.
 *
 *   // app/employer/jobs/loading.tsx
 *   export default function Loading() { return <LoadingState variant="page" />; }
 */

/** One skeleton block. `bg-secondary` keeps it visible on white cards (bg-muted is too faint there). */
export function Bone({ className }: { className?: string }) {
  return <Skeleton className={cn("bg-secondary", className)} />;
}

function LoadingRegion({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn("w-full", className)}>
      <span className="sr-only">{label ?? "Loading…"}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export function PageHeaderSkeleton({ withActions = true }: { withActions?: boolean }) {
  return (
    <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-3">
        <Bone className="h-3 w-40" />
        <Bone className="h-7 w-64 max-w-full" />
        <Bone className="h-4 w-80 max-w-full" />
      </div>
      {withActions ? <Bone className="h-8 w-32" /> : null}
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <Bone className="h-3.5 w-24" />
          <Bone className="h-7 w-20" />
          <Bone className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 4, label, className }: { rows?: number; columns?: number; label?: string; className?: string }) {
  return (
    <LoadingRegion label={label} className={className}>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden items-center gap-4 border-b border-border bg-surface-subtle px-4 py-3 md:flex">
          {Array.from({ length: columns }, (_, i) => (
            <Bone key={i} className={cn("h-3.5", i === 0 ? "w-1/4" : "w-1/6")} />
          ))}
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} className="flex flex-col gap-2 px-4 py-4 md:flex-row md:items-center md:gap-4">
              {Array.from({ length: columns }, (_, c) => (
                <Bone key={c} className={cn("h-4", c === 0 ? "w-2/3 md:w-1/4" : c === 1 ? "w-1/2 md:w-1/6" : "hidden w-1/6 md:block")} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

export function CardsSkeleton({ count = 6, label, className }: { count?: number; label?: string; className?: string }) {
  return (
    <LoadingRegion label={label} className={className}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <Bone className="size-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Bone className="h-4 w-3/4" />
                <Bone className="h-3 w-1/2" />
              </div>
            </div>
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-5/6" />
            <div className="flex gap-2 pt-1">
              <Bone className="h-6 w-16 rounded-full" />
              <Bone className="h-6 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function DetailSkeleton({ label, className }: { label?: string; className?: string }) {
  return (
    <LoadingRegion label={label} className={className}>
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {[0, 1].map((block) => (
            <div key={block} className="space-y-4 rounded-xl border border-border bg-card p-5">
              <Bone className="h-5 w-40" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="space-y-2">
                    <Bone className="h-3 w-24" />
                    <Bone className="h-4 w-40 max-w-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <Bone className="h-5 w-32" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Bone className="size-6 rounded-full" />
              <div className="flex-1 space-y-2">
                <Bone className="h-3.5 w-3/4" />
                <Bone className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

export function PageSkeleton({ withStats = true, label, className }: { withStats?: boolean; label?: string; className?: string }) {
  return (
    <LoadingRegion label={label} className={className}>
      <PageHeaderSkeleton />
      <div className="space-y-6">
        {withStats ? <StatGridSkeleton /> : null}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap gap-3 border-b border-border p-4">
            <Bone className="h-8 w-full sm:w-64" />
            <Bone className="h-8 w-32" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }, (_, r) => (
              <div key={r} className="flex items-center gap-4 px-4 py-4">
                <Bone className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Bone className="h-4 w-1/2 md:w-1/3" />
                  <Bone className="h-3 w-1/3 md:w-1/5" />
                </div>
                <Bone className="hidden h-6 w-20 rounded-full sm:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}

type LoadingStateProps = {
  variant?: "page" | "table" | "cards" | "detail";
  label?: string;
  className?: string;
};

/** Pick a preset by name — the usual one-liner for `loading.tsx`. */
export function LoadingState({ variant = "page", label, className }: LoadingStateProps) {
  switch (variant) {
    case "table":
      return <TableSkeleton label={label} className={className} />;
    case "cards":
      return <CardsSkeleton label={label} className={className} />;
    case "detail":
      return <DetailSkeleton label={label} className={className} />;
    default:
      return <PageSkeleton label={label} className={className} />;
  }
}
