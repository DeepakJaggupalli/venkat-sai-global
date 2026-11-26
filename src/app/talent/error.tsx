"use client";

import { RouteError } from "@/components/shared/route-error";
import { useT } from "@/i18n/client";

/** Any People Portal page without its own boundary: the friendly error in the candidate's language. */
export default function TalentError({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  const t = useT("talent-jobs");
  const d = useT("talent-dashboard");
  return (
    <RouteError
      reset={reset}
      retry={retry}
      digest={error.digest}
      homeHref="/talent"
      audience="external"
      labels={{
        title: t("error.title"),
        body: t("error.body"),
        retry: t("error.retry"),
        home: d("notFound.dashboard"),
        whatsapp: t("error.whatsapp"),
        reference: t("error.reference", { code: "{code}" }),
      }}
    />
  );
}
