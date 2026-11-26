import { Bone } from "@/components/shared/loading-state";

/** Matches the Command Centre home: greeting, how-to-use bar, tile rows, quick actions, charts and lists. */
export default function CommandCentreLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-8">
      <span className="sr-only">Loading your dashboard…</span>
      <div aria-hidden="true" className="space-y-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Bone className="h-10 w-72 max-w-full rounded-xl" />
            <Bone className="h-4 w-80 max-w-full" />
            <Bone className="h-4 w-44" />
            <div className="flex gap-2 pt-1">
              <Bone className="h-8 w-40 rounded-full" />
              <Bone className="h-8 w-56 rounded-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Bone className="col-span-2 h-11 w-48 rounded-full" />
            <Bone className="h-11 w-40 rounded-full" />
            <Bone className="h-11 w-36 rounded-full" />
          </div>
        </div>

        <Bone className="h-16 w-full rounded-[22px]" />

        <TileRow count={10} />

        <div className="space-y-3">
          <Bone className="h-5 w-36" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="border-border flex min-h-[7.5rem] flex-col gap-3 rounded-[18px] border bg-white p-4">
                <Bone className="size-10 rounded-xl" />
                <Bone className="h-4 w-32 max-w-full" />
                <Bone className="h-3 w-40 max-w-full" />
              </div>
            ))}
          </div>
        </div>

        <TileRow count={10} />

        <div className="grid gap-4 lg:grid-cols-5">
          <Bone className="h-[300px] rounded-[22px] lg:col-span-3" />
          <Bone className="h-[300px] rounded-[22px] lg:col-span-2" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Bone className="h-72 rounded-[22px]" />
          <Bone className="h-72 rounded-[22px]" />
          <Bone className="h-72 rounded-[22px]" />
        </div>
      </div>
    </div>
  );
}

function TileRow({ count }: { count: number }) {
  return (
    <div className="space-y-3">
      <Bone className="h-5 w-48" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="border-border space-y-3 rounded-[20px] border bg-white p-4 sm:p-5">
            <Bone className="size-8 rounded-xl" />
            <Bone className="h-9 w-16" />
            <Bone className="h-4 w-32 max-w-full" />
            <Bone className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
