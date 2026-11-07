import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { countries, taxRates } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";

import { assertStaff } from "./access";
import { notFound, rethrowConstraint } from "./errors";
import type { TaxRateFormInput } from "./schemas";
import type { TaxRateRecord } from "./tax";

/**
 * Tax rate administration (commercial.plans) and the loader used by the tax engine. Rates are versioned by
 * effective dates: to change a rate, end the current row (effectiveUntil) and add a new one.
 */

export type TaxRateRow = typeof taxRates.$inferSelect;

/** Active rates for the given countries (the engine filters by date, kind, region and code). */
export async function loadTaxRates(countryCodes: readonly string[], tx: DbOrTx = db): Promise<TaxRateRecord[]> {
  const codes = [...new Set(countryCodes.filter(Boolean).map((c) => c.toUpperCase()))];
  if (!codes.length) return [];
  const rows = await tx.select().from(taxRates).where(eq(taxRates.isActive, true));
  return rows
    .filter((r) => codes.includes(r.countryCode))
    .map((r) => ({
      id: r.id,
      name: r.name,
      countryCode: r.countryCode,
      region: r.region,
      kind: r.kind,
      rateBasisPoints: r.rateBasisPoints,
      taxCode: r.taxCode,
      isActive: r.isActive,
      effectiveFrom: r.effectiveFrom,
      effectiveUntil: r.effectiveUntil,
    }));
}

export async function listTaxRates(ctx: StaffContext, filters: { countryCode?: string } = {}): Promise<TaxRateRow[]> {
  assertStaff(ctx, ["commercial.view", "commercial.plans"], "any");
  return db
    .select()
    .from(taxRates)
    .where(filters.countryCode ? eq(taxRates.countryCode, filters.countryCode.toUpperCase()) : undefined)
    .orderBy(asc(taxRates.countryCode), asc(taxRates.kind), asc(taxRates.effectiveFrom));
}

function toBasisPoints(ratePercent: string): number {
  return Math.round(Number(ratePercent) * 100);
}

export async function saveTaxRate(ctx: StaffContext, input: TaxRateFormInput): Promise<TaxRateRow> {
  assertStaff(ctx, "commercial.plans");
  try {
    return await db.transaction(async (tx) => {
      const [country] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, input.countryCode)).limit(1);
      if (!country) throw new ActionError("Choose a country.", { fieldErrors: { countryCode: ["Unknown country"] } });
      const values = {
        name: input.name,
        countryCode: input.countryCode,
        region: input.region?.trim() || null,
        kind: input.kind,
        rateBasisPoints: toBasisPoints(input.ratePercent),
        taxCode: input.taxCode?.trim() || null,
        isActive: input.isActive,
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil ?? null,
        notes: input.notes ?? null,
      };
      let row: TaxRateRow;
      if (input.id) {
        const [existing] = await tx.select().from(taxRates).where(eq(taxRates.id, input.id)).limit(1).for("update");
        if (!existing) throw notFound("Tax rate");
        // Editing the rate itself requires re-confirmation by finance.
        const rateChanged = existing.rateBasisPoints !== values.rateBasisPoints || existing.kind !== values.kind || existing.taxCode !== values.taxCode;
        [row] = (await tx
          .update(taxRates)
          .set({ ...values, ...(rateChanged ? { confirmedAt: null, confirmedByUserId: null } : {}) })
          .where(eq(taxRates.id, input.id))
          .returning()) as [TaxRateRow];
      } else {
        [row] = (await tx.insert(taxRates).values(values).returning()) as [TaxRateRow];
      }
      await audit({ action: input.id ? "commercial.tax_rate_updated" : "commercial.tax_rate_created", entityType: "tax_rate", entityId: row.id, actorUserId: ctx.user.id, actorType: "staff", metadata: values, tx });
      return row;
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Finance confirms a rate (seeded rates are default configuration until confirmed). */
export async function confirmTaxRate(ctx: StaffContext, taxRateId: string): Promise<void> {
  assertStaff(ctx, "commercial.plans");
  const [row] = await db
    .update(taxRates)
    .set({ confirmedAt: new Date(), confirmedByUserId: ctx.user.id })
    .where(and(eq(taxRates.id, taxRateId)))
    .returning({ id: taxRates.id, name: taxRates.name, rateBasisPoints: taxRates.rateBasisPoints });
  if (!row) throw notFound("Tax rate");
  await audit({ action: "commercial.tax_rate_confirmed", entityType: "tax_rate", entityId: row.id, actorUserId: ctx.user.id, actorType: "staff", metadata: { name: row.name, rateBasisPoints: row.rateBasisPoints } });
}
