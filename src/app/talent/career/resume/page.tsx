import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Callout } from "@/components/shared/callout";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { PrintButton } from "@/components/talent/career/career-client";
import { intlLocaleOf } from "@/components/talent/labels";
import { getLocale, getT } from "@/i18n/server";
import { sp, type SearchParams } from "@/lib/http";
import { requireCandidate } from "@/modules/candidates/guard";
import { getCandidateProfileDetail } from "@/modules/candidates/queries";
import { selfActor } from "@/modules/candidates/service";
import { countryOptions } from "@/modules/taxonomy/queries";

import { getAgeGateForCandidate } from "../../onboarding/_lib/state";
import { ResumeSheet, type ResumeTemplate } from "./_components/resume-sheet";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-account");
  return { title: t("career.resume.title") };
}

const PATH = "/talent/career/resume";

/** Print rules: only the resume sheet is printed (the portal shell, header and controls are hidden). */
const PRINT_CSS = `@media print {
  @page { margin: 14mm; }
  body * { visibility: hidden !important; }
  #resume-sheet, #resume-sheet * { visibility: visible !important; }
  #resume-sheet { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: 0 !important; padding: 0 !important; }
}`;

/**
 * /talent/career/resume — resume built from the candidate's own profile, in two ATS-friendly
 * single-column templates (real text, standard headings, no tables or graphics), printed to PDF
 * with the browser's print dialog. Nothing is stored; edits happen on the profile.
 */
export default async function ResumeBuilderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireCandidate();
  const gate = await getAgeGateForCandidate(session.candidate);
  if (gate.state !== "complete") redirect("/talent/onboarding");
  const [t, tc, locale, params, detail, countries] = await Promise.all([
    getT("talent-account"),
    getT("common"),
    getLocale(),
    searchParams,
    getCandidateProfileDetail(selfActor(session)),
    countryOptions(),
  ]);
  if (!detail) notFound();
  const template: ResumeTemplate = sp(params, "template") === "compact" ? "compact" : "classic";
  const tp = await getT("talent-profile");

  return (
    <div className="space-y-6">
      <style>{PRINT_CSS}</style>
      <div className="space-y-6 print:hidden">
        <PageHeader
          title={t("career.resume.title")}
          description={t("career.resume.builderDescription")}
          breadcrumbs={[{ label: tc("portal.talent"), href: "/talent" }, { label: tc("nav.career"), href: "/talent/career" }, { label: t("career.resume.title") }]}
          actions={[<PrintButton key="print" label={t("career.resume.print")} />, { label: t("career.resume.edit"), href: "/talent/profile", variant: "outline" }]}
        />
        <LinkTabs
          label={t("career.resume.templates")}
          items={[
            { href: `${PATH}?template=classic`, label: t("career.resume.classic"), match: "exact" },
            { href: `${PATH}?template=compact`, label: t("career.resume.compact"), match: "exact" },
          ]}
          activeHref={`${PATH}?template=${template}`}
        />
        <Callout tone="info" title={t("career.resume.howTitle")}>
          <p>{t("career.resume.how")}</p>
        </Callout>
        {detail.completeness.score < 50 ? (
          <Callout tone="warning" title={t("career.resume.thinTitle")} action={{ label: t("career.resume.edit"), href: "/talent/profile" }}>
            <p>{t("career.resume.thin")}</p>
          </Callout>
        ) : null}
      </div>
      <ResumeSheet template={template} detail={detail} t={t} tp={tp} loc={intlLocaleOf(locale)} countries={countries} />
      <p className="text-sm text-muted-foreground print:hidden">
        {t("career.resume.privacy")}{" "}
        <Link href="/talent/privacy" className="font-medium text-teal-strong underline underline-offset-2">
          {tc("nav.privacy")}
        </Link>
      </p>
    </div>
  );
}
