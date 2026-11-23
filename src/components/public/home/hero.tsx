import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import type { HomepageData } from "@/modules/content/collections";
import type { PublicMediaAsset } from "@/modules/content/types";

import { type CtaSpec } from "../blocks";
import { CmsImage, CmsVideo } from "../cms-media";
import { CtaLink } from "../cta-link";
import { EN_MARKETING, type MarketingT } from "../marketing-i18n";
import { MANPOWER_PORTAL_HREF } from "./manpower";
import type { PosterCard } from "../requirements/data";
import { NowHiringCard, RouteCard } from "./hero-card";

/**
 * Seeded headings (the original specification copy and earlier seeds). When the CMS still holds exactly one of
 * these, the designed default headline shows; anything an editor has written is respected.
 */
const LEGACY_HEADINGS = new Set(["Connecting Global Talent With Limitless Opportunities.", "Skilled hands from Vizag to the world"]);
const LEGACY_CTA_LABELS = new Set(["explore opportunities", "hire through venkat sai", "become a partner"]);

const SEND_CV_HREF = "/send-cv";
const JOBS_HREF = "/jobs";

/** "Get your job *abroad*." → lead, accent (highlighted word between asterisks), rest. No asterisks: all lead. */
export function splitAccent(title: string): [string, string, string] {
  const match = /^(.*?)\*(.+?)\*(.*)$/.exec(title);
  return match ? [match[1]!, match[2]!, match[3]!] : [title, "", ""];
}

const TRUST = ["hero.trust.noFees", "hero.trust.paperwork", "hero.trust.tested"] as const;

export function usableHeroCta(cta: CtaSpec | null | undefined, fallback: { label: string; href: string }): { label: string; href: string } {
  const label = cta?.label?.trim();
  const href = cta?.href?.trim();
  if (!label || !href || LEGACY_CTA_LABELS.has(label.toLowerCase())) return fallback;
  if (!(href.startsWith("/") ? !href.startsWith("//") : /^https:\/\//i.test(href))) return fallback;
  return { label, href };
}

const AUDIENCE_PILL =
  "inline-flex min-h-10 items-center rounded-full border border-border bg-white px-4 text-sm font-medium text-foreground transition-colors hover:border-[#c9cdd5] hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * Homepage hero, white: accent label, a very large black headline, one grey line, the two pills (Send your CV,
 * Explore jobs) and three trust checks. On the right one clean card: the latest requirement poster, else a route
 * card. A CMS hero image or video (uploaded by the business) takes the card's place.
 * The copy enters once on load (CSS, opacity/transform only; static for reduced motion).
 * CMS text stays as written; the designed defaults follow the page language (`t`).
 */
export function HomeHero({
  hero,
  media,
  poster,
  openRequirements = 0,
  t = EN_MARKETING,
}: {
  hero: HomepageData["hero"] | null | undefined;
  media: PublicMediaAsset | null;
  poster?: PosterCard | null;
  /** Number of published requirement posters (live count, shown as "N more open requirements"). */
  openRequirements?: number;
  whatsappE164?: string;
  t?: MarketingT;
}) {
  const cmsHeading = hero?.heading?.trim();
  const heading = cmsHeading && !LEGACY_HEADINGS.has(cmsHeading) ? cmsHeading : null;
  const subheading = (heading ? hero?.subheading?.trim() : null) || t("hero.subheading");
  const defaultPrimary = { label: t("common.sendCv"), href: SEND_CV_HREF };
  const defaultSecondary = { label: t("common.exploreJobs"), href: JOBS_HREF };
  // The main action is always "Send your CV" (CMS CTAs that still point elsewhere become the secondary pill).
  const primary = usableHeroCta(hero?.primaryCta, defaultPrimary);
  const secondary = usableHeroCta(hero?.secondaryCta, defaultSecondary);
  const [first, second] = primary.href === JOBS_HREF && secondary.href === SEND_CV_HREF ? [secondary, primary] : [primary, secondary];
  const image = media?.kind === "image" ? media : null;
  const video = media && (media.kind === "video" || media.kind === "embed") ? media : null;
  const more = openRequirements - 1;
  const [titleLead, titleAccent, titleRest] = splitAccent(t("hero.title"));

  return (
    <section aria-labelledby="home-hero-title" className="relative overflow-hidden bg-white" data-testid="home-hero">
      <div className="container-page grid items-center gap-12 pt-12 pb-20 sm:pt-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16 lg:pt-20 lg:pb-28">
        <div className="min-w-0">
          <p className="label-dot motion-safe:animate-[vsg-enter_0.7s_cubic-bezier(0.22,1,0.36,1)_both]">{t("hero.eyebrow")}</p>
          <h1
            id="home-hero-title"
            className="mt-6 text-balance font-display text-[2.875rem] leading-[1.02] text-foreground motion-safe:animate-[vsg-enter_0.8s_cubic-bezier(0.22,1,0.36,1)_60ms_both] sm:text-7xl lg:text-[5.25rem] xl:text-[5.75rem]"
          >
            {heading ?? (
              <>
                {titleLead}
                {titleAccent ? <span className="bg-gradient-to-r from-[#0284c7] to-[#0891b2] bg-clip-text text-transparent">{titleAccent}</span> : null}
                {titleRest}
              </>
            )}
          </h1>
          <p className="mt-7 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground motion-safe:animate-[vsg-enter_0.8s_cubic-bezier(0.22,1,0.36,1)_120ms_both] sm:text-xl">
            {subheading}
          </p>
          <div className="mt-10 flex flex-col gap-3 motion-safe:animate-[vsg-enter_0.8s_cubic-bezier(0.22,1,0.36,1)_180ms_both] min-[420px]:flex-row min-[420px]:flex-wrap">
            <CtaLink href={first.href} cta="send_cv" location="hero" variant="primary" arrow className="min-h-12 px-6 text-[15px]" data-testid="hero-send-cv">
              {first.label}
            </CtaLink>
            <CtaLink href={second.href} cta="explore_jobs" location="hero" variant="outline" className="min-h-12 px-6 text-[15px]" data-testid="hero-explore-jobs">
              {second.label}
            </CtaLink>
          </div>
          <ul className="mt-10 flex flex-col gap-3 text-sm font-medium text-foreground motion-safe:animate-[vsg-enter_0.8s_cubic-bezier(0.22,1,0.36,1)_240ms_both] sm:flex-row sm:flex-wrap sm:gap-x-6">
            {TRUST.map((key) => (
              <li key={key} className="flex items-center gap-2">
                <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full bg-teal-soft text-teal-strong">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-2 motion-safe:animate-[vsg-enter_0.8s_cubic-bezier(0.22,1,0.36,1)_280ms_both]" data-testid="hero-audience-links">
            {/* Straight to each business portal's sign-up (signed-in members are sent on to their portal). */}
            <Link href={MANPOWER_PORTAL_HREF.agency} className={AUDIENCE_PILL}>
              {t("hero.forAgency")}
            </Link>
            <Link href={MANPOWER_PORTAL_HREF.company} className={AUDIENCE_PILL}>
              {t("hero.forCompany")}
            </Link>
          </div>
        </div>

        <div className="relative min-w-0 motion-safe:animate-[vsg-enter_0.9s_cubic-bezier(0.22,1,0.36,1)_200ms_both] lg:ps-4">
          <div aria-hidden="true" className="absolute -inset-x-6 -inset-y-8 -z-0 rounded-[2.5rem] bg-gradient-to-br from-[#f0f9ff] via-white to-[#ecfeff] lg:-inset-x-10" />
          <div className="relative">
            {video ? (
              <CmsVideo asset={video} className="rounded-3xl border border-border shadow-card" />
            ) : image ? (
              <div className="relative aspect-[4/5] overflow-hidden rounded-3xl border border-border bg-surface-subtle shadow-card sm:aspect-[4/3] lg:aspect-[4/5]">
                <CmsImage asset={image} priority className="absolute inset-0" sizes="(min-width: 1024px) 40vw, 100vw" />
              </div>
            ) : poster ? (
              <>
                <NowHiringCard poster={poster} t={t} />
                {openRequirements > 1 ? (
                  <Link
                    href="/requirements"
                    className="group/more mt-4 flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-border bg-white/80 px-5 text-sm font-medium text-foreground backdrop-blur transition-colors hover:border-[#c9cdd5] focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span>{t("hero.moreRequirements", { count: more })}</span>
                    <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-150 group-hover/more:translate-x-0.5 motion-reduce:transition-none" />
                  </Link>
                ) : null}
              </>
            ) : (
              <RouteCard t={t} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
