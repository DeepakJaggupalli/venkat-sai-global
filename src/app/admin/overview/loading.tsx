import { Bone } from "@/components/shared/loading-state";

/** Matches the owner overview: title, period tabs, two tile rows, the chart row and the breakdown cards. */
export default function OwnerOverviewLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-8">
      <span className="sr-only">Loading the owner overview…</span>
      <div aria-hidden="true" className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <Bone className="h-8 w-56 rounded-xl" />
            <Bone className="h-4 w-[28rem] max-w-full" />
          </div>
          <Bone className="h-9 w-40 rounded-full" />
        </div>
        <div className="border-border flex gap-3 border-b pb-2">
          <Bone className="h-6 w-16" />
          <Bone className="h-6 w-16" />
          <Bone className="h-6 w-16" />
        </div>
        <Tiles count={4} className="lg:grid-cols-4" />
        <Tiles count={6} className="lg:grid-cols-3" />
        <div className="grid gap-4 lg:grid-cols-5">
          <Bone className="h-[300px] rounded-[22px] lg:col-span-3" />
          <Bone className="h-[300px] rounded-[22px] lg:col-span-2" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Bone className="h-72 rounded-[22px]" />
          <Bone className="h-72 rounded-[22px]" />
        </div>
      </div>
    </div>
  );
}

function Tiles({ count, className }: { count: number; className: string }) {
  return (
    <div className="space-y-3">
      <Bone className="h-5 w-48" />
      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${className}`}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="border-border space-y-3 rounded-[20px] border bg-white p-4 sm:p-5">
            <Bone className="size-8 rounded-xl" />
            <Bone className="h-9 w-16" />
            <Bone className="h-4 w-32 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
