import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import {
  currencies,
  organizations,
  partnerAgreements,
  partnerAssignments,
  partnerSettlementLines,
  partnerSettlements,
  partnerSubmissions,
  placements,
  type PartnerSettlementLineKind,
} from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { formatMoney } from "@/lib/format";
import { audit } from "@/modules/audit";
import { submitForApproval } from "@/modules/approvals/service";
import type { ApprovalDecision } from "@/modules/approvals/types";
import { requireUploadedFile } from "@/modules/files";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import { notifyOrganization, notifyStaff } from "@/modules/notifications";

import { assertStaff } from "./access";
import { ADMIN_COMMERCIAL_PATHS, PARTNER_SETTLEMENTS_PATH } from "./constants";
import { forbidden, invalidState, notFound, rethrowConstraint } from "./errors";
import { minorUnitsFor, parseDecimalToMinor } from "./money";
import { computePlacementFee, resolveFeeTerms, settlementTotal, type PlacementForFee } from "./settlement-rules";

/**
 * Recruitment-partner settlements (staff: partners.settlements; partners: partner.settlements.view, own only).
 *
 *   compute (placements with partner attribution × commission terms) → draft (staff adds bonus / adjustment /
 *   deduction lines, tax deducted at source) → submit → approval "partner_settlement" → approved → paid (bank
 *   reference). Rejected → cancelled (placements freed); changes requested → draft. Partners may dispute an
 *   approved or paid settlement and attach their own invoice. One settlement per partner, period and currency;
 *   a placement fee is settled once (partner_settlement_lines_placement_fee_uq).
 */

export type SettlementRow = typeof partnerSettlements.$inferSelect;
export type SettlementLineRow = typeof partnerSettlementLines.$inferSelect;

export type ComputeResult = {
  settlements: { id: string; code: string; currency: string; amountMinor: number; linesAdded: number }[];
  skipped: { placementId: string; placementCode: string; reason: string }[];
};

async function lockSettlement(tx: DbOrTx, settlementId: string): Promise<SettlementRow> {
  const [row] = await tx.select().from(partnerSettlements).where(eq(partnerSettlements.id, settlementId)).limit(1).for("update");
  if (!row) throw notFound("Settlement");
  return row;
}

async function recomputeTotal(tx: DbOrTx, settlementId: string): Promise<number> {
  const lines = await tx.select({ kind: partnerSettlementLines.kind, amountMinor: partnerSettlementLines.amountMinor, voidedAt: partnerSettlementLines.voidedAt }).from(partnerSettlementLines).where(eq(partnerSettlementLines.settlementId, settlementId));
  const total = settlementTotal(lines);
  if (total < 0) throw new ActionError("Deductions cannot exceed the fees in a settlement.", { code: "partner_settlements_amounts_chk" });
  const [current] = await tx.select({ withholding: partnerSettlements.withholdingTaxMinor }).from(partnerSettlements).where(eq(partnerSettlements.id, settlementId)).limit(1);
  if ((current?.withholding ?? 0) > total) throw new ActionError("The tax deducted at source is more than the settlement amount. Lower it first.");
  await tx.update(partnerSettlements).set({ amountMinor: total }).where(eq(partnerSettlements.id, settlementId));
  return total;
}

/** The agreement in force on a date (accepted, effective window covering it), else the active one. */
async function agreementTermsOn(tx: DbOrTx, partnerOrganizationId: string, onDate: string) {
  const rows = await tx
    .select({ commercialTerms: partnerAgreements.commercialTerms, status: partnerAgreements.status, effectiveFrom: partnerAgreements.effectiveFrom, effectiveUntil: partnerAgreements.effectiveUntil })
    .from(partnerAgreements)
    .where(and(eq(partnerAgreements.organizationId, partnerOrganizationId), isNotNull(partnerAgreements.acceptedAt)))
    .orderBy(desc(partnerAgreements.acceptedAt));
  const covering = rows.find((r) => (!r.effectiveFrom || r.effectiveFrom <= onDate) && (!r.effectiveUntil || r.effectiveUntil >= onDate));
  return (covering ?? rows.find((r) => r.status === "active"))?.commercialTerms ?? null;
}

/**
 * Compute settlement drafts for a partner and period: every attributed placement whose fee is payable by
 * `periodEnd` and not yet settled (earlier unsettled fees are caught up). One draft per currency; an existing
 * draft for the same period and currency is topped up. Skipped placements are returned with the reason.
 */
export async function computeSettlementDrafts(ctx: StaffContext, input: { partnerOrganizationId: string; periodStart: string; periodEnd: string }): Promise<ComputeResult> {
  assertStaff(ctx, "partners.settlements");
  if (input.periodEnd < input.periodStart) throw new ActionError("The period end must be on or after the start.", { fieldErrors: { periodEnd: ["Before the start"] } });
  try {
    return await db.transaction(async (tx) => {
      const [partner] = await tx.select({ id: organizations.id, type: organizations.type }).from(organizations).where(eq(organizations.id, input.partnerOrganizationId)).limit(1);
      if (!partner || partner.type !== "recruitment_partner") throw notFound("Recruitment partner");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`settlement:${partner.id}`}, 0))`);
      const settled = tx
        .select({ placementId: partnerSettlementLines.placementId })
        .from(partnerSettlementLines)
        .where(and(eq(partnerSettlementLines.kind, "placement_fee"), isNull(partnerSettlementLines.voidedAt), isNotNull(partnerSettlementLines.placementId)));
      const candidates = await tx
        .select({
          id: placements.id,
          code: placements.code,
          status: placements.status,
          placedOn: placements.placedOn,
          joinedOn: placements.joinedOn,
          salaryMinor: placements.salaryMinor,
          salaryCurrency: placements.salaryCurrency,
          salaryPeriod: placements.salaryPeriod,
          feeMinor: placements.feeMinor,
          feeCurrency: placements.feeCurrency,
          applicationId: placements.applicationId,
        })
        .from(placements)
        .where(
          and(
            eq(placements.partnerOrganizationId, partner.id),
            notInArray(placements.status, ["cancelled"]),
            lte(placements.placedOn, input.periodEnd),
            sql`${placements.id} not in (${settled})`,
          ),
        );
      const skipped: ComputeResult["skipped"] = [];
      const byCurrency = new Map<string, { placement: PlacementForFee; amountMinor: number; description: string }[]>();
      for (const placement of candidates) {
        const [submission] = await tx
          .select({ terms: partnerAssignments.commissionTerms })
          .from(partnerSubmissions)
          .innerJoin(partnerAssignments, eq(partnerAssignments.id, partnerSubmissions.assignmentId))
          .where(and(eq(partnerSubmissions.applicationId, placement.applicationId), eq(partnerSubmissions.partnerOrganizationId, partner.id)))
          .limit(1);
        const agreement = await agreementTermsOn(tx, partner.id, placement.joinedOn ?? placement.placedOn);
        const decision = computePlacementFee(placement, resolveFeeTerms(submission?.terms ?? null, agreement), input.periodEnd);
        if (!decision.ok) {
          skipped.push({ placementId: placement.id, placementCode: placement.code, reason: decision.reason });
          continue;
        }
        const list = byCurrency.get(decision.currency) ?? [];
        list.push({ placement, amountMinor: decision.amountMinor, description: decision.description });
        byCurrency.set(decision.currency, list);
      }

      const created: ComputeResult["settlements"] = [];
      for (const [currency, items] of byCurrency) {
        const [cur] = await tx.select({ code: currencies.code }).from(currencies).where(eq(currencies.code, currency)).limit(1);
        if (!cur) {
          for (const item of items) skipped.push({ placementId: item.placement.id, placementCode: item.placement.code, reason: `Unknown currency ${currency} in the terms.` });
          continue;
        }
        let [settlement] = await tx
          .select()
          .from(partnerSettlements)
          .where(and(eq(partnerSettlements.partnerOrganizationId, partner.id), eq(partnerSettlements.periodStart, input.periodStart), eq(partnerSettlements.periodEnd, input.periodEnd), eq(partnerSettlements.currency, currency), ne(partnerSettlements.status, "cancelled")))
          .limit(1);
        if (settlement && settlement.status !== "draft") {
          for (const item of items) skipped.push({ placementId: item.placement.id, placementCode: item.placement.code, reason: `The ${currency} settlement ${settlement.code} for this period is already ${settlement.status.replace("_", " ")}.` });
          continue;
        }
        if (!settlement) {
          const code = await nextCode("STL", { tx });
          [settlement] = await tx.insert(partnerSettlements).values({ currency, code, partnerOrganizationId: partner.id, periodStart: input.periodStart, periodEnd: input.periodEnd, createdByUserId: ctx.user.id }).returning();
        }
        await tx.insert(partnerSettlementLines).values(items.map((item) => ({ currency, settlementId: settlement!.id, kind: "placement_fee" as const, placementId: item.placement.id, description: item.description, amountMinor: item.amountMinor })));
        const amountMinor = await recomputeTotal(tx, settlement!.id);
        created.push({ id: settlement!.id, code: settlement!.code, currency, amountMinor, linesAdded: items.length });
      }
      await audit({
        action: "commercial.settlement_computed",
        entityType: "organization",
        entityId: partner.id,
        organizationId: partner.id,
        actorUserId: ctx.user.id,
        actorType: "staff",
        metadata: { periodStart: input.periodStart, periodEnd: input.periodEnd, settlements: created.map((c) => ({ id: c.id, currency: c.currency, amountMinor: c.amountMinor, lines: c.linesAdded })), skipped: skipped.length },
        tx,
      });
      return { settlements: created, skipped };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

async function parseSettlementAmount(tx: DbOrTx, currency: string, value: string, field: string): Promise<number> {
  const [cur] = await tx.select({ minorUnits: currencies.minorUnits }).from(currencies).where(eq(currencies.code, currency)).limit(1);
  const parsed = parseDecimalToMinor(value, minorUnitsFor(currency, cur?.minorUnits));
  if (!parsed.ok || parsed.minor < 0) throw new ActionError(parsed.ok ? "The amount cannot be negative." : parsed.error, { fieldErrors: { [field]: ["Invalid amount"] } });
  return parsed.minor;
}

/** Add a manual line (bonus / adjustment / deduction) to a draft settlement. */
export async function addSettlementLine(ctx: StaffContext, input: { settlementId: string; kind: PartnerSettlementLineKind; description: string; amount: string }): Promise<SettlementLineRow> {
  assertStaff(ctx, "partners.settlements");
  if (input.kind === "placement_fee") throw new ActionError("Placement fees are added by computing the settlement.");
  return db.transaction(async (tx) => {
    const settlement = await lockSettlement(tx, input.settlementId);
    if (settlement.status !== "draft") throw invalidState("Only draft settlements can be changed.");
    const amountMinor = await parseSettlementAmount(tx, settlement.currency, input.amount, "amount");
    if (amountMinor <= 0) throw new ActionError("The amount must be more than zero.", { fieldErrors: { amount: ["Must be positive"] } });
    const [line] = await tx.insert(partnerSettlementLines).values({ currency: settlement.currency, settlementId: settlement.id, kind: input.kind, description: input.description, amountMinor }).returning();
    await recomputeTotal(tx, settlement.id);
    await audit({ action: "commercial.settlement_line_added", entityType: "partner_settlement", entityId: settlement.id, organizationId: settlement.partnerOrganizationId, actorUserId: ctx.user.id, actorType: "staff", metadata: { kind: input.kind, amountMinor }, tx });
    return line!;
  });
}

/** Remove a line from a draft (a removed placement fee can be settled later). */
export async function removeSettlementLine(ctx: StaffContext, lineId: string): Promise<void> {
  assertStaff(ctx, "partners.settlements");
  await db.transaction(async (tx) => {
    const [line] = await tx.select().from(partnerSettlementLines).where(eq(partnerSettlementLines.id, lineId)).limit(1);
    if (!line) throw notFound("Settlement line");
    const settlement = await lockSettlement(tx, line.settlementId);
    if (settlement.status !== "draft") throw invalidState("Only draft settlements can be changed.");
    await tx.delete(partnerSettlementLines).where(eq(partnerSettlementLines.id, lineId));
    await recomputeTotal(tx, settlement.id);
    await audit({ action: "commercial.settlement_line_removed", entityType: "partner_settlement", entityId: settlement.id, organizationId: settlement.partnerOrganizationId, actorUserId: ctx.user.id, actorType: "staff", metadata: { kind: line.kind, placementId: line.placementId, amountMinor: line.amountMinor }, tx });
  });
}

export async function updateSettlementDraft(ctx: StaffContext, input: { settlementId: string; withholdingTax?: string; notes?: string; internalNotes?: string }): Promise<SettlementRow> {
  assertStaff(ctx, "partners.settlements");
  return db.transaction(async (tx) => {
    const settlement = await lockSettlement(tx, input.settlementId);
    if (settlement.status !== "draft") throw invalidState("Only draft settlements can be changed.");
    const withholdingTaxMinor = input.withholdingTax !== undefined ? await parseSettlementAmount(tx, settlement.currency, input.withholdingTax, "withholdingTax") : settlement.withholdingTaxMinor;
    if (withholdingTaxMinor > settlement.amountMinor) throw new ActionError("The tax deducted cannot be more than the settlement amount.", { fieldErrors: { withholdingTax: ["Too large"] } });
    const [row] = await tx
      .update(partnerSettlements)
      .set({ withholdingTaxMinor, notes: input.notes ?? settlement.notes, internalNotes: input.internalNotes ?? settlement.internalNotes })
      .where(eq(partnerSettlements.id, settlement.id))
      .returning();
    await audit({ action: "commercial.settlement_updated", entityType: "partner_settlement", entityId: settlement.id, organizationId: settlement.partnerOrganizationId, actorUserId: ctx.user.id, actorType: "staff", metadata: { withholdingTaxMinor }, tx });
    return row!;
  });
}

/** Submit a draft for approval (approval type partner_settlement). */
export async function submitSettlement(ctx: StaffContext, settlementId: string): Promise<SettlementRow> {
  assertStaff(ctx, "partners.settlements");
  return db.transaction(async (tx) => {
    const settlement = await lockSettlement(tx, settlementId);
    if (settlement.status !== "draft") throw invalidState("Only draft settlements can be submitted.");
    const amount = await recomputeTotal(tx, settlement.id);
    if (amount <= 0) throw invalidState("The settlement has nothing to pay.");
    const [partner] = await tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, settlement.partnerOrganizationId)).limit(1);
    const approval = await submitForApproval(
      {
        type: "partner_settlement",
        entityType: "partner_settlement",
        entityId: settlement.id,
        organizationId: settlement.partnerOrganizationId,
        title: `Settlement ${settlement.code} — ${partner?.name ?? "partner"} — ${formatMoney(amount, settlement.currency)}`,
        summary: `Period ${settlement.periodStart} to ${settlement.periodEnd}. Net payable ${formatMoney(amount - settlement.withholdingTaxMinor, settlement.currency)}.`,
        payload: { code: settlement.code, amountMinor: amount, withholdingTaxMinor: settlement.withholdingTaxMinor, currency: settlement.currency, periodStart: settlement.periodStart, periodEnd: settlement.periodEnd },
        submittedByUserId: ctx.user.id,
      },
      tx,
    );
    const [row] = await tx.update(partnerSettlements).set({ status: "pending_approval", approvalRequestId: approval.id }).where(eq(partnerSettlements.id, settlement.id)).returning();
    await audit({ action: "commercial.settlement_submitted", entityType: "partner_settlement", entityId: settlement.id, organizationId: settlement.partnerOrganizationId, actorUserId: ctx.user.id, actorType: "staff", metadata: { approvalId: approval.id, amountMinor: amount }, tx });
    return row!;
  });
}

async function voidLines(tx: DbOrTx, settlementId: string): Promise<void> {
  await tx.update(partnerSettlementLines).set({ voidedAt: new Date() }).where(and(eq(partnerSettlementLines.settlementId, settlementId), isNull(partnerSettlementLines.voidedAt)));
}

async function notifyPartner(tx: DbOrTx, settlement: SettlementRow, change: string, extra: Record<string, unknown> = {}): Promise<void> {
  await notifyOrganization(
    {
      event: "partner.settlement_updated",
      organizationId: settlement.partnerOrganizationId,
      permission: "partner.settlements.view",
      data: { code: settlement.code, change, status: settlement.status, amount: formatMoney(settlement.amountMinor - settlement.withholdingTaxMinor, settlement.currency), periodStart: settlement.periodStart, periodEnd: settlement.periodEnd, ...extra },
      link: `${PARTNER_SETTLEMENTS_PATH}/${settlement.id}`,
      dedupeKey: `settlement-${change}:${settlement.id}:${settlement.updatedAt.getTime()}`,
    },
    { tx },
  );
}

/** Apply an approval decision (approval handler; inside the decision transaction). */
export async function applySettlementDecisionTx(tx: DbOrTx, settlementId: string, decision: ApprovalDecision, reason: string | null, actorUserId: string): Promise<void> {
  const settlement = await lockSettlement(tx, settlementId);
  if (settlement.status !== "pending_approval") throw invalidState("This settlement is not waiting for approval.");
  let row: SettlementRow;
  if (decision === "approved") {
    [row] = (await tx.update(partnerSettlements).set({ status: "approved", approvedByUserId: actorUserId, approvedAt: new Date() }).where(eq(partnerSettlements.id, settlement.id)).returning()) as [SettlementRow];
    await notifyPartner(tx, row, "approved");
  } else if (decision === "rejected") {
    [row] = (await tx
      .update(partnerSettlements)
      .set({ status: "cancelled", internalNotes: [settlement.internalNotes, reason ? `Rejected: ${reason}` : "Rejected"].filter(Boolean).join("\n") })
      .where(eq(partnerSettlements.id, settlement.id))
      .returning()) as [SettlementRow];
    await voidLines(tx, settlement.id);
  } else {
    [row] = (await tx.update(partnerSettlements).set({ status: "draft" }).where(eq(partnerSettlements.id, settlement.id)).returning()) as [SettlementRow];
  }
  await audit({ action: `commercial.settlement_${decision}`, entityType: "partner_settlement", entityId: settlement.id, organizationId: settlement.partnerOrganizationId, actorUserId, actorType: "staff", metadata: { reason }, tx });
}

/** Record the payout of an approved settlement with the bank reference (UTR). */
export async function markSettlementPaid(ctx: StaffContext, input: { settlementId: string; paymentReference: string; paidAt: Date }): Promise<SettlementRow> {
  assertStaff(ctx, "partners.settlements");
  return db.transaction(async (tx) => {
    const settlement = await lockSettlement(tx, input.settlementId);
    if (settlement.status !== "approved") throw invalidState("Only approved settlements can be marked as paid.");
    const [row] = await tx.update(partnerSettlements).set({ status: "paid", paidAt: input.paidAt, paymentReference: input.paymentReference.trim() }).where(eq(partnerSettlements.id, settlement.id)).returning();
    await notifyPartner(tx, row!, "paid", { paymentReference: input.paymentReference.trim() });
    await audit({ action: "commercial.settlement_paid", entityType: "partner_settlement", entityId: settlement.id, organizationId: settlement.partnerOrganizationId, actorUserId: ctx.user.id, actorType: "staff", metadata: { paymentReference: input.paymentReference.trim(), amountMinor: settlement.amountMinor, withholdingTaxMinor: settlement.withholdingTaxMinor, currency: settlement.currency }, tx });
    return row!;
  });
}

/** Cancel a draft or approved (unpaid) settlement; its placement fees can be settled again later. */
export async function cancelSettlement(ctx: StaffContext, settlementId: string, reason: string): Promise<SettlementRow> {
  assertStaff(ctx, "partners.settlements");
  if (reason.trim().length < 5) throw new ActionError("Give a reason (at least 5 characters).", { fieldErrors: { reason: ["Required"] } });
  return db.transaction(async (tx) => {
    const settlement = await lockSettlement(tx, settlementId);
    if (!["draft", "approved", "disputed"].includes(settlement.status)) throw invalidState("Paid or pending settlements cannot be cancelled here.");
    const [row] = await tx
      .update(partnerSettlements)
      .set({ status: "cancelled", internalNotes: [settlement.internalNotes, `Cancelled: ${reason.trim()}`].filter(Boolean).join("\n") })
      .where(eq(partnerSettlements.id, settlement.id))
      .returning();
    await voidLines(tx, settlement.id);
    if (settlement.status !== "draft") await notifyPartner(tx, row!, "cancelled");
    await audit({ action: "commercial.settlement_cancelled", entityType: "partner_settlement", entityId: settlement.id, organizationId: settlement.partnerOrganizationId, actorUserId: ctx.user.id, actorType: "staff", metadata: { reason: reason.trim(), from: settlement.status }, tx });
    return row!;
  });
}

function assertPartnerSettlements(ctx: OrgContext, settlement: SettlementRow): void {
  if (ctx.orgType !== "recruitment_partner" || ctx.organization.id !== settlement.partnerOrganizationId) throw notFound("Settlement");
  if (!ctx.permissions.has("partner.settlements.view")) throw forbidden();
}

/** A partner disputes an approved or paid settlement (staff are notified). */
export async function disputeSettlement(ctx: OrgContext, input: { settlementId: string; reason: string }): Promise<SettlementRow> {
  return db.transaction(async (tx) => {
    const settlement = await lockSettlement(tx, input.settlementId);
    assertPartnerSettlements(ctx, settlement);
    if (!["approved", "paid"].includes(settlement.status)) throw invalidState("Only approved or paid settlements can be disputed.");
    const [row] = await tx
      .update(partnerSettlements)
      .set({ status: "disputed", disputeReason: input.reason.trim(), internalNotes: [settlement.internalNotes, `Disputed while ${settlement.status}.`].filter(Boolean).join("\n") })
      .where(eq(partnerSettlements.id, settlement.id))
      .returning();
    await notifyStaff(
      { event: "partner.settlement_updated", permission: "partners.settlements", data: { forStaff: true, code: settlement.code, change: "disputed", reason: input.reason.trim().slice(0, 200) }, link: ADMIN_COMMERCIAL_PATHS.settlement(settlement.id), dedupeKey: `settlement-disputed:${settlement.id}:${Date.now()}` },
      { tx },
    );
    await audit({ action: "commercial.settlement_disputed", entityType: "partner_settlement", entityId: settlement.id, organizationId: settlement.partnerOrganizationId, actorUserId: ctx.user.id, actorType: "user", metadata: { from: settlement.status }, tx });
    return row!;
  });
}

/**
 * Staff resolve a partner dispute: back to `approved` (unchanged, still to pay), `paid` (it was paid — needs a
 * payout date), or `draft` to correct the lines and resubmit for approval.
 */
export async function resolveSettlementDispute(ctx: StaffContext, input: { settlementId: string; outcome: "approved" | "paid" | "draft"; note: string }): Promise<SettlementRow> {
  assertStaff(ctx, "partners.settlements");
  return db.transaction(async (tx) => {
    const settlement = await lockSettlement(tx, input.settlementId);
    if (settlement.status !== "disputed") throw invalidState("This settlement is not disputed.");
    if (input.outcome === "paid" && !settlement.paidAt) throw invalidState("This settlement has not been paid yet: mark it approved, then paid with the bank reference.");
    const [row] = await tx
      .update(partnerSettlements)
      .set({ status: input.outcome, notes: [settlement.notes, `Dispute resolved: ${input.note.trim()}`].filter(Boolean).join("\n"), ...(input.outcome === "draft" ? { approvedAt: null, approvedByUserId: null } : {}) })
      .where(eq(partnerSettlements.id, settlement.id))
      .returning();
    await notifyPartner(tx, row!, "dispute_resolved", { note: input.note.trim().slice(0, 300) });
    await audit({ action: "commercial.settlement_dispute_resolved", entityType: "partner_settlement", entityId: settlement.id, organizationId: settlement.partnerOrganizationId, actorUserId: ctx.user.id, actorType: "staff", metadata: { outcome: input.outcome }, tx });
    return row!;
  });
}

/** A partner records its own invoice for the settlement (number + optional PDF uploaded for the organisation). */
export async function submitPartnerInvoice(ctx: OrgContext, input: { settlementId: string; partnerInvoiceNumber: string; partnerInvoiceFileId?: string }): Promise<SettlementRow> {
  return db.transaction(async (tx) => {
    const settlement = await lockSettlement(tx, input.settlementId);
    assertPartnerSettlements(ctx, settlement);
    if (!["pending_approval", "approved", "disputed"].includes(settlement.status)) throw invalidState("An invoice can be added while the settlement is being approved or awaiting payment.");
    if (input.partnerInvoiceFileId) {
      await requireUploadedFile(input.partnerInvoiceFileId, { purposes: ["org_document", "invoice"], organizationId: ctx.organization.id }, tx);
    }
    const [row] = await tx
      .update(partnerSettlements)
      .set({ partnerInvoiceNumber: input.partnerInvoiceNumber.trim(), partnerInvoiceFileId: input.partnerInvoiceFileId ?? settlement.partnerInvoiceFileId })
      .where(eq(partnerSettlements.id, settlement.id))
      .returning();
    await audit({ action: "commercial.settlement_partner_invoice", entityType: "partner_settlement", entityId: settlement.id, organizationId: settlement.partnerOrganizationId, actorUserId: ctx.user.id, actorType: "user", metadata: { partnerInvoiceNumber: input.partnerInvoiceNumber.trim(), fileAttached: Boolean(input.partnerInvoiceFileId) }, tx });
    return row!;
  });
}

/** Placements of a partner already in a live settlement (for UI hints). */
export async function settledPlacementIds(partnerOrganizationId: string): Promise<string[]> {
  const rows = await db
    .select({ placementId: partnerSettlementLines.placementId })
    .from(partnerSettlementLines)
    .innerJoin(partnerSettlements, eq(partnerSettlements.id, partnerSettlementLines.settlementId))
    .where(and(eq(partnerSettlements.partnerOrganizationId, partnerOrganizationId), eq(partnerSettlementLines.kind, "placement_fee"), isNull(partnerSettlementLines.voidedAt), or(inArray(partnerSettlements.status, ["draft", "pending_approval", "approved", "paid", "disputed"]))));
  return rows.map((r) => r.placementId).filter((id): id is string => Boolean(id));
}
