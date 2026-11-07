import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { sanitizeHref } from "@/components/layout/public-nav";
import { SafeHtml } from "@/components/shared/safe-html";
import { CmsCta, CtaBand, EntryCard } from "@/components/public/blocks";
import { CmsIcon } from "@/components/public/cms-icon";
import { MediaGallery, pickAsset, pickAssets } from "@/components/public/cms-media";
import { CtaLink } from "@/components/public/cta-link";
import { JobMiniCard } from "@/components/public/opportunity-cards";
import { PageHero } from "@/components/public/page-hero";
import { PreviewRibbon } from "@/components/public/preview-ribbon";
import { Section, SectionHeading } from "@/components/public/section";
import { buildPageMetadata, htmlToText, previewTokenFrom, settle } from "@/components/public/server";
import { TrackEvent } from "@/components/public/track-event";
import type { SearchParams } from "@/lib/http";
import { getPublishedEntryBySlug } from "@/modules/content/queries";
import type { PublishedEntry } from "@/modules/content/types";
import { searchJobs } from "@/modules/jobs/queries";
import { parseJobSearchParams } from "@/modules/jobs/schemas";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

const load = (slug: string, preview: string | null) => settle(`industries.${slug}`, () => getPublishedEntryBySlug("industries", slug, { preview }), null);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await load(slug, previewTokenFrom(sp));
  if (!detail) return { title: "Industry not found", robots: { index: false } };
  const { entry } = detail;
  return buildPageMetadata({
    title: entry.title,
    description: entry.summary || htmlToText(entry.data.overview),
    path: entry.path ?? `/industries/${entry.slug}`,
    seo: entry.seo,
    assets: detail.assets,
    imageAssetId: entry.heroAssetId,
    noindex: detail.preview,
  });
}

function TagCloud({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {items.map((item, i) => (
        <li key={`${item}-${i}`} className="rounded-full border border-border bg-white px-3 py-1.5 text-sm text-navy">
          {item}
        </li>
      ))}
    </ul>
  );
}

export default async function IndustryPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await load(slug, previewTokenFrom(sp));
  if (!detail) notFound();
  const { entry, assets, references } = detail;
  const d = entry.data;
  const industryId = typeof d.industryId === "string" ? d.industryId : null;
  const jobs = industryId
    ? await settle("industry.jobs", () => searchJobs(parseJobSearchParams({ industry: industryId, sort: "newest", pageSize: "6" }), { kind: "public" }), null)
    : null;
  const roles = (d.typicalRoles ?? []).filter((r) => r.trim());
  const skills = (d.skillsInDemand ?? []).filter((r) => r.trim());
  const services = (d.relatedServiceIds ?? [])
    .map((id) => references[id])
    .filter((e): e is PublishedEntry => e?.collection === "services") as unknown as PublishedEntry<"services">[];
  const gallery = pickAssets(assets, d.galleryAssetIds);
  const jobsHref = industryId ? `/jobs?industry=${encodeURIComponent(industryId)}` : "/jobs";

  return (
    <>
      <TrackEvent name="industry_view" props={{ industry: entry.slug }} disabled={detail.preview} />
      <PreviewRibbon show={detail.preview} />
      <PageHero
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Industries", href: "/industries" }, { label: entry.title }]}
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <CmsIcon name={d.iconName} className="size-4" /> Industry
          </span>
        }
        title={entry.title}
        intro={entry.summary}
        media={pickAsset(assets, entry.heroAssetId)}
        actions={
          <>
            <CmsCta cta={d.cta} fallback={{ label: "Submit a workforce requirement", href: "/employers/request" }} id={`industry_cta:${entry.slug}`} location="industry_hero" variant="accent" />
            <CtaLink href={jobsHref} cta="industry_jobs" location="industry_hero" variant="onDark">
              View jobs in this industry
            </CtaLink>
          </>
        }
      />

      <Section labelledBy="industry-overview-title">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <h2 id="industry-overview-title" className="font-heading text-2xl font-bold text-navy sm:text-3xl">
              Overview
            </h2>
            <SafeHtml html={d.overview} className="mt-6" />
          </div>
          {roles.length || skills.length ? (
            <aside className="space-y-6" aria-label="Roles and skills">
              {roles.length ? (
                <div className="rounded-2xl border border-border bg-surface-subtle p-6">
                  <h3 className="font-heading text-lg font-semibold text-navy">Typical roles</h3>
                  <TagCloud items={roles} />
                </div>
              ) : null}
              {skills.length ? (
                <div className="rounded-2xl border border-border bg-surface-subtle p-6">
                  <h3 className="font-heading text-lg font-semibold text-navy">Skills employers commonly ask for</h3>
                  <TagCloud items={skills} />
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>
      </Section>

      {d.howWeSupport ? (
        <Section tone="subtle" labelledBy="industry-support-title">
          <SectionHeading id="industry-support-title" eyebrow="How we help" title="How Venkat Sai can support" />
          <SafeHtml html={d.howWeSupport} className="mt-6 max-w-3xl" />
        </Section>
      ) : null}

      <Section labelledBy="industry-jobs-title">
        <SectionHeading
          id="industry-jobs-title"
          eyebrow="Opportunities"
          title={`Open jobs in ${entry.title}`}
          action={
            <CtaLink href={jobsHref} cta="industry_all_jobs" location="industry_jobs" variant="link">
              All jobs
            </CtaLink>
          }
        />
        {jobs?.items.length ? (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="industry-jobs">
            {jobs.items.map((job) => (
              <li key={job.id}>
                <JobMiniCard job={job} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-8 rounded-xl border border-dashed border-border bg-white p-6 text-sm text-muted-foreground">
            <p>There are no open jobs in this industry right now. Create your profile and you will be ready to apply when new roles are published.</p>
            <div className="mt-4 flex flex-wrap gap-4">
              <CtaLink href="/sign-up" cta="industry_signup" location="industry_jobs" variant="link">
                Create your profile
              </CtaLink>
              <CtaLink href="/jobs" cta="browse_all_jobs" location="industry_jobs" variant="link">
                Browse all jobs
              </CtaLink>
            </div>
          </div>
        )}
      </Section>

      {services.length ? (
        <Section tone="subtle" labelledBy="industry-services-title">
          <SectionHeading id="industry-services-title" eyebrow="Services" title="Related services" />
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <li key={s.id}>
                <EntryCard href={s.path ?? `/services/${s.slug}`} title={s.title} summary={s.summary} iconName={s.data.iconName} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {gallery.length ? (
        <Section labelledBy="industry-gallery-title">
          <SectionHeading id="industry-gallery-title" eyebrow="Gallery" title="In the field" />
          <MediaGallery assets={gallery} className="mt-10" />
        </Section>
      ) : null}

      <CtaBand
        location="industry_cta_band"
        heading={`Hiring in ${entry.title}?`}
        body="Share your requirement and we will plan sourcing, screening and trade testing with you."
        primary={{
          label: d.cta?.label?.trim() && sanitizeHref(d.cta?.href) ? d.cta.label : "Submit a workforce requirement",
          href: (d.cta?.label?.trim() && sanitizeHref(d.cta?.href)) || "/employers/request",
          id: `industry_cta:${entry.slug}`,
        }}
        secondary={{ label: "All industries", href: "/industries", id: "all_industries" }}
      />
    </>
  );
}
