import { LoadingState } from "@/components/shared/loading-state";

export default function Loading() {
  return <LoadingState variant="detail" label="Loading the backup page" className="mx-auto w-full max-w-3xl" />;
}
