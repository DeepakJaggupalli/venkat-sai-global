import { BRAND } from "@/config/site";
import type { HomepageData } from "@/modules/content/collections";
import type { PublicMediaAsset } from "@/modules/content/types";

import { CmsCta, type CtaSpec } from "../blocks";
import { CmsImage, CmsVideo } from "../cms-media";
import { BeadPattern, HeroGlobe } from "../visuals";

const JOURNEY = BRAND.tagline.split(".").map((s) => s.trim()).filter(Boolean);

const DEFAULT_CTAS: Record<"primary" | "secondary" | "tertiary", CtaSpec> = {
  primary: { label: "Explore Opportunities", href: "/jobs" },
  secondary: { label: "Hire Through Venkat Sai", href: "/employers" },
  tertiary: { label: "Become a Partner", href: "/partners" },
};

/**
 * Brand-first homepage hero. Copy and calls to action come from the CMS homepage singleton (with the
 * specification's defaults); CMS media replaces the designed globe composition once real media is uploaded.
 */
export function HomeHero({ hero, media }: { hero: HomepageData["hero"] | null | undefined; media: PublicMediaAsset | null }) {
  const heading = hero?.heading?.trim() || "Connecting Global Talent With Limitless Opportunities.";
  const subheading = hero?.subheading?.trim() || BRAND.promise;
  return (
    <section aria-labelledby="home-hero-title" className="relative isolate overflow-hidden bg-navy-deep text-white" data-testid="home-hero">
      <BeadPattern />
      <div aria-hidden="true" className="absolute -top-48 -left-40 -z-10 size-[40rem] rounded-full bg-teal/20 blur-3xl" />
      <div aria-hidden="true" className="absolute right-[-12rem] bottom-[-14rem] -z-10 size-[34rem] rounded-full bg-gold/10 blur-3xl" />
      <div className="container-page relative grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:py-28">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-soft">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-gold" />
            {BRAND.name} · {BRAND.category}
          </p>
          <h1 id="home-hero-title" className="mt-6 text-balance font-heading text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            {heading}
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-white/80">{subheading}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <CmsCta cta={hero?.primaryCta} fallback={DEFAULT_CTAS.primary} id="explore_opportunities" location="hero" variant="accent" />
            <CmsCta cta={hero?.secondaryCta} fallback={DEFAULT_CTAS.secondary} id="hire_through_venkat_sai" location="hero" variant="onDark" />
            <CmsCta cta={hero?.tertiaryCta} fallback={DEFAULT_CTAS.tertiary} id="become_a_partner" location="hero" variant="linkOnDark" />
          </div>
          <ol aria-label="Your journey with Venkat Sai" className="mt-12 flex flex-wrap items-center gap-x-2 gap-y-3 text-sm font-medium text-white/80">
            {JOURNEY.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1">{step}</span>
                {i < JOURNEY.length - 1 ? (
                  <span aria-hidden="true" className="h-px w-4 bg-gradient-to-r from-gold to-teal" />
                ) : null}
              </li>
            ))}
          </ol>
        </div>
        <div className="relative min-w-0">
          {media && media.kind === "image" ? (
            <div className="relative overflow-hidden rounded-3xl border border-white/10 shadow-2xl shadow-black/40">
              <CmsImage asset={media} priority className="aspect-[4/3]" sizes="(min-width: 1024px) 45vw, 100vw" />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-navy-deep/50 to-transparent" />
            </div>
          ) : media && (media.kind === "video" || media.kind === "embed") ? (
            <CmsVideo asset={media} className="rounded-3xl border border-white/10 shadow-2xl shadow-black/40" />
          ) : (
            <HeroGlobe className="mx-auto max-w-[34rem]" />
          )}
        </div>
      </div>
    </section>
  );
}
