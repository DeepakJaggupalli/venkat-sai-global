import { Bone } from "@/components/shared/loading-state";

const CARD = "rounded-[22px] border border-border bg-white shadow-card";

/** Dashboard skeleton in the same shape as the page: header, headline tiles, quick actions, then two columns. */
export default function EmployerDashboardLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="w-full">
      <span className="sr-only">Loading your dashboard…</span>
      <div aria-hidden="true" className="space-y-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Bone className="h-3 w-36" />
            <Bone className="h-10 w-72 max-w-full" />
            <Bone className="h-4 w-80 max-w-full" />
            <Bone className="h-4 w-48" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Bone className="col-span-2 h-11 w-44 rounded-full" />
            <Bone className="h-11 w-32 rounded-full" />
            <Bone className="h-11 w-32 rounded-full" />
          </div>
        </div>

        <div className="space-y-4">
          <Bone className="h-6 w-48" />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="space-y-3 rounded-[20px] border border-border bg-white p-4 shadow-card sm:p-5">
                <Bone className="size-8 rounded-xl" />
                <Bone className="h-9 w-16" />
                <Bone className="h-4 w-32 max-w-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Bone className="h-6 w-40" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex min-h-[7.5rem] flex-col gap-3 rounded-[18px] border border-border bg-white p-4 shadow-xs">
                <Bone className="size-10 shrink-0 rounded-xl" />
                <div className="w-full space-y-2">
                  <Bone className="h-4 w-24" />
                  <Bone className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <div className={`${CARD} space-y-4 p-5`}>
              <Bone className="h-5 w-44" />
              <Bone className="h-56 w-full rounded-2xl" />
            </div>
            <div className={`${CARD} space-y-3 p-5`}>
              <Bone className="h-5 w-40" />
              {Array.from({ length: 4 }, (_, i) => (
                <Bone key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
          <div className="min-w-0 space-y-6">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className={`${CARD} space-y-3 p-5`}>
                <Bone className="h-5 w-36" />
                <Bone className="h-4 w-full" />
                <Bone className="h-4 w-4/5" />
                <Bone className="h-11 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
