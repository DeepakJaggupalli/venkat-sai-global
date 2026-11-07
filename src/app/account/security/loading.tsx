import { Skeleton } from "@/components/ui/skeleton";
import { getT } from "@/i18n/server";

export default async function SecurityLoading() {
  const t = await getT("auth");
  return (
    <div className="space-y-6" aria-busy="true">
      <p role="status" className="sr-only">
        {t("common.loading")}
      </p>
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      {[0, 1, 2].map((index) => (
        <div key={index} className="space-y-3 rounded-xl border p-4 sm:p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full max-w-lg" />
          <Skeleton className="h-10 w-40" />
        </div>
      ))}
    </div>
  );
}
