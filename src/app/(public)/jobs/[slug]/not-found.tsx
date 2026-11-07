import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { getT } from "@/i18n/server";

/** A job that was closed, filled, removed or never existed: explain kindly and point to open jobs. */
export default async function JobNotFound() {
  const t = await getT("talent-jobs");
  return (
    <div className="container-page py-12">
      <h1 className="sr-only">{t("detail.notFoundTitle")}</h1>
      <EmptyState
        icon={<SearchX />}
        titleAs="h2"
        title={t("detail.notFoundTitle")}
        description={t("detail.notFoundDescription")}
        primaryAction={{ label: t("detail.browseJobs"), href: "/jobs" }}
        secondaryAction={{ label: t("alerts.create"), href: "/talent/alerts" }}
      />
    </div>
  );
}
