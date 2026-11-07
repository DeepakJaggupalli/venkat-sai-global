import { CardsSkeleton, PageHeaderSkeleton, StatGridSkeleton } from "@/components/shared/loading-state";

/** People Portal loading state: header, stat tiles and cards (matches the dashboard layout). */
export default function TalentLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatGridSkeleton />
      <CardsSkeleton count={4} />
    </div>
  );
}
