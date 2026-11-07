import { Building2, ClipboardList, Flag, MapPin, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DateText } from "@/components/shared/date-text";
import type { PublishedEntry } from "@/modules/content/types";
import { industryOptions } from "@/modules/taxonomy/queries";

import { countryName } from "../../events/_lib/schedule";
import { MediaGallery } from "../../gallery/_components/media-gallery";
import { toGalleryItems } from "../../gallery/_lib/gallery-items";
import { ArticleLayout, FactBox, Prose } from "../../news/_components/article-parts";
import { CmsImage } from "../../news/_components/cms-image";
import { JsonLd } from "../../news/_components/json-ld";
import { MetaItem, PreviewRibbon, PublicHero, PublicSection } from "../../news/_components/public-hero";
import { abs, articleJsonLd, assetFor, breadcrumbJsonLd, entryMetadata, imagesFor, loadEntry, readPreview, safeLoad, type PageSearchParams } from "../../news/_lib/cms";
import { calendarDate, excerptText } from "../../news/_lib/text";
import { TestimonialCard } from "../_components/testimonial-card";

type Props = { params: Promise<{ slug: string }>; searchParams: PageSearchParams };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadEntry("case_studies", slug, readPreview(sp));
  if (!detail) return { title: "Success story not found", robots: { index: false } };
  return entryMetadata(detail, { path: `/success-stories/${slug}`, type: "article", fallbackDescription: excerptText(detail.entry.data.outcome, 160) });
}

function isTestimonial(entry: PublishedEntry | undefined): entry is PublishedEntry<"testimonials"> {
  return entry?.collection === "testimonials";
}

export default async function CaseStudyPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadEntry("case_studies", slug, readPreview(sp));
  if (!detail) notFound();
  const { entry, assets, references, preview } = detail;
  const d = entry.data;
  const industries = d.industryId ? await safeLoad("industries", () => industryOptions(), []) : [];
  const industry = d.industryId ? (industries.find((o) => o.value === d.industryId)?.label ?? null) : null;
  const country = countryName(d.countryCode);
  const hero = assetFor(assets, entry.heroAssetId);
  const photos = toGalleryItems(imagesFor(assets, d.photoAssetIds));
  const testimonials = [d.clientTestimonialId, ...(d.candidateTestimonialIds ?? [])].map((id) => (id ? references[id] : undefined)).filter(isTestimonial);
  const positions = (d.positions ?? []).filter((p) => p.role);
  const totalPositions = positions.reduce((sum, p) => sum + (p.count ?? 0), 0);
  const client = d.clientName || d.clientDescriptor;

  return (
    <>
      <PreviewRibbon preview={preview} />
      {!preview ? (
        <JsonLd
          data={[
            articleJsonLd(entry, { type: "Article", url: abs(`/success-stories/${slug}`), imageUrl: hero?.kind === "image" ? (hero.variants.lg ?? hero.url) : null }),
            breadcrumbJsonLd([{ name: "Home", url: abs("/") }, { name: "Success stories", url: abs("/success-stories") }, { name: entry.title }]),
          ]}
        />
      ) : null}
      <PublicHero
        eyebrow="Case study"
        title={entry.title}
        description={entry.summary}
        breadcrumbs={[{ label: "Success stories", href: "/success-stories" }, { label: entry.title }]}
        meta={
          <>
            <MetaItem icon={<Building2 />}>{client}</MetaItem>
            {industry ? <MetaItem icon={<Flag />}>{industry}</MetaItem> : null}
            {country ? <MetaItem icon={<MapPin />}>{country}</MetaItem> : null}
          </>
        }
      />
      <ArticleLayout
        aside={
          <FactBox title="At a glance">
            <dl className="space-y-3">
              <div>
                <dt className="text-muted-foreground">Client</dt>
                <dd className="font-medium">{client}</dd>
                {d.clientName && d.clientDescriptor ? <dd className="text-muted-foreground">{d.clientDescriptor}</dd> : null}
              </div>
              {industry ? (
                <div>
                  <dt className="text-muted-foreground">Sector</dt>
                  <dd className="font-medium">{industry}</dd>
                </div>
              ) : null}
              {country ? (
                <div>
                  <dt className="text-muted-foreground">Work location</dt>
                  <dd className="font-medium">{country}</dd>
                </div>
              ) : null}
              {totalPositions > 0 ? (
                <div>
                  <dt className="text-muted-foreground">Positions</dt>
                  <dd className="font-medium tabular-nums">{totalPositions.toLocaleString("en-IN")}</dd>
                </div>
              ) : null}
              {d.candidateCategories?.length ? (
                <div>
                  <dt className="text-muted-foreground">Candidate categories</dt>
                  <dd className="font-medium">{d.candidateCategories.join(", ")}</dd>
                </div>
              ) : null}
            </dl>
          </FactBox>
        }
      >
        {hero && hero.kind === "image" ? <CmsImage asset={hero} priority className="mb-8 rounded-xl" sizes="(min-width: 1024px) 760px, 100vw" /> : null}

        <section aria-labelledby="requirement-title">
          <h2 id="requirement-title" className="flex items-center gap-2 font-heading text-2xl font-semibold text-navy">
            <ClipboardList className="size-5 text-teal" aria-hidden="true" />
            The requirement
          </h2>
          <Prose html={d.requirement} />
        </section>

        {positions.length ? (
          <section aria-labelledby="positions-title" className="mt-10">
            <h2 id="positions-title" className="flex items-center gap-2 font-heading text-2xl font-semibold text-navy">
              <Users className="size-5 text-teal" aria-hidden="true" />
              Positions
            </h2>
            <ul className="mt-4 divide-y divide-border rounded-xl border border-border/80 bg-card">
              {positions.map((p, i) => (
                <li key={`${p.role}-${i}`} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <span className="font-medium">{p.role}</span>
                  {p.count ? <span className="tabular-nums text-muted-foreground">{p.count.toLocaleString("en-IN")}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {d.process?.length ? (
          <section aria-labelledby="process-title" className="mt-10">
            <h2 id="process-title" className="font-heading text-2xl font-semibold text-navy">How we delivered it</h2>
            <ol className="mt-4 space-y-4">
              {d.process.map((step, i) => (
                <li key={`${step.title}-${i}`} className="flex gap-4">
                  <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-soft text-sm font-semibold text-teal-strong">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-navy">{step.title}</p>
                    {step.description ? <p className="mt-1 text-muted-foreground whitespace-pre-line">{step.description}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {d.assessmentMethod ? (
          <section aria-labelledby="assessment-title" className="mt-10">
            <h2 id="assessment-title" className="font-heading text-2xl font-semibold text-navy">Assessment method</h2>
            <Prose html={d.assessmentMethod} />
          </section>
        ) : null}

        {d.timeline?.length ? (
          <section aria-labelledby="timeline-title" className="mt-10">
            <h2 id="timeline-title" className="font-heading text-2xl font-semibold text-navy">Timeline</h2>
            <ol className="mt-4 border-l-2 border-teal/40 pl-6">
              {d.timeline.map((m, i) => {
                const date = calendarDate(m.date);
                return (
                  <li key={`${m.milestone}-${i}`} className="relative pb-6 last:pb-0">
                    <span aria-hidden="true" className="absolute top-1.5 -left-[1.95rem] size-3 rounded-full border-2 border-white bg-teal" />
                    {date ? (
                      <p className="text-xs font-semibold text-muted-foreground">
                        <DateText value={date} dateOnly />
                      </p>
                    ) : null}
                    <p className="font-semibold text-navy">{m.milestone}</p>
                    {m.description ? <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{m.description}</p> : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <section aria-labelledby="outcome-title" className="mt-10 rounded-xl border border-teal/30 bg-teal-soft/50 p-6">
          <h2 id="outcome-title" className="font-heading text-2xl font-semibold text-navy">The outcome</h2>
          <Prose html={d.outcome} />
        </section>

        {photos.length ? (
          <PublicSection title="Photos" id="photos" className="pb-0">
            <MediaGallery items={photos} label={`Photos: ${entry.title}`} />
          </PublicSection>
        ) : null}

        {testimonials.length ? (
          <PublicSection title="In their words" id="testimonials" className="pb-0">
            <ul className="grid gap-6 md:grid-cols-2">
              {testimonials.map((t) => (
                <li key={t.id}>
                  <TestimonialCard entry={t} assets={assets} />
                </li>
              ))}
            </ul>
          </PublicSection>
        ) : null}

        <div className="mt-12 rounded-xl border border-border/80 bg-surface-subtle p-6">
          <p className="font-heading text-lg font-semibold text-navy">Have a similar requirement?</p>
          <p className="mt-1 text-muted-foreground">Tell us what you need and our team will get back to you.</p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
            <Link href="/employers/request" className="text-teal-strong hover:underline">
              Post a workforce requirement
            </Link>
            <Link href="/success-stories" className="text-teal-strong hover:underline">
              More success stories
            </Link>
          </div>
        </div>
      </ArticleLayout>
    </>
  );
}
