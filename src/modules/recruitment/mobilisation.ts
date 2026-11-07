import "server-only";

import { and, asc, count, desc, eq, isNull, sql, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import {
  candidateProfiles,
  jobs,
  mobilisationChecklistItems,
  mobilisationRecords,
  placements,
  users,
  type MobilisationChecklistCategory,
  type MobilisationChecklistStatus,
  type MobilisationResponsibleParty,
  type MobilisationStatus,
} from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { encryptField } from "@/lib/crypto";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";
import { grantFileAccess, requireUploadedFile } from "@/modules/files";
import { notify } from "@/modules/notifications";

import { assertOrg, assertStaff, assertUuid, isUuid, loadApplicationScope, publicEmployerName, type ApplicationScope } from "./access";
import { actorUserId, auditActorType } from "./actors";
import { notFoundError, rethrowConstraint } from "./errors";
import { recruitmentLinks } from "./links";
import { defaultMobilisationChecklist, mobilisationRank, mobilisationTransitionGate, MOBILISATION_STATUS_LABELS } from "./mobilisation-rules";
import { addChecklistItemSchema, reviewChecklistItemSchema, startMobilisationSchema, submitChecklistItemSchema, updateMobilisationSchema, type UpdateMobilisationInput } from "./schemas";
import { autoAdvance } from "./stage-move";
import type { CandidateActor, PartnerActor, StaffActor } from "./types";
import { STAGE_KEYS } from "./workflow";

/**
 * Overseas mobilisation of a placement: record creation with the default checklist, gated status
 * changes (mobilisation-rules.ts), document submission by the candidate / sourcing partner / staff,
 * staff verification, and scoped read models (staff, partner, candidate).
 */

type PlacementRow = typeof placements.$inferSelect;
type MobilisationRow = typeof mobilisationRecords.$inferSelect;
type ChecklistRow = typeof mobilisationChecklistItems.$inferSelect;

const MOBILISATION_CONSTRAINTS = {
  mobilisation_records_placement_uq: "This placement already has a mobilisation record.",
  mobilisation_records_visa_dates_chk: "The visa expiry date cannot be before the issue date.",
  mobilisation_records_travel_chk: "The arrival time cannot be before the departure time.",
} as const;

/** Create the mobilisation record + default checklist if the placement has none (idempotent). */
export async function ensureMobilisation(tx: DbOrTx, input: { placementId: string; destinationCountryCode: string; candidateId: string }): Promise<string> {
  const [existing] = await tx.select({ id: mobilisationRecords.id, status: mobilisationRecords.status }).from(mobilisationRecords).where(eq(mobilisationRecords.placementId, input.placementId)).limit(1);
  if (existing) {
    if (existing.status === "cancelled") {
      await tx.update(mobilisationRecords).set({ status: "not_started", statusReason: null, destinationCountryCode: input.destinationCountryCode }).where(eq(mobilisationRecords.id, existing.id));
    }
    return existing.id;
  }
  const [candidate] = await tx.select({ emigrationCheckStatus: candidateProfiles.emigrationCheckStatus }).from(candidateProfiles).where(eq(candidateProfiles.id, input.candidateId)).limit(1);
  const code = await nextCode("MOB", { tx });
  const [record] = await tx
    .insert(mobilisationRecords)
    .values({ code, placementId: input.placementId, destinationCountryCode: input.destinationCountryCode, status: "not_started" })
    .returning({ id: mobilisationRecords.id });
  const checklist = defaultMobilisationChecklist({ emigrationCheckStatus: candidate?.emigrationCheckStatus ?? null });
  await tx.insert(mobilisationChecklistItems).values(
    checklist.map((item) => ({
      mobilisationId: record!.id,
      key: item.key,
      item: item.item,
      description: item.description,
      category: item.category,
      responsibleParty: item.responsibleParty,
      isRequired: item.isRequired,
      isCandidateVisible: item.isCandidateVisible,
      sortOrder: item.sortOrder,
    })),
  );
  return record!.id;
}

async function loadPlacementForUpdate(placementId: string, tx: DbOrTx): Promise<PlacementRow> {
  assertUuid(placementId, "Placement");
  const [placement] = await tx.select().from(placements).where(eq(placements.id, placementId)).limit(1).for("update");
  if (!placement) throw notFoundError("Placement");
  return placement;
}

// ---------------------------------------------------------------------------
// Mobilisation writes
// ---------------------------------------------------------------------------

/** Create a mobilisation record for a placement that has none (e.g. the job's country was missing at acceptance). */
export async function startMobilisation(ctx: StaffContext, input: { placementId: string; destinationCountryCode: string }): Promise<{ mobilisationId: string }> {
  assertStaff(ctx, "recruitment.mobilisation");
  const data = startMobilisationSchema.parse(input);
  try {
    return await db.transaction(async (tx) => {
      const placement = await loadPlacementForUpdate(data.placementId, tx);
      if (placement.status === "cancelled" || placement.status === "completed") throw new ActionError("This placement is closed.", { code: "placement_status" });
      const mobilisationId = await ensureMobilisation(tx, { placementId: placement.id, destinationCountryCode: data.destinationCountryCode, candidateId: placement.candidateId });
      await audit({
        action: "mobilisation.started",
        entityType: "mobilisation",
        entityId: mobilisationId,
        organizationId: placement.organizationId,
        actorUserId: ctx.user.id,
        actorType: "staff",
        metadata: { placementCode: placement.code, destination: data.destinationCountryCode },
        tx,
      });
      return { mobilisationId };
    });
  } catch (error) {
    rethrowConstraint(error, MOBILISATION_CONSTRAINTS);
  }
}

async function loadMobilisationForUpdate(mobilisationId: string, tx: DbOrTx): Promise<{ record: MobilisationRow; placement: PlacementRow; scope: ApplicationScope }> {
  assertUuid(mobilisationId, "Mobilisation record");
  const [record] = await tx.select().from(mobilisationRecords).where(eq(mobilisationRecords.id, mobilisationId)).limit(1).for("update");
  if (!record) throw notFoundError("Mobilisation record");
  const [placement] = await tx.select().from(placements).where(eq(placements.id, record.placementId)).limit(1);
  const scope = placement ? await loadApplicationScope(placement.applicationId, tx) : null;
  if (!placement || !scope) throw notFoundError("Mobilisation record");
  return { record, placement, scope };
}

/**
 * Update a mobilisation record (staff, recruitment.mobilisation). Status changes pass the gates in
 * mobilisationTransitionGate (no travel before clearances, no departure before the checklist is
 * done). Visa numbers are stored encrypted (+ last 4). Moves the placement to "mobilising" and the
 * application to Documentation / Mobilisation as the record progresses; the candidate is notified of
 * status changes.
 */
export async function updateMobilisation(ctx: StaffContext, input: UpdateMobilisationInput): Promise<void> {
  assertStaff(ctx, "recruitment.mobilisation");
  const data = updateMobilisationSchema.parse(input);
  try {
    await db.transaction(async (tx) => {
      const { record, placement, scope } = await loadMobilisationForUpdate(data.mobilisationId, tx);
      const set: Partial<typeof mobilisationRecords.$inferInsert> = {};
      const assign = <K extends keyof typeof set>(key: K, value: (typeof set)[K] | undefined) => {
        if (value !== undefined) set[key] = value;
      };
      assign("visaType", data.visaType);
      assign("visaStatus", data.visaStatus);
      assign("visaIssuedOn", data.visaIssuedOn);
      assign("visaExpiresOn", data.visaExpiresOn);
      assign("medicalStatus", data.medicalStatus);
      assign("medicalCompletedOn", data.medicalCompletedOn);
      assign("medicalValidUntil", data.medicalValidUntil);
      assign("emigrationClearanceStatus", data.emigrationClearanceStatus);
      assign("emigrationClearanceReference", data.emigrationClearanceReference);
      assign("emigrationClearedOn", data.emigrationClearedOn);
      assign("pdosCompleted", data.pdosCompleted);
      assign("pdosCompletedOn", data.pdosCompleted === false ? null : data.pdosCompletedOn);
      assign("travelDate", data.travelDate);
      assign("flightDetails", data.flightDetails);
      assign("departedAt", data.departedAt);
      assign("arrivedAt", data.arrivedAt);
      assign("accommodationDetails", data.accommodationDetails);
      assign("candidateInstructions", data.candidateInstructions);
      assign("notes", data.notes);
      assign("statusReason", data.statusReason);
      if (data.visaNumber !== undefined) {
        const normalized = data.visaNumber?.replace(/\s+/g, "").toUpperCase() ?? null;
        set.visaNumberEncrypted = normalized ? encryptField(normalized) : null;
        set.visaNumberLast4 = normalized ? normalized.slice(-4) : null;
      }
      if (data.coordinatorUserId !== undefined) {
        if (data.coordinatorUserId) {
          const [staff] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, data.coordinatorUserId), eq(users.isStaff, true), eq(users.status, "active"))).limit(1);
          if (!staff) throw new ActionError("Choose an active Venkat Sai team member as coordinator.", { fieldErrors: { coordinatorUserId: ["Invalid coordinator"] } });
        }
        set.coordinatorUserId = data.coordinatorUserId;
      }

      const toStatus = data.status && data.status !== record.status ? data.status : null;
      if (toStatus) {
        const checklist = await tx
          .select({ item: mobilisationChecklistItems.item, isRequired: mobilisationChecklistItems.isRequired, status: mobilisationChecklistItems.status })
          .from(mobilisationChecklistItems)
          .where(eq(mobilisationChecklistItems.mobilisationId, record.id));
        const gate = mobilisationTransitionGate(
          {
            status: record.status,
            emigrationClearanceStatus: set.emigrationClearanceStatus ?? record.emigrationClearanceStatus,
            visaStatus: set.visaStatus ?? record.visaStatus,
            medicalStatus: set.medicalStatus ?? record.medicalStatus,
            checklist,
          },
          toStatus,
        );
        if (!gate.allowed) throw new ActionError(gate.message, { code: "mobilisation_gate" });
        if ((toStatus === "on_hold" || toStatus === "cancelled") && !(data.statusReason ?? record.statusReason)) {
          throw new ActionError("Give a reason.", { fieldErrors: { statusReason: ["Required"] } });
        }
        set.status = toStatus;
        if (toStatus === "departed" && !set.departedAt && !record.departedAt) set.departedAt = new Date();
        if (toStatus === "arrived" && !set.arrivedAt && !record.arrivedAt) set.arrivedAt = new Date();
        if (toStatus === "completed") set.completedAt = new Date();
      }
      if (!Object.keys(set).length) return;
      await tx.update(mobilisationRecords).set(set).where(eq(mobilisationRecords.id, record.id));

      if (toStatus) {
        if (placement.status === "pending_joining" && mobilisationRank(toStatus) > 0) {
          await tx.update(placements).set({ status: "mobilising" }).where(eq(placements.id, placement.id));
        }
        if (toStatus === "cancelled" && (placement.status === "pending_joining" || placement.status === "mobilising")) {
          await tx.update(placements).set({ status: "cancelled", cancelledAt: new Date(), cancellationReason: data.statusReason ?? record.statusReason }).where(eq(placements.id, placement.id));
        }
        if (scope.status === "active") {
          const rank = mobilisationRank(toStatus);
          if (rank >= mobilisationRank("visa_processing")) await autoAdvance(tx, scope, { kind: "staff", ctx }, STAGE_KEYS.mobilisation, { fallbackCategory: "pre_joining" });
          else if (rank >= mobilisationRank("documents_pending")) await autoAdvance(tx, scope, { kind: "staff", ctx }, STAGE_KEYS.documentation, { fallbackCategory: "pre_joining" });
        }
        await notify(
          {
            event: "placement.mobilisation_update",
            recipients: [{ userId: scope.candidateUserId }],
            data: {
              mobilisationCode: record.code,
              jobTitle: scope.job.title,
              employerName: publicEmployerName(scope.job, scope.organizationName),
              status: MOBILISATION_STATUS_LABELS[toStatus],
              statusKey: toStatus,
            },
            link: recruitmentLinks.candidateApplication(scope.id),
            dedupeKey: `mobilisation-status:${record.id}:${toStatus}:${Date.now()}`,
          },
          { tx },
        );
      }
      const { visaNumberEncrypted: _omit, ...auditable } = set;
      void _omit;
      await audit({
        action: toStatus ? "mobilisation.status_changed" : "mobilisation.updated",
        entityType: "mobilisation",
        entityId: record.id,
        organizationId: placement.organizationId,
        actorUserId: ctx.user.id,
        actorType: "staff",
        metadata: { code: record.code, from: record.status, ...auditable, visaNumberChanged: data.visaNumber !== undefined },
        tx,
      });
    });
  } catch (error) {
    rethrowConstraint(error, MOBILISATION_CONSTRAINTS);
  }
}

/** Add an ad-hoc checklist item (staff). */
export async function addChecklistItem(
  ctx: StaffContext,
  input: {
    mobilisationId: string;
    item: string;
    description?: string | null;
    category?: MobilisationChecklistCategory;
    responsibleParty?: MobilisationResponsibleParty;
    isRequired?: boolean;
    isCandidateVisible?: boolean;
    dueDate?: string | null;
  },
): Promise<{ id: string }> {
  assertStaff(ctx, "recruitment.mobilisation");
  const data = addChecklistItemSchema.parse(input);
  return db.transaction(async (tx) => {
    const { record, placement } = await loadMobilisationForUpdate(data.mobilisationId, tx);
    if (record.status === "cancelled" || record.status === "completed") throw new ActionError("This mobilisation is closed.", { code: "mobilisation_closed" });
    const [last] = await tx.select({ value: sql<number>`coalesce(max(${mobilisationChecklistItems.sortOrder}), 0)` }).from(mobilisationChecklistItems).where(eq(mobilisationChecklistItems.mobilisationId, record.id));
    const [row] = await tx
      .insert(mobilisationChecklistItems)
      .values({
        mobilisationId: record.id,
        key: null,
        item: data.item,
        description: data.description,
        category: data.category,
        responsibleParty: data.responsibleParty,
        isRequired: data.isRequired,
        isCandidateVisible: data.isCandidateVisible,
        dueDate: data.dueDate,
        sortOrder: Number(last?.value ?? 0) + 10,
      })
      .returning({ id: mobilisationChecklistItems.id });
    await audit({
      action: "mobilisation.checklist_item_added",
      entityType: "mobilisation",
      entityId: record.id,
      organizationId: placement.organizationId,
      actorUserId: ctx.user.id,
      actorType: "staff",
      metadata: { itemId: row!.id, item: data.item },
      tx,
    });
    return { id: row!.id };
  });
}

async function loadChecklistItemForUpdate(itemId: string, tx: DbOrTx) {
  assertUuid(itemId, "Checklist item");
  const [item] = await tx.select().from(mobilisationChecklistItems).where(eq(mobilisationChecklistItems.id, itemId)).limit(1).for("update");
  if (!item) throw notFoundError("Checklist item");
  const loaded = await loadMobilisationForUpdate(item.mobilisationId, tx);
  return { item, ...loaded };
}

/**
 * Submit a checklist item (optionally with a document): the candidate for their own candidate-visible
 * items, the sourcing partner (partner.documents.manage) for its candidates, or staff.
 */
export async function submitChecklistItem(actor: CandidateActor | PartnerActor | StaffActor, input: { itemId: string; fileId?: string | null; note?: string | null }): Promise<void> {
  const data = submitChecklistItemSchema.parse(input);
  await db.transaction(async (tx) => {
    const { item, record, placement, scope } = await loadChecklistItemForUpdate(data.itemId, tx);
    if (actor.kind === "candidate") {
      if (scope.candidateId !== actor.candidateId || !item.isCandidateVisible) throw notFoundError("Checklist item");
    } else if (actor.kind === "partner") {
      assertOrg(actor.ctx, "partner.documents.manage");
      if (placement.partnerOrganizationId !== actor.ctx.organization.id) throw notFoundError("Checklist item");
    } else {
      assertStaff(actor.ctx, "recruitment.mobilisation");
    }
    if (record.status === "cancelled" || record.status === "completed") throw new ActionError("This mobilisation is closed.", { code: "mobilisation_closed" });
    if (item.status === "verified") throw new ActionError("This item has already been verified.", { code: "item_verified" });

    const userId = actorUserId(actor)!;
    let fileId = item.fileId;
    if (data.fileId) {
      const file = await requireUploadedFile(
        data.fileId,
        actor.kind === "partner" ? { purposes: ["mobilisation_document"], ownerUserId: userId, organizationId: actor.ctx.organization.id } : { purposes: ["mobilisation_document"], ownerUserId: userId },
        tx,
      );
      fileId = file.id;
      if (actor.kind !== "candidate") {
        await grantFileAccess({ fileId: file.id, granteeUserId: scope.candidateUserId, reason: "Mobilisation document uploaded for you", contextType: "mobilisation", contextId: record.id, grantedByUserId: userId }, { tx });
      }
    }
    if (!fileId && item.category === "document") throw new ActionError("Upload the document.", { fieldErrors: { fileId: ["Upload the document"] } });
    await tx
      .update(mobilisationChecklistItems)
      .set({ status: "submitted", fileId, completedAt: new Date(), rejectionReason: null, notes: data.note && actor.kind === "staff" ? data.note : item.notes })
      .where(eq(mobilisationChecklistItems.id, item.id));
    await audit({
      action: "mobilisation.checklist_item_submitted",
      entityType: "mobilisation",
      entityId: record.id,
      organizationId: placement.organizationId,
      actorUserId: userId,
      actorType: auditActorType(actor),
      metadata: { itemId: item.id, key: item.key, withFile: Boolean(data.fileId), by: actor.kind },
      tx,
    });
  });
}

/** Staff verify, reject (with a reason the candidate sees), mark not applicable, or reset a checklist item. */
export async function reviewChecklistItem(
  ctx: StaffContext,
  input: { itemId: string; decision: "verified" | "rejected" | "not_applicable" | "pending"; rejectionReason?: string | null; notes?: string | null },
): Promise<void> {
  assertStaff(ctx, "recruitment.mobilisation");
  const data = reviewChecklistItemSchema.parse(input);
  await db.transaction(async (tx) => {
    const { item, record, placement, scope } = await loadChecklistItemForUpdate(data.itemId, tx);
    if (record.status === "cancelled" || record.status === "completed") throw new ActionError("This mobilisation is closed.", { code: "mobilisation_closed" });
    const now = new Date();
    const set: Partial<typeof mobilisationChecklistItems.$inferInsert> = { status: data.decision as MobilisationChecklistStatus, notes: data.notes ?? item.notes };
    if (data.decision === "verified") Object.assign(set, { verifiedByUserId: ctx.user.id, verifiedAt: now, rejectionReason: null, completedAt: item.completedAt ?? now });
    if (data.decision === "rejected") Object.assign(set, { rejectionReason: data.rejectionReason, verifiedByUserId: null, verifiedAt: null });
    if (data.decision === "not_applicable") Object.assign(set, { verifiedByUserId: ctx.user.id, verifiedAt: now, rejectionReason: null });
    if (data.decision === "pending") Object.assign(set, { verifiedByUserId: null, verifiedAt: null, rejectionReason: null, completedAt: null });
    await tx.update(mobilisationChecklistItems).set(set).where(eq(mobilisationChecklistItems.id, item.id));
    if (data.decision === "rejected" && item.isCandidateVisible) {
      await notify(
        {
          event: "placement.mobilisation_update",
          recipients: [{ userId: scope.candidateUserId }],
          data: { mobilisationCode: record.code, jobTitle: scope.job.title, item: item.item, status: "Needs attention", message: data.rejectionReason },
          link: recruitmentLinks.candidateApplication(scope.id),
          dedupeKey: `mobilisation-item-rejected:${item.id}:${now.getTime()}`,
        },
        { tx },
      );
    }
    await audit({
      action: `mobilisation.checklist_item_${data.decision}`,
      entityType: "mobilisation",
      entityId: record.id,
      organizationId: placement.organizationId,
      actorUserId: ctx.user.id,
      actorType: "staff",
      metadata: { itemId: item.id, key: item.key, reason: data.rejectionReason ?? null },
      tx,
    });
  });
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export type ChecklistItemView = {
  id: string;
  key: string | null;
  item: string;
  description: string | null;
  category: MobilisationChecklistCategory;
  status: MobilisationChecklistStatus;
  responsibleParty: MobilisationResponsibleParty;
  isRequired: boolean;
  isCandidateVisible: boolean;
  fileId: string | null;
  dueDate: string | null;
  completedAt: Date | null;
  verifiedAt: Date | null;
  rejectionReason: string | null;
  /** Staff only. */
  notes: string | null;
};

export type MobilisationView = {
  id: string;
  code: string;
  placementId: string;
  placementCode: string;
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  status: MobilisationStatus;
  statusReason: string | null;
  destinationCountryCode: string;
  visaType: string | null;
  visaStatus: MobilisationRow["visaStatus"];
  visaNumberLast4: string | null;
  visaIssuedOn: string | null;
  visaExpiresOn: string | null;
  medicalStatus: MobilisationRow["medicalStatus"];
  medicalCompletedOn: string | null;
  medicalValidUntil: string | null;
  emigrationClearanceStatus: MobilisationRow["emigrationClearanceStatus"];
  emigrationClearanceReference: string | null;
  emigrationClearedOn: string | null;
  pdosCompleted: boolean;
  pdosCompletedOn: string | null;
  travelDate: string | null;
  flightDetails: string | null;
  departedAt: Date | null;
  arrivedAt: Date | null;
  accommodationDetails: string | null;
  candidateInstructions: string | null;
  coordinatorUserId: string | null;
  coordinatorName: string | null;
  notes: string | null;
  checklist: ChecklistItemView[];
};

export type CandidateMobilisationView = {
  id: string;
  code: string;
  status: MobilisationStatus;
  statusLabel: string;
  destinationCountryCode: string;
  visaStatus: MobilisationRow["visaStatus"];
  medicalStatus: MobilisationRow["medicalStatus"];
  emigrationClearanceStatus: MobilisationRow["emigrationClearanceStatus"];
  pdosCompleted: boolean;
  travelDate: string | null;
  flightDetails: string | null;
  accommodationDetails: string | null;
  candidateInstructions: string | null;
  checklist: Omit<ChecklistItemView, "notes" | "isCandidateVisible">[];
};

function toChecklistView(item: ChecklistRow, staff: boolean): ChecklistItemView {
  return {
    id: item.id,
    key: item.key,
    item: item.item,
    description: item.description,
    category: item.category,
    status: item.status,
    responsibleParty: item.responsibleParty,
    isRequired: item.isRequired,
    isCandidateVisible: item.isCandidateVisible,
    fileId: item.fileId,
    dueDate: item.dueDate,
    completedAt: item.completedAt,
    verifiedAt: item.verifiedAt,
    rejectionReason: item.rejectionReason,
    notes: staff ? item.notes : null,
  };
}

async function loadMobilisationView(where: SQL, staff: boolean): Promise<MobilisationView | null> {
  const [row] = await db
    .select({ record: mobilisationRecords, placementCode: placements.code, applicationId: placements.applicationId, candidateName: users.displayName, jobTitle: jobs.title })
    .from(mobilisationRecords)
    .innerJoin(placements, eq(placements.id, mobilisationRecords.placementId))
    .innerJoin(jobs, eq(jobs.id, placements.jobId))
    .innerJoin(candidateProfiles, eq(candidateProfiles.id, placements.candidateId))
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(where)
    .limit(1);
  if (!row) return null;
  const r = row.record;
  const [items, coordinator] = await Promise.all([
    db.select().from(mobilisationChecklistItems).where(eq(mobilisationChecklistItems.mobilisationId, r.id)).orderBy(asc(mobilisationChecklistItems.sortOrder)),
    r.coordinatorUserId ? db.select({ name: users.displayName }).from(users).where(eq(users.id, r.coordinatorUserId)).limit(1) : Promise.resolve([]),
  ]);
  return {
    id: r.id,
    code: r.code,
    placementId: r.placementId,
    placementCode: row.placementCode,
    applicationId: row.applicationId,
    candidateName: row.candidateName,
    jobTitle: row.jobTitle,
    status: r.status,
    statusReason: r.statusReason,
    destinationCountryCode: r.destinationCountryCode,
    visaType: r.visaType,
    visaStatus: r.visaStatus,
    visaNumberLast4: r.visaNumberLast4,
    visaIssuedOn: r.visaIssuedOn,
    visaExpiresOn: r.visaExpiresOn,
    medicalStatus: r.medicalStatus,
    medicalCompletedOn: r.medicalCompletedOn,
    medicalValidUntil: r.medicalValidUntil,
    emigrationClearanceStatus: r.emigrationClearanceStatus,
    emigrationClearanceReference: r.emigrationClearanceReference,
    emigrationClearedOn: r.emigrationClearedOn,
    pdosCompleted: r.pdosCompleted,
    pdosCompletedOn: r.pdosCompletedOn,
    travelDate: r.travelDate,
    flightDetails: r.flightDetails,
    departedAt: r.departedAt,
    arrivedAt: r.arrivedAt,
    accommodationDetails: r.accommodationDetails,
    candidateInstructions: r.candidateInstructions,
    coordinatorUserId: r.coordinatorUserId,
    coordinatorName: coordinator[0]?.name ?? null,
    notes: staff ? r.notes : null,
    checklist: items.filter((i) => staff || i.isCandidateVisible || i.responsibleParty === "partner").map((i) => toChecklistView(i, staff)),
  };
}

/** Full mobilisation record for staff (recruitment.mobilisation or recruitment.view). */
export async function getMobilisationForStaff(ctx: StaffContext, mobilisationId: string): Promise<MobilisationView> {
  assertStaff(ctx, ["recruitment.mobilisation", "recruitment.view"], "any");
  if (!isUuid(mobilisationId)) throw notFoundError("Mobilisation record");
  const view = await loadMobilisationView(eq(mobilisationRecords.id, mobilisationId), true);
  if (!view) throw notFoundError("Mobilisation record");
  return view;
}

/** Mobilisation of a placement credited to the partner (for uploading documents); no internal notes. */
export async function getMobilisationForPartner(ctx: PartnerActor["ctx"], placementId: string): Promise<MobilisationView> {
  assertOrg(ctx, ["partner.documents.manage", "partner.submissions.view"], "any");
  if (!isUuid(placementId)) throw notFoundError("Mobilisation record");
  const view = await loadMobilisationView(and(eq(placements.id, placementId), eq(placements.partnerOrganizationId, ctx.organization.id))!, false);
  if (!view) throw notFoundError("Mobilisation record");
  return { ...view, visaNumberLast4: null, emigrationClearanceReference: null, coordinatorUserId: null };
}

export async function listMobilisationsForStaff(
  ctx: StaffContext,
  filters: { status?: MobilisationStatus; coordinatorUserId?: string; destinationCountryCode?: string },
  page: PageQuery,
): Promise<Paginated<{ id: string; code: string; status: MobilisationStatus; destinationCountryCode: string; travelDate: string | null; candidateName: string; jobTitle: string; placementId: string; applicationId: string; coordinatorUserId: string | null; openRequiredItems: number }>> {
  assertStaff(ctx, ["recruitment.mobilisation", "recruitment.view"], "any");
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(mobilisationRecords.status, filters.status));
  if (filters.coordinatorUserId && isUuid(filters.coordinatorUserId)) conditions.push(eq(mobilisationRecords.coordinatorUserId, filters.coordinatorUserId));
  if (filters.destinationCountryCode) conditions.push(eq(mobilisationRecords.destinationCountryCode, filters.destinationCountryCode.toUpperCase().slice(0, 2)));
  const where = conditions.length ? and(...conditions) : undefined;
  const openItems = sql<number>`(select count(*)::int from ${mobilisationChecklistItems} where ${mobilisationChecklistItems.mobilisationId} = ${mobilisationRecords.id} and ${mobilisationChecklistItems.isRequired} and ${mobilisationChecklistItems.status} not in ('verified', 'not_applicable'))`;
  const [rows, total] = await Promise.all([
    db
      .select({
        id: mobilisationRecords.id,
        code: mobilisationRecords.code,
        status: mobilisationRecords.status,
        destinationCountryCode: mobilisationRecords.destinationCountryCode,
        travelDate: mobilisationRecords.travelDate,
        candidateName: users.displayName,
        jobTitle: jobs.title,
        placementId: placements.id,
        applicationId: placements.applicationId,
        coordinatorUserId: mobilisationRecords.coordinatorUserId,
        openRequiredItems: openItems,
      })
      .from(mobilisationRecords)
      .innerJoin(placements, eq(placements.id, mobilisationRecords.placementId))
      .innerJoin(jobs, eq(jobs.id, placements.jobId))
      .innerJoin(candidateProfiles, eq(candidateProfiles.id, placements.candidateId))
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .where(where)
      .orderBy(asc(sql`coalesce(${mobilisationRecords.travelDate}, '9999-12-31')`), desc(mobilisationRecords.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(mobilisationRecords).where(where),
  ]);
  return paginated(rows.map((r) => ({ ...r, openRequiredItems: Number(r.openRequiredItems) })), total[0]?.value ?? 0, page);
}

/** The candidate's own mobilisation for an application (candidate-visible items only, no internal notes, no identifiers). */
export async function getMobilisationForCandidate(actor: CandidateActor, applicationId: string): Promise<CandidateMobilisationView | null> {
  if (!isUuid(applicationId)) return null;
  const view = await loadMobilisationView(and(eq(placements.applicationId, applicationId), eq(placements.candidateId, actor.candidateId), isNull(candidateProfiles.deletedAt))!, false);
  if (!view) return null;
  return {
    id: view.id,
    code: view.code,
    status: view.status,
    statusLabel: MOBILISATION_STATUS_LABELS[view.status],
    destinationCountryCode: view.destinationCountryCode,
    visaStatus: view.visaStatus,
    medicalStatus: view.medicalStatus,
    emigrationClearanceStatus: view.emigrationClearanceStatus,
    pdosCompleted: view.pdosCompleted,
    travelDate: view.travelDate,
    flightDetails: view.flightDetails,
    accommodationDetails: view.accommodationDetails,
    candidateInstructions: view.candidateInstructions,
    checklist: view.checklist
      .filter((i) => i.isCandidateVisible)
      .map((i) => ({
        id: i.id,
        key: i.key,
        item: i.item,
        description: i.description,
        category: i.category,
        status: i.status,
        responsibleParty: i.responsibleParty,
        isRequired: i.isRequired,
        fileId: i.fileId,
        dueDate: i.dueDate,
        completedAt: i.completedAt,
        verifiedAt: i.verifiedAt,
        rejectionReason: i.rejectionReason,
      })),
  };
}
