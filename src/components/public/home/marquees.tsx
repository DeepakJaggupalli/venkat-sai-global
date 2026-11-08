import { ArrowRight, HardHat } from "lucide-react";
import Link from "next/link";

import { ProgressiveBlur } from "@/components/motion-primitives/progressive-blur";

import { Flag } from "../flag";
import { Marquee } from "../marquee";
import { PausableRails } from "../pausable-rails";

export type MarqueeCountry = { code: string; name: string; href?: string | null };

/** Countries where Venkat Sai candidates are sent to work, plus home (no counts — just where the work is). */
export const DEFAULT_DESTINATION_COUNTRIES: readonly MarqueeCountry[] = [
  { code: "AE", name: "UAE" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
  { code: "KW", name: "Kuwait" },
  { code: "OM", name: "Oman" },
  { code: "BH", name: "Bahrain" },
  { code: "PL", name: "Poland" },
  { code: "RO", name: "Romania" },
  { code: "HR", name: "Croatia" },
  { code: "MT", name: "Malta" },
  { code: "DE", name: "Germany" },
  { code: "RU", name: "Russia" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "JP", name: "Japan" },
  { code: "IN", name: "India" },
];

export const TRADES: readonly string[] = [
  "Welder 6G",
  "Welder 3G / 4G",
  "TIG welder",
  "Pipe fitter",
  "Structural fitter",
  "Fabricator",
  "Electrician",
  "Rigger",
  "Scaffolder",
  "Grinder",
  "NDT technician",
  "Mechanical helper",
];

const CHIP = "inline-flex h-11 items-center gap-2.5 rounded-full border border-border bg-white px-4 text-[15px] font-medium whitespace-nowrap text-foreground";

function CountryChip({ country }: { country: MarqueeCountry }) {
  const body = (
    <>
      <Flag code={country.code} />
      {country.name}
    </>
  );
  return country.href ? (
    <Link href={country.href} className={`${CHIP} transition-colors hover:border-[#c9cdd5]`}>
      {body}
    </Link>
  ) : (
    <span className={CHIP}>{body}</span>
  );
}

/** Soft blur over the faded edges of a rail (decorative). */
function RailEdges() {
  return (
    <>
      <ProgressiveBlur direction="left" blurLayers={4} blurIntensity={0.6} className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-28" />
      <ProgressiveBlur direction="right" blurLayers={4} blurIntensity={0.6} className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-28" />
    </>
  );
}

/**
 * "Where our people work": a light-grey band with two slow rails moving in opposite directions (destination
 * countries with real SVG flags, then trades), followed by a centred heading and one line of copy. Countries
 * come from published CMS destinations when there are any (each chip links to its country guide).
 */
export function DestinationMarquees({
  countries,
  heading,
  intro,
  guidesHref,
}: {
  countries: readonly MarqueeCountry[];
  heading?: string | null;
  intro?: string | null;
  /** "Country guides" link (shown when the CMS global reach section is on and guides exist). */
  guidesHref?: string | null;
}) {
  const list = countries.length >= 6 ? countries : DEFAULT_DESTINATION_COUNTRIES;
  return (
    <section aria-labelledby="home-where-title" className="overflow-hidden border-y border-border bg-surface-subtle py-16 sm:py-20 lg:py-24" data-testid="home-marquees">
      <PausableRails label="lists of countries and trades">
        <div className="space-y-4">
          <div className="relative">
            <Marquee
              label="Countries where our people work"
              items={list}
              itemKey={(c) => c.code + c.name}
              speed="slow"
              render={(c) => (
                <span className="mx-2 inline-flex">
                  <CountryChip country={c} />
                </span>
              )}
            />
            <RailEdges />
          </div>
          <div className="relative">
            <Marquee
              label="Trades we train and recruit"
              items={TRADES}
              itemKey={(t) => t}
              reverse
              speed="slow"
              render={(t) => (
                <span className="mx-2 inline-flex">
                  <span className={CHIP}>
                    <HardHat aria-hidden="true" className="size-4 text-teal-strong" />
                    {t}
                  </span>
                </span>
              )}
            />
            <RailEdges />
          </div>
        </div>
      </PausableRails>
      <div className="container-page mt-12 text-center sm:mt-14" data-reveal>
        <p className="label-dot justify-center">Where our people work</p>
        <h2 id="home-where-title" className="mx-auto mt-4 max-w-3xl text-balance font-display text-[2rem] text-foreground sm:text-[2.75rem] lg:text-[3.25rem]">
          {heading || "From Vizag to sites across the Gulf, Europe and Asia"}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          {intro || "We place welders, fitters, electricians, riggers and scaffolders with employers abroad, and prepare them for the job here in Visakhapatnam."}
        </p>
        {guidesHref ? (
          <Link href={guidesHref} className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-foreground underline-offset-4 hover:underline">
            Country guides
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
