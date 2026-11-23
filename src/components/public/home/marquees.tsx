import { ArrowRight, CalendarCheck, HardHat, Plane } from "lucide-react";
import Link from "next/link";

import { ProgressiveBlur } from "@/components/motion-primitives/progressive-blur";

import { Flag } from "../flag";
import { EN_MARKETING, type MarketingT } from "../marketing-i18n";
import { Marquee } from "../marquee";
import { PausableRails } from "../pausable-rails";

export type MarqueeCountry = { code: string; name: string; href?: string | null };

/** Countries where Venkat Sai candidates are sent to work, by relevance, plus home (no counts — just where the work is). */
export const DEFAULT_DESTINATION_COUNTRIES: readonly MarqueeCountry[] = [
  { code: "AE", name: "UAE" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
  { code: "KW", name: "Kuwait" },
  { code: "OM", name: "Oman" },
  { code: "BH", name: "Bahrain" },
  { code: "IQ", name: "Iraq" },
  { code: "JO", name: "Jordan" },
  { code: "IL", name: "Israel" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "BN", name: "Brunei" },
  { code: "MV", name: "Maldives" },
  { code: "MU", name: "Mauritius" },
  { code: "SC", name: "Seychelles" },
  { code: "PL", name: "Poland" },
  { code: "RO", name: "Romania" },
  { code: "HR", name: "Croatia" },
  { code: "RS", name: "Serbia" },
  { code: "HU", name: "Hungary" },
  { code: "CZ", name: "Czech Republic" },
  { code: "SK", name: "Slovakia" },
  { code: "LT", name: "Lithuania" },
  { code: "LV", name: "Latvia" },
  { code: "DE", name: "Germany" },
  { code: "NL", name: "Netherlands" },
  { code: "PT", name: "Portugal" },
  { code: "GR", name: "Greece" },
  { code: "CY", name: "Cyprus" },
  { code: "RU", name: "Russia" },
  { code: "GE", name: "Georgia" },
  { code: "AM", name: "Armenia" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "IN", name: "India" },
];

/**
 * Trades we train and recruit, in two rails: welding, mechanical, electrical and oil & gas first; construction,
 * drivers and operators, automotive, hospitality, logistics and general second. Trade names stay in English in
 * every language (they are how the jobs are advertised).
 */
export const TRADE_RAILS: readonly (readonly string[])[] = [
  [
    "6G Welder",
    "TIG Welder",
    "MIG Welder",
    "Arc Welder",
    "Pipe Welder",
    "Structural Welder",
    "Fabricator",
    "Grinder",
    "Gas Cutter",
    "Pipe Fitter",
    "Structural Fitter",
    "Mechanical Fitter",
    "Millwright",
    "Machinist",
    "CNC Operator",
    "Turner",
    "HVAC Technician",
    "Refrigeration Technician",
    "Electrician",
    "Industrial Electrician",
    "Instrument Technician",
    "Cable Puller",
    "Lineman",
    "Panel Wireman",
    "Rigger",
    "Roustabout",
    "Blaster / Painter",
    "NDT Technician",
    "QA/QC Inspector",
    "Safety Officer",
  ],
  [
    "Mason",
    "Carpenter",
    "Shuttering Carpenter",
    "Steel Fixer",
    "Painter",
    "Plasterer",
    "Tile Setter",
    "Plumber",
    "Scaffolder",
    "Insulator",
    "Duct Fabricator",
    "Heavy Driver",
    "Light Driver",
    "Crane Operator",
    "Forklift Operator",
    "JCB Operator",
    "Excavator Operator",
    "Auto Mechanic",
    "Auto Electrician",
    "Denter",
    "Cook",
    "Waiter",
    "Housekeeping",
    "Cleaner",
    "Warehouse Helper",
    "Store Keeper",
    "Mechanical Helper",
    "General Helper",
    "Security Guard",
  ],
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
 * "Where our people work": a light-grey band with three slow, user-scrollable rails (destination countries
 * with real SVG flags, then two rows of trades), followed by a centred heading, one line of copy and two badges.
 * The country list is the curated DEFAULT_DESTINATION_COUNTRIES; a chip links to its country guide when a CMS
 * destination for that country is published.
 */
export function DestinationMarquees({
  countries,
  heading,
  intro,
  guidesHref,
  t = EN_MARKETING,
}: {
  countries: readonly MarqueeCountry[];
  heading?: string | null;
  intro?: string | null;
  /** "Country guides" link (shown when the CMS global reach section is on and guides exist). */
  guidesHref?: string | null;
  t?: MarketingT;
}) {
  const guides = new Map(countries.filter((c) => c.href).map((c) => [c.code.toUpperCase(), c.href]));
  const list = DEFAULT_DESTINATION_COUNTRIES.map((c) => ({ ...c, href: guides.get(c.code) ?? null }));
  return (
    <section aria-labelledby="home-where-title" className="overflow-hidden border-y border-border bg-surface-subtle py-16 sm:py-20 lg:py-24" data-testid="home-marquees">
      <PausableRails label="lists of countries and trades">
        <div className="space-y-4">
          <div className="relative">
            <Marquee
              label={t("where.countries")}
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
          {TRADE_RAILS.map((trades, i) => (
            <div key={i} className="relative">
              <Marquee
                label={t(i === 0 ? "where.trades" : "where.tradesMore")}
                items={trades}
                itemKey={(trade) => trade}
                reverse={i === 0}
                speed="slow"
                render={(trade) => (
                  <span className="mx-2 inline-flex">
                    <span className={CHIP} lang="en">
                      <HardHat aria-hidden="true" className="size-4 text-teal-strong" />
                      {trade}
                    </span>
                  </span>
                )}
              />
              <RailEdges />
            </div>
          ))}
        </div>
      </PausableRails>
      <div className="container-page mt-12 text-center sm:mt-14" data-reveal>
        <p className="label-dot justify-center">{t("where.eyebrow")}</p>
        <h2 id="home-where-title" className="mx-auto mt-4 max-w-3xl text-balance font-display text-[2rem] text-foreground sm:text-[2.75rem] lg:text-[3.25rem]">
          {heading || t("where.title")}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          {intro || t("where.intro")}
        </p>
        <ul className="mt-6 flex flex-wrap justify-center gap-2 text-sm font-medium text-foreground">
          <li className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3.5 py-1.5">
            <CalendarCheck aria-hidden="true" className="size-4 text-teal-strong" />
            {t("where.badgeDaily")}
          </li>
          <li className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3.5 py-1.5">
            <Plane aria-hidden="true" className="size-4 text-teal-strong" />
            {t("where.badgeDepartures")}
          </li>
        </ul>
        {guidesHref ? (
          <Link href={guidesHref} className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-foreground underline-offset-4 hover:underline">
            {t("where.guides")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
