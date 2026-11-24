import { Check } from "lucide-react";
import Link from "next/link";
import type { HomepageData } from "@/modules/content/collections";

import { type CtaSpec } from "../blocks";
import { CtaLink } from "../cta-link";
import { EN_MARKETING, type MarketingT } from "../marketing-i18n";
import { MANPOWER_PORTAL_HREF } from "./manpower";
import { RouteCard } from "./hero-card";

/**
 * Seeded headings (the original specification copy and earlier seeds). When the CMS still holds exactly one of
 * these, the designed default headline shows; anything an editor has written is respected.
 */
const LEGACY_HEADINGS = new Set(["Connecting Global Talent With Limitless Opportunities.", "Skilled hands from Vizag to the world"]);
const LEGACY_CTA_LABELS = new Set(["explore opportunities", "hire through venkat sai", "become a partner"]);

const SEND_CV_HREF = "/send-cv";
const JOBS_HREF = "/jobs";
/** The latest requirements section right below the hero (homepage, `id="requirements"`). */
export const REQUIREMENTS_ANCHOR = "#requirements";

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

export type HeroCta = { label: string; href: string };

/** Seeded English labels of the built-in links, shown in the page language instead. */
function localised(cta: HeroCta, t: MarketingT): HeroCta {
  const label = cta.label.trim().toLowerCase();
  if (cta.href === SEND_CV_HREF && label === "send your cv") return { ...cta, label: t("common.sendCv") };
  if (cta.href === JOBS_HREF && label === "explore jobs") return { ...cta, label: t("common.exploreJobs") };
  return cta;
}

/**
 * The two hero pills. Default: "Send your CV", then "Explore jobs" (the seeded CMS pair, which lists Explore jobs
 * first, shows in this order too). While requirements are open, the main pill is "Apply for open jobs" (it jumps to
 * the list right below the hero) and "Send your CV" comes second. A CTA an editor set in the CMS that points anywhere
 * else keeps its place.
 */
export function heroCtas({
  primaryCta,
  secondaryCta,
  hasRequirements,
  t = EN_MARKETING,
}: {
  primaryCta?: CtaSpec | null;
  secondaryCta?: CtaSpec | null;
  hasRequirements: boolean;
  t?: MarketingT;
}): [HeroCta, HeroCta] {
  const defaultPrimary = { label: t("common.sendCv"), href: SEND_CV_HREF };
  const primary = localised(usableHeroCta(primaryCta, defaultPrimary), t);
  const secondary = localised(usableHeroCta(secondaryCta, { label: t("common.exploreJobs"), href: JOBS_HREF }), t);
  const pair: [HeroCta, HeroCta] = primary.href === JOBS_HREF && secondary.href === SEND_CV_HREF ? [secondary, primary] : [primary, secondary];
  if (!hasRequirements) return pair;
  const apply = { label: t("hero.applyOpenJobs"), href: REQUIREMENTS_ANCHOR };
  const builtIn = (cta: HeroCta) => cta.href === SEND_CV_HREF || cta.href === JOBS_HREF;
  const [first, second] = pair;
  if (builtIn(first) && builtIn(second)) return [apply, pair.find((cta) => cta.href === SEND_CV_HREF) ?? defaultPrimary];
  if (builtIn(first)) return [apply, second];
  if (builtIn(second)) return [first, apply];
  return pair;
}

/** Analytics name and test id of a hero pill, by where it leads. */
function ctaIds(cta: HeroCta, slot: 1 | 2): { cta: string; testId: string } {
  if (cta.href === REQUIREMENTS_ANCHOR) return { cta: "apply_requirements", testId: "hero-apply-requirements" };
  if (cta.href === SEND_CV_HREF) return { cta: "send_cv", testId: "hero-send-cv" };
  if (cta.href === JOBS_HREF) return { cta: "explore_jobs", testId: "hero-explore-jobs" };
  return { cta: `hero_custom_${slot}`, testId: `hero-cta-${slot}` };
}

const AUDIENCE_PILL =
  "inline-flex min-h-11 items-center rounded-full border border-border bg-white px-4 text-sm font-medium text-foreground transition-colors hover:border-[#c9cdd5] hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * Homepage hero, white: accent label, a very large black headline, one grey line, the two pills (see heroCtas) and
 * three trust checks. On the right, always, one clean card: the route card with the flight from Vizag (the owner
 * wants the flight on every visit; the latest requirements follow right below the hero). The CMS hero image/video
 * field is therefore not shown here.
 * The copy enters once on load (CSS, opacity/transform only; static for reduced motion).
 * CMS text stays as written; the designed defaults follow the page language (`t`).
 */
export function HomeHero({
  hero,
  openRequirements = 0,
  t = EN_MARKETING,
}: {
  hero: HomepageData["hero"] | null | undefined;
  /** Number of published requirement posters; any at all makes the main pill "Apply for open jobs". */
  openRequirements?: number;
  whatsappE164?: string;
  t?: MarketingT;
}) {
  const cmsHeading = hero?.heading?.trim();
  const heading = cmsHeading && !LEGACY_HEADINGS.has(cmsHeading) ? cmsHeading : null;
  const subheading = (heading ? hero?.subheading?.trim() : null) || t("hero.subheading");
  const [first, second] = heroCtas({ primaryCta: hero?.primaryCta, secondaryCta: hero?.secondaryCta, hasRequirements: openRequirements > 0, t });
  const firstIds = ctaIds(first, 1);
  const secondIds = ctaIds(second, 2);
  const [titleLead, titleAccent, titleRest] = splitAccent(t("hero.title"));

  return (
    <section aria-labelledby="home-hero-title" className="relative overflow-hidden bg-white" data-testid="home-hero">
      <div className="container-page grid items-center gap-10 pt-10 pb-12 sm:gap-12 sm:pt-16 sm:pb-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16 lg:pt-20 lg:pb-16">
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
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground motion-safe:animate-[vsg-enter_0.8s_cubic-bezier(0.22,1,0.36,1)_120ms_both] sm:mt-7 sm:text-xl">
            {subheading}
          </p>
          <div className="mt-8 flex flex-col gap-3 motion-safe:animate-[vsg-enter_0.8s_cubic-bezier(0.22,1,0.36,1)_180ms_both] min-[420px]:flex-row min-[420px]:flex-wrap sm:mt-10">
            <CtaLink href={first.href} cta={firstIds.cta} location="hero" variant="primary" arrow className="min-h-12 px-6 text-center text-[15px] whitespace-normal" data-testid={firstIds.testId}>
              {first.label}
            </CtaLink>
            <CtaLink href={second.href} cta={secondIds.cta} location="hero" variant="outline" className="min-h-12 px-6 text-[15px]" data-testid={secondIds.testId}>
              {second.label}
            </CtaLink>
          </div>
          <ul className="mt-8 flex flex-col gap-3 text-sm font-medium text-foreground motion-safe:animate-[vsg-enter_0.8s_cubic-bezier(0.22,1,0.36,1)_240ms_both] sm:mt-10 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {TRUST.map((key) => (
              <li key={key} className="flex items-center gap-2">
                <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full bg-teal-soft text-teal-strong">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-2 motion-safe:animate-[vsg-enter_0.8s_cubic-bezier(0.22,1,0.36,1)_280ms_both] sm:mt-8" data-testid="hero-audience-links">
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
            <RouteCard t={t} />
          </div>
        </div>
      </div>
    </section>
  );
}
