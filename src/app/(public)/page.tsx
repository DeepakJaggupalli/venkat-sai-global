import { Megaphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { CtaBand } from "@/components/public/blocks";
import { resolveContact } from "@/components/public/contact-links";
import { AudienceCards, type AudienceKey } from "@/components/public/home/audiences";
import { ContactBand } from "@/components/public/home/bands";
import { AboutTeaser, IndustriesSection, NewsSection, SuccessStoriesSection } from "@/components/public/home/content-sections";
import { HomeFaqSection } from "@/components/public/home/faq";
import { FeaturedServicesSection } from "@/components/public/home/featured-services";
import { HomeHero, usableHeroCta } from "@/components/public/home/hero";
import { EmployerBand, HowItWorksSection, TrainingTeaser } from "@/components/public/home/journey";
import { DestinationMarquees } from "@/components/public/home/marquees";
import { MetricsSection } from "@/components/public/home/metrics";
import { OpportunitiesSection } from "@/components/public/home/opportunities";
import { resolveHomepageSections, type ResolvedSection } from "@/components/public/home/sections";
import { JsonLd } from "@/components/public/json-ld";
import { PreviewRibbon } from "@/components/public/preview-ribbon";
import { loadPosterPage } from "@/components/public/requirements/data";
import { LatestRequirements } from "@/components/public/requirements/latest-requirements";
import { RevealScope } from "@/components/public/reveal";
import type { SectionTone } from "@/components/public/section";
import { buildPageMetadata, previewTokenFrom, settle } from "@/components/public/server";
import { getHomepageBanners, getSiteSettings } from "@/components/public/site-data";
import { sanitizeHref } from "@/components/layout/public-nav";
import { BRAND, DEFAULT_SEO } from "@/config/site";
import { absoluteUrl } from "@/lib/env";
import type { SearchParams } from "@/lib/http";
import type { CmsCollection } from "@/db/schema";
import { CONTACT } from "@/config/contact";
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

  const [banners, settings, metrics, about, services, industries, destinations, stories, news, homepageJobs, latestJobs, internships, courses, countries, faqs, posters] = await Promise.all([
    getHomepageBanners(),
    getSiteSettings(),
    has("metrics") ? settle("metrics", () => getPublicMetrics(), []) : Promise.resolve([]),
    has("about") ? settle("about", () => getSingletonData("about"), null) : Promise.resolve(null),
    has("services") && !featuredServices.length ? settle("services", () => getPublishedEntries("services", { limit: 24 }), EMPTY_PAGE) : Promise.resolve(EMPTY_PAGE),
    has("industries") && !featuredIndustries.length ? settle("industries", () => getPublishedEntries("industries", { limit: 12 }), EMPTY_PAGE) : Promise.resolve(EMPTY_PAGE),
    settle("destinations", () => getPublishedEntries("destinations", { limit: 60 }), EMPTY_PAGE),
    has("success_stories") && !featuredStories.length ? settle("case_studies", () => getPublishedEntries("case_studies", { limit: 3 }), EMPTY_PAGE) : Promise.resolve(EMPTY_PAGE),
    has("news") ? settle("news", () => getPublishedEntries("news", { limit: 3 }), EMPTY_PAGE) : Promise.resolve(EMPTY_PAGE),
    has("opportunities") ? settle("jobs.homepage", () => listFeaturedJobs({ placement: "homepage", limit: 3 }), []) : Promise.resolve([]),
    has("opportunities") ? settle("jobs.latest", () => searchJobs(parseJobSearchParams({ sort: "relevance", pageSize: "3" }), { kind: "public" }), null) : Promise.resolve(null),
    has("opportunities") ? settle("jobs.internships", () => searchJobs(parseJobSearchParams({ type: "internship", sort: "newest", pageSize: "3" }), { kind: "public" }), null) : Promise.resolve(null),
    has("opportunities") ? settle("courses", () => listPublicCourses({}, { page: 1, pageSize: 3, offset: 0 }), null) : Promise.resolve(null),
    settle("countries", () => listCountries(), []),
    settle("faqs.home", () => getPublishedEntries("faqs", { limit: 6 }), EMPTY_PAGE),
    loadPosterPage({ pageSize: 1 }),
  ]);

  const assets: AssetMap = { ...(detail?.assets ?? {}), ...services.assets, ...stories.assets, ...news.assets };
  const serviceList = (featuredServices.length ? featuredServices : services.items).filter((s) => s.data.isActive !== false);
  const industryList = (featuredIndustries.length ? featuredIndustries : industries.items).slice(0, 12);
  const storyList = (featuredStories.length ? featuredStories : stories.items).slice(0, 3);
  const countryNames = Object.fromEntries(countries.map((c) => [c.code, c.name]));
  // Promoted homepage jobs first, then the most relevant public jobs, without duplicates.
  const jobIds = new Set<string>();
  const jobs = [...homepageJobs, ...(latestJobs?.items ?? [])].filter((j) => (jobIds.has(j.id) ? false : (jobIds.add(j.id), true))).slice(0, 3);
  const heroMedia = home?.hero?.mediaAssetId ? (assets[home.hero.mediaAssetId] ?? null) : null;
  const ctaBand = home?.ctaBand;
  const contactDetails = resolveContact(settings?.contact);
  const marqueeCountries = destinations.items.map((d) => ({
    code: d.data.countryCode,
    name: countryNames[d.data.countryCode] ?? d.title,
    href: d.path ?? `/global-reach/${d.slug}`,
  }));
  const latestPoster = posters.items.find((p) => p.poster) ?? posters.items[0] ?? null;
  const section = (key: ResolvedSection["key"]) => sections.find((s) => s.key === key) ?? null;
  // The designed core of the page renders in a fixed order (visibility and headings still come from the CMS);
  // the remaining content sections follow in the CMS order. Bands alternate white / light grey.
  const CORE = new Set<ResolvedSection["key"]>(["metrics", "services", "opportunities", "employers", "candidates", "cta_band", "global_reach", "partners", "institutions"]);
  const tail = sections.filter((s) => !CORE.has(s.key));
  // The specification seed's closing band is treated as "not customised" so the new defaults show.
  const LEGACY_CTA_HEADINGS = new Set([BRAND.tagline, "Your next job could be abroad"]);
  const ctaCustomised = Boolean(ctaBand?.heading?.trim() && !LEGACY_CTA_HEADINGS.has(ctaBand.heading.trim()));
  const ctaPrimary = usableHeroCta(ctaCustomised ? ctaBand?.primaryCta : null, { label: "Send your CV", href: "/send-cv" });
  const ctaSecondary = usableHeroCta(ctaCustomised ? ctaBand?.secondaryCta : null, { label: "Explore jobs", href: "/jobs" });
  const servicesSection = section("services");
  const candidatesSection = section("candidates");
  const metricsSection = section("metrics");
  const opportunitiesSection = section("opportunities");
  const employersSection = section("employers");
  const ctaSection = section("cta_band");
  const reachSection = section("global_reach");
  const audiences = (["partners", "institutions"] as const).filter((k): k is AudienceKey & ("partners" | "institutions") => has(k));
  const hasOpportunities = jobs.length > 0 || (internships?.items.length ?? 0) > 0 || (courses?.items.length ?? 0) > 0;

  type Block = { key: string; render: (tone: SectionTone) => ReactNode };
  const blocks: Block[] = [];
  if (servicesSection) blocks.push({ key: "services", render: (tone) => <FeaturedServicesSection key="services" tone={tone} services={serviceList} assets={assets} heading={servicesSection.heading} intro={servicesSection.intro} /> });
  blocks.push({ key: "requirements", render: (tone) => <LatestRequirements key="requirements" limit={6} tone={tone === "subtle" ? "subtle" : "white"} /> });
  if (candidatesSection) blocks.push({ key: "candidates", render: (tone) => <HowItWorksSection key="candidates" tone={tone} heading={candidatesSection.heading} intro={candidatesSection.intro} /> });
  blocks.push({ key: "training", render: (tone) => <TrainingTeaser key="training" tone={tone} /> });
  if (metricsSection && metrics.length) blocks.push({ key: "metrics", render: (tone) => <MetricsSection key="metrics" tone={tone} metrics={metrics} heading={metricsSection.heading} intro={metricsSection.intro} /> });
  if (opportunitiesSection && hasOpportunities)
    blocks.push({
      key: "opportunities",
      render: (tone) => (
        <OpportunitiesSection key="opportunities" tone={tone} jobs={jobs} internships={internships?.items ?? []} courses={courses?.items ?? []} heading={opportunitiesSection.heading} intro={opportunitiesSection.intro} />
      ),
    });
  if (employersSection) blocks.push({ key: "employers", render: (tone) => <EmployerBand key="employers" tone={tone} heading={employersSection.heading} intro={employersSection.intro} whatsappE164={contactDetails.whatsapp.e164} /> });
  for (const item of tail) {
    const text = { heading: item.heading, intro: item.intro };
    switch (item.key) {
      case "about":
        blocks.push({ key: item.key, render: (tone) => <AboutTeaser key={item.key} tone={tone} about={about} {...text} /> });
        break;
      case "industries":
        if (industryList.length) blocks.push({ key: item.key, render: (tone) => <IndustriesSection key={item.key} tone={tone} industries={industryList} {...text} /> });
        break;
      case "success_stories":
        if (storyList.length) blocks.push({ key: item.key, render: (tone) => <SuccessStoriesSection key={item.key} tone={tone} stories={storyList} assets={assets} {...text} /> });
        break;
      case "news":
        if (news.items.length) blocks.push({ key: item.key, render: (tone) => <NewsSection key={item.key} tone={tone} news={news.items} assets={assets} {...text} /> });
        break;
      default:
        break;
    }
  }
  if (audiences.length) blocks.push({ key: "audiences", render: (tone) => <AudienceCards key="audiences" tone={tone === "subtle" ? "subtle" : "white"} audiences={audiences} /> });
  if (faqs.items.length) blocks.push({ key: "faq", render: (tone) => <HomeFaqSection key="faq" tone={tone} faqs={faqs.items} /> });
  // The rails band after the hero is grey, so the first block is white and they alternate from there.
  const toneAt = (index: number): SectionTone => (index % 2 === 0 ? "white" : "subtle");
  const closingTone = toneAt(blocks.length);
  const contactTone = toneAt(blocks.length + 1);

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
      streetAddress: settings?.legalEntity?.registeredAddress?.trim() || "B-Block, Plot D-6, Autonagar, Gajuwaka",
      addressLocality: "Visakhapatnam",
      addressRegion: "Andhra Pradesh",
      postalCode: "530012",
      addressCountry: "IN",
    },
    contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: contactDetails.emails[0], telephone: contactDetails.phones[0]?.e164 }],
    ...(sameAs.length ? { sameAs } : {}),
  };

  return (
    <>
      {detail?.preview ? null : <JsonLd data={organization} />}
      <PreviewRibbon show={Boolean(detail?.preview)} />
      <RevealScope>
        <HomeHero hero={home?.hero} media={heroMedia} poster={latestPoster} openRequirements={posters.total} />
        {banners.length ? (
          <div className="border-y border-border bg-teal-soft/60" data-testid="homepage-banners">
            <ul className="container-page divide-y divide-border">
              {banners.map((b) => {
                const href = sanitizeHref(b.linkUrl);
                return (
                  <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm text-foreground">
                    <Megaphone aria-hidden="true" className="size-4 shrink-0 text-teal-strong" />
                    <strong className="font-semibold">{b.title}</strong>
                    {b.body ? <span className="text-muted-foreground">{b.body}</span> : null}
                    {href ? (
                      <Link href={href} className="font-semibold text-teal-strong underline underline-offset-4">
                        {b.linkLabel?.trim() || "Learn more"}
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <DestinationMarquees
          countries={marqueeCountries}
          heading={reachSection?.heading}
          intro={reachSection?.intro}
          guidesHref={reachSection && destinations.items.length ? "/global-reach" : null}
        />
        {blocks.map((block, index) => block.render(toneAt(index)))}
        {ctaSection ? (
          <CtaBand
            location="home_cta_band"
            tone={closingTone === "subtle" ? "subtle" : "white"}
            heading={ctaSection.heading || (ctaCustomised ? ctaBand?.heading?.trim() : null) || "Your trade can take you anywhere."}
            body={ctaSection.intro || (ctaCustomised ? ctaBand?.body?.trim() : null) || "Send your CV and trade today. We call you when a matching requirement opens. Applying is always free."}
            primary={{ ...ctaPrimary, id: "cta_band_primary" }}
            secondary={{ ...ctaSecondary, id: "cta_band_secondary" }}
          />
        ) : null}
        <ContactBand
          tone={ctaSection ? contactTone : closingTone}
          contact={contactDetails}
          channel={{ url: contactDetails.whatsappGroupUrl ?? CONTACT.whatsappChannelUrl, kind: contactDetails.whatsappGroupUrl ? "group" : "channel" }}
        />
      </RevealScope>
    </>
  );
}
