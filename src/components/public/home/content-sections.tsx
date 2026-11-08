import { ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";

import { BRAND } from "@/config/site";
import { stockPhoto } from "@/content/stock-photos";
import type { AboutData } from "@/modules/content/collections";
import type { AssetMap, PublishedEntry } from "@/modules/content/types";

import { EntryCard } from "../blocks";
import { CmsIcon } from "../cms-icon";
import { CmsImage, pickAsset } from "../cms-media";
import { CtaLink } from "../cta-link";
import { Section, SectionHeading, type SectionTone } from "../section";
import { StockImage } from "../stock-image";
import { htmlToText } from "../text";

type SectionText = { heading?: string | null; intro?: string | null };

/** About teaser: copy and up to four capabilities on the left, a photograph on the right. */
export function AboutTeaser({ tone = "subtle", about, heading, intro }: SectionText & { about: AboutData | null } & { tone?: SectionTone }) {
  const summary = intro || htmlToText(about?.history, 240) || `${BRAND.name} is the technology platform of ${BRAND.legalEntity}, based in ${BRAND.headquarters}.`;
  const capabilities = (about?.capabilities ?? []).filter((c) => c.title?.trim()).slice(0, 4);
  return (
    <Section tone={tone} labelledBy="home-about-title" data-testid="home-about">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div data-reveal>
          <SectionHeading id="home-about-title" eyebrow="About Venkat Sai" title={heading || "A welding works that grew into a careers company"} intro={summary} />
          {capabilities.length ? (
            <ul className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {capabilities.map((c, i) => (
                <li key={`${c.title}-${i}`} className="border-t border-border pt-4">
                  <h3 className="font-heading text-base font-bold tracking-tight text-foreground">{c.title}</h3>
                  {c.description ? <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{c.description}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin aria-hidden="true" className="size-4 text-teal-strong" />
            {BRAND.headquarters}
          </p>
          <div className="mt-8">
            <CtaLink href="/about" cta="about_teaser" location="home_about" variant="outline" arrow>
              Our story
            </CtaLink>
          </div>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-white" data-reveal="2">
          <StockImage photo={stockPhoto("shipyard")} sizes="(min-width: 1024px) 45vw, 100vw" />
        </div>
      </div>
    </Section>
  );
}

/** Industries as calm chips with their icon. */
export function IndustriesSection({ tone = "white", industries, heading, intro }: SectionText & { industries: readonly PublishedEntry<"industries">[] } & { tone?: SectionTone }) {
  if (!industries.length) return null;
  return (
    <Section tone={tone} labelledBy="home-industries-title" data-testid="home-industries">
      <SectionHeading
        id="home-industries-title"
        eyebrow="Industries"
        title={heading || "Industries we work with"}
        intro={intro}
        action={
          <CtaLink href="/industries" cta="all_industries" location="home_industries" variant="outline" arrow>
            All industries
          </CtaLink>
        }
      />
      <ul className="mt-12 flex flex-wrap gap-3">
        {industries.map((i) => (
          <li key={i.id}>
            <Link
              href={i.path ?? `/industries/${i.slug}`}
              className="group inline-flex min-h-12 items-center gap-2.5 rounded-full border border-border bg-white py-2 pr-5 pl-3 text-[15px] font-medium text-foreground transition-colors hover:border-[#c9cdd5] hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-soft text-teal-strong">
                <CmsIcon name={i.data.iconName} className="size-3.5" />
              </span>
              {i.title}
              <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function SuccessStoriesSection({ tone = "subtle", stories, assets, heading, intro }: SectionText & { stories: readonly PublishedEntry<"case_studies">[]; assets: AssetMap } & { tone?: SectionTone }) {
  if (!stories.length) return null;
  return (
    <Section tone={tone} labelledBy="home-stories-title" data-testid="home-success-stories">
      <SectionHeading
        id="home-stories-title"
        eyebrow="Success stories"
        title={heading || "Work delivered with our clients"}
        intro={intro || "Published with the client's consent."}
        action={
          <CtaLink href="/success-stories" cta="all_success_stories" location="home_success_stories" variant="outline" arrow>
            All success stories
          </CtaLink>
        }
      />
      <ul className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {stories.map((s) => (
          <li key={s.id}>
            <EntryCard
              href={s.path ?? `/success-stories/${s.slug}`}
              title={s.title}
              summary={s.summary}
              iconName="award"
              image={pickAsset(assets, s.heroAssetId)}
              badge={<span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-xs font-medium text-teal-strong">{s.data.clientName?.trim() || s.data.clientDescriptor}</span>}
              footer={
                <span aria-hidden="true" className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
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

export function NewsSection({ tone = "white", news, assets, heading, intro }: SectionText & { news: readonly PublishedEntry<"news">[]; assets: AssetMap } & { tone?: SectionTone }) {
  if (!news.length) return null;
  const fmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  return (
    <Section tone={tone} labelledBy="home-news-title" data-testid="home-news">
      <SectionHeading
        id="home-news-title"
        eyebrow="Latest news"
        title={heading || "News and announcements"}
        intro={intro}
        action={
          <CtaLink href="/news" cta="all_news" location="home_news" variant="outline" arrow>
            All news
          </CtaLink>
        }
      />
      <ul className="mt-12 grid gap-8 md:grid-cols-3">
        {news.map((n) => {
          const image = pickAsset(assets, n.heroAssetId);
          return (
            <li key={n.id}>
              <article className="group relative flex h-full flex-col">
                <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-surface-subtle">
                  {image && image.kind === "image" ? (
                    <CmsImage asset={image} size="md" sizes="(min-width: 768px) 33vw, 100vw" className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
                  ) : (
                    <StockImage photo={stockPhoto("doha")} decorative sizes="(min-width: 768px) 33vw, 100vw" className="transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
                  )}
                </div>
                <p className="mt-4 text-xs font-medium text-muted-foreground">
                  <time dateTime={n.publishedAt.toISOString()}>{fmt.format(n.publishedAt)}</time>
                </p>
                <h3 className="mt-1.5 font-heading text-lg font-bold tracking-tight text-foreground">
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
