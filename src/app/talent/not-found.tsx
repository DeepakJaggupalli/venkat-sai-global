"use client";

import { NotFoundView } from "@/components/shared/not-found-view";
import { useT } from "@/i18n/client";

/**
 * People Portal not-found page (unknown ids, another person's application or enrolment). Rendered inside
 * the portal shell, which already provides `<main id="main-content">`, and in the candidate's language.
 * The same page is shown whether an id does not exist or belongs to someone else, so nothing leaks.
 * Same look as every other portal (shared NotFoundView), with translated words.
 *
 * Synchronous on purpose: the /talent layout's I18nProvider already holds the talent-dashboard messages.
 * An async version (awaiting getT) suspended inside the detail pages' loading boundary after notFound()
 * aborted it, and React logged "Aborted, errored or already flushed boundaries should not be flushed again"
 * on every unknown enrolment, message, support request or job.
 */
export default function TalentNotFound() {
  const t = useT("talent-dashboard");
  return (
    <div data-testid="talent-not-found">
      <NotFoundView
        homeHref="/talent"
        homeLabel={t("notFound.dashboard")}
        secondary={{ label: t("notFound.jobs"), href: "/talent/jobs" }}
        title={t("notFound.title")}
        description={t("notFound.description")}
        eyebrow={null}
      />
    </div>
  );
}
