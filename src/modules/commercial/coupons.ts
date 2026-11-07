import "server-only";

import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { couponRedemptions, coupons, currencies } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";

import { assertStaff } from "./access";
import { notFound, rethrowConstraint } from "./errors";
import { minorUnitsFor, parseDecimalToMinor } from "./money";
import type { CouponDiscount } from "./pricing";
import type { CouponFormInput } from "./schemas";

/**
 * Coupons: administration (commercial.plans), validation and redemption.
 *  - Codes are upper-case. Percent coupons work in any currency; fixed coupons only in their own currency.
 *  - A redemption is recorded when the coupon is applied to an invoice (and reversed if that invoice is voided or
 *    the draft deleted). `redeemedCount` is incremented atomically against `maxRedemptions`, so concurrent
 *    redemptions can never exceed the cap; repeat cycles of the same subscription do not count again.
 *  - Duration: `once` = first invoice only; `repeating` = the first N invoices of the subscription; `forever` =
 *    every invoice of the subscription. Deactivating or expiring a coupon stops NEW redemptions only.
 */

export type CouponRow = typeof coupons.$inferSelect;

export async function saveCoupon(ctx: StaffContext, input: CouponFormInput): Promise<CouponRow> {
  assertStaff(ctx, "commercial.plans");
  try {
    return await db.transaction(async (tx) => {
      let amountOffMinor: number | null = null;
      let currency: string | null = null;
      if (input.discountType === "fixed") {
        const [cur] = await tx.select().from(currencies).where(eq(currencies.code, input.currency!)).limit(1);
        if (!cur?.isActive) throw new ActionError("Choose an active currency.", { fieldErrors: { currency: ["Unknown or inactive currency"] } });
        const parsed = parseDecimalToMinor(input.amountOff!, minorUnitsFor(cur.code, cur.minorUnits));
        if (!parsed.ok || parsed.minor <= 0) throw new ActionError(parsed.ok ? "The discount must be more than zero." : parsed.error, { fieldErrors: { amountOff: ["Invalid amount"] } });
        amountOffMinor = parsed.minor;
        currency = cur.code;
      }
      const values = {
        code: input.code,
        description: input.description ?? null,
        discountType: input.discountType,
        percentOff: input.discountType === "percent" ? (input.percentOff ?? null) : null,
        amountOffMinor,
        currency,
        duration: input.duration,
        durationCycles: input.duration === "repeating" ? (input.durationCycles ?? null) : null,
        maxRedemptions: input.maxRedemptions ?? null,
        maxRedemptionsPerOrganization: input.maxRedemptionsPerOrganization ?? null,
        validFrom: input.validFrom ?? null,
        validUntil: input.validUntil ?? null,
        planIds: input.planIds,
        isActive: input.isActive,
      };
      let row: CouponRow;
      if (input.id) {
        const [existing] = await tx.select().from(coupons).where(eq(coupons.id, input.id)).limit(1).for("update");
        if (!existing) throw notFound("Coupon");
        if (existing.redeemedCount > 0 && (existing.discountType !== values.discountType || existing.percentOff !== values.percentOff || existing.amountOffMinor !== values.amountOffMinor || existing.currency !== values.currency)) {
          throw new ActionError("This coupon has been redeemed, so its discount cannot change. Deactivate it and create a new coupon.");
        }
        if (values.maxRedemptions !== null && values.maxRedemptions < existing.redeemedCount) {
          throw new ActionError(`The limit cannot be lower than the ${existing.redeemedCount} redemptions already made.`, { fieldErrors: { maxRedemptions: ["Too low"] } });
        }
        [row] = (await tx.update(coupons).set(values).where(eq(coupons.id, input.id)).returning()) as [CouponRow];
      } else {
        [row] = (await tx.insert(coupons).values({ ...values, createdByUserId: ctx.user.id }).returning()) as [CouponRow];
      }
      await audit({ action: input.id ? "commercial.coupon_updated" : "commercial.coupon_created", entityType: "coupon", entityId: row.id, actorUserId: ctx.user.id, actorType: "staff", metadata: { ...values, validFrom: values.validFrom?.toISOString() ?? null, validUntil: values.validUntil?.toISOString() ?? null }, tx });
      return row;
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

export async function setCouponActive(ctx: StaffContext, couponId: string, isActive: boolean): Promise<void> {
  assertStaff(ctx, "commercial.plans");
  const [row] = await db.update(coupons).set({ isActive }).where(eq(coupons.id, couponId)).returning({ id: coupons.id, code: coupons.code });
  if (!row) throw notFound("Coupon");
  await audit({ action: isActive ? "commercial.coupon_activated" : "commercial.coupon_deactivated", entityType: "coupon", entityId: couponId, actorUserId: ctx.user.id, actorType: "staff", metadata: { code: row.code } });
}

export type CouponValidation = { ok: true; coupon: CouponRow } | { ok: false; reason: string };

/** Can this coupon be applied to a new invoice in `currency` (optionally for `planId`, by an organisation / person)? */
export async function validateCoupon(
  input: { code: string; currency: string; planId?: string | null; organizationId?: string | null; userId?: string | null; at?: Date },
  tx: DbOrTx = db,
): Promise<CouponValidation> {
  const code = input.code.trim().toUpperCase();
  const at = input.at ?? new Date();
  const [coupon] = await tx.select().from(coupons).where(eq(coupons.code, code)).limit(1);
  if (!coupon || !coupon.isActive) return { ok: false, reason: "This coupon code is not valid." };
  if (coupon.validFrom && coupon.validFrom.getTime() > at.getTime()) return { ok: false, reason: "This coupon is not valid yet." };
  if (coupon.validUntil && coupon.validUntil.getTime() <= at.getTime()) return { ok: false, reason: "This coupon has expired." };
  if (coupon.planIds.length) {
    if (!input.planId || !coupon.planIds.includes(input.planId)) return { ok: false, reason: "This coupon does not apply to the selected plan." };
  }
  if (coupon.discountType === "fixed" && coupon.currency !== input.currency) {
    return { ok: false, reason: `This coupon can only be used for payments in ${coupon.currency}.` };
  }
  if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) return { ok: false, reason: "This coupon has reached its redemption limit." };
  if (coupon.maxRedemptionsPerOrganization !== null && (input.organizationId || input.userId)) {
    const [used] = await tx
      .select({ value: count() })
      .from(couponRedemptions)
      .where(
        and(
          eq(couponRedemptions.couponId, coupon.id),
          isNull(couponRedemptions.reversedAt),
          input.organizationId ? eq(couponRedemptions.organizationId, input.organizationId) : eq(couponRedemptions.userId, input.userId!),
        ),
      );
    if ((used?.value ?? 0) >= coupon.maxRedemptionsPerOrganization) return { ok: false, reason: "Your organisation has already used this coupon." };
  }
  return { ok: true, coupon };
}

export function toCouponDiscount(coupon: Pick<CouponRow, "discountType" | "percentOff" | "amountOffMinor">): CouponDiscount {
  return { discountType: coupon.discountType, percentOff: coupon.percentOff, amountOffMinor: coupon.amountOffMinor };
}

/**
 * Record a redemption for an invoice (inside the invoice transaction). Increments `redeemedCount` atomically
 * unless this is a repeat cycle of the same subscription.
 */
export async function redeemCoupon(
  tx: DbOrTx,
  input: { couponId: string; invoiceId: string; currency: string; discountMinor: number; organizationId: string | null; userId: string | null; subscriptionId: string | null; redeemedByUserId: string | null },
): Promise<void> {
  const repeatCycle = input.subscriptionId
    ? (
        await tx
          .select({ id: couponRedemptions.id })
          .from(couponRedemptions)
          .where(and(eq(couponRedemptions.couponId, input.couponId), eq(couponRedemptions.subscriptionId, input.subscriptionId), isNull(couponRedemptions.reversedAt)))
          .limit(1)
      ).length > 0
    : false;
  if (!repeatCycle) {
    const bumped = await tx
      .update(coupons)
      .set({ redeemedCount: sql`${coupons.redeemedCount} + 1` })
      .where(and(eq(coupons.id, input.couponId), sql`(${coupons.maxRedemptions} is null or ${coupons.redeemedCount} < ${coupons.maxRedemptions})`))
      .returning({ id: coupons.id });
    if (!bumped.length) throw new ActionError("This coupon has reached its redemption limit.", { code: "coupons_redemptions_chk" });
  }
  await tx.insert(couponRedemptions).values({
    couponId: input.couponId,
    invoiceId: input.invoiceId,
    currency: input.currency,
    discountMinor: input.discountMinor,
    organizationId: input.organizationId,
    userId: input.userId,
    subscriptionId: input.subscriptionId,
    redeemedByUserId: input.redeemedByUserId,
  });
}

/** Reverse the redemption of an invoice (invoice voided / draft deleted). */
export async function reverseRedemptionForInvoice(tx: DbOrTx, invoiceId: string): Promise<void> {
  const rows = await tx
    .update(couponRedemptions)
    .set({ reversedAt: new Date() })
    .where(and(eq(couponRedemptions.invoiceId, invoiceId), isNull(couponRedemptions.reversedAt)))
    .returning({ couponId: couponRedemptions.couponId, subscriptionId: couponRedemptions.subscriptionId });
  for (const row of rows) {
    if (row.subscriptionId) {
      const [stillUsed] = await tx
        .select({ id: couponRedemptions.id })
        .from(couponRedemptions)
        .where(and(eq(couponRedemptions.couponId, row.couponId), eq(couponRedemptions.subscriptionId, row.subscriptionId), isNull(couponRedemptions.reversedAt)))
        .limit(1);
      if (stillUsed) continue;
    }
    await tx
      .update(coupons)
      .set({ redeemedCount: sql`greatest(${coupons.redeemedCount} - 1, 0)` })
      .where(eq(coupons.id, row.couponId));
  }
}

/** The active (non-reversed) coupon applied to an invoice, if any. */
export async function couponForInvoice(tx: DbOrTx, invoiceId: string): Promise<CouponRow | null> {
  const [row] = await tx
    .select({ coupon: coupons })
    .from(couponRedemptions)
    .innerJoin(coupons, eq(coupons.id, couponRedemptions.couponId))
    .where(and(eq(couponRedemptions.invoiceId, invoiceId), isNull(couponRedemptions.reversedAt)))
    .limit(1);
  return row?.coupon ?? null;
}

/**
 * Coupon that still applies to the next invoice of a subscription (repeating / forever coupons), or null.
 * Applies even if the coupon was deactivated later (that only stops new redemptions).
 */
export async function couponForRenewal(tx: DbOrTx, subscriptionId: string): Promise<CouponRow | null> {
  const redemptions = await tx
    .select({ coupon: coupons, redeemedAt: couponRedemptions.redeemedAt })
    .from(couponRedemptions)
    .innerJoin(coupons, eq(coupons.id, couponRedemptions.couponId))
    .where(and(eq(couponRedemptions.subscriptionId, subscriptionId), isNull(couponRedemptions.reversedAt)))
    .orderBy(desc(couponRedemptions.redeemedAt));
  const latest = redemptions[0];
  if (!latest) return null;
  const coupon = latest.coupon;
  if (coupon.duration === "forever") return coupon;
  if (coupon.duration === "repeating") {
    const cycles = redemptions.filter((r) => r.coupon.id === coupon.id).length;
    return cycles < (coupon.durationCycles ?? 1) ? coupon : null;
  }
  return null;
}
