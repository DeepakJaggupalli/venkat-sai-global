import { BadgeCheck, MapPin, Plane } from "lucide-react";

import { whatsappHref } from "@/config/contact";
import type { HomepageData } from "@/modules/content/collections";
import type { PublicMediaAsset } from "@/modules/content/types";

import { type CtaSpec } from "../blocks";
import { CmsImage, CmsVideo } from "../cms-media";
import { DEFAULT_WHATSAPP_MESSAGE, WhatsAppIcon } from "../contact-links";
import { CtaLink } from "../cta-link";
import { GLOBE_DESTINATIONS } from "./globe-data";
import { HeroGlobe } from "./hero-globe";

/**
 * Seeded headings (the original specification copy and the current seed). When the CMS still holds exactly
 * one of these, the designed three-line default headline shows; anything an editor has written is respected.
 */
const LEGACY_HEADINGS = new Set(["Connecting Global Talent With Limitless Opportunities.", "Skilled hands from Vizag to the world"]);
const LEGACY_CTA_LABELS = new Set(["explore opportunities", "hire through venkat sai", "become a partner"]);

const DEFAULT_PRIMARY = { label: "Explore jobs", href: "/jobs" };
const DEFAULT_SECONDARY = { label: "Send your CV", href: "/send-cv" };

const HERO_CTA = "min-h-12 px-6 text-base sm:min-h-14 sm:px-7";

export function usableHeroCta(cta: CtaSpec | null | undefined, fallback: { label: string; href: string }): { label: string; href: string } {
  const label = cta?.label?.trim();
  const href = cta?.href?.trim();
  if (!label || !href || LEGACY_CTA_LABELS.has(label.toLowerCase())) return fallback;
  if (!(href.startsWith("/") ? !href.startsWith("//") : /^https:\/\//i.test(href))) return fallback;
  return { label, href };
}

/**
 * Homepage hero: dark navy band with a heavy display headline, the three main actions (Explore jobs, Send
 * your CV, WhatsApp) and the interactive globe showing routes from Visakhapatnam. It slides under the
 * transparent header. A CMS hero image becomes a dimmed backdrop; a CMS video replaces the globe.
 */
export function HomeHero({ hero, media, whatsappE164 }: { hero: HomepageData["hero"] | null | undefined; media: PublicMediaAsset | null; whatsappE164?: string }) {
  const cmsHeading = hero?.heading?.trim();
  const heading = cmsHeading && !LEGACY_HEADINGS.has(cmsHeading) ? cmsHeading : null;
  const subheading =
    (heading ? hero?.subheading?.trim() : null) ||
    "We train welders, fitters, electricians and riggers in Visakhapatnam and connect them with employers in the Gulf, Europe and Asia. Applying for a job is always free.";
  const primary = usableHeroCta(hero?.primaryCta, DEFAULT_PRIMARY);
  const secondary = usableHeroCta(hero?.secondaryCta, DEFAULT_SECONDARY);
  const image = media?.kind === "image" ? media : null;
  const video = media && (media.kind === "video" || media.kind === "embed") ? media : null;

  return (
    <section
      aria-labelledby="home-hero-title"
      className="band-dark relative isolate -mt-16 overflow-hidden bg-navy-deep pt-16 text-white xl:-mt-[4.5rem] xl:pt-[4.5rem]"
      data-testid="home-hero"
    >
      {image ? (
        <div aria-hidden="true" className="absolute inset-0 -z-20">
          <CmsImage asset={image} priority className="opacity-30" sizes="100vw" />
        </div>
      ) : null}
      <div aria-hidden="true" className="bg-grid-dark absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_70%_40%,#000_20%,transparent_70%)]" />
      <div aria-hidden="true" className="absolute -top-40 -left-40 -z-10 size-[36rem] rounded-full bg-royal/40 blur-3xl" />
      <div aria-hidden="true" className="absolute right-[-10rem] bottom-[-12rem] -z-10 size-[30rem] rounded-full bg-yellow/10 blur-3xl" />

      <div className="container-page relative grid items-center gap-10 pt-10 pb-16 sm:pt-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-6 lg:pt-16 lg:pb-24">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-yellow/40 bg-yellow/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-yellow">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            Venkat Sai Welding Works · Visakhapatnam
          </p>
          <h1 id="home-hero-title" className="mt-6 text-balance font-display text-[2.9rem] uppercase sm:text-7xl lg:text-[5.4rem] xl:text-8xl">
            {heading ?? (
              <>
                <span className="block">Skilled hands</span>
                <span className="block">from Vizag</span>
                <span className="block text-yellow">to the world</span>
              </>
            )}
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-white/85 sm:text-xl">{subheading}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <CtaLink href={primary.href} cta="explore_jobs" location="hero" variant="accent" arrow className={HERO_CTA} data-testid="hero-explore-jobs">
              {primary.label}
            </CtaLink>
            <CtaLink href={secondary.href} cta="send_cv" location="hero" variant="onDark" className={HERO_CTA}>
              {secondary.label}
            </CtaLink>
            <CtaLink
              href={whatsappHref(DEFAULT_WHATSAPP_MESSAGE, whatsappE164)}
              cta="whatsapp"
              location="hero"
              variant="onDark"
              className={`${HERO_CTA} border-green-strong bg-green-strong hover:border-green hover:bg-[#0b6630]`}
            >
              <WhatsAppIcon className="size-5" />
              WhatsApp
            </CtaLink>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-white/85">
            <li className="flex items-center gap-2">
              <BadgeCheck aria-hidden="true" className="size-4 text-yellow" />
              Free for candidates to apply
            </li>
            <li className="flex items-center gap-2">
              <BadgeCheck aria-hidden="true" className="size-4 text-yellow" />
              Trade tests at our own workshop
            </li>
            <li className="flex items-center gap-2">
              <Plane aria-hidden="true" className="size-4 text-yellow" />
              Visa, ticket and documents handled
            </li>
          </ul>
        </div>

        <div className="relative min-w-0">
          {video ? (
            <CmsVideo asset={video} className="rounded-3xl border border-white/10 shadow-2xl shadow-black/40" />
          ) : (
            <>
              <HeroGlobe className="mx-auto max-w-[36rem]" />
              <p className="sr-only">Routes from Visakhapatnam to {GLOBE_DESTINATIONS.map((d) => d.label).join(", ")}.</p>
            </>
          )}
        </div>
      </div>
      <div aria-hidden="true" className="stripe-hazard h-2 w-full" />
    </section>
  );
}
