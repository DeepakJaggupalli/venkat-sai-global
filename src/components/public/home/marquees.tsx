import { flagEmoji } from "../geo";
import { Marquee } from "../marquee";
import { GLOBE_DESTINATIONS } from "./globe-data";

export type MarqueeCountry = { code: string; name: string };

/** Countries the business sends people to (no counts — just where the work is). */
export const DEFAULT_DESTINATION_COUNTRIES: readonly MarqueeCountry[] = [
  ...GLOBE_DESTINATIONS.map((d) => ({ code: d.code, name: d.code === "AE" ? "UAE (Dubai)" : d.label })),
];

export const TRADES: readonly string[] = [
  "Welder 6G",
  "Welder 3G / 4G",
  "Pipe fitter",
  "Fitter",
  "Electrician",
  "Rigger",
  "Scaffolder",
  "Fabricator",
  "NDT technician",
  "Mechanical helper",
];

/**
 * "Where our people work" — two infinite marquees: destination countries (yellow band, poster style) and
 * trades (navy band). Countries come from published CMS destinations when there are any.
 */
export function DestinationMarquees({ countries, heading }: { countries: readonly MarqueeCountry[]; heading?: string | null }) {
  const list = countries.length ? countries : DEFAULT_DESTINATION_COUNTRIES;
  return (
    <section aria-labelledby="home-where-title" className="relative overflow-hidden" data-testid="home-marquees">
      <div className="bg-yellow py-5 text-navy sm:py-6">
        <div className="container-page mb-3 flex items-center gap-3">
          <h2 id="home-where-title" className="font-display text-2xl uppercase sm:text-3xl">
            {heading || "Where our people work"}
          </h2>
          <span aria-hidden="true" className="h-0.5 flex-1 bg-navy/25" />
        </div>
        <Marquee
          label="Destination countries"
          items={list}
          itemKey={(c) => c.code + c.name}
          speed="slow"
          render={(c) => (
            <span className="mx-3 inline-flex items-center gap-3 rounded-full border-2 border-navy/15 bg-white/60 px-5 py-2 font-display text-xl uppercase sm:text-2xl">
              <span aria-hidden="true" className="text-2xl leading-none sm:text-3xl">
                {flagEmoji(c.code)}
              </span>
              {c.name}
            </span>
          )}
        />
      </div>
      <div className="band-dark bg-navy py-4 text-white">
        <Marquee
          label="Trades we recruit and train"
          items={TRADES}
          itemKey={(t) => t}
          reverse
          render={(t) => (
            <span className="mx-2 inline-flex items-center gap-4 font-display text-lg uppercase tracking-wide text-white/90 sm:text-xl">
              {t}
              <span aria-hidden="true" className="text-yellow">
                ✦
              </span>
            </span>
          )}
        />
      </div>
    </section>
  );
}
