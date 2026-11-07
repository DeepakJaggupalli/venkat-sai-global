import { CardsSkeleton, PageHeaderSkeleton, StatGridSkeleton } from "@/components/shared/loading-state";

export default function EmployerDashboardLoading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />
      <StatGridSkeleton />
      <CardsSkeleton count={3} />
    </div>
  );
}
