import { Megaphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/public/blocks";
import { AudienceSection } from "@/components/public/home/audiences";
import { AboutTeaser, GlobalReachSection, IndustriesSection, NewsSection, ServicesSection, SuccessStoriesSection } from "@/components/public/home/content-sections";
import { HomeHero } from "@/components/public/home/hero";
import { MetricsSection } from "@/components/public/home/metrics";
import { OpportunitiesSection } from "@/components/public/home/opportunities";
import { resolveHomepageSections, type ResolvedSection } from "@/components/public/home/sections";
import { JsonLd } from "@/components/public/json-ld";
import { PreviewRibbon } from "@/components/public/preview-ribbon";
import { buildPageMetadata, previewTokenFrom, settle } from "@/components/public/server";
import { getHomepageBanners, getSiteSettings } from "@/components/public/site-data";
import { sanitizeHref } from "@/components/layout/public-nav";
import { BRAND, DEFAULT_SEO } from "@/config/site";
import { absoluteUrl } from "@/lib/env";
import type { SearchParams } from "@/lib/http";
import type { CmsCollection } from "@/db/schema";
import { getPublicMetrics, getPublishedEntries, getSingleton, getSingletonData } from "@/modules/content/queries";
import type { AssetMap, PublishedEntry, ReferenceMap } from "@/modules/content/types";
import { listFeaturedJobs, searchJobs } from "@/modules/jobs/queries";
import { parseJobSearchParams } from "@/modules/jobs/schemas";
import { listCountries } from "@/modules/taxonomy/queries";
import { listPublicCourses } from "@/modules/training/queries";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const preview = previewTokenFrom(await searchParams);
  const detail = await settle("homepage.meta", () => getSingleton("homepage", { preview }), null);
  return buildPageMetadata({
    title: DEFAULT_SEO.title,
    description: DEFAULT_SEO.description,
    path: "/",
    seo: detail?.entry.seo,
    assets: detail?.assets,
    noindex: detail?.preview,
    absoluteTitle: true,
  });
}

function referenced<K extends CmsCollection>(references: ReferenceMap | undefined, ids: readonly string[] | null | undefined, collection: K): PublishedEntry<K>[] {
  if (!references || !ids?.length) return [];
  const out: PublishedEntry<K>[] = [];
  for (const id of ids) {
    const entry = references[id];
    if (entry && entry.collection === collection) out.push(entry as unknown as PublishedEntry<K>);
  }
  return out;
}

const EMPTY_PAGE = { items: [], assets: {} as AssetMap, references: {} as ReferenceMap, total: 0, page: 1, pageSize: 0, pageCount: 0 };

export default async function HomePage({ searchParams }: Props) {
  const preview = previewTokenFrom(await searchParams);
  const detail = await settle("homepage", () => getSingleton("homepage", { preview }), null);
  const home = detail?.entry.data ?? null;
  const sections = resolveHomepageSections(home?.sections);
  const has = (key: ResolvedSection["key"]) => sections.some((s) => s.key === key);

  const featuredServices = referenced(detail?.references, home?.featuredServiceIds, "services");
  const featuredIndustries = referenced(detail?.references, home?.featuredIndustryIds, "industries");
  const featuredStories = referenced(detail?.references, home?.featuredCaseStudyIds, "case_studies");

  const [banners, settings, metrics, about, services, industries, destinations, stories, news, homepageJobs, latestJobs, internships, courses, countries] = await Promise.all([
    getHomepageBanners(),
    getSiteSettings(),
    has("metrics") ? settle("metrics", () => getPublicMetrics(), []) : Promise.resolve([]),
    has("about") ? settle("about", () => getSingletonData("about"), null) : Promise.resolve(null),
    has("services") && !featuredServices.length ? settle("services", () => getPublishedEntries("services", { limit: 9 }), EMPTY_PAGE) : Promise.resolve(EMPTY_PAGE),
    has("industries") && !featuredIndustries.length ? settle("industries", () => getPublishedEntries("industries", { limit: 12 }), EMPTY_PAGE) : Promise.resolve(EMPTY_PAGE),
    has("global_reach") ? settle("destinations", () => getPublishedEntries("destinations", { limit: 60 }), EMPTY_PAGE) : Promise.resolve(EMPTY_PAGE),
    has("success_stories") && !featuredStories.length ? settle("case_studies", () => getPublishedEntries("case_studies", { limit: 3 }), EMPTY_PAGE) : Promise.resolve(EMPTY_PAGE),
    has("news") ? settle("news", () => getPublishedEntries("news", { limit: 3 }), EMPTY_PAGE) : Promise.resolve(EMPTY_PAGE),
    has("opportunities") ? settle("jobs.homepage", () => listFeaturedJobs({ placement: "homepage", limit: 3 }), []) : Promise.resolve([]),
    has("opportunities") ? settle("jobs.latest", () => searchJobs(parseJobSearchParams({ sort: "relevance", pageSize: "3" }), { kind: "public" }), null) : Promise.resolve(null),
    has("opportunities") ? settle("jobs.internships", () => searchJobs(parseJobSearchParams({ type: "internship", sort: "newest", pageSize: "3" }), { kind: "public" }), null) : Promise.resolve(null),
    has("opportunities") ? settle("courses", () => listPublicCourses({}, { page: 1, pageSize: 3, offset: 0 }), null) : Promise.resolve(null),
    has("global_reach") ? settle("countries", () => listCountries(), []) : Promise.resolve([]),
  ]);

  const assets: AssetMap = { ...(detail?.assets ?? {}), ...services.assets, ...stories.assets, ...news.assets };
  const serviceList = (featuredServices.length ? featuredServices : services.items).filter((s) => s.data.isActive !== false).slice(0, 9);
  const industryList = (featuredIndustries.length ? featuredIndustries : industries.items).slice(0, 12);
  const storyList = (featuredStories.length ? featuredStories : stories.items).slice(0, 3);
  const countryNames = Object.fromEntries(countries.map((c) => [c.code, c.name]));
  // Promoted homepage jobs first, then the most relevant public jobs, without duplicates.
  const jobIds = new Set<string>();
  const jobs = [...homepageJobs, ...(latestJobs?.items ?? [])].filter((j) => (jobIds.has(j.id) ? false : (jobIds.add(j.id), true))).slice(0, 3);
  const heroMedia = home?.hero?.mediaAssetId ? (assets[home.hero.mediaAssetId] ?? null) : null;
  const ctaBand = home?.ctaBand;

  const render = (section: ResolvedSection, index: number) => {
    const text = { heading: section.heading, intro: section.intro };
    switch (section.key) {
      case "metrics":
        return <MetricsSection key={section.key} metrics={metrics} {...text} />;
      case "about":
        return <AboutTeaser key={section.key} about={about} {...text} />;
      case "services":
        return <ServicesSection key={section.key} services={serviceList} assets={assets} {...text} />;
      case "opportunities":
        return <OpportunitiesSection key={section.key} jobs={jobs} internships={internships?.items ?? []} courses={courses?.items ?? []} {...text} />;
      case "industries":
        return <IndustriesSection key={section.key} industries={industryList} {...text} />;
      case "global_reach":
        return <GlobalReachSection key={section.key} destinations={destinations.items} countryNames={countryNames} {...text} />;
      case "employers":
        return <AudienceSection key={section.key} audience="employers" tone={index % 2 ? "subtle" : "white"} {...text} />;
      case "candidates":
        return <AudienceSection key={section.key} audience="candidates" reverse tone={index % 2 ? "subtle" : "white"} {...text} />;
      case "partners":
        return <AudienceSection key={section.key} audience="partners" tone={index % 2 ? "subtle" : "white"} {...text} />;
      case "institutions":
        return <AudienceSection key={section.key} audience="institutions" reverse tone={index % 2 ? "subtle" : "white"} {...text} />;
      case "success_stories":
        return <SuccessStoriesSection key={section.key} stories={storyList} assets={assets} {...text} />;
      case "news":
        return <NewsSection key={section.key} news={news.items} assets={assets} {...text} />;
      case "cta_band":
        return (
          <CtaBand
            key={section.key}
            location="home_cta_band"
            eyebrow={BRAND.category}
            heading={section.heading || ctaBand?.heading?.trim() || BRAND.tagline}
            body={section.intro || ctaBand?.body?.trim() || BRAND.promise}
            primary={{
              label: ctaBand?.primaryCta?.label?.trim() || "Create your profile",
              href: sanitizeHref(ctaBand?.primaryCta?.href) ?? "/sign-up",
              id: "cta_band_primary",
            }}
            secondary={{
              label: ctaBand?.secondaryCta?.label?.trim() || "Submit a workforce requirement",
              href: sanitizeHref(ctaBand?.secondaryCta?.href) ?? "/employers/request",
              id: "cta_band_secondary",
            }}
          />
        );
      default:
        return null;
    }
  };

  const contact = settings?.contact;
  const sameAs = (settings?.socialLinks ?? []).map((s) => s.url).filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u));
  const organization: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.name,
    legalName: settings?.legalEntity?.name?.trim() || BRAND.legalEntity,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icon"),
    slogan: BRAND.statement,
    description: DEFAULT_SEO.description,
    address: {
      "@type": "PostalAddress",
      streetAddress: settings?.legalEntity?.registeredAddress?.trim() || undefined,
      addressLocality: "Visakhapatnam",
      addressRegion: "Andhra Pradesh",
      addressCountry: "IN",
    },
    ...(contact?.email || contact?.phone
      ? { contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: contact.email || undefined, telephone: contact.phone || undefined }] }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };

  return (
    <>
      {detail?.preview ? null : <JsonLd data={organization} />}
      <PreviewRibbon show={Boolean(detail?.preview)} />
      {banners.length ? (
        <div className="border-b border-gold/40 bg-gold-soft" data-testid="homepage-banners">
          <ul className="container-page divide-y divide-gold/30">
            {banners.map((b) => {
              const href = sanitizeHref(b.linkUrl);
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm text-navy">
                  <Megaphone aria-hidden="true" className="size-4 shrink-0 text-gold-strong" />
                  <strong className="font-semibold">{b.title}</strong>
                  {b.body ? <span className="text-navy/80">{b.body}</span> : null}
                  {href ? (
                    <Link href={href} className="font-semibold text-navy underline underline-offset-4">
                      {b.linkLabel?.trim() || "Learn more"}
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <HomeHero hero={home?.hero} media={heroMedia} />
      {sections.map(render)}
    </>
  );
}
