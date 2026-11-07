import { Eye, FileText, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { FileLink } from "@/components/files";
import { UserAvatar } from "@/components/shared/avatars";
import { PageHeader } from "@/components/shared/page-header";
import { ProgressRing } from "@/components/shared/progress-ring";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { intlLocaleOf } from "@/components/talent/labels";
import { FileRefForm } from "@/components/talent/profile/about-forms";
import { EditDialog } from "@/components/talent/profile/dialog";
import { getLocale, getT } from "@/i18n/server";
import { requireCandidate } from "@/modules/candidates/guard";
import { getCandidateProfileDetail } from "@/modules/candidates/queries";
import { selfActor } from "@/modules/candidates/service";
import {
  countryOptions,
  currencyOptions,
  industryOptions,
  jobCategoryOptions,
  listEducationLevels,
  listLanguages,
  listQualificationTypes,
} from "@/modules/taxonomy/queries";

import { getAgeGateForCandidate } from "../onboarding/_lib/state";
import { setPhoto, setResume } from "./actions";
import { AboutSections } from "./_components/about-sections";
import { EvidenceSections } from "./_components/evidence-sections";
import { HistorySections } from "./_components/history-sections";
import { getPreferredContactMethod, listCredentialSkillLinks } from "./_lib/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-profile");
  return { title: t("profile.title") };
}

/**
 * /talent/profile — the candidate's own profile (spec 8.2–8.4): completeness with next best
 * actions, per-item verification, every section editor, and a link to the employer preview.
 * Section anchors (#personal, #experience, #documents, …) are targets of module links and hints.
 */
export default async function TalentProfilePage() {
  const session = await requireCandidate();
  const gate = await getAgeGateForCandidate(session.candidate);
  if (gate.state !== "complete") redirect("/talent/onboarding");

  const [t, locale, detail, contactMethod, credentialLinks, countries, currencies, industries, categories, languages, levels, qualificationTypes] = await Promise.all([
    getT("talent-profile"),
    getLocale(),
    getCandidateProfileDetail(selfActor(session)),
    getPreferredContactMethod(session.user.id),
    listCredentialSkillLinks(session.candidate.id),
    countryOptions(),
    currencyOptions(),
    industryOptions(),
    jobCategoryOptions(),
    listLanguages(),
    listEducationLevels(),
    listQualificationTypes(),
  ]);
  if (!detail) notFound();

  const loc = intlLocaleOf(locale);
  const { profile, account, completeness } = detail;
  const name = profile.legalName || account.displayName;
  const location = [profile.city, profile.stateRegion, countries.find((c) => c.value === profile.currentCountryCode)?.label].filter(Boolean).join(", ");
  const options = {
    countries,
    currencies,
    industries,
    categories,
    languages: languages.map((l) => ({ value: l.code, label: l.name })),
    levels: levels.map((l) => ({ value: l.id, label: l.name })),
    qualificationTypes: qualificationTypes.map((q) => ({ value: q.id, label: q.name })),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("profile.title")}
        description={t("profile.description")}
        breadcrumbs={[{ label: t("breadcrumb.portal"), href: "/talent" }, { label: t("profile.title") }]}
        actions={[
          { label: t("profile.preview"), href: "/talent/profile/preview", icon: <Eye aria-hidden="true" /> },
          { label: t("profile.resumeBuilder"), href: "/talent/career/resume", variant: "outline", icon: <FileText aria-hidden="true" /> },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <SectionCard title={t("profile.overview")} headingLevel="h2" id="photo">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex flex-col items-center gap-3">
              {detail.photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- private, access-checked file route
                <img src={detail.photo.thumbnailUrl ?? detail.photo.url} alt={t("profile.photoAlt")} className="size-24 rounded-full border object-cover" />
              ) : (
                <UserAvatar name={name} size="xl" />
              )}
              <EditDialog mode="edit" triggerLabel={detail.photo ? t("photo.change") : t("photo.add")} title={t("photo.title")} description={t("photo.description")} size="md">
                <FileRefForm action={setPhoto} purpose="avatar" file={detail.photo} label={t("photo.label")} description={t("photo.hint")} />
              </EditDialog>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="font-heading text-xl font-semibold text-navy">{name}</p>
                <p className="text-muted-foreground">{profile.headline || t("profile.noHeadline")}</p>
                {location ? <p className="text-sm text-muted-foreground">{location}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={profile.verificationLevel === "none" ? "neutral" : "success"} size="sm">
                  {t(`level.${profile.verificationLevel}`)}
                </StatusBadge>
                <StatusBadge tone="info" size="sm">
                  {t(`enum.visibility.${profile.visibility}`)}
                </StatusBadge>
                {profile.isOpenToWork ? (
                  <StatusBadge tone="brand" size="sm">
                    {t("profile.openToWork")}
                  </StatusBadge>
                ) : null}
                {detail.isMinor ? (
                  <StatusBadge tone="warning" size="sm">
                    {t("profile.minorBadge")}
                  </StatusBadge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">{t(`level.${profile.verificationLevel}.hint`)}</p>
              <div id="resume" className="scroll-mt-24 rounded-lg border bg-surface-subtle p-3">
                <p className="text-sm font-medium">{t("resume.title")}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {detail.resume ? <FileLink file={detail.resume} showMeta /> : <span className="text-sm text-muted-foreground">{t("resume.none")}</span>}
                  <EditDialog mode={detail.resume ? "edit" : "add"} triggerLabel={detail.resume ? t("resume.replace") : t("resume.upload")} title={t("resume.title")} description={t("resume.description")} size="md">
                    <FileRefForm action={setResume} purpose="resume" file={detail.resume} label={t("resume.label")} description={t("resume.hint")} />
                  </EditDialog>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t("completeness.title")} headingLevel="h2" icon={<ShieldCheck aria-hidden="true" className="size-5" />}>
          <div className="flex items-center gap-4">
            <ProgressRing value={completeness.score} label={t("completeness.title")} size="lg" tone={completeness.score >= 80 ? "success" : "brand"} />
            <p className="text-sm text-muted-foreground">{completeness.score >= 100 ? t("completeness.complete") : t("completeness.why")}</p>
          </div>
          {completeness.nextActions.length ? (
            <div className="mt-4">
              <p className="text-sm font-medium">{t("completeness.next")}</p>
              <ul className="mt-2 divide-y">
                {completeness.nextActions.slice(0, 5).map((action) => (
                  <li key={action.key} className="flex items-center justify-between gap-3 py-2">
                    <Link href={action.href} className="text-sm font-medium text-teal-strong underline-offset-2 hover:underline">
                      {t(`hint.${action.key}`) === `hint.${action.key}` ? action.label : t(`hint.${action.key}`)}
                    </Link>
                    {action.points > 0 ? <span className="shrink-0 text-xs text-muted-foreground">{t("completeness.points", { count: action.points })}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SectionCard>
      </div>

      <AboutSections t={t} loc={loc} detail={detail} contactMethod={contactMethod} options={options} />
      <HistorySections t={t} loc={loc} detail={detail} options={options} />
      <EvidenceSections t={t} loc={loc} detail={detail} credentialLinks={credentialLinks} options={options} />

      <SectionCard id="privacy" title={t("section.privacy")} description={t("section.privacy.description")} headingLevel="h2" action={{ label: t("section.privacy.manage"), href: "/talent/privacy", variant: "outline" }}>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li>
            <span className="text-muted-foreground">{t("field.visibility")}: </span>
            {t(`enum.visibility.${profile.visibility}`)}
          </li>
          <li>
            <span className="text-muted-foreground">{t("privacy.nameShown")}: </span>
            {detail.privacy.showFullNameToEmployers ? t("common.yes") : t("privacy.initialsOnly")}
          </li>
          <li>
            <span className="text-muted-foreground">{t("privacy.photoShown")}: </span>
            {detail.privacy.showPhoto ? t("common.yes") : t("common.no")}
          </li>
          <li>
            <span className="text-muted-foreground">{t("privacy.blocked")}: </span>
            {detail.privacy.blockedOrganizationIds.length}
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}

