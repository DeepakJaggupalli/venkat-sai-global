import { AlertTriangle, CalendarCheck, ExternalLink, ShieldCheck, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Callout } from "@/components/shared/callout";
import { SafeHtml } from "@/components/shared/safe-html";
import { CheckList, CtaBand, EntryCard } from "@/components/public/blocks";
import { pickAsset } from "@/components/public/cms-media";
import { CtaLink } from "@/components/public/cta-link";
import { flagEmoji, REACH_GROUP_LABELS, reachGroupFor } from "@/components/public/geo";
import { SAFE_RECRUITMENT_PATH } from "@/components/public/links";
import { JobMiniCard } from "@/components/public/opportunity-cards";
import { PageHero } from "@/components/public/page-hero";
import { PreviewRibbon } from "@/components/public/preview-ribbon";
import { Section, SectionHeading } from "@/components/public/section";
import { buildPageMetadata, htmlToText, previewTokenFrom, settle } from "@/components/public/server";
import { TrackEvent } from "@/components/public/track-event";
import { ReachMap } from "@/components/public/visuals";
import type { SearchParams } from "@/lib/http";
import { getPublishedEntryBySlug } from "@/modules/content/queries";
import type { PublishedEntry } from "@/modules/content/types";
import { searchJobs } from "@/modules/jobs/queries";
import { parseJobSearchParams } from "@/modules/jobs/schemas";
import { listCountries, listIndustries, listJobCategories, listLanguages } from "@/modules/taxonomy/queries";

type Props = { params: Promise<{ country: string }>; searchParams: Promise<SearchParams> };

const load = (slug: string, preview: string | null) => settle(`destinations.${slug}`, () => getPublishedEntryBySlug("destinations", slug, { preview }), null);

function longDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function safeExternal(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ country }, sp] = await Promise.all([params, searchParams]);
  const detail = await load(country, previewTokenFrom(sp));
  if (!detail) return { title: "Destination not found", robots: { index: false } };
  const { entry } = detail;
  return buildPageMetadata({
    title: `Working in ${entry.title}`,
    description: entry.summary || htmlToText(entry.data.overview) || `Country guide for ${entry.title}: hiring industries, documentation and reviewed employment guidance.`,
    path: entry.path ?? `/global-reach/${entry.slug}`,
    seo: entry.seo,
    assets: detail.assets,
    imageAssetId: entry.heroAssetId,
    noindex: detail.preview,
  });
}

export default async function DestinationPage({ params, searchParams }: Props) {
  const [{ country }, sp] = await Promise.all([params, searchParams]);
  const detail = await load(country, previewTokenFrom(sp));
  if (!detail) notFound();
  const { entry, assets, references } = detail;
  const d = entry.data;
  const code = d.countryCode;

  const [jobs, countries, industries, categories, languages] = await Promise.all([
    settle("destination.jobs", () => searchJobs(parseJobSearchParams({ country: code, sort: "newest", pageSize: "6" }), { kind: "public" }), null),
    settle("countries", () => listCountries(), []),
    d.hiringIndustryIds?.length ? settle("industries", () => listIndustries(), []) : Promise.resolve([]),
    d.commonJobCategoryIds?.length ? settle("job_categories", () => listJobCategories(), []) : Promise.resolve([]),
    d.languageCodes?.length ? settle("languages", () => listLanguages(), []) : Promise.resolve([]),
  ]);
  const countryName = countries.find((c) => c.code === code)?.name ?? entry.title;
  const pick = (rows: readonly { id: string; name: string }[], ids: readonly string[] | null | undefined) =>
    (ids ?? []).map((id) => rows.find((r) => r.id === id)?.name).filter((n): n is string => Boolean(n));
  const hiringIndustries = pick(industries, d.hiringIndustryIds);
  const jobCategories = pick(categories, d.commonJobCategoryIds);
  const languageNames = (d.languageCodes ?? []).map((c) => languages.find((l) => l.code === c)?.name).filter((n): n is string => Boolean(n));
  const services = (d.availableServiceIds ?? [])
    .map((id) => references[id])
    .filter((e): e is PublishedEntry => e?.collection === "services") as unknown as PublishedEntry<"services">[];
  const guidance = d.guidance;
  const reviewed = longDate(guidance?.reviewedAt);
  const sources = (guidance?.sources ?? []).map((s) => ({ ...s, safeUrl: safeExternal(s.url) })).filter((s) => s.title?.trim());
  const jobsHref = `/jobs?country=${encodeURIComponent(code)}`;
  const facts: { label: string; values: string[] }[] = [
    { label: "Hiring industries", values: hiringIndustries },
    { label: "Common job categories", values: jobCategories },
    { label: "Languages", values: languageNames },
  ].filter((f) => f.values.length);

  return (
    <>
      <TrackEvent name="country_view" props={{ country: code }} disabled={detail.preview} />
      <PreviewRibbon show={detail.preview} />
      <PageHero
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Global reach", href: "/global-reach" }, { label: entry.title }]}
        eyebrow={`${REACH_GROUP_LABELS[reachGroupFor(d.region)]} · Country guide`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            <span aria-hidden="true">{flagEmoji(code)}</span>
            {entry.title}
          </span>
        }
        intro={entry.summary}
        media={pickAsset(assets, entry.heroAssetId)}
        visual={<ReachMap points={[{ code, label: countryName, region: d.region }]} />}
        meta={
          reviewed ? (
            <>
              <span className="inline-flex items-center gap-1.5" data-testid="last-reviewed">
                <CalendarCheck aria-hidden="true" className="size-4" />
                Last reviewed {reviewed}
              </span>
              {guidance?.reviewedBy ? (
                <span className="inline-flex items-center gap-1.5">
                  <UserCheck aria-hidden="true" className="size-4" />
                  Reviewed by {guidance.reviewedBy}
                </span>
              ) : null}
            </>
          ) : null
        }
        actions={
          <>
            <CtaLink href={jobsHref} cta="destination_jobs" location="destination_hero" variant="accent" arrow>
              Jobs in {countryName}
            </CtaLink>
            <CtaLink href="/sign-up" cta="build_career_profile" location="destination_hero" variant="onDark">
              Build your profile
            </CtaLink>
          </>
        }
      />

      <div className="container-page pt-8">
        <Callout tone="warning" icon={<AlertTriangle aria-hidden="true" className="size-5" />} title="General information, not a promise of eligibility">
          {guidance?.disclaimer?.trim() ? <p>{guidance.disclaimer}</p> : null}
          <p className={guidance?.disclaimer?.trim() ? "mt-2" : undefined}>
            Venkat Sai does not make automated visa or work-permit eligibility decisions or promises. Requirements change; always confirm with the official sources below and with the
            employer before acting.
          </p>
        </Callout>
      </div>

      <Section labelledBy="destination-overview-title">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-10">
            <div>
              <h2 id="destination-overview-title" className="font-heading text-2xl font-bold text-navy sm:text-3xl">
                Working in {entry.title}
              </h2>
              {d.overview ? <SafeHtml html={d.overview} className="mt-6" /> : <p className="mt-4 text-muted-foreground">An overview for this destination is being prepared.</p>}
            </div>
            {d.employmentConditions ? (
              <div>
                <h3 className="font-heading text-xl font-semibold text-navy">Employment conditions</h3>
                <SafeHtml html={d.employmentConditions} className="mt-4" />
              </div>
            ) : null}
            {guidance?.employmentGuidance ? (
              <div>
                <h3 className="font-heading text-xl font-semibold text-navy">Employment guidance</h3>
                <SafeHtml html={guidance.employmentGuidance} className="mt-4" />
              </div>
            ) : null}
            {guidance?.immigrationGuidance ? (
              <div>
                <h3 className="font-heading text-xl font-semibold text-navy">Immigration and visa guidance</h3>
                <SafeHtml html={guidance.immigrationGuidance} className="mt-4" />
              </div>
            ) : null}
            {d.recruitmentRestrictions ? (
              <div className="rounded-2xl border border-warning/40 bg-warning-soft p-6">
                <h3 className="font-heading text-xl font-semibold text-navy">Recruitment restrictions</h3>
                <SafeHtml html={d.recruitmentRestrictions} className="mt-4" />
              </div>
            ) : null}
          </div>
          <aside className="space-y-6" aria-label={`${entry.title} at a glance`}>
            {facts.length ? (
              <div className="rounded-2xl border border-border bg-surface-subtle p-6">
                <h3 className="font-heading text-lg font-semibold text-navy">At a glance</h3>
                <dl className="mt-4 space-y-4">
                  {facts.map((f) => (
                    <div key={f.label}>
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{f.label}</dt>
                      <dd className="mt-1 text-sm text-navy">{f.values.join(", ")}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            {d.requiredQualifications?.length ? (
              <div className="rounded-2xl border border-border bg-white p-6">
                <h3 className="font-heading text-lg font-semibold text-navy">Commonly required qualifications</h3>
                <CheckList items={d.requiredQualifications} className="mt-4" />
              </div>
            ) : null}
            {d.documentation?.length ? (
              <div className="rounded-2xl border border-border bg-white p-6">
                <h3 className="font-heading text-lg font-semibold text-navy">Documents usually asked for</h3>
                <CheckList items={d.documentation} className="mt-4" />
              </div>
            ) : null}
            <div className="rounded-2xl border border-teal/40 bg-teal-soft p-6">
              <ShieldCheck aria-hidden="true" className="size-6 text-teal-strong" />
              <h3 className="mt-3 font-heading text-lg font-semibold text-navy">Never pay for a job</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                Venkat Sai never charges candidates. Before you travel, check that the recruiting agent is registered on the Government of India&apos;s eMigrate portal.
              </p>
              <Link href={SAFE_RECRUITMENT_PATH} className="mt-3 inline-flex text-sm font-semibold text-teal-strong underline underline-offset-4">
                How to recruit safely
              </Link>
            </div>
          </aside>
        </div>
      </Section>

      {sources.length ? (
        <Section tone="subtle" labelledBy="destination-sources-title" className="py-12 sm:py-14 lg:py-16">
          <h2 id="destination-sources-title" className="font-heading text-xl font-semibold text-navy">
            Sources
          </h2>
          <ul className="mt-5 space-y-3">
            {sources.map((s, i) => {
              const accessed = longDate(s.accessedAt);
              return (
                <li key={`${s.title}-${i}`} className="text-sm">
                  {s.safeUrl ? (
                    <a href={s.safeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-teal-strong underline underline-offset-4">
                      {s.title}
                      <ExternalLink aria-hidden="true" className="size-3.5" />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <span className="font-medium text-navy">{s.title}</span>
                  )}
                  {accessed ? <span className="text-muted-foreground"> · accessed {accessed}</span> : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <Section labelledBy="destination-jobs-title">
        <SectionHeading
          id="destination-jobs-title"
          eyebrow="Opportunities"
          title={`Open jobs in ${countryName}`}
          action={
            <CtaLink href={jobsHref} cta="destination_all_jobs" location="destination_jobs" variant="link">
              All jobs in {countryName}
            </CtaLink>
          }
        />
        {jobs?.items.length ? (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="destination-jobs">
            {jobs.items.map((job) => (
              <li key={job.id}>
                <JobMiniCard job={job} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-8 rounded-xl border border-dashed border-border bg-white p-6 text-sm text-muted-foreground">
            <p>There are no open jobs in {countryName} right now. Build your profile so you are ready to apply when roles are published.</p>
            <div className="mt-4 flex flex-wrap gap-4">
              <CtaLink href="/sign-up" cta="destination_signup" location="destination_jobs" variant="link">
                Build your profile
              </CtaLink>
              <CtaLink href="/jobs?overseas=1" cta="browse_overseas_jobs" location="destination_jobs" variant="link">
                Browse all overseas jobs
              </CtaLink>
            </div>
          </div>
        )}
      </Section>

      {services.length ? (
        <Section tone="subtle" labelledBy="destination-services-title">
          <SectionHeading id="destination-services-title" eyebrow="Services" title={`Services available for ${entry.title}`} />
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <li key={s.id}>
                <EntryCard href={s.path ?? `/services/${s.slug}`} title={s.title} summary={s.summary} iconName={s.data.iconName} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <CtaBand
        location="destination_cta_band"
        heading={`Hiring people for ${entry.title}?`}
        body="Share your requirement. We plan sourcing, trade testing, documentation and PDOT (Pre-Departure Orientation Training) coordination with you."
        primary={{ label: "Submit a workforce requirement", href: "/employers/request", id: "submit_workforce_requirement" }}
        secondary={{ label: "All destinations", href: "/global-reach", id: "global_reach" }}
      />
    </>
  );
}
