import { Building2, Compass, Eye, MapPin, Target } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SafeHtml } from "@/components/shared/safe-html";
import { CtaBand, FeatureGrid, ProseSplit } from "@/components/public/blocks";
import { CmsImage, MediaGallery, pickAsset, pickAssets } from "@/components/public/cms-media";
import { ContactIcons, ContactList, MapEmbed } from "@/components/public/contact-links";
import { CtaLink } from "@/components/public/cta-link";
import { PageHero } from "@/components/public/page-hero";
import { PreviewRibbon } from "@/components/public/preview-ribbon";
import { LatestRequirements } from "@/components/public/requirements/latest-requirements";
import { Section, SectionHeading } from "@/components/public/section";
import { buildPageMetadata, htmlToText, previewTokenFrom, settle } from "@/components/public/server";
import { loadPublicContact } from "@/components/public/services/contact-data";
import { ServiceIllustration } from "@/components/public/services/service-illustration";
import { BRAND } from "@/config/site";
import type { SearchParams } from "@/lib/http";
import { getSingleton } from "@/modules/content/queries";
import type { PublishedEntry } from "@/modules/content/types";

type Props = { searchParams: Promise<SearchParams> };

const loadAbout = (preview: string | null) => settle("about", () => getSingleton("about", { preview }), null);

const DEFAULT_INTRO =
  "Training, trade testing, overseas employment and manpower supply from Autonagar, Gajuwaka, Visakhapatnam, for welders, fitters, electricians, riggers, scaffolders and other tradespeople.";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const detail = await loadAbout(previewTokenFrom(await searchParams));
  return buildPageMetadata({
    title: detail?.entry.title && detail.entry.title !== "About page" ? detail.entry.title : "About Venkat Sai",
    description: detail?.entry.summary || htmlToText(detail?.entry.data.history) || DEFAULT_INTRO,
    path: "/about",
    seo: detail?.entry.seo,
    assets: detail?.assets,
    imageAssetId: detail?.entry.heroAssetId,
    noindex: detail?.preview,
  });
}

export default async function AboutPage({ searchParams }: Props) {
  const [detail, contact] = await Promise.all([loadAbout(previewTokenFrom(await searchParams)), loadPublicContact()]);
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
        intro={entry.summary || DEFAULT_INTRO}
        media={hero}
        visual={<ServiceIllustration iconName="flame" className="mx-auto aspect-[4/3] w-full max-w-md" />}
        meta={
          <span className="inline-flex items-center gap-1.5">
            <MapPin aria-hidden="true" className="size-4" />
            {about.headquarters?.trim() || contact.addressLines.join(", ")}
          </span>
        }
        actions={
          <>
            <CtaLink href="/send-cv" cta="send_cv" location="about_hero" variant="accent" arrow>
              Send your CV and trade
            </CtaLink>
            <CtaLink href="/services" cta="our_services" location="about_hero" variant="onDark">
              Our services
            </CtaLink>
          </>
        }
      />

      <div className="border-b border-border bg-white" data-testid="about-contact-icons">
        <div className="container-page flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-navy">Find us, WhatsApp, email or call:</p>
          <ContactIcons contact={contact} labels />
        </div>
      </div>

      <Section labelledBy="about-history-title">
        <ProseSplit id="about-history-title" eyebrow="Who we are" title="More than welding">
          <SafeHtml html={about.history} />
        </ProseSplit>
      </Section>

      {about.capabilities?.length ? (
        <Section tone="subtle" labelledBy="about-capabilities-title">
          <SectionHeading id="about-capabilities-title" eyebrow="What we do" title="Training, testing, jobs abroad and manpower" />
          <FeatureGrid items={about.capabilities} columns={about.capabilities.length > 4 ? 3 : 4} className="mt-10" icon={<Building2 />} />
        </Section>
      ) : null}

      <LatestRequirements limit={6} heading="Our latest requirements" />

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

      {leadership.length ? (
        <Section labelledBy="about-leadership-title">
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
          <SectionHeading id="about-infrastructure-title" eyebrow="Our workshop" title="Facilities and operations" />
          {about.infrastructure ? <SafeHtml html={about.infrastructure} className="mt-8 max-w-3xl" /> : null}
          <MediaGallery assets={photos} className="mt-10" />
        </Section>
      ) : null}

      <Section tone="subtle" labelledBy="about-visit-title" id="visit" className="scroll-mt-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div>
            <SectionHeading id="about-visit-title" eyebrow="Visit us" title="Our centre in Autonagar, Gajuwaka" />
            <ContactList contact={contact} className="mt-8" />
            <a
              href={contact.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg border border-navy/20 bg-white px-5 text-sm font-semibold text-navy hover:border-navy/40"
            >
              <MapPin aria-hidden="true" className="size-4" />
              Open in Google Maps
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
          <MapEmbed contact={contact} />
        </div>
      </Section>

      <CtaBand
        location="about_cta_band"
        heading="Looking for work in your trade?"
        body="Send your CV and trade, see our latest requirements, or tell us the workers your company needs."
        primary={{ label: "Explore jobs", href: "/jobs", id: "explore_jobs" }}
        secondary={{ label: "Request manpower", href: "/employers/request", id: "submit_workforce_requirement" }}
      />
    </>
  );
}
