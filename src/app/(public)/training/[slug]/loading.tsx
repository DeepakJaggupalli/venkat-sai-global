import { DetailSkeleton } from "@/components/shared/loading-state";

export default function Loading() {
  return (
    <div className="bg-surface-subtle">
      <div className="h-48 border-b bg-navy" aria-hidden="true" />
      <div className="container-page py-6 sm:py-8">
        <DetailSkeleton />
      </div>
    </div>
  );
}
