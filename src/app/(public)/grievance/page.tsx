import { CalendarDays, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/modules/identity/session";
import { GRIEVANCE_TYPE_LABELS, GRIEVANCE_TYPE_VALUES } from "@/modules/operations/constants";

import { DateText } from "@/components/shared/date-text";

import { Prose } from "../news/_components/article-parts";
import { MetaItem, PreviewRibbon, PublicHero } from "../news/_components/public-hero";
import { entryMetadata, listingMetadata, loadEntry, loadPrivacyTimelines, loadSiteSettings, readPreview, safeLoad, type PageSearchParams } from "../news/_lib/cms";
import { calendarDate } from "../news/_lib/text";
import { TicketForm } from "../support/_components/ticket-form";
import { submitGrievanceAction } from "./actions";
import { GrievanceOfficerCard, GrievanceTimelines } from "./_components/officer-card";

const SLUG = "grievance-redressal";
const DESCRIPTION = "How to raise a grievance with Venkat Sai Global, who handles it and how quickly we respond.";

export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const detail = await safeLoad("grievance.meta", () => loadEntry("pages", SLUG, readPreview(sp)), null);
  return detail ? entryMetadata(detail, { path: "/grievance", type: "website", fallbackDescription: DESCRIPTION }) : listingMetadata("Grievance redressal", DESCRIPTION, "/grievance");
}

export default async function GrievancePage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = await searchParams;
  const [detail, settings, timelines, user, locale] = await Promise.all([
    safeLoad("grievance.page", () => loadEntry("pages", SLUG, readPreview(sp)), null),
    loadSiteSettings(),
    loadPrivacyTimelines(),
    getCurrentUser(),
    getLocale(),
  ]);
  const page = detail?.entry;
  const effective = calendarDate(page?.data.effectiveDate);
  const grievanceTypes = GRIEVANCE_TYPE_VALUES.map((value) => ({ value, label: GRIEVANCE_TYPE_LABELS[value] }));

  return (
    <>
      <PreviewRibbon preview={Boolean(detail?.preview)} />
      <PublicHero
        eyebrow="Grievance redressal"
        title={page?.title ?? "Grievance redressal"}
        description={page?.summary ?? "If something has gone wrong, tell us. Every grievance is registered with a reference, acknowledged and resolved within the timelines below."}
        breadcrumbs={[{ label: "Grievance redressal" }]}
        meta={
          effective ? (
            <MetaItem icon={<CalendarDays />}>
              Effective <DateText value={effective} dateOnly />
              {page?.data.version ? ` · Version ${page.data.version}` : ""}
            </MetaItem>
          ) : undefined
        }
      />
      <div className="container-page grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-10">
          {page?.data.body ? <Prose html={page.data.body} /> : null}
          <div id="raise" className="scroll-mt-24 rounded-xl border border-border/80 bg-card p-5 shadow-xs sm:p-8">
            <TicketForm mode="grievance" formId="grievance" action={submitGrievanceAction} signedInAs={user?.displayName ?? null} grievanceTypes={grievanceTypes} locale={locale} />
          </div>
        </div>
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start" aria-label="Grievance officer and timelines">
          <GrievanceOfficerCard officer={settings?.grievanceOfficer} />
          <GrievanceTimelines ackHours={timelines.ackHours} resolutionDays={timelines.resolutionDays} />
          <section aria-labelledby="grievance-fraud-title" className="rounded-xl border border-border/80 bg-surface-subtle p-6">
            <h2 id="grievance-fraud-title" className="flex items-center gap-2 font-heading text-lg font-semibold text-navy">
              <ShieldCheck className="size-5 text-teal" aria-hidden="true" />
              Asked to pay for a job?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Venkat Sai Global never charges candidates. Report the offer using this form, choosing &ldquo;General grievance&rdquo;.
            </p>
            <Link href="/safe-recruitment" className="mt-3 inline-block text-sm font-semibold text-teal-strong hover:underline">
              Warning signs of recruitment fraud
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
