import "server-only";

import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { applications, candidateProfiles, jobs, mobilisationRecords, organizations, placements, users, type MobilisationStatus, type PlacementStatus } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit } from "@/modules/audit";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import { notifyOrganization, notifyStaff } from "@/modules/notifications";

import { assertApplicationAccess, assertOrg, assertOrgActive, assertStaff, assertUuid, isUuid, loadApplicationScope, type ApplicationScope } from "./access";
import { actorUserId, auditActorType } from "./actors";
import { forbiddenError, notFoundError, rethrowConstraint } from "./errors";
import { recruitmentLinks } from "./links";
import { ensureMobilisation } from "./mobilisation";
import { confirmJoinedSchema, linkReplacementSchema, updatePlacementSchema, type UpdatePlacementInput } from "./schemas";
import { autoAdvance } from "./stage-move";
import type { HiringActor, RecruitmentActor } from "./types";
import { STAGE_KEYS } from "./workflow";

/**
 * Placements (confirmed hires): creation from an accepted offer (+ the mobilisation record for
 * overseas jobs, see mobilisation.ts), joining confirmation, status updates and the replacement
 * chain, and placement read models.
 */

type PlacementRow = typeof placements.$inferSelect;

const PLACEMENT_CONSTRAINTS = {
  placements_application_uq: "This application already has a placement.",
  placements_joined_chk: "The joining date cannot be before the placement date.",
  placements_fee_chk: "A fee needs an amount and a currency.",
} as const;

/** Allowed manual placement status changes ("joined" only through confirmJoined). */
const PLACEMENT_TRANSITIONS: Readonly<Record<PlacementStatus, readonly PlacementStatus[]>> = {
  pending_joining: ["mobilising", "cancelled"],
  mobilising: ["pending_joining", "cancelled"],
  joined: ["replacement_required", "completed"],
  replacement_required: ["joined", "completed", "cancelled"],
  cancelled: [],
  completed: [],
};

export function canChangePlacementStatus(from: PlacementStatus, to: PlacementStatus): boolean {
  return from === to || PLACEMENT_TRANSITIONS[from].includes(to);
}

const todayIso = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Creation (called when the candidate accepts an offer)
// ---------------------------------------------------------------------------

export type OfferForPlacement = {
  id: string;
  countryCode: string | null;
  workLocation: string | null;
  salaryMinor: number | null;
  salaryCurrency: string | null;
  salaryPeriod: (typeof placements.$inferSelect)["salaryPeriod"];
};

/**
 * Create the placement (pending joining) for an accepted offer and, for overseas jobs, the
 * mobilisation record with its default checklist. Runs inside the acceptance transaction.
 */
export async function createPlacementFromOffer(
  tx: DbOrTx,
  scope: ApplicationScope,
  offer: OfferForPlacement,
  actorUserIdValue: string | null,
): Promise<{ placementId: string; code: string; mobilisationId: string | null }> {
  const now = new Date();
  const values = {
    offerId: offer.id,
    candidateId: scope.candidateId,
    organizationId: scope.job.organizationId,
    jobId: scope.jobId,
    partnerOrganizationId: scope.partnerOrganizationId,
    placedOn: todayIso(now),
    joinedOn: null,
    countryCode: offer.countryCode ?? scope.job.countryCode,
    workLocation: offer.workLocation ?? scope.job.city,
    status: "pending_joining" as const,
    salaryMinor: offer.salaryMinor,
    salaryCurrency: offer.salaryCurrency,
    salaryPeriod: offer.salaryPeriod,
    cancelledAt: null,
    cancellationReason: null,
    completedAt: null,
  };
  const [existing] = await tx.select({ id: placements.id, code: placements.code, status: placements.status }).from(placements).where(eq(placements.applicationId, scope.id)).limit(1).for("update");
  let placementId: string;
  let code: string;
  if (existing) {
    // One placement per application: a cancelled one is revived for the new offer.
    if (existing.status !== "cancelled") throw new ActionError("This application already has a placement.", { code: "placement_exists" });
    await tx.update(placements).set(values).where(eq(placements.id, existing.id));
    placementId = existing.id;
    code = existing.code;
  } else {
    code = await nextCode("PLC", { tx });
    const [row] = await tx.insert(placements).values({ code, applicationId: scope.id, ...values }).returning({ id: placements.id });
    placementId = row!.id;
  }

  let mobilisationId: string | null = null;
  const destination = values.countryCode;
  if (scope.job.isOverseas && destination) {
    mobilisationId = await ensureMobilisation(tx, { placementId, destinationCountryCode: destination, candidateId: scope.candidateId });
  }
  await audit({
    action: "placement.created",
    entityType: "placement",
    entityId: placementId,
    organizationId: scope.job.organizationId,
    actorUserId: actorUserIdValue,
    actorType: actorUserIdValue ? "user" : "system",
    metadata: { code, applicationId: scope.id, offerId: offer.id, mobilisationId, overseas: scope.job.isOverseas },
    tx,
  });
  return { placementId, code, mobilisationId };
}

// ---------------------------------------------------------------------------
// Placement access
// ---------------------------------------------------------------------------

async function loadPlacementForUpdate(placementId: string, tx: DbOrTx): Promise<{ placement: PlacementRow; scope: ApplicationScope }> {
  assertUuid(placementId, "Placement");
  const [placement] = await tx.select().from(placements).where(eq(placements.id, placementId)).limit(1).for("update");
  if (!placement) throw notFoundError("Placement");
  const scope = await loadApplicationScope(placement.applicationId, tx);
  if (!scope) throw notFoundError("Placement");
  return { placement, scope };
}

function assertCanManagePlacement(actor: HiringActor, placement: PlacementRow): void {
  if (actor.kind === "staff") {
    assertStaff(actor.ctx, "recruitment.mobilisation");
    return;
  }
  assertOrg(actor.ctx, "employer.offers.manage");
  assertOrgActive(actor.ctx);
  if (placement.organizationId !== actor.ctx.organization.id) throw notFoundError("Placement");
}

// ---------------------------------------------------------------------------
// Placement writes
// ---------------------------------------------------------------------------

/** Confirm the candidate joined: placement → joined, application → Joined (hired), mobilisation completed; notifies the employer, staff and the sourcing partner. */
export async function confirmJoined(actor: HiringActor, input: { placementId: string; joinedOn: string }): Promise<void> {
  const data = confirmJoinedSchema.parse(input);
  try {
    await db.transaction(async (tx) => {
      const { placement, scope } = await loadPlacementForUpdate(data.placementId, tx);
      assertCanManagePlacement(actor, placement);
      if (placement.status !== "pending_joining" && placement.status !== "mobilising" && placement.status !== "replacement_required") {
        throw new ActionError("This placement cannot be marked as joined.", { code: "placement_status" });
      }
      if (data.joinedOn < placement.placedOn) throw new ActionError("The joining date cannot be before the placement date.", { fieldErrors: { joinedOn: ["Too early"] } });
      if (data.joinedOn > todayIso(new Date(Date.now() + 24 * 60 * 60 * 1000))) {
        throw new ActionError("The joining date cannot be in the future.", { fieldErrors: { joinedOn: ["Cannot be in the future"] } });
      }
      await tx.update(placements).set({ status: "joined", joinedOn: data.joinedOn }).where(eq(placements.id, placement.id));
      await tx
        .update(mobilisationRecords)
        .set({ status: "completed", completedAt: new Date() })
        .where(and(eq(mobilisationRecords.placementId, placement.id), inArray(mobilisationRecords.status, ["departed", "arrived", "travel_booked"])));
      if (scope.status !== "withdrawn") {
        await autoAdvance(tx, scope, actor, STAGE_KEYS.joined, { fallbackCategory: "joined", internalNote: `Joined on ${data.joinedOn}` });
      }

      const payload = { placementCode: placement.code, applicationCode: scope.code, jobTitle: scope.job.title, joinedOn: data.joinedOn };
      if (placement.organizationId) {
        await notifyOrganization(
          { event: "placement.joined", organizationId: placement.organizationId, permission: "employer.pipeline.view", data: payload, link: recruitmentLinks.employerOffers(), dedupeKey: `placement-joined-org:${placement.id}` },
          { tx },
        );
      }
      await notifyStaff({ event: "placement.joined", permission: "recruitment.view", data: payload, link: recruitmentLinks.staffApplication(scope.id), dedupeKey: `placement-joined-staff:${placement.id}` }, { tx });
      if (placement.partnerOrganizationId) {
        await notifyOrganization(
          { event: "placement.joined", organizationId: placement.partnerOrganizationId, permission: "partner.submissions.view", data: payload, link: recruitmentLinks.partnerInterviews(), dedupeKey: `placement-joined-partner:${placement.id}` },
          { tx },
        );
      }
      await audit({
        action: "placement.joined",
        entityType: "placement",
        entityId: placement.id,
        organizationId: placement.organizationId,
        actorUserId: actorUserId(actor),
        actorType: auditActorType(actor),
        metadata: { code: placement.code, joinedOn: data.joinedOn },
        tx,
      });
    });
  } catch (error) {
    rethrowConstraint(error, PLACEMENT_CONSTRAINTS);
  }
}

/**
 * Update a placement. Staff (recruitment.mobilisation): status (see PLACEMENT_TRANSITIONS),
 * replacement deadline, fee, work location, internal notes. Employers (employer.offers.manage):
 * only flag their own joined placement as needing a replacement, with a reason.
 */
export async function updatePlacement(actor: HiringActor, input: UpdatePlacementInput): Promise<void> {
  const data = updatePlacementSchema.parse(input);
  try {
    await db.transaction(async (tx) => {
      const { placement, scope } = await loadPlacementForUpdate(data.placementId, tx);
      assertCanManagePlacement(actor, placement);
      if (actor.kind === "employer") {
        const onlyReplacement = data.status === "replacement_required" && Object.entries(data).every(([k, v]) => ["placementId", "status", "reason"].includes(k) || v === undefined);
        if (!onlyReplacement) throw forbiddenError("Employers can only report that a replacement is needed.");
        if (!data.reason) throw new ActionError("Tell us why a replacement is needed.", { fieldErrors: { reason: ["Required"] } });
      }
      const set: Partial<typeof placements.$inferInsert> = {};
      if (data.status && data.status !== placement.status) {
        if (!canChangePlacementStatus(placement.status, data.status)) {
          throw new ActionError(`A ${placement.status.replace(/_/g, " ")} placement cannot change to ${data.status.replace(/_/g, " ")}.`, { code: "placement_status" });
        }
        set.status = data.status;
        if (data.status === "cancelled") {
          if (!data.reason) throw new ActionError("Give a reason for cancelling the placement.", { fieldErrors: { reason: ["Required"] } });
          set.cancelledAt = new Date();
          set.cancellationReason = data.reason;
        }
        if (data.status === "completed") set.completedAt = new Date();
      }
      if (data.replacementDeadline !== undefined) set.replacementDeadline = data.replacementDeadline;
      if (data.feeMinor !== undefined) {
        set.feeMinor = data.feeMinor;
        set.feeCurrency = data.feeMinor === null ? null : (data.feeCurrency ?? placement.feeCurrency);
      }
      if (data.workLocation !== undefined) set.workLocation = data.workLocation;
      if (data.notes !== undefined) set.notes = data.notes;
      if (!Object.keys(set).length) return;
      await tx.update(placements).set(set).where(eq(placements.id, placement.id));
      if (set.status === "cancelled") {
        await tx
          .update(mobilisationRecords)
          .set({ status: "cancelled", statusReason: data.reason })
          .where(and(eq(mobilisationRecords.placementId, placement.id), sql`${mobilisationRecords.status} not in ('completed', 'cancelled')`));
      }
      if (set.status === "replacement_required") {
        await notifyStaff(
          {
            event: "placement.mobilisation_update",
            permission: "recruitment.mobilisation",
            data: { placementCode: placement.code, jobTitle: scope.job.title, status: "Replacement required", reason: data.reason },
            link: recruitmentLinks.staffApplication(scope.id),
            dedupeKey: `placement-replacement:${placement.id}:${Date.now()}`,
          },
          { tx },
        );
      }
      await audit({
        action: set.status ? `placement.${set.status}` : "placement.updated",
        entityType: "placement",
        entityId: placement.id,
        organizationId: placement.organizationId,
        actorUserId: actorUserId(actor),
        actorType: auditActorType(actor),
        metadata: { code: placement.code, from: placement.status, ...set, reason: data.reason ?? null },
        tx,
      });
    });
  } catch (error) {
    rethrowConstraint(error, PLACEMENT_CONSTRAINTS);
  }
}

/**
 * Record that `placementId` (a new hire) replaces `replacesPlacementId` under the replacement
 * guarantee. The replaced placement (status replacement_required) is marked completed; the chain is
 * kept on the new placement (replacementForPlacementId).
 */
export async function linkReplacementPlacement(ctx: StaffContext, input: { placementId: string; replacesPlacementId: string }): Promise<void> {
  assertStaff(ctx, "recruitment.mobilisation");
  const data = linkReplacementSchema.parse(input);
  if (data.placementId === data.replacesPlacementId) throw new ActionError("A placement cannot replace itself.");
  await db.transaction(async (tx) => {
    const [replacement] = await tx.select().from(placements).where(eq(placements.id, data.placementId)).limit(1).for("update");
    const [original] = await tx.select().from(placements).where(eq(placements.id, data.replacesPlacementId)).limit(1).for("update");
    if (!replacement || !original) throw notFoundError("Placement");
    if (original.status !== "replacement_required") throw new ActionError("The original placement is not marked as needing a replacement.", { code: "placement_status" });
    if (original.jobId !== replacement.jobId && original.organizationId !== replacement.organizationId) {
      throw new ActionError("A replacement must be for the same job or employer.", { code: "replacement_mismatch" });
    }
    if (replacement.replacementForPlacementId) throw new ActionError("This placement is already linked as a replacement.", { code: "replacement_linked" });
    await tx.update(placements).set({ replacementForPlacementId: original.id }).where(eq(placements.id, replacement.id));
    await tx.update(placements).set({ status: "completed", completedAt: new Date() }).where(eq(placements.id, original.id));
    await audit({
      action: "placement.replacement_linked",
      entityType: "placement",
      entityId: replacement.id,
      organizationId: replacement.organizationId,
      actorUserId: ctx.user.id,
      actorType: "staff",
      metadata: { replacementCode: replacement.code, originalCode: original.code, originalId: original.id },
      tx,
    });
  });
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export type PlacementView = {
  id: string;
  code: string;
  applicationId: string;
  applicationCode: string;
  offerId: string | null;
  candidateId: string;
  candidateName: string;
  jobId: string;
  jobTitle: string;
  organizationId: string | null;
  organizationName: string | null;
  partnerOrganizationId: string | null;
  status: PlacementStatus;
  placedOn: string;
  joinedOn: string | null;
  countryCode: string | null;
  workLocation: string | null;
  replacementDeadline: string | null;
  replacementForPlacementId: string | null;
  salaryMinor: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  /** Staff only (null for employers). */
  feeMinor: number | null;
  feeCurrency: string | null;
  /** Staff only. */
  notes: string | null;
  cancellationReason: string | null;
  mobilisationId: string | null;
  mobilisationStatus: MobilisationStatus | null;
  createdAt: Date;
};

const placementSelection = {
  placement: placements,
  applicationCode: applications.code,
  candidateName: users.displayName,
  jobTitle: jobs.title,
  organizationName: organizations.name,
  mobilisationId: mobilisationRecords.id,
  mobilisationStatus: mobilisationRecords.status,
};

function basePlacementQuery(tx: DbOrTx) {
  return tx
    .select(placementSelection)
    .from(placements)
    .innerJoin(applications, eq(applications.id, placements.applicationId))
    .innerJoin(jobs, eq(jobs.id, placements.jobId))
    .innerJoin(candidateProfiles, eq(candidateProfiles.id, placements.candidateId))
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .leftJoin(organizations, eq(organizations.id, placements.organizationId))
    .leftJoin(mobilisationRecords, eq(mobilisationRecords.placementId, placements.id));
}

type PlacementQueryRow = {
  placement: PlacementRow;
  applicationCode: string;
  candidateName: string;
  jobTitle: string;
  organizationName: string | null;
  mobilisationId: string | null;
  mobilisationStatus: MobilisationStatus | null;
};

function toPlacementView(r: PlacementQueryRow, staff: boolean): PlacementView {
  const p = r.placement;
  return {
    id: p.id,
    code: p.code,
    applicationId: p.applicationId,
    applicationCode: r.applicationCode,
    offerId: p.offerId,
    candidateId: p.candidateId,
    candidateName: r.candidateName,
    jobId: p.jobId,
    jobTitle: r.jobTitle,
    organizationId: p.organizationId,
    organizationName: r.organizationName,
    partnerOrganizationId: staff ? p.partnerOrganizationId : null,
    status: p.status,
    placedOn: p.placedOn,
    joinedOn: p.joinedOn,
    countryCode: p.countryCode,
    workLocation: p.workLocation,
    replacementDeadline: p.replacementDeadline,
    replacementForPlacementId: p.replacementForPlacementId,
    salaryMinor: p.salaryMinor,
    salaryCurrency: p.salaryCurrency,
    salaryPeriod: p.salaryPeriod,
    feeMinor: staff ? p.feeMinor : null,
    feeCurrency: staff ? p.feeCurrency : null,
    notes: staff ? p.notes : null,
    cancellationReason: p.cancellationReason,
    mobilisationId: r.mobilisationId,
    mobilisationStatus: r.mobilisationStatus,
    createdAt: p.createdAt,
  };
}

export type PlacementListFilters = { status?: PlacementStatus; jobId?: string; organizationId?: string; partnerOrganizationId?: string };

function placementConditions(filters: PlacementListFilters): SQL[] {
  const where: SQL[] = [];
  if (filters.status) where.push(eq(placements.status, filters.status));
  if (filters.jobId && isUuid(filters.jobId)) where.push(eq(placements.jobId, filters.jobId));
  if (filters.organizationId && isUuid(filters.organizationId)) where.push(eq(placements.organizationId, filters.organizationId));
  if (filters.partnerOrganizationId && isUuid(filters.partnerOrganizationId)) where.push(eq(placements.partnerOrganizationId, filters.partnerOrganizationId));
  return where;
}

export async function listPlacementsForStaff(ctx: StaffContext, filters: PlacementListFilters, page: PageQuery): Promise<Paginated<PlacementView>> {
  assertStaff(ctx, ["recruitment.view", "recruitment.mobilisation"], "any");
  const conditions = placementConditions(filters);
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, total] = await Promise.all([
    basePlacementQuery(db).where(where).orderBy(desc(placements.placedOn), desc(placements.createdAt)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(placements).where(where),
  ]);
  return paginated(rows.map((r) => toPlacementView(r, true)), total[0]?.value ?? 0, page);
}

export async function listPlacementsForEmployer(ctx: OrgContext<"employer">, filters: Omit<PlacementListFilters, "organizationId" | "partnerOrganizationId">, page: PageQuery): Promise<Paginated<PlacementView>> {
  assertOrg(ctx, ["employer.offers.manage", "employer.pipeline.view"], "any");
  const where = and(eq(placements.organizationId, ctx.organization.id), ...placementConditions(filters));
  const [rows, total] = await Promise.all([
    basePlacementQuery(db).where(where).orderBy(desc(placements.placedOn), desc(placements.createdAt)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(placements).where(where),
  ]);
  return paginated(rows.map((r) => toPlacementView(r, false)), total[0]?.value ?? 0, page);
}

/** The placement of an application, as staff / the employer / the sourcing partner may see it. */
export async function getPlacementForApplication(actor: RecruitmentActor, applicationId: string): Promise<PlacementView | null> {
  const scope = await loadApplicationScope(applicationId);
  if (!scope) throw notFoundError("Application");
  assertApplicationAccess(actor, scope, "view");
  const [row] = await basePlacementQuery(db).where(eq(placements.applicationId, scope.id)).limit(1);
  if (!row) return null;
  return toPlacementView(row, actor.kind === "staff" || actor.kind === "system");
}
