import "server-only";

import { getCountryDataList, type ICountryData } from "countries-list";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { countries } from "@/db/schema";
import type { MarketRegion } from "@/db/schema/_constants";

import { countInserted, type SeedResult } from "./util";

/**
 * All ISO 3166-1 countries and territories from the countries-list package (plus the widely
 * used user-assigned code XK, Kosovo): alpha-2/alpha-3 codes, English and native names, calling
 * code, main currency, continent, and the market region used to group destinations.
 *
 * `isDestination` is CONFIGURATION ONLY: it marks markets the platform is set up to present as
 * overseas employment destinations (GCC plus commonly served markets). It is not a claim of
 * operations there — public pages list a destination only when a published CMS "destinations"
 * entry exists for it. Admins change it at /admin/settings/taxonomies.
 *
 * Re-running the seed inserts missing countries and fills empty reference fields; it never
 * overwrites names, flags, regions or sort order that already exist.
 */

const GCC = ["AE", "SA", "QA", "KW", "BH", "OM"] as const;
const MIDDLE_EAST = new Set(["IL", "IQ", "IR", "JO", "LB", "PS", "SY", "YE", "TR"]);
/** Transcontinental / Caucasus countries grouped with Europe for recruitment purposes. */
const EUROPE_EXTRA = new Set(["RU", "GE", "AM", "AZ"]);
const NORTH_AMERICA = new Set(["US", "CA", "GL", "BM", "PM"]);
/** Default destination configuration (see the note above). */
export const DEFAULT_DESTINATIONS: readonly string[] = [...GCC, "MY", "SG", "MV", "JO", "DE", "PL", "RO", "GB", "JP", "AU", "NZ", "CA"];
/** Uninhabited territories hidden from selectors by default. */
const HIDDEN = new Set(["AQ", "BV", "HM", "GS", "TF", "UM"]);
/** Where the package lists several historical calling codes, the one in use today. */
const PHONE_OVERRIDES: Record<string, string> = { XK: "+383" };

export function marketRegionFor(country: Pick<ICountryData, "iso2" | "continent">): MarketRegion | null {
  const code = country.iso2;
  if (code === "IN") return "india";
  if ((GCC as readonly string[]).includes(code)) return "gcc";
  if (MIDDLE_EAST.has(code)) return "middle_east";
  if (EUROPE_EXTRA.has(code)) return "europe";
  switch (country.continent) {
    case "EU":
      return "europe";
    case "AS":
      return "asia_pacific";
    case "AF":
      return "africa";
    case "OC":
      return "oceania";
    case "SA":
      return "latin_america";
    case "NA":
      // Mexico, Central America and the Caribbean are grouped as Latin America & the Caribbean.
      return NORTH_AMERICA.has(code) ? "north_america" : "latin_america";
    default:
      return null; // Antarctica
  }
}

export type CountrySeed = {
  code: string;
  iso3: string | null;
  name: string;
  nativeName: string | null;
  phoneCode: string | null;
  currencyCode: string | null;
  continent: string | null;
  marketRegion: MarketRegion | null;
  isActive: boolean;
  isDestination: boolean;
  sortOrder: number;
};

export function countrySeedData(activeCurrencies: ReadonlySet<string>): CountrySeed[] {
  return getCountryDataList()
    .map((c) => ({
      code: c.iso2,
      iso3: c.iso3 && /^[A-Z]{3}$/.test(c.iso3) ? c.iso3 : null,
      name: c.name,
      nativeName: c.native || null,
      phoneCode: PHONE_OVERRIDES[c.iso2] ?? (c.phone?.length ? `+${c.phone[0]}` : null),
      currencyCode: c.currency.find((cur) => activeCurrencies.has(cur)) ?? null,
      continent: c.continent ?? null,
      marketRegion: marketRegionFor(c),
      isActive: !HIDDEN.has(c.iso2),
      isDestination: DEFAULT_DESTINATIONS.includes(c.iso2),
      sortOrder: c.iso2 === "IN" ? 0 : 10,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function seedCountries(): Promise<SeedResult> {
  const activeCurrencies = new Set((await db.execute<{ code: string }>(sql`select code from currencies`)).rows.map((r) => r.code.trim()));
  const data = countrySeedData(activeCurrencies);
  const rows = await db
    .insert(countries)
    .values(data)
    .onConflictDoUpdate({
      target: countries.code,
      // Fill gaps only — never overwrite values that exist (admins may have edited them).
      set: {
        iso3: sql`coalesce(${countries.iso3}, excluded.iso3)`,
        nativeName: sql`coalesce(${countries.nativeName}, excluded.native_name)`,
        phoneCode: sql`coalesce(${countries.phoneCode}, excluded.phone_code)`,
        currencyCode: sql`coalesce(${countries.currencyCode}, excluded.currency_code)`,
        continent: sql`coalesce(${countries.continent}, excluded.continent)`,
        marketRegion: sql`coalesce(${countries.marketRegion}, excluded.market_region)`,
      },
      setWhere: sql`(${countries.iso3} is null and excluded.iso3 is not null)
        or (${countries.nativeName} is null and excluded.native_name is not null)
        or (${countries.phoneCode} is null and excluded.phone_code is not null)
        or (${countries.currencyCode} is null and excluded.currency_code is not null)
        or (${countries.continent} is null and excluded.continent is not null)
        or (${countries.marketRegion} is null and excluded.market_region is not null)`,
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return { name: "countries", ...countInserted(rows), total: data.length };
}
