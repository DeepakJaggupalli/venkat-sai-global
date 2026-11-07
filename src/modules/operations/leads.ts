import "server-only";

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { internalNotes, leads, organizations } from "@/db/schema";
import type { LeadAttribution, LeadSource, LeadStatus, LeadType } from "@/db/schema/operations";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { toMinorUnits } from "@/lib/format";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";
import { notify } from "@/modules/notifications";

import { canTransition, LEAD_STATUS_LABELS, LEAD_TRANSITIONS, OPEN_LEAD_STATUSES } from "./constants";
import { assertAssignableStaff, assertStaff, rethrowConstraint } from "./internal";
import { staffLeadHref } from "./links";
import type { LeadCreateInput, LeadUpdateInput } from "./schemas";

/**
 * Leads (CRM pipeline) — Command Centre only: reads need leads.view, writes leads.manage.
 * Public forms create / attach leads through findOrCreateInboundLead() inside their own transaction.
 */

export type LeadRow = typeof leads.$inferSelect;

const LEAD_ORG_TYPE: Partial<Record<LeadType, (typeof organizations.$inferSelect)["type"]>> = {
  employer: "employer",
  partner: "recruitment_partner",
  institution: "institution",
};

async function loadLeadForUpdate(tx: DbOrTx, id: string): Promise<LeadRow> {
  const [row] = await tx.select().from(leads).where(eq(leads.id, id)).for("update").limit(1);
  if (!row) throw new ActionError("Lead not found.");
  return row;
}

/**
 * Attach an inbound enquiry / requirement to the open lead of the same type with the same email or phone,
 * or create a new lead (code LEAD). Only fills empty fields of an existing lead. Runs in the caller's tx.
 */
export async function findOrCreateInboundLead(
  input: {
    type: LeadType;
    source: LeadSource;
    name: string;
    email?: string | null;
    phone?: string | null;
    organizationName?: string | null;
    countryCode?: string | null;
    interest?: string | null;
    sourceDetail?: string | null;
    consentToContact: boolean;
    utm?: LeadAttribution;
  },
  tx: DbOrTx,
): Promise<{ id: string; code: string; created: boolean }> {
  const contact = [input.email ? eq(leads.email, input.email) : null, input.phone ? eq(leads.phone, input.phone) : null].filter((c) => c !== null);
  if (contact.length) {
    const [existing] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.type, input.type), inArray(leads.status, [...OPEN_LEAD_STATUSES]), or(...contact)))
      .orderBy(desc(leads.createdAt))
      .limit(1);
    if (existing) {
      await tx
        .update(leads)
        .set({
          organizationName: existing.organizationName ?? input.organizationName ?? null,
          email: existing.email ?? input.email ?? null,
          phone: existing.phone ?? input.phone ?? null,
          countryCode: existing.countryCode ?? input.countryCode ?? null,
          interest: existing.interest ?? input.interest ?? null,
          consentToContact: existing.consentToContact || input.consentToContact,
        })
        .where(eq(leads.id, existing.id));
      return { id: existing.id, code: existing.code, created: false };
    }
  }
  const code = await nextCode("LEAD", { tx });
  const [row] = await tx
    .insert(leads)
    .values({
      code,
      type: input.type,
      source: input.source,
      sourceDetail: input.sourceDetail ?? null,
      name: input.name,
      organizationName: input.organizationName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      countryCode: input.countryCode ?? null,
      interest: input.interest ?? null,
      consentToContact: input.consentToContact,
      utm: input.utm ?? {},
    })
    .returning({ id: leads.id, code: leads.code });
  await audit({ action: "lead.created", entityType: "lead", entityId: row!.id, metadata: { code, type: input.type, source: input.source, inbound: true }, tx });
  return { id: row!.id, code: row!.code, created: true };
}

function moneyFields(input: { estimatedValue?: number; estimatedValueCurrency?: string }) {
  if (input.estimatedValue === undefined || !input.estimatedValueCurrency) return { estimatedValueMinor: null, estimatedValueCurrency: null };
  return { estimatedValueMinor: toMinorUnits(input.estimatedValue, input.estimatedValueCurrency), estimatedValueCurrency: input.estimatedValueCurrency };
}

const LEAD_CONSTRAINTS = { leads_estimated_value_chk: "Enter both an estimated value and its currency." };

/** Create a lead entered by staff (calls, events, referrals, imports). */
export async function createLead(ctx: StaffContext, input: LeadCreateInput): Promise<{ id: string; code: string }> {
  assertStaff(ctx, "leads.manage");
  try {
    return await db.transaction(async (tx) => {
      const code = await nextCode("LEAD", { tx });
      const [row] = await tx
        .insert(leads)
        .values({
          code,
          type: input.type,
          source: input.source,
          sourceDetail: input.sourceDetail ?? null,
          name: input.name,
          designation: input.designation ?? null,
          organizationName: input.organizationName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          countryCode: input.countryCode ?? null,
          city: input.city ?? null,
          interest: input.interest ?? null,
          notes: input.notes ?? null,
          ...moneyFields(input),
          consentToContact: input.consentToContact,
          nextFollowUpAt: input.nextFollowUpAt ?? null,
          createdByUserId: ctx.user.id,
        })
        .returning({ id: leads.id, code: leads.code });
      await audit({ action: "lead.created", entityType: "lead", entityId: row!.id, metadata: { code, type: input.type, source: input.source }, actorUserId: ctx.user.id, actorType: "staff", tx });
      return row!;
    });
  } catch (error) {
    rethrowConstraint(error, LEAD_CONSTRAINTS);
  }
}

/** Edit lead details (only the fields present in `input`). */
export async function updateLead(ctx: StaffContext, input: LeadUpdateInput): Promise<void> {
  assertStaff(ctx, "leads.manage");
  const patch: Partial<typeof leads.$inferInsert> = {};
  const keys = ["type", "source", "sourceDetail", "name", "designation", "organizationName", "email", "phone", "countryCode", "city", "interest", "notes", "consentToContact", "nextFollowUpAt"] as const;
  for (const k of keys) {
    if (input[k] !== undefined) (patch as Record<string, unknown>)[k] = input[k];
  }
  if (input.estimatedValue !== undefined || input.estimatedValueCurrency !== undefined) Object.assign(patch, moneyFields(input));
  if (!Object.keys(patch).length) return;
  try {
    await db.transaction(async (tx) => {
      await loadLeadForUpdate(tx, input.id);
      await tx.update(leads).set(patch).where(eq(leads.id, input.id));
      await audit({ action: "lead.updated", entityType: "lead", entityId: input.id, metadata: { fields: Object.keys(patch) }, actorUserId: ctx.user.id, actorType: "staff", tx });
    });
  } catch (error) {
    rethrowConstraint(error, LEAD_CONSTRAINTS);
  }
}

/** Assign (or unassign) a lead to a staff member with leads.view; the assignee is notified. */
export async function assignLead(ctx: StaffContext, id: string, assigneeUserId: string | null): Promise<void> {
  assertStaff(ctx, "leads.manage");
  const assignee = assigneeUserId ? await assertAssignableStaff(assigneeUserId, "leads.view") : null;
  await db.transaction(async (tx) => {
    const lead = await loadLeadForUpdate(tx, id);
    if (lead.assignedToUserId === (assignee?.id ?? null)) return;
    await tx.update(leads).set({ assignedToUserId: assignee?.id ?? null }).where(eq(leads.id, id));
    await audit({ action: "lead.assigned", entityType: "lead", entityId: id, metadata: { from: lead.assignedToUserId, to: assignee?.id ?? null }, actorUserId: ctx.user.id, actorType: "staff", tx });
    if (assignee && assignee.id !== ctx.user.id) {
      await notify(
        {
          event: "work.assigned",
          recipients: [{ userId: assignee.id }],
          data: { kindLabel: "lead", title: lead.organizationName ? `${lead.name} (${lead.organizationName})` : lead.name, code: lead.code, assignedBy: ctx.user.displayName },
          link: staffLeadHref(id),
        },
        { tx },
      );
    }
  });
}

/** Move a lead through the pipeline (LEAD_TRANSITIONS); "lost" needs a reason. */
export async function changeLeadStatus(ctx: StaffContext, id: string, status: LeadStatus, opts: { lostReason?: string | null } = {}): Promise<void> {
  assertStaff(ctx, "leads.manage");
  await db.transaction(async (tx) => {
    const lead = await loadLeadForUpdate(tx, id);
    if (!canTransition(LEAD_TRANSITIONS, lead.status, status)) {
      throw new ActionError(`A lead cannot move from ${LEAD_STATUS_LABELS[lead.status]} to ${LEAD_STATUS_LABELS[status]}.`);
    }
    if (status === "lost" && !opts.lostReason?.trim()) {
      throw new ActionError("Say why the lead was lost.", { fieldErrors: { lostReason: ["A reason is required"] } });
    }
    const closing = status === "won" || status === "lost";
    await tx
      .update(leads)
      .set({
        status,
        lostReason: status === "lost" ? opts.lostReason!.trim() : null,
        ...(closing ? { nextFollowUpAt: null } : {}),
      })
      .where(eq(leads.id, id));
    await audit({ action: "lead.status_changed", entityType: "lead", entityId: id, metadata: { from: lead.status, to: status, lostReason: opts.lostReason ?? null }, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

/**
 * Record a contact with the prospect: stamps lastContactedAt, sets (or clears with null) the next follow-up,
 * moves a new lead to "contacted" and keeps the note as a staff-only internal note.
 */
export async function recordLeadFollowUp(
  ctx: StaffContext,
  id: string,
  input: { note?: string | null; contactedAt?: Date | null; nextFollowUpAt?: Date | null },
): Promise<void> {
  assertStaff(ctx, "leads.manage");
  const contactedAt = input.contactedAt ?? new Date();
  if (contactedAt.getTime() > Date.now() + 5 * 60_000) throw new ActionError("The contact time cannot be in the future.", { fieldErrors: { contactedAt: ["Choose a past time"] } });
  await db.transaction(async (tx) => {
    const lead = await loadLeadForUpdate(tx, id);
    await tx
      .update(leads)
      .set({
        lastContactedAt: contactedAt,
        ...(input.nextFollowUpAt !== undefined ? { nextFollowUpAt: input.nextFollowUpAt } : {}),
        ...(lead.status === "new" ? { status: "contacted" as const } : {}),
      })
      .where(eq(leads.id, id));
    if (input.note?.trim()) {
      await tx.insert(internalNotes).values({ entityType: "lead", entityId: id, authorUserId: ctx.user.id, body: input.note.trim(), visibility: "staff" });
    }
    await audit({
      action: "lead.follow_up_recorded",
      entityType: "lead",
      entityId: id,
      metadata: { contactedAt: contactedAt.toISOString(), nextFollowUpAt: input.nextFollowUpAt?.toISOString() ?? null, statusFrom: lead.status },
      actorUserId: ctx.user.id,
      actorType: "staff",
      tx,
    });
  });
}

/** Link a lead to the organisation it became (type must match) and mark it won. */
export async function convertLead(ctx: StaffContext, id: string, organizationId: string): Promise<void> {
  assertStaff(ctx, ["leads.manage", "orgs.view"]);
  await db.transaction(async (tx) => {
    const lead = await loadLeadForUpdate(tx, id);
    const expectedType = LEAD_ORG_TYPE[lead.type];
    if (!expectedType) throw new ActionError("Only employer, partner and institution leads can be linked to an organisation.");
    const [org] = await tx
      .select({ id: organizations.id, type: organizations.type, name: organizations.name })
      .from(organizations)
      .where(and(eq(organizations.id, organizationId), isNull(organizations.deletedAt)))
      .limit(1);
    if (!org) throw new ActionError("Organisation not found.", { fieldErrors: { organizationId: ["Choose an organisation"] } });
    if (org.type !== expectedType) throw new ActionError("This organisation is a different kind of organisation from the lead.", { fieldErrors: { organizationId: ["Type does not match the lead"] } });
    await tx
      .update(leads)
      .set({ organizationId: org.id, convertedAt: lead.convertedAt ?? new Date(), status: "won", lostReason: null, nextFollowUpAt: null })
      .where(eq(leads.id, id));
    await audit({ action: "lead.converted", entityType: "lead", entityId: id, organizationId: org.id, metadata: { organizationName: org.name, from: lead.status }, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

/** Leads with a follow-up due before `before` that have not had a reminder for that time (reminder task). */
export async function leadsWithDueFollowUps(before: Date, tx: DbOrTx = db): Promise<Pick<LeadRow, "id" | "code" | "name" | "organizationName" | "assignedToUserId" | "nextFollowUpAt">[]> {
  return tx
    .select({ id: leads.id, code: leads.code, name: leads.name, organizationName: leads.organizationName, assignedToUserId: leads.assignedToUserId, nextFollowUpAt: leads.nextFollowUpAt })
    .from(leads)
    .where(and(inArray(leads.status, [...OPEN_LEAD_STATUSES]), sql`${leads.nextFollowUpAt} is not null and ${leads.nextFollowUpAt} <= ${before}`))
    .limit(500);
}
