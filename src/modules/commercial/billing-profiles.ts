import "server-only";

import { eq } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { billingProfiles, countries, currencies } from "@/db/schema";
import type { InvoicePartySnapshot } from "@/db/schema/commercial";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";

import { authorizeOrgBilling, isOrgActor, type BillingActor } from "./access";
import { rethrowConstraint } from "./errors";
import type { BillingProfileFormInput } from "./schemas";

/**
 * Organisation billing details (1:1 with organisations): legal name, address, GST state code (place of supply),
 * GSTIN / VAT number, tax exemption and preferred currency. Copied into invoices at issue (buyer snapshot), so
 * edits never change issued invoices. Members with the billing-manage permission edit their own organisation;
 * staff need commercial.invoices.
 */

export type BillingProfileRow = typeof billingProfiles.$inferSelect;

export async function getBillingProfile(organizationId: string, tx: DbOrTx = db): Promise<BillingProfileRow | null> {
  const [row] = await tx.select().from(billingProfiles).where(eq(billingProfiles.organizationId, organizationId)).limit(1);
  return row ?? null;
}

export async function upsertBillingProfile(actor: BillingActor, input: BillingProfileFormInput): Promise<BillingProfileRow> {
  const organizationId = isOrgActor(actor) ? actor.organization.id : input.organizationId;
  if (!organizationId) throw new ActionError("Choose the organisation.", { fieldErrors: { organizationId: ["Required"] } });
  try {
    return await db.transaction(async (tx) => {
      await authorizeOrgBilling(actor, organizationId, { level: "manage", staffPermission: "commercial.invoices" }, tx);
      const [country] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, input.countryCode)).limit(1);
      if (!country) throw new ActionError("Choose a country.", { fieldErrors: { countryCode: ["Unknown country"] } });
      const [currency] = await tx.select({ code: currencies.code, isActive: currencies.isActive }).from(currencies).where(eq(currencies.code, input.currency)).limit(1);
      if (!currency?.isActive) throw new ActionError("Choose an active currency.", { fieldErrors: { currency: ["Unknown or inactive currency"] } });
      const isIndia = input.countryCode === "IN";
      const taxId = input.taxId?.trim() || null;
      const values = {
        legalName: input.legalName,
        contactName: input.contactName ?? null,
        billingEmail: input.billingEmail,
        billingPhone: input.billingPhone ?? null,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        city: input.city,
        stateRegion: input.stateRegion ?? null,
        stateCode: input.stateCode?.trim() || null,
        postalCode: input.postalCode ?? null,
        countryCode: input.countryCode,
        taxIdType: taxId ? (isIndia ? ("gstin" as const) : (input.taxIdType ?? "other")) : null,
        taxId,
        taxExempt: input.taxExempt,
        taxExemptReason: input.taxExempt ? (input.taxExemptReason ?? null) : null,
        currency: input.currency,
      };
      const before = await getBillingProfile(organizationId, tx);
      const [row] = await tx
        .insert(billingProfiles)
        .values({ organizationId, ...values })
        .onConflictDoUpdate({ target: billingProfiles.organizationId, set: { ...values, updatedAt: new Date() } })
        .returning();
      await audit({
        action: before ? "commercial.billing_profile_updated" : "commercial.billing_profile_created",
        entityType: "organization",
        entityId: organizationId,
        organizationId,
        actorUserId: actor.user.id,
        actorType: isOrgActor(actor) ? "user" : "staff",
        // Tax identity changes matter for invoices; contact details are not copied into the audit trail.
        metadata: { countryCode: values.countryCode, stateCode: values.stateCode, taxIdType: values.taxIdType, taxIdChanged: before?.taxId !== values.taxId, taxExempt: values.taxExempt, currency: values.currency },
        tx,
      });
      return row!;
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Buyer snapshot frozen on an invoice at issue. */
export function buyerSnapshotFromProfile(profile: BillingProfileRow): InvoicePartySnapshot {
  return {
    legalName: profile.legalName,
    contactName: profile.contactName,
    email: profile.billingEmail,
    phone: profile.billingPhone,
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2,
    city: profile.city,
    stateRegion: profile.stateRegion,
    stateCode: profile.stateCode,
    postalCode: profile.postalCode,
    countryCode: profile.countryCode,
    taxIdType: profile.taxIdType,
    taxId: profile.taxId,
  };
}
