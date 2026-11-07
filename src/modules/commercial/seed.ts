import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { countries, taxRates } from "@/db/schema";
import type { TaxRateKind } from "@/db/schema/commercial";

/**
 * Idempotent production seed for the commercial module (called by scripts/seed.ts).
 *
 * Seeds ONLY the India GST rate definitions for services under SAC 9985 (support services), as DEFAULT
 * CONFIGURATION that finance must confirm with its tax adviser before relying on it: rows are inserted without
 * `confirmedAt` and with a note saying so, and the admin tax-rate screen highlights unconfirmed rates.
 *   CGST 9 % + SGST 9 % (intra-state supply) · IGST 18 % (inter-state supply)
 * Effective from 1 July 2017 (GST introduction). Existing rows are never changed (an administrator may have edited
 * or confirmed them). No plans, prices or coupons are seeded — Venkat Sai creates them.
 */
const GST_EFFECTIVE_FROM = new Date("2017-07-01T00:00:00+05:30");
const SAC_SUPPORT_SERVICES = "9985";
const NOTE = "Default configuration seeded for services under SAC 9985. Finance must confirm the rate and SAC with a tax adviser before relying on it.";

const DEFAULT_GST_RATES: { name: string; kind: TaxRateKind; rateBasisPoints: number }[] = [
  { name: "CGST 9%", kind: "gst_cgst", rateBasisPoints: 900 },
  { name: "SGST 9%", kind: "gst_sgst", rateBasisPoints: 900 },
  { name: "IGST 18%", kind: "gst_igst", rateBasisPoints: 1800 },
];

export type CommercialSeedResult = { inserted: number; existing: number; skipped?: string };

export async function seed(): Promise<void> {
  await seedDefaultTaxRates();
}

export async function seedDefaultTaxRates(): Promise<CommercialSeedResult> {
  const [india] = await db.select({ code: countries.code }).from(countries).where(eq(countries.code, "IN")).limit(1);
  if (!india) return { inserted: 0, existing: 0, skipped: "Country IN is missing (run the reference seeds first)." };
  let inserted = 0;
  let existing = 0;
  for (const rate of DEFAULT_GST_RATES) {
    // tax_rates_definition_uq is an expression index (coalesce), which ON CONFLICT (cols) cannot infer:
    // check first, then insert with a target-less ON CONFLICT DO NOTHING (docs/SCHEMA_NOTES.md §2).
    const [found] = await db
      .select({ id: taxRates.id })
      .from(taxRates)
      .where(and(eq(taxRates.countryCode, "IN"), isNull(taxRates.region), eq(taxRates.kind, rate.kind), eq(taxRates.taxCode, SAC_SUPPORT_SERVICES), eq(taxRates.effectiveFrom, GST_EFFECTIVE_FROM)))
      .limit(1);
    if (found) {
      existing += 1;
      continue;
    }
    const rows = await db
      .insert(taxRates)
      .values({ name: rate.name, countryCode: "IN", region: null, kind: rate.kind, rateBasisPoints: rate.rateBasisPoints, taxCode: SAC_SUPPORT_SERVICES, isActive: true, effectiveFrom: GST_EFFECTIVE_FROM, notes: NOTE })
      .onConflictDoNothing()
      .returning({ id: taxRates.id });
    if (rows.length) inserted += 1;
    else existing += 1;
  }
  return { inserted, existing };
}
