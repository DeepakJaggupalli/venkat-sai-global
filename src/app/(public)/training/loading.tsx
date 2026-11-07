import { CardsSkeleton } from "@/components/shared/loading-state";

export default function Loading() {
  return (
    <div className="bg-surface-subtle">
      <div className="h-40 border-b bg-navy" aria-hidden="true" />
      <div className="container-page py-6 sm:py-8">
        <CardsSkeleton count={6} />
      </div>
    </div>
  );
}
