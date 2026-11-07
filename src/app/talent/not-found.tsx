"use client";

import { SearchX } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

/**
 * People Portal not-found page (unknown ids, another person's application or enrolment). Rendered inside
 * the portal shell, which already provides `<main id="main-content">`, and in the candidate's language.
 * The same page is shown whether an id does not exist or belongs to someone else, so nothing leaks.
 *
 * Synchronous on purpose: the /talent layout's I18nProvider already holds the talent-dashboard messages.
 * An async version (awaiting getT) suspended inside the detail pages' loading boundary after notFound()
 * aborted it, and React logged "Aborted, errored or already flushed boundaries should not be flushed again"
 * on every unknown enrolment, message, support request or job.
 */
export default function TalentNotFound() {
  const t = useT("talent-dashboard");
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center sm:py-16" data-testid="talent-not-found">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-subtle text-muted-foreground">
        <SearchX aria-hidden="true" className="size-6" />
      </span>
      <h1 className="mt-4 font-heading text-2xl font-bold text-navy">{t("notFound.title")}</h1>
      <p className="mt-2 max-w-md text-muted-foreground">{t("notFound.description")}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/talent">{t("notFound.dashboard")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/talent/jobs">{t("notFound.jobs")}</Link>
        </Button>
      </div>
    </div>
  );
}
