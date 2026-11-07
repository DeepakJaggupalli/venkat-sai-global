import {
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  Clock,
  ExternalLink,
  FileCheck2,
  Gift,
  Globe2,
  Laptop,
  ListChecks,
  Lock,
  MapPin,
  Plane,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { OrgAvatar } from "@/components/shared/avatars";
import { SafeHtml } from "@/components/shared/safe-html";
import { VerificationBadge } from "@/components/shared/verification-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PublicJobDetail } from "@/modules/jobs/types";

import { EmployerLine, jobLocationText } from "./job-card";
import { daysUntil, enumLabel, experienceText, intlLocale, isClosingSoon, placeText, salaryText, type Translate } from "./labels";
import { SaveJobButton } from "./save-job-button";
import { ShareJobButton } from "./share-job-button";

export type JobApplyCta =
  | { kind: "platform"; href: string; signedIn: boolean }
  | { kind: "external"; url: string }
  | { kind: "applied"; href: string }
  | { kind: "closed" };

type JobDetailViewProps = {
  job: PublicJobDetail;
  t: Translate;
  locale: string;
  apply: JobApplyCta;
  shareUrl: string;
  viewer: { signedIn: boolean; returnTo: string };
  timeZone: string;
  now?: Date;
};

function TextBlock({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-foreground">
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

function DetailSection({ id, title, icon, children }: { id: string; title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-card p-4 shadow-xs sm:p-6">
      <h2 id={id} className="flex items-center gap-2 font-heading text-lg font-semibold text-navy">
        {icon ? (
          <span aria-hidden="true" className="text-teal-strong [&_svg]:size-5">
            {icon}
          </span>
        ) : null}
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Facts({ items }: { items: { key: string; label: string; value: ReactNode; icon: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        // dt/dd must be direct children of the dl's div wrapper (axe definition-list), so the icon sits inside the dt.
        <div key={item.key} className="relative min-w-0 pl-6.5">
          <dt className="text-xs text-muted-foreground">
            <span aria-hidden="true" className="absolute top-0.5 left-0 text-muted-foreground [&_svg]:size-4">
              {item.icon}
            </span>
            {item.label}
          </dt>
          <dd className="text-sm font-medium break-words text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ApplyPanel({ job, t, apply, shareUrl, viewer, closesLabel }: Pick<JobDetailViewProps, "job" | "t" | "apply" | "shareUrl" | "viewer"> & { closesLabel: string | null }) {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      {apply.kind === "platform" ? (
        <Button asChild size="lg" className="w-full" data-testid="apply-button">
          <Link href={apply.signedIn ? apply.href : `/sign-in?returnTo=${encodeURIComponent(apply.href)}`} rel={apply.signedIn ? undefined : "nofollow"}>
            {apply.signedIn ? t("detail.apply") : t("detail.signInToApply")}
          </Link>
        </Button>
      ) : apply.kind === "external" ? (
        <>
          <Button asChild size="lg" className="w-full">
            <a href={apply.url} target="_blank" rel="noopener noreferrer nofollow">
              {t("detail.applyExternal")}
              <ExternalLink aria-hidden="true" />
              <span className="sr-only">{t("detail.opensNewTab")}</span>
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">{t("detail.externalNotice")}</p>
        </>
      ) : apply.kind === "applied" ? (
        <>
          <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success-strong">
            <BadgeCheck aria-hidden="true" className="size-4" />
            {t("detail.alreadyApplied")}
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href={apply.href}>{t("detail.viewApplication")}</Link>
          </Button>
        </>
      ) : (
        <p className="rounded-lg bg-surface-subtle px-3 py-2 text-sm text-muted-foreground">{t("detail.closed")}</p>
      )}
      {closesLabel ? <p className="text-center text-xs text-muted-foreground">{closesLabel}</p> : null}
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <SaveJobButton jobId={job.id} jobTitle={job.title} initialSaved={job.isSaved} signedIn={viewer.signedIn} returnTo={viewer.returnTo} variant="full" />
        <ShareJobButton jobId={job.id} title={job.title} url={shareUrl} />
      </div>
      <p className="flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-teal-strong" />
        <span>
          {t("safety.neverCharge")}{" "}
          <Link href="/safe-recruitment" className="font-medium text-teal-strong underline underline-offset-2">
            {t("safety.learnHow")}
          </Link>
        </span>
      </p>
    </div>
  );
}

/**
 * Full job page (spec 8.4) shared by the public board and the People Portal: every job field, the
 * information source (verified / employer-supplied / pending review), employment terms, benefits,
 * sponsorship, the recruitment process, the recruiting agent for overseas jobs (CONVENTIONS 15.2), the
 * employer profile and a privacy notice. Confidential jobs never reveal the organisation.
 */
export function JobDetailView({ job, t, locale, apply, shareUrl, viewer, timeZone, now = new Date() }: JobDetailViewProps) {
  const loc = intlLocale(locale);
  const salary = salaryText(t, job.salary, locale);
  const experience = experienceText(t, job.experienceMinYears, job.experienceMaxYears);
  const closesIn = daysUntil(job.closesAt, now);
  const soon = isClosingSoon(job.closesAt, now);
  const closesLabel =
    job.closesAt && closesIn !== null ? (closesIn === 0 ? t("card.closesToday") : t("detail.closesOn", { date: formatDate(job.closesAt, { timeZone, locale: loc }) })) : null;
  const verifiedEmployer = job.employer.verified || job.verifiedEmployer;
  const infoLabels: Record<string, { label: string; description: string }> = {
    verified: { label: t("info.verified"), description: t("info.verifiedDescription") },
    employer_supplied: { label: t("info.employerSupplied"), description: t("info.employerSuppliedDescription") },
    pending_review: { label: t("info.pendingReview"), description: t("info.pendingReviewDescription") },
  };
  const info = infoLabels[job.infoSource] ?? infoLabels.employer_supplied;
  const perks = [
    job.accommodationProvided ? t("benefits.accommodation") : null,
    job.foodProvided ? t("benefits.food") : null,
    job.transportProvided ? t("benefits.transport") : null,
  ].filter((v): v is string => !!v);
  const showSponsorship = job.isOverseas || job.visaSponsorship !== "not_applicable" || !!job.sponsorshipDetails;

  const keyFacts = [
    { key: "location", label: t("card.location"), value: jobLocationText(job, t), icon: <MapPin /> },
    { key: "type", label: t("card.employmentType"), value: enumLabel(t, "employmentType", job.employmentType), icon: <Briefcase /> },
    { key: "mode", label: t("card.workMode"), value: enumLabel(t, "workMode", job.workMode), icon: <Laptop /> },
    { key: "salary", label: t("card.salary"), value: salary ?? t("salary.notDisclosed"), icon: <Wallet /> },
    {
      key: "experience",
      label: t("card.experience"),
      value: [experience, job.experienceLevel ? enumLabel(t, "experienceLevel", job.experienceLevel) : null].filter(Boolean).join(" · ") || t("detail.notStated"),
      icon: <Clock />,
    },
    { key: "openings", label: t("detail.openings"), value: t("detail.openingsCount", { count: job.openings }), icon: <Users /> },
    {
      key: "posted",
      label: t("detail.posted"),
      value: job.publishedAt ? formatDate(job.publishedAt, { timeZone, locale: loc }) : t("detail.notStated"),
      icon: <CalendarDays />,
    },
    {
      key: "closes",
      label: t("detail.applyBy"),
      value: job.closesAt ? <span className={cn(soon && "text-warning-strong")}>{formatDate(job.closesAt, { timeZone, locale: loc })}</span> : t("detail.noDeadline"),
      icon: <CalendarClock />,
    },
  ];

  const terms = [
    job.contractDurationMonths ? { key: "contract", label: t("terms.contract"), value: t("terms.months", { count: job.contractDurationMonths }), icon: <FileCheck2 /> } : null,
    job.workingHours ? { key: "hours", label: t("terms.hours"), value: job.workingHours, icon: <Clock /> } : null,
    job.startDate ? { key: "start", label: t("terms.start"), value: formatDate(job.startDate, { timeZone: "UTC", locale: loc }), icon: <CalendarDays /> } : null,
    job.minEducationLevel ? { key: "education", label: t("terms.education"), value: job.minEducationLevel.name, icon: <ListChecks /> } : null,
    job.industry ? { key: "industry", label: t("terms.industry"), value: job.industry.name, icon: <Building2 /> } : null,
    job.category ? { key: "category", label: t("terms.category"), value: job.category.name, icon: <Briefcase /> } : null,
  ].filter((v): v is NonNullable<typeof v> => v !== null);

  return (
    <article className="space-y-6" data-testid="job-detail">
      <header className="rounded-xl border bg-card p-4 shadow-xs sm:p-6">
        <div className="flex items-start gap-4">
          {job.employer.confidential ? (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-surface-subtle text-muted-foreground" aria-hidden="true">
              <Building2 className="size-7" />
            </span>
          ) : (
            <OrgAvatar name={job.employer.name} src={job.employer.logoUrl} size="lg" verified={job.employer.verified} />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-mono text-xs text-muted-foreground">{job.code}</p>
            <h1 className="font-heading text-2xl leading-tight font-bold text-navy sm:text-3xl">{job.title}</h1>
            <EmployerLine job={job} t={t} />
            <div className="flex flex-wrap items-center gap-2">
              <VerificationBadge state={job.infoSource} label={info.label} description={info.description} />
              {job.isFeatured ? <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold-strong">{t("tag.featured")}</span> : null}
              {job.isOverseas ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-xs font-medium text-teal-strong">
                  <Plane aria-hidden="true" className="size-3" />
                  {t("tag.overseas")}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="mt-5 border-t pt-5">
          <Facts items={keyFacts} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 min-w-0 space-y-6 lg:order-1">
          {job.summary || job.descriptionHtml ? (
            <DetailSection id="job-description" title={t("detail.description")}>
              {job.summary ? <p className="mb-3 text-sm font-medium text-foreground">{job.summary}</p> : null}
              {job.descriptionHtml ? <SafeHtml html={job.descriptionHtml} /> : null}
            </DetailSection>
          ) : null}

          {job.responsibilities ? (
            <DetailSection id="job-responsibilities" title={t("detail.responsibilities")}>
              <TextBlock text={job.responsibilities} />
            </DetailSection>
          ) : null}

          <DetailSection id="job-requirements" title={t("detail.requirements")} icon={<ListChecks />}>
            <div className="space-y-4">
              {job.qualificationsText ? <TextBlock text={job.qualificationsText} /> : null}
              {job.skillDetails.length ? (
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{t("detail.skills")}</h3>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {job.skillDetails.map((skill) => (
                      <li key={skill.id} className={cn("rounded-full border px-2.5 py-1 text-xs", skill.isRequired ? "border-navy/30 bg-navy/5 font-medium text-navy" : "text-foreground")}>
                        {skill.name}
                        {skill.minYears ? ` · ${t("detail.skillYears", { count: skill.minYears })}` : null}
                        <span className={cn(skill.isRequired ? "ms-1" : "sr-only")}>({skill.isRequired ? t("detail.required") : t("detail.preferred")})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {!job.qualificationsText && !job.skillDetails.length ? <p className="text-sm text-muted-foreground">{t("detail.noRequirements")}</p> : null}
            </div>
          </DetailSection>

          <DetailSection id="job-terms" title={t("detail.terms")} icon={<FileCheck2 />}>
            {terms.length ? <Facts items={terms} /> : <p className="text-sm text-muted-foreground">{t("detail.noTerms")}</p>}
          </DetailSection>

          {job.benefits.length || perks.length ? (
            <DetailSection id="job-benefits" title={t("detail.benefits")} icon={<Gift />}>
              <ul className="grid gap-2 sm:grid-cols-2">
                {[...perks, ...job.benefits].map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm">
                    <BadgeCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-teal-strong" />
                    {b}
                  </li>
                ))}
              </ul>
            </DetailSection>
          ) : null}

          {job.locations.length > 1 ? (
            <DetailSection id="job-locations" title={t("detail.locations")} icon={<MapPin />}>
              <ul className="space-y-1.5 text-sm">
                {job.locations.map((l, i) => (
                  <li key={`${l.countryCode}-${l.city}-${i}`} className="flex flex-wrap justify-between gap-2">
                    <span>{placeText({ city: l.city, stateRegion: l.stateRegion, countryName: l.countryName, countryCode: l.countryCode })}</span>
                    {l.openings ? <span className="text-muted-foreground">{t("detail.openingsCount", { count: l.openings })}</span> : null}
                  </li>
                ))}
              </ul>
            </DetailSection>
          ) : null}

          {showSponsorship ? (
            <DetailSection id="job-visa" title={t("detail.sponsorship")} icon={<Globe2 />}>
              <p className="text-sm font-medium">{enumLabel(t, "visa", job.visaSponsorship)}</p>
              {job.sponsorshipDetails ? (
                <div className="mt-2">
                  <TextBlock text={job.sponsorshipDetails} />
                </div>
              ) : null}
              {job.isOverseas ? <p className="mt-3 text-xs text-muted-foreground">{t("detail.overseasNotice")}</p> : null}
            </DetailSection>
          ) : null}

          {job.isOverseas ? (
            <DetailSection id="job-agent" title={t("agent.title")} icon={<ShieldCheck />}>
              {job.recruitingAgent ? (
                <div className="space-y-3">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("agent.name")}</dt>
                      <dd className="text-sm font-medium">{job.recruitingAgent.name}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("agent.certificate")}</dt>
                      <dd className="font-mono text-sm font-medium">{job.recruitingAgent.certificateNumber}</dd>
                    </div>
                    {job.recruitingAgent.validUntil ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("agent.validUntil")}</dt>
                        <dd className="text-sm font-medium">{formatDate(job.recruitingAgent.validUntil, { timeZone: "UTC", locale: loc })}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <VerificationBadge state="verified" label={t("agent.verified")} description={t("agent.verifiedDescription")} variant="detail" />
                  <p className="text-xs text-muted-foreground">{t("agent.checkYourself")}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("agent.notRecorded")}</p>
              )}
            </DetailSection>
          ) : null}

          <DetailSection id="job-process" title={t("detail.process")} icon={<ListChecks />}>
            <div className="space-y-3">
              {job.recruitmentProcess ? <TextBlock text={job.recruitmentProcess} /> : <p className="text-sm text-muted-foreground">{t("detail.processDefault")}</p>}
              {job.screeningQuestions.length ? <p className="text-sm text-muted-foreground">{t("detail.screeningCount", { count: job.screeningQuestions.length })}</p> : null}
              <p className="rounded-lg bg-teal-soft/60 px-3 py-2 text-sm text-foreground">{t("detail.freeToApply")}</p>
            </div>
          </DetailSection>

          {job.employerProfile && !job.employer.confidential ? (
            <DetailSection id="job-employer" title={t("detail.aboutEmployer", { name: job.employer.name })} icon={<Building2 />}>
              <div className="space-y-3">
                {job.employerProfile.about ? <TextBlock text={job.employerProfile.about} /> : null}
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  {job.employerProfile.industry ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("terms.industry")}</dt>
                      <dd>{job.employerProfile.industry}</dd>
                    </div>
                  ) : null}
                  {job.employerProfile.country ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("detail.employerCountry")}</dt>
                      <dd>{job.employerProfile.country}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("detail.employerVerification")}</dt>
                    <dd>{verifiedEmployer ? t("employer.verified") : t("employer.unverified")}</dd>
                  </div>
                </dl>
                {job.employerProfile.website ? (
                  <a href={job.employerProfile.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm font-medium text-teal-strong underline-offset-2 hover:underline">
                    {t("detail.employerWebsite")}
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                    <span className="sr-only">{t("detail.opensNewTab")}</span>
                  </a>
                ) : null}
              </div>
            </DetailSection>
          ) : job.employer.confidential ? (
            <DetailSection id="job-employer" title={t("detail.confidentialTitle")} icon={<Lock />}>
              <p className="text-sm text-muted-foreground">{t("detail.confidentialBody")}</p>
            </DetailSection>
          ) : null}

          <section aria-labelledby="job-privacy" className="rounded-xl border border-dashed bg-surface-subtle p-4 sm:p-5">
            <h2 id="job-privacy" className="flex items-center gap-2 font-heading text-base font-semibold text-navy">
              <Lock aria-hidden="true" className="size-4 text-teal-strong" />
              {t("privacy.title")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("privacy.body")}</p>
            <p className="mt-2 text-sm">
              <Link href="/legal/privacy-policy" className="font-medium text-teal-strong underline underline-offset-2">
                {t("privacy.policyLink")}
              </Link>
            </p>
          </section>
        </div>

        <div className="order-1 lg:order-2">
          <div className="space-y-4 lg:sticky lg:top-20">
            <ApplyPanel job={job} t={t} apply={apply} shareUrl={shareUrl} viewer={viewer} closesLabel={closesLabel} />
          </div>
        </div>
      </div>
    </article>
  );
}
