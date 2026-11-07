import { LoadingState } from "@/components/shared/loading-state";

export default function JobsLoading() {
  return (
    <div className="container-page py-8">
      <LoadingState variant="cards" />
    </div>
  );
}
