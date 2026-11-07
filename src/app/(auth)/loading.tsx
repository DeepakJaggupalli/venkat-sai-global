import { Skeleton } from "@/components/ui/skeleton";
import { getT } from "@/i18n/server";

/** Placeholder while an auth screen loads (the split layout stays in place). */
export default async function AuthLoading() {
  const t = await getT("auth");
  return (
    <div className="space-y-6" aria-busy="true">
      <p role="status" className="sr-only">
        {t("common.loading")}
      </p>
      <div className="space-y-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
