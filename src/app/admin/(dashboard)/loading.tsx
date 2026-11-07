import { PageHeaderSkeleton, StatGridSkeleton } from "@/components/shared/loading-state";

export default function AdminLoading() {
  return (
    <div className="space-y-8" aria-busy="true">
      <PageHeaderSkeleton withActions={false} />
      <StatGridSkeleton count={6} />
      <StatGridSkeleton count={4} />
      <StatGridSkeleton count={4} />
    </div>
  );
}
