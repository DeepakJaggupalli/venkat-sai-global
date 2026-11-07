import { CircleSlash } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { sanitizeHref } from "@/components/layout/public-nav";
import { Callout } from "@/components/shared/callout";
import { SafeHtml } from "@/components/shared/safe-html";
import {
  CheckList,
  CmsCta,
  CtaBand,
  FaqList,
  FeatureGrid,
  StepList,
} from "@/components/public/blocks";
import { CmsIcon } from "@/components/public/cms-icon";
import {
  MediaGallery,
  pickAsset,
  pickAssets,
} from "@/components/public/cms-media";
import { EnquiryForm } from "@/components/public/forms/enquiry-form";
import { JsonLd } from "@/components/public/json-ld";
import { PageHero } from "@/components/public/page-hero";
import { PreviewRibbon } from "@/components/public/preview-ribbon";
import { Section, SectionHeading } from "@/components/public/section";
import {
  buildPageMetadata,
  htmlToText,
  previewTokenFrom,
  settle,
} from "@/components/public/server";
import { TrackEvent } from "@/components/public/track-event";
import { BRAND } from "@/config/site";
import { absoluteUrl } from "@/lib/env";
import type { SearchParams } from "@/lib/http";
import { getPublishedEntryBySlug } from "@/modules/content/queries";
import type { PublishedEntry } from "@/modules/content/types";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
};

const load = (slug: string, preview: string | null) =>
  settle(
    `services.${slug}`,
    () => getPublishedEntryBySlug("services", slug, { preview }),
    null,
  );

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await load(slug, previewTokenFrom(sp));
  if (!detail) return { title: "Service not found", robots: { index: false } };
  const { entry } = detail;
  return buildPageMetadata({
    title: entry.title,
    description: entry.summary || htmlToText(entry.data.overview),
    path: entry.path ?? `/services/${entry.slug}`,
    seo: entry.seo,
    assets: detail.assets,
    imageAssetId: entry.heroAssetId,
    noindex: detail.preview,
  });
}

export default async function ServicePage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await load(slug, previewTokenFrom(sp));
  if (!detail) notFound();
  const { entry, assets, references } = detail;
  const s = entry.data;
  const path = entry.path ?? `/services/${entry.slug}`;
  const offered = s.isActive !== false;
  const gallery = pickAssets(assets, s.galleryAssetIds);
  const industries = (s.relatedIndustryIds ?? [])
    .map((id) => references[id])
    .filter((e): e is PublishedEntry => e?.collection === "industries");
  const enquiryType = s.enquiryType ?? "general";

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: entry.title,
    description: entry.summary || htmlToText(s.overview, 300),
    url: absoluteUrl(path),
    provider: {
      "@type": "Organization",
      name: BRAND.name,
      url: absoluteUrl("/"),
    },
    areaServed: "Worldwide",
  };
  const faqs = (s.faqs ?? []).filter(
    (f) => f.question?.trim() && f.answer?.trim(),
  );

  return (
    <>
      <TrackEvent
        name="service_view"
        props={{ service: entry.slug }}
        disabled={detail.preview}
      />
      {detail.preview ? null : <JsonLd data={serviceJsonLd} />}
      {!detail.preview && faqs.length ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: { "@type": "Answer", text: f.answer },
            })),
          }}
        />
      ) : null}
      <PreviewRibbon show={detail.preview} />
      <PageHero
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Services", href: "/services" },
          { label: entry.title },
        ]}
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <CmsIcon name={s.iconName} className="size-4" /> Service
          </span>
        }
        title={entry.title}
        intro={entry.summary}
        media={pickAsset(assets, entry.heroAssetId)}
        actions={
          offered ? (
            <>
              <CmsCta
                cta={s.cta}
                id={`service_cta:${entry.slug}`}
                location="service_hero"
                variant="accent"
              />
              <a
                href="#enquire"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/30 bg-white/5 px-5 text-sm font-semibold text-white hover:border-white/60 hover:bg-white/10"
              >
                Send an enquiry
              </a>
            </>
          ) : null
        }
      />

      {!offered ? (
        <div className="container-page pt-8">
          <Callout
            tone="neutral"
            icon={<CircleSlash aria-hidden="true" className="size-5" />}
            title="This service is not currently offered"
          >
            We are not taking new enquiries for this service at the moment.{" "}
            <Link
              href="/services"
              className="font-medium underline underline-offset-4"
            >
              See our other services
            </Link>
            .
          </Callout>
        </div>
      ) : null}

      <Section labelledBy="service-overview-title">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <h2
              id="service-overview-title"
              className="font-heading text-2xl font-bold text-navy sm:text-3xl"
            >
              Overview
            </h2>
            <SafeHtml html={s.overview} className="mt-6" />
          </div>
          {s.benefits?.length || s.requirements?.length ? (
            <aside className="space-y-6" aria-label="Benefits and requirements">
              {s.benefits?.length ? (
                <div className="rounded-2xl border border-border bg-surface-subtle p-6">
                  <h3 className="font-heading text-lg font-semibold text-navy">
                    Benefits
                  </h3>
                  <CheckList items={s.benefits} className="mt-4" />
                </div>
              ) : null}
              {s.requirements?.length ? (
                <div className="rounded-2xl border border-border bg-white p-6">
                  <h3 className="font-heading text-lg font-semibold text-navy">
                    What you will need
                  </h3>
                  <CheckList items={s.requirements} className="mt-4" />
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>
      </Section>

      {s.whoItHelps?.length ? (
        <Section tone="subtle" labelledBy="service-audience-title">
          <SectionHeading
            id="service-audience-title"
            eyebrow="Who it helps"
            title="Who this service is for"
          />
          <FeatureGrid items={s.whoItHelps} className="mt-10" />
        </Section>
      ) : null}

      {s.whatWeProvide?.length ? (
        <Section labelledBy="service-provide-title">
          <SectionHeading
            id="service-provide-title"
            eyebrow="What Venkat Sai provides"
            title="What is included"
          />
          <FeatureGrid items={s.whatWeProvide} className="mt-10" />
        </Section>
      ) : null}

      {s.processSteps?.length ? (
        <Section tone="navy" labelledBy="service-process-title">
          <SectionHeading
            id="service-process-title"
            onDark
            eyebrow="How it works"
            title="The process, step by step"
          />
          <StepList steps={s.processSteps} onDark className="mt-12" />
        </Section>
      ) : null}

      {gallery.length ? (
        <Section labelledBy="service-gallery-title">
          <SectionHeading
            id="service-gallery-title"
            eyebrow="Gallery"
            title="From our work"
          />
          <MediaGallery assets={gallery} className="mt-10" />
        </Section>
      ) : null}

      {industries.length ? (
        <Section tone="subtle" labelledBy="service-industries-title">
          <SectionHeading
            id="service-industries-title"
            eyebrow="Industries"
            title="Industries this service supports"
          />
          <ul className="mt-8 flex flex-wrap gap-3">
            {industries.map((i) => (
              <li key={i.id}>
                <Link
                  href={i.path ?? `/industries/${i.slug}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-white px-4 text-sm font-medium text-navy hover:border-teal hover:bg-teal-soft/50"
                >
                  {i.title}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {faqs.length || offered ? (
        <Section
          labelledBy={faqs.length ? "service-faq-title" : undefined}
          id="enquire"
          className="scroll-mt-24"
        >
          <div
            className={
              faqs.length ? "grid gap-12 lg:grid-cols-2" : "mx-auto max-w-2xl"
            }
          >
            {faqs.length ? (
              <div>
                <SectionHeading
                  id="service-faq-title"
                  eyebrow="Questions"
                  title="Frequently asked questions"
                />
                <FaqList faqs={faqs} className="mt-8" />
              </div>
            ) : null}
            {offered ? (
              <EnquiryForm
                type={enquiryType}
                sourcePage={path}
                formId={`service:${entry.slug}`}
                defaultSubject={`Enquiry about ${entry.title}`}
                heading={`Enquire about ${entry.title}`}
                intro="Tell us what you need. A member of the Venkat Sai team will reply using the contact details you share."
              />
            ) : null}
          </div>
        </Section>
      ) : null}

      <CtaBand
        location="service_cta_band"
        heading="Ready to take the next step?"
        body={BRAND.promise}
        primary={
          s.cta?.label?.trim() && sanitizeHref(s.cta?.href) && offered
            ? {
                label: s.cta.label,
                href: sanitizeHref(s.cta.href) ?? "/jobs",
                id: `service_cta:${entry.slug}`,
              }
            : {
                label: "Explore opportunities",
                href: "/jobs",
                id: "explore_opportunities",
              }
        }
        secondary={{
          label: "All services",
          href: "/services",
          id: "all_services",
        }}
      />
    </>
  );
}
