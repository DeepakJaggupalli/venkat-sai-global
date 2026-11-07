import { Building2, Compass, Eye, MapPin, Target } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SafeHtml } from "@/components/shared/safe-html";
import { CtaBand, FeatureGrid, ProseSplit } from "@/components/public/blocks";
import { CmsImage, MediaGallery, pickAsset, pickAssets } from "@/components/public/cms-media";
import { PageHero } from "@/components/public/page-hero";
import { PreviewRibbon } from "@/components/public/preview-ribbon";
import { Section, SectionHeading } from "@/components/public/section";
import { buildPageMetadata, htmlToText, previewTokenFrom, settle } from "@/components/public/server";
import { ReachMap } from "@/components/public/visuals";
import { BRAND } from "@/config/site";
import type { SearchParams } from "@/lib/http";
import { getSingleton } from "@/modules/content/queries";
import type { PublishedEntry } from "@/modules/content/types";

type Props = { searchParams: Promise<SearchParams> };

const loadAbout = (preview: string | null) => settle("about", () => getSingleton("about", { preview }), null);

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const detail = await loadAbout(previewTokenFrom(await searchParams));
  return buildPageMetadata({
    title: detail?.entry.title && detail.entry.title !== "About page" ? detail.entry.title : "About Venkat Sai",
    description: detail?.entry.summary || htmlToText(detail?.entry.data.history) || `${BRAND.name} is the technology platform of ${BRAND.legalEntity}, ${BRAND.headquarters}.`,
    path: "/about",
    seo: detail?.entry.seo,
    assets: detail?.assets,
    imageAssetId: detail?.entry.heroAssetId,
    noindex: detail?.preview,
  });
}

export default async function AboutPage({ searchParams }: Props) {
  const detail = await loadAbout(previewTokenFrom(await searchParams));
  if (!detail) notFound();
  const { entry, assets, references } = detail;
  const about = entry.data;
  const hero = pickAsset(assets, entry.heroAssetId);
  const photos = pickAssets(assets, about.photoAssetIds);
  const leadership = (about.leadershipIds ?? [])
    .map((id) => references[id])
    .filter((m): m is PublishedEntry => Boolean(m) && m?.collection === "team_members") as unknown as PublishedEntry<"team_members">[];
  const hasMissionVision = Boolean(about.mission?.trim() || about.vision?.trim());

  return (
    <>
      <PreviewRibbon show={detail.preview} />
      <PageHero
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "About" }]}
        eyebrow="About Venkat Sai"
        title={entry.title && entry.title !== "About page" ? entry.title : `About ${BRAND.name}`}
        intro={entry.summary || BRAND.promise}
        media={hero}
        meta={
          <span className="inline-flex items-center gap-1.5">
            <MapPin aria-hidden="true" className="size-4" />
            {about.headquarters?.trim() || BRAND.headquarters}
          </span>
        }
      />

      <Section labelledBy="about-history-title">
        <ProseSplit id="about-history-title" eyebrow="Our background" title="Where we come from">
          <SafeHtml html={about.history} />
        </ProseSplit>
      </Section>

      {about.evolution ? (
        <Section tone="subtle" labelledBy="about-evolution-title">
          <ProseSplit id="about-evolution-title" eyebrow={BRAND.category} title={`The evolution into ${BRAND.name}`}>
            <SafeHtml html={about.evolution} />
          </ProseSplit>
        </Section>
      ) : null}

      {hasMissionVision ? (
        <Section labelledBy="about-purpose-title">
          <SectionHeading id="about-purpose-title" eyebrow="Purpose" title="Mission and vision" />
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {about.mission?.trim() ? (
              <div className="rounded-2xl border border-border bg-white p-8">
                <Target aria-hidden="true" className="size-7 text-teal-strong" />
                <h3 className="mt-4 font-heading text-xl font-semibold text-navy">Our mission</h3>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">{about.mission}</p>
              </div>
            ) : null}
            {about.vision?.trim() ? (
              <div className="rounded-2xl border border-border bg-white p-8">
                <Eye aria-hidden="true" className="size-7 text-teal-strong" />
                <h3 className="mt-4 font-heading text-xl font-semibold text-navy">Our vision</h3>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">{about.vision}</p>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      {about.values?.length ? (
        <Section tone="subtle" labelledBy="about-values-title">
          <SectionHeading id="about-values-title" eyebrow="Values" title="What we stand for" />
          <FeatureGrid items={about.values} className="mt-10" icon={<Compass />} />
        </Section>
      ) : null}

      {about.capabilities?.length ? (
        <Section labelledBy="about-capabilities-title">
          <SectionHeading id="about-capabilities-title" eyebrow="Capabilities" title="What we do today" />
          <FeatureGrid items={about.capabilities} columns={4} className="mt-10" icon={<Building2 />} />
        </Section>
      ) : null}

      {leadership.length ? (
        <Section tone="subtle" labelledBy="about-leadership-title">
          <SectionHeading id="about-leadership-title" eyebrow="Leadership" title="The people behind Venkat Sai" />
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {leadership.map((m) => {
              const photo = pickAsset(detail.assets, m.data.photoAssetId);
              return (
                <li key={m.id} className="overflow-hidden rounded-2xl border border-border bg-white">
                  {photo ? (
                    <div className="aspect-[4/3] bg-surface-subtle">
                      <CmsImage asset={photo} size="md" sizes="(min-width: 1024px) 33vw, 50vw" />
                    </div>
                  ) : null}
                  <div className="p-6">
                    <h3 className="font-heading text-lg font-semibold text-navy">{m.title}</h3>
                    <p className="text-sm font-medium text-teal-strong">{m.data.role}</p>
                    {m.data.bio ? <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{m.data.bio}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {about.infrastructure || photos.length ? (
        <Section labelledBy="about-infrastructure-title">
          <SectionHeading id="about-infrastructure-title" eyebrow="Infrastructure" title="Facilities and operations" />
          {about.infrastructure ? <SafeHtml html={about.infrastructure} className="mt-8 max-w-3xl" /> : null}
          <MediaGallery assets={photos} className="mt-10" />
        </Section>
      ) : null}

      <Section tone="navy" labelledBy="about-hq-title">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading id="about-hq-title" onDark eyebrow="Headquarters" title="Visakhapatnam, Andhra Pradesh" intro={about.headquarters?.trim() || BRAND.headquarters} />
            <p className="mt-6 text-base leading-relaxed text-white/75">
              {BRAND.name} is operated by {BRAND.legalEntity}. Our work starts in Auto Nagar, one of Visakhapatnam&apos;s industrial hubs, and connects people and
              organisations wherever opportunity is.
            </p>
          </div>
          <ReachMap points={[]} />
        </div>
      </Section>

      <CtaBand
        location="about_cta_band"
        heading={BRAND.tagline}
        body={BRAND.promise}
        primary={{ label: "Explore opportunities", href: "/jobs", id: "explore_opportunities" }}
        secondary={{ label: "Work with us", href: "/employers", id: "hire_through_venkat_sai" }}
      />
    </>
  );
}
