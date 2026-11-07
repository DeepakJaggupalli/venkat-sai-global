import { ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";

import { BRAND } from "@/config/site";
import type { AboutData } from "@/modules/content/collections";
import type { AssetMap, PublishedEntry } from "@/modules/content/types";

import { EntryCard } from "../blocks";
import { CmsIcon } from "../cms-icon";
import { CmsImage, pickAsset } from "../cms-media";
import { CtaLink } from "../cta-link";
import { flagEmoji, groupByReach } from "../geo";
import { Section, SectionHeading } from "../section";
import { htmlToText } from "../text";
import { BeadPattern, ReachMap } from "../visuals";

type SectionText = { heading?: string | null; intro?: string | null };

export function AboutTeaser({ about, heading, intro }: SectionText & { about: AboutData | null }) {
  const summary = intro || htmlToText(about?.history, 360) || `${BRAND.name} is the technology platform of ${BRAND.legalEntity}, based in ${BRAND.headquarters}.`;
  const capabilities = (about?.capabilities ?? []).filter((c) => c.title?.trim()).slice(0, 4);
  return (
    <Section tone="white" labelledBy="home-about-title" data-testid="home-about">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <SectionHeading id="home-about-title" eyebrow="About Venkat Sai" title={heading || "Rooted in industry. Built for global opportunity."} intro={summary} />
          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin aria-hidden="true" className="size-4 text-teal-strong" />
            Headquartered in {BRAND.headquarters}
          </p>
          <div className="mt-8">
            <CtaLink href="/about" cta="about_teaser" location="home_about" variant="outline" arrow>
              Our story
            </CtaLink>
          </div>
        </div>
        {capabilities.length ? (
          <ul className="grid content-start gap-4 sm:grid-cols-2">
            {capabilities.map((c, i) => (
              <li key={`${c.title}-${i}`} className="rounded-xl border border-border bg-surface-subtle p-5">
                <span aria-hidden="true" className="font-heading text-sm font-bold text-gold-strong">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 font-heading text-base font-semibold text-navy">{c.title}</h3>
                {c.description ? <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{c.description}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Section>
  );
}

export function ServicesSection({ services, assets, heading, intro }: SectionText & { services: readonly PublishedEntry<"services">[]; assets: AssetMap }) {
  if (!services.length) return null;
  return (
    <Section tone="subtle" labelledBy="home-services-title" data-testid="home-services">
      <SectionHeading
        id="home-services-title"
        eyebrow="What we do"
        title={heading || "Services across the opportunity journey"}
        intro={intro || "From skill development and testing to recruitment, overseas employment and workforce supply."}
        action={
          <CtaLink href="/services" cta="all_services" location="home_services" variant="link">
            All services
          </CtaLink>
        }
      />
      <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <li key={s.id}>
            <EntryCard href={s.path ?? `/services/${s.slug}`} title={s.title} summary={s.summary} iconName={s.data.iconName} image={pickAsset(assets, s.heroAssetId)} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function IndustriesSection({ industries, heading, intro }: SectionText & { industries: readonly PublishedEntry<"industries">[] }) {
  if (!industries.length) return null;
  return (
    <Section tone="white" labelledBy="home-industries-title" data-testid="home-industries">
      <SectionHeading
        id="home-industries-title"
        eyebrow="Industries"
        title={heading || "Industries we work with"}
        intro={intro}
        action={
          <CtaLink href="/industries" cta="all_industries" location="home_industries" variant="link">
            All industries
          </CtaLink>
        }
      />
      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {industries.map((i) => (
          <li key={i.id}>
            <Link
              href={i.path ?? `/industries/${i.slug}`}
              className="group flex min-h-16 items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 transition-colors duration-200 hover:border-teal hover:bg-teal-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-soft text-teal-strong">
                <CmsIcon name={i.data.iconName} className="size-5" />
              </span>
              <span className="font-heading text-sm font-semibold text-navy">{i.title}</span>
              <ArrowRight aria-hidden="true" className="ml-auto size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function GlobalReachSection({
  destinations,
  countryNames,
  heading,
  intro,
}: SectionText & { destinations: readonly PublishedEntry<"destinations">[]; countryNames: Readonly<Record<string, string>> }) {
  if (!destinations.length) return null;
  const groups = groupByReach(destinations, (d) => d.data.region);
  const points = destinations.map((d) => ({ code: d.data.countryCode, label: countryNames[d.data.countryCode] ?? d.title, region: d.data.region }));
  return (
    <section aria-labelledby="home-reach-title" className="relative isolate overflow-hidden bg-navy-deep py-16 text-white sm:py-20 lg:py-24" data-testid="home-global-reach">
      <BeadPattern />
      <div className="container-page relative">
        <SectionHeading
          id="home-reach-title"
          onDark
          eyebrow="Global reach"
          title={heading || "From Visakhapatnam to the world"}
          intro={intro || "Country guides for the destinations we recruit for, each reviewed and sourced."}
          action={
            <CtaLink href="/global-reach" cta="global_reach" location="home_global_reach" variant="onDark" arrow>
              Explore destinations
            </CtaLink>
          }
        />
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
          <ReachMap points={points} />
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((g) => (
            <div key={g.group}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">{g.label}</h3>
              <ul className="mt-3 space-y-2">
                {g.items.map((d) => (
                  <li key={d.id}>
                    <Link href={d.path ?? `/global-reach/${d.slug}`} className="inline-flex items-center gap-2 rounded-sm font-medium text-white underline-offset-4 hover:underline">
                      <span aria-hidden="true">{flagEmoji(d.data.countryCode)}</span>
                      {d.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SuccessStoriesSection({ stories, assets, heading, intro }: SectionText & { stories: readonly PublishedEntry<"case_studies">[]; assets: AssetMap }) {
  if (!stories.length) return null;
  return (
    <Section tone="subtle" labelledBy="home-stories-title" data-testid="home-success-stories">
      <SectionHeading
        id="home-stories-title"
        eyebrow="Success stories"
        title={heading || "Work delivered with our clients"}
        intro={intro || "Published with the client's consent."}
        action={
          <CtaLink href="/success-stories" cta="all_success_stories" location="home_success_stories" variant="link">
            All success stories
          </CtaLink>
        }
      />
      <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {stories.map((s) => (
          <li key={s.id}>
            <EntryCard
              href={s.path ?? `/success-stories/${s.slug}`}
              title={s.title}
              summary={s.summary}
              iconName="award"
              image={pickAsset(assets, s.heroAssetId)}
              badge={<span className="rounded-md bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold-strong">{s.data.clientName?.trim() || s.data.clientDescriptor}</span>}
              footer={
                <span aria-hidden="true" className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-strong">
                  Read the story <ArrowRight className="size-4" />
                </span>
              }
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function NewsSection({ news, assets, heading, intro }: SectionText & { news: readonly PublishedEntry<"news">[]; assets: AssetMap }) {
  if (!news.length) return null;
  const fmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  return (
    <Section tone="white" labelledBy="home-news-title" data-testid="home-news">
      <SectionHeading
        id="home-news-title"
        eyebrow="Latest news"
        title={heading || "News and announcements"}
        intro={intro}
        action={
          <CtaLink href="/news" cta="all_news" location="home_news" variant="link">
            All news
          </CtaLink>
        }
      />
      <ul className="mt-10 grid gap-6 md:grid-cols-3">
        {news.map((n) => {
          const image = pickAsset(assets, n.heroAssetId);
          return (
            <li key={n.id}>
              <article className="group relative flex h-full flex-col">
                <div className="aspect-[16/10] overflow-hidden rounded-xl bg-surface-subtle">
                  {image && image.kind === "image" ? (
                    <CmsImage asset={image} size="md" sizes="(min-width: 768px) 33vw, 100vw" className="transition-transform duration-300 group-hover:scale-[1.02]" />
                  ) : (
                    <div aria-hidden="true" className="relative size-full overflow-hidden bg-navy">
                      <BeadPattern />
                    </div>
                  )}
                </div>
                <p className="mt-4 text-xs font-medium text-muted-foreground">
                  <time dateTime={n.publishedAt.toISOString()}>{fmt.format(n.publishedAt)}</time>
                </p>
                <h3 className="mt-1.5 font-heading text-lg font-semibold text-navy">
                  <Link href={n.path ?? `/news/${n.slug}`} className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 group-hover:underline">
                    {n.title}
                  </Link>
                </h3>
                {n.summary ? <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{n.summary}</p> : null}
              </article>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
