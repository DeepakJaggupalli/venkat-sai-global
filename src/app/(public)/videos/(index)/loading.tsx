import { LoadingState } from "@/components/shared/loading-state";

export default function Loading() {
  return (
    <div className="container-page py-10 sm:py-14">
      <LoadingState variant="cards" />
    </div>
  );
}
