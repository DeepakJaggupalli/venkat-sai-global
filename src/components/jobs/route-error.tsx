"use client";

import { RouteError } from "@/components/shared/route-error";
import { useT } from "@/i18n/client";

/**
 * Translated error boundary body for People Portal job routes: the shared friendly error screen in the
 * candidate's language, with a retry, a way back and WhatsApp support. Only the digest is shown; no details leak.
 */
export function JobsRouteError({
  error,
  reset,
  retry,
  backHref,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  retry?: () => void;
  backHref: string;
}) {
  const t = useT("talent-jobs");
  return (
    <RouteError
      digest={error.digest}
      reset={reset}
      retry={retry}
      homeHref={backHref}
      audience="external"
      labels={{
        title: t("error.title"),
        body: t("error.body"),
        retry: t("error.retry"),
        home: t("error.back"),
        whatsapp: t("error.whatsapp"),
        reference: t("error.reference", { code: "{code}" }),
      }}
    />
  );
}
