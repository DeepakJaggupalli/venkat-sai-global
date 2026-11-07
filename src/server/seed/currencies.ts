import "server-only";

import { currencies as isoCurrencies } from "countries-list/currencies";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { currencies } from "@/db/schema";

import { countInserted, type SeedResult } from "./util";

/**
 * ISO 4217 currencies in active use (from the countries-list package, CLDR names/symbols).
 * Excluded: withdrawn codes, precious metals, fund / accounting / testing codes.
 *
 * Minor units follow Intl (CLDR) — the same source as currencyMinorUnits() in src/lib/format.ts,
 * so amounts stored in minor units and their display always agree. ISO decimals are the fallback
 * when the runtime does not know a code. (CLDR uses 0 decimals for a few currencies whose ISO
 * minor unit is 2, e.g. PKR, IDR, HUF, COP — see docs/OPERATIONS.md.)
 */
const NOT_IN_CIRCULATION = new Set([
  "XAG", "XAU", "XPD", "XPT", // precious metals
  "XBA", "XBB", "XBC", "XBD", "XDR", "XSU", "XUA", "XAD", // units of account
  "XTS", "XXX", // testing / no currency
  "BOV", "CHE", "CHW", "CLF", "COU", "MXV", "USN", "UYI", "UYW", // fund codes
]);

export function intlMinorUnits(code: string, isoDecimals: number): number {
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits;
    return typeof digits === "number" ? digits : isoDecimals;
  } catch {
    return isoDecimals;
  }
}

export type CurrencySeed = { code: string; name: string; symbol: string; minorUnits: number };

export function currencySeedData(): CurrencySeed[] {
  return Object.entries(isoCurrencies)
    .filter(([code, c]) => !c.withdrawn && !NOT_IN_CIRCULATION.has(code))
    .map(([code, c]) => ({ code, name: c.name, symbol: c.symbol || code, minorUnits: intlMinorUnits(code, c.decimals) }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function seedCurrencies(): Promise<SeedResult> {
  const data = currencySeedData();
  // Insert missing currencies; existing rows (possibly edited by admins) are left untouched.
  const rows = await db
    .insert(currencies)
    .values(data.map((c) => ({ ...c, isActive: true })))
    .onConflictDoNothing({ target: currencies.code })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return { name: "currencies", ...countInserted(rows), total: data.length };
}
