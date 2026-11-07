import "server-only";

import { and, count, desc, eq, inArray, isNotNull, lte, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { applications, candidateProfiles, countries, currencies, jobs, offers, organizations, users, type OfferStatus } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit } from "@/modules/audit";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import { grantFileAccess, requireUploadedFile } from "@/modules/files";
import { notify, notifyOrganization, notifyStaff } from "@/modules/notifications";

import {
  assertApplicationAccess,
  assertOrg,
  assertOrgActive,
  assertStaff,
  assertUuid,
  isUuid,
  loadApplicationScope,
  publicEmployerName,
  type ApplicationScope,
} from "./access";
import { actorUserId, auditActorType } from "./actors";
import { isUniqueViolation, notFoundError, rethrowConstraint } from "./errors";
import { recruitmentLinks } from "./links";
import { createPlacementFromOffer } from "./placements";
import { createOfferSchema, issueOfferSchema, respondToOfferSchema, updateOfferSchema, withdrawOfferSchema, type CreateOfferInput, type UpdateOfferInput } from "./schemas";
import { autoAdvance } from "./stage-move";
import type { CandidateActor, HiringActor, RecruitmentActor } from "./types";
import { STAGE_KEYS } from "./workflow";

/**
 * Offers: draft → issued → accepted | declined | withdrawn | expired. At most one open (draft /
 * issued / accepted) offer per application; a revised offer withdraws the issued one and points at
 * it. Accepting creates the placement (and, for overseas jobs, the mobilisation record).
 * Candidates never see drafts or internal notes.
 */

type OfferRow = typeof offers.$inferSelect;

const OFFER_CONSTRAINTS = {
  offers_application_open_uq: "This application already has an open offer. Withdraw or revise it first.",
  offers_salary_chk: "A salary needs an amount, a currency and a period.",
  offers_contract_duration_chk: "The contract duration must be at least one month.",
} as const;

const OFFER_FILE_CONTEXT = "offer";

function assertCanManageOffers(actor: HiringActor, scope: ApplicationScope): void {
  if (actor.kind === "staff") {
    assertStaff(actor.ctx, "recruitment.mobilisation");
    return;
  }
  assertOrg(actor.ctx, "employer.offers.manage");
  assertOrgActive(actor.ctx);
  if (scope.job.organizationId !== actor.ctx.organization.id || !scope.sharedWithEmployerAt) throw notFoundError("Application");
}

async function loadOfferForUpdate(offerId: string, tx: DbOrTx): Promise<{ offer: OfferRow; scope: ApplicationScope }> {
  assertUuid(offerId, "Offer");
  const [offer] = await tx.select().from(offers).where(eq(offers.id, offerId)).limit(1).for("update");
  if (!offer) throw notFoundError("Offer");
  const scope = await loadApplicationScope(offer.applicationId, tx, { lock: true });
  if (!scope) throw notFoundError("Offer");
  return { offer, scope };
}

type OfferFields = Omit<ReturnType<typeof createOfferSchema.parse>, "applicationId">;

async function validateOfferFields(actor: HiringActor, fields: OfferFields, tx: DbOrTx): Promise<void> {
  if (fields.salaryCurrency) {
    const [row] = await tx.select({ code: currencies.code }).from(currencies).where(eq(currencies.code, fields.salaryCurrency)).limit(1);
    if (!row) throw new ActionError("Choose a valid currency.", { fieldErrors: { salaryCurrency: ["Choose a valid currency"] } });
  }
  if (fields.countryCode) {
    const [row] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, fields.countryCode)).limit(1);
    if (!row) throw new ActionError("Choose a valid country.", { fieldErrors: { countryCode: ["Choose a valid country"] } });
  }
  if (fields.expiresAt && fields.expiresAt.getTime() <= Date.now()) {
    throw new ActionError("The response deadline must be in the future.", { fieldErrors: { expiresAt: ["Choose a future date"] } });
  }
  if (fields.offerFileId) {
    await requireUploadedFile(
      fields.offerFileId,
      actor.kind === "employer"
        ? { purposes: ["application_attachment"], ownerUserId: actor.ctx.user.id, organizationId: actor.ctx.organization.id }
        : { purposes: ["application_attachment", "mobilisation_document"], ownerUserId: actor.ctx.user.id },
      tx,
    );
  }
}

function offerValues(fields: OfferFields) {
  return {
    jobTitle: fields.jobTitle,
    salaryMinor: fields.salaryMinor,
    salaryCurrency: fields.salaryMinor === null ? null : fields.salaryCurrency,
    salaryPeriod: fields.salaryMinor === null ? null : fields.salaryPeriod,
    benefits: fields.benefits,
    countryCode: fields.countryCode,
    workLocation: fields.workLocation,
    startDate: fields.startDate,
    contractDurationMonths: fields.contractDurationMonths,
    offerFileId: fields.offerFileId,
    expiresAt: fields.expiresAt,
    internalNotes: fields.internalNotes,
  };
}

async function withOfferConstraints<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isUniqueViolation(error, "offers_application_open_uq")) {
      throw new ActionError(OFFER_CONSTRAINTS.offers_application_open_uq, { code: "offer_open" });
    }
    rethrowConstraint(error, OFFER_CONSTRAINTS);
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Create a draft offer for an active application (staff: recruitment.mobilisation; employer: employer.offers.manage). */
export async function createOffer(actor: HiringActor, input: CreateOfferInput, opts: { supersedesOfferId?: string | null; tx?: DbOrTx } = {}): Promise<{ id: string; code: string }> {
  const data = createOfferSchema.parse(input);
  const run = async (tx: DbOrTx) => {
    const scope = await loadApplicationScope(data.applicationId, tx, { lock: true });
    if (!scope) throw notFoundError("Application");
    assertCanManageOffers(actor, scope);
    if (scope.status !== "active") throw new ActionError("Offers can only be made on open applications.", { code: "application_closed" });
    const { applicationId: _ignored, ...fields } = data;
    void _ignored;
    await validateOfferFields(actor, fields, tx);
    const [open] = await tx.select({ id: offers.id }).from(offers).where(and(eq(offers.applicationId, scope.id), inArray(offers.status, ["draft", "issued", "accepted"]))).limit(1);
    if (open) throw new ActionError(OFFER_CONSTRAINTS.offers_application_open_uq, { code: "offer_open" });
    const code = await nextCode("OFR", { tx });
    const [row] = await tx
      .insert(offers)
      .values({
        code,
        applicationId: scope.id,
        organizationId: scope.job.organizationId,
        issuedByUserId: actorUserId(actor),
        supersedesOfferId: opts.supersedesOfferId ?? null,
        status: "draft",
        ...offerValues(fields),
      })
      .returning({ id: offers.id });
    await audit({
      action: "offer.created",
      entityType: "offer",
      entityId: row!.id,
      organizationId: scope.job.organizationId,
      actorUserId: actorUserId(actor),
      actorType: auditActorType(actor),
      metadata: { code, applicationId: scope.id, supersedesOfferId: opts.supersedesOfferId ?? null },
      tx,
    });
    return { id: row!.id, code };
  };
  return withOfferConstraints(() => (opts.tx ? run(opts.tx) : db.transaction(run)));
}

/** Edit a draft offer (all fields are replaced). */
export async function updateOffer(actor: HiringActor, input: UpdateOfferInput): Promise<void> {
  const data = updateOfferSchema.parse(input);
  await withOfferConstraints(() =>
    db.transaction(async (tx) => {
      const { offer, scope } = await loadOfferForUpdate(data.offerId, tx);
      assertCanManageOffers(actor, scope);
      if (offer.status !== "draft") throw new ActionError("Only draft offers can be edited. Revise the offer instead.", { code: "offer_not_draft" });
      const { offerId: _ignored, ...fields } = data;
      void _ignored;
      await validateOfferFields(actor, fields, tx);
      await tx.update(offers).set(offerValues(fields)).where(eq(offers.id, offer.id));
      await audit({
        action: "offer.updated",
        entityType: "offer",
        entityId: offer.id,
        organizationId: scope.job.organizationId,
        actorUserId: actorUserId(actor),
        actorType: auditActorType(actor),
        metadata: { code: offer.code },
        tx,
      });
    }),
  );
}

/** Issue a draft offer to the candidate (they can see and answer it from now on). */
export async function issueOffer(actor: HiringActor, input: { offerId: string; expiresAt?: Date | null }): Promise<void> {
  const data = issueOfferSchema.parse(input);
  await withOfferConstraints(() =>
    db.transaction(async (tx) => {
      const { offer, scope } = await loadOfferForUpdate(data.offerId, tx);
      assertCanManageOffers(actor, scope);
      if (offer.status !== "draft") throw new ActionError("This offer has already been issued.", { code: "offer_not_draft" });
      if (scope.status !== "active") throw new ActionError("Offers can only be made on open applications.", { code: "application_closed" });
      const expiresAt = data.expiresAt ?? offer.expiresAt;
      if (expiresAt && expiresAt.getTime() <= Date.now()) throw new ActionError("The response deadline must be in the future.", { fieldErrors: { expiresAt: ["Choose a future date"] } });
      const now = new Date();
      await tx.update(offers).set({ status: "issued", issuedAt: now, expiresAt, issuedByUserId: actorUserId(actor) }).where(eq(offers.id, offer.id));
      if (offer.offerFileId) {
        await grantFileAccess(
          { fileId: offer.offerFileId, granteeUserId: scope.candidateUserId, reason: "Job offer letter", contextType: OFFER_FILE_CONTEXT, contextId: offer.id, grantedByUserId: actorUserId(actor) },
          { tx },
        );
        if (scope.job.organizationId && actor.kind === "staff") {
          await grantFileAccess(
            { fileId: offer.offerFileId, granteeOrganizationId: scope.job.organizationId, reason: "Job offer letter", contextType: OFFER_FILE_CONTEXT, contextId: offer.id, grantedByUserId: actorUserId(actor) },
            { tx },
          );
        }
      }
      await autoAdvance(tx, scope, actor, STAGE_KEYS.offerIssued, { fallbackCategory: "offer", notifyCandidate: false, internalNote: `Offer ${offer.code} issued` });
      await notify(
        {
          event: "offer.issued",
          recipients: [{ userId: scope.candidateUserId }],
          data: {
            offerCode: offer.code,
            applicationCode: scope.code,
            jobTitle: offer.jobTitle,
            employerName: publicEmployerName(scope.job, scope.organizationName),
            expiresAt: expiresAt?.toISOString() ?? null,
          },
          link: recruitmentLinks.candidateApplication(scope.id),
          dedupeKey: `offer-issued:${offer.id}`,
        },
        { tx },
      );
      await audit({
        action: "offer.issued",
        entityType: "offer",
        entityId: offer.id,
        organizationId: scope.job.organizationId,
        actorUserId: actorUserId(actor),
        actorType: auditActorType(actor),
        metadata: { code: offer.code, expiresAt: expiresAt?.toISOString() ?? null },
        tx,
      });
    }),
  );
}

async function withdrawInTx(tx: DbOrTx, actor: HiringActor, offer: OfferRow, scope: ApplicationScope, reason: string): Promise<void> {
  if (offer.status !== "draft" && offer.status !== "issued") throw new ActionError("Only draft or issued offers can be withdrawn.", { code: "offer_status" });
  await tx.update(offers).set({ status: "withdrawn", withdrawnAt: new Date(), withdrawalReason: reason }).where(eq(offers.id, offer.id));
  if (offer.status === "issued") {
    await notify(
      {
        event: "application.status_changed",
        recipients: [{ userId: scope.candidateUserId }],
        data: { applicationCode: scope.code, jobTitle: scope.job.title, employerName: publicEmployerName(scope.job, scope.organizationName), status: "Offer withdrawn", message: null },
        link: recruitmentLinks.candidateApplication(scope.id),
        dedupeKey: `offer-withdrawn:${offer.id}`,
      },
      { tx },
    );
  }
  await audit({
    action: "offer.withdrawn",
    entityType: "offer",
    entityId: offer.id,
    organizationId: scope.job.organizationId,
    actorUserId: actorUserId(actor),
    actorType: auditActorType(actor),
    metadata: { code: offer.code, from: offer.status, reason },
    tx,
  });
}

export async function withdrawOffer(actor: HiringActor, input: { offerId: string; reason: string }): Promise<void> {
  const data = withdrawOfferSchema.parse(input);
  await db.transaction(async (tx) => {
    const { offer, scope } = await loadOfferForUpdate(data.offerId, tx);
    assertCanManageOffers(actor, scope);
    await withdrawInTx(tx, actor, offer, scope, data.reason);
  });
}

/** Replace an issued offer: withdraws it and creates a new draft pointing at it (issue the draft afterwards). */
export async function reviseOffer(actor: HiringActor, offerId: string, input: Omit<CreateOfferInput, "applicationId">): Promise<{ id: string; code: string }> {
  return withOfferConstraints(() =>
    db.transaction(async (tx) => {
      const { offer, scope } = await loadOfferForUpdate(offerId, tx);
      assertCanManageOffers(actor, scope);
      if (offer.status !== "issued") throw new ActionError("Only an issued offer can be revised. Edit drafts directly.", { code: "offer_status" });
      await withdrawInTx(tx, actor, offer, scope, "Replaced by a revised offer");
      return createOffer(actor, { ...input, applicationId: scope.id }, { supersedesOfferId: offer.id, tx });
    }),
  );
}

/**
 * The candidate accepts or declines an issued offer before it expires. Accepting moves the
 * application to "Offer accepted" and creates the placement (+ mobilisation for overseas jobs);
 * the employer and staff are told either way.
 */
export async function respondToOffer(
  actor: CandidateActor,
  input: { offerId: string; response: "accept" | "decline"; declineReason?: string | null; signedOfferFileId?: string | null },
): Promise<{ placementId: string | null; mobilisationId: string | null }> {
  const data = respondToOfferSchema.parse(input);
  const expired = await db.transaction(async (tx) => {
    const { offer, scope } = await loadOfferForUpdate(data.offerId, tx);
    if (scope.candidateId !== actor.candidateId || offer.status === "draft") throw notFoundError("Offer");
    if (offer.status !== "issued") throw new ActionError("This offer can no longer be answered.", { code: "offer_status" });
    if (offer.expiresAt && offer.expiresAt.getTime() <= Date.now()) {
      await expireOfferInTx(tx, offer, scope);
      return true;
    }
    return false;
  });
  if (expired) throw new ActionError("This offer has expired.", { code: "offer_expired" });

  return db.transaction(async (tx) => {
    const { offer, scope } = await loadOfferForUpdate(data.offerId, tx);
    if (scope.candidateId !== actor.candidateId || offer.status !== "issued") throw new ActionError("This offer can no longer be answered.", { code: "offer_status" });
    if (scope.status !== "active") throw new ActionError("This application is closed.", { code: "application_closed" });
    const now = new Date();
    let placementId: string | null = null;
    let mobilisationId: string | null = null;

    if (data.response === "accept") {
      let signedOfferFileId: string | null = null;
      if (data.signedOfferFileId) {
        const file = await requireUploadedFile(data.signedOfferFileId, { purposes: ["application_attachment"], ownerUserId: actor.userId }, tx);
        signedOfferFileId = file.id;
        if (scope.job.organizationId) {
          await grantFileAccess(
            { fileId: file.id, granteeOrganizationId: scope.job.organizationId, reason: "Countersigned job offer", contextType: OFFER_FILE_CONTEXT, contextId: offer.id, grantedByUserId: actor.userId },
            { tx },
          );
        }
      }
      await tx.update(offers).set({ status: "accepted", respondedAt: now, signedOfferFileId }).where(eq(offers.id, offer.id));
      await autoAdvance(tx, scope, actor, STAGE_KEYS.offerAccepted, { notifyCandidate: false, internalNote: `Offer ${offer.code} accepted` });
      const created = await createPlacementFromOffer(tx, scope, offer, actor.userId);
      placementId = created.placementId;
      mobilisationId = created.mobilisationId;
    } else {
      await tx.update(offers).set({ status: "declined", respondedAt: now, declineReason: data.declineReason }).where(eq(offers.id, offer.id));
    }

    const payload = { offerCode: offer.code, applicationCode: scope.code, jobTitle: offer.jobTitle, response: data.response === "accept" ? "accepted" : "declined" };
    if (scope.job.organizationId) {
      await notifyOrganization(
        { event: "offer.responded", organizationId: scope.job.organizationId, permission: "employer.offers.manage", data: payload, link: recruitmentLinks.employerOffers(), dedupeKey: `offer-responded-org:${offer.id}` },
        { tx },
      );
    }
    await notifyStaff({ event: "offer.responded", permission: "recruitment.mobilisation", data: payload, link: recruitmentLinks.staffApplication(scope.id), dedupeKey: `offer-responded-staff:${offer.id}` }, { tx });
    await audit({
      action: data.response === "accept" ? "offer.accepted" : "offer.declined",
      entityType: "offer",
      entityId: offer.id,
      organizationId: scope.job.organizationId,
      actorUserId: actor.userId,
      actorType: "user",
      metadata: { code: offer.code, placementId, mobilisationId },
      tx,
    });
    return { placementId, mobilisationId };
  });
}

async function expireOfferInTx(tx: DbOrTx, offer: OfferRow, scope: ApplicationScope): Promise<void> {
  await tx.update(offers).set({ status: "expired" }).where(and(eq(offers.id, offer.id), eq(offers.status, "issued")));
  await notify(
    {
      event: "application.status_changed",
      recipients: [{ userId: scope.candidateUserId }],
      data: { applicationCode: scope.code, jobTitle: scope.job.title, employerName: publicEmployerName(scope.job, scope.organizationName), status: "Offer expired", message: null },
      link: recruitmentLinks.candidateApplication(scope.id),
      dedupeKey: `offer-expired-candidate:${offer.id}`,
    },
    { tx },
  );
  const payload = { offerCode: offer.code, applicationCode: scope.code, jobTitle: offer.jobTitle, response: "expired" };
  if (scope.job.organizationId) {
    await notifyOrganization({ event: "offer.responded", organizationId: scope.job.organizationId, permission: "employer.offers.manage", data: payload, link: recruitmentLinks.employerOffers(), dedupeKey: `offer-expired-org:${offer.id}` }, { tx });
  }
  await notifyStaff({ event: "offer.responded", permission: "recruitment.mobilisation", data: payload, link: recruitmentLinks.staffApplication(scope.id), dedupeKey: `offer-expired-staff:${offer.id}` }, { tx });
  await audit({ action: "offer.expired", entityType: "offer", entityId: offer.id, organizationId: scope.job.organizationId, actorType: "system", metadata: { code: offer.code }, tx });
}

/** Expire issued offers past their response deadline (task). Returns how many expired. */
export async function expireDueOffers(now: Date = new Date()): Promise<number> {
  const due = await db
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.status, "issued"), isNotNull(offers.expiresAt), lte(offers.expiresAt, now)))
    .limit(500);
  let expired = 0;
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const [offer] = await tx.select().from(offers).where(eq(offers.id, id)).limit(1).for("update");
      if (!offer || offer.status !== "issued" || !offer.expiresAt || offer.expiresAt > now) return;
      const scope = await loadApplicationScope(offer.applicationId, tx);
      if (!scope) return;
      await expireOfferInTx(tx, offer, scope);
      expired += 1;
    });
  }
  return expired;
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export type OfferView = {
  id: string;
  code: string;
  applicationId: string;
  applicationCode: string;
  jobId: string;
  candidateId: string;
  candidateName: string;
  organizationId: string | null;
  status: OfferStatus;
  jobTitle: string;
  salaryMinor: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  benefits: string | null;
  countryCode: string | null;
  workLocation: string | null;
  startDate: string | null;
  contractDurationMonths: number | null;
  offerFileId: string | null;
  signedOfferFileId: string | null;
  supersedesOfferId: string | null;
  issuedAt: Date | null;
  respondedAt: Date | null;
  expiresAt: Date | null;
  declineReason: string | null;
  withdrawnAt: Date | null;
  withdrawalReason: string | null;
  internalNotes: string | null;
  createdAt: Date;
};

export type CandidateOfferView = Omit<OfferView, "internalNotes" | "candidateName" | "candidateId" | "organizationId" | "supersedesOfferId"> & {
  employerName: string;
  /** Can still be accepted or declined. */
  canRespond: boolean;
};

const offerSelection = {
  offer: offers,
  applicationCode: applications.code,
  jobId: applications.jobId,
  candidateId: applications.candidateId,
  candidateName: users.displayName,
  jobOrganizationId: jobs.organizationId,
  isConfidential: jobs.isConfidential,
  confidentialEmployerName: jobs.confidentialEmployerName,
  organizationName: organizations.name,
};

function baseOfferQuery(tx: DbOrTx) {
  return tx
    .select(offerSelection)
    .from(offers)
    .innerJoin(applications, eq(applications.id, offers.applicationId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(candidateProfiles, eq(candidateProfiles.id, applications.candidateId))
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .leftJoin(organizations, eq(organizations.id, jobs.organizationId));
}

type OfferQueryRow = {
  offer: OfferRow;
  applicationCode: string;
  jobId: string;
  candidateId: string;
  candidateName: string;
  jobOrganizationId: string | null;
  isConfidential: boolean;
  confidentialEmployerName: string | null;
  organizationName: string | null;
};

function toOfferView(r: OfferQueryRow): OfferView {
  const o = r.offer;
  return {
    id: o.id,
    code: o.code,
    applicationId: o.applicationId,
    applicationCode: r.applicationCode,
    jobId: r.jobId,
    candidateId: r.candidateId,
    candidateName: r.candidateName,
    organizationId: o.organizationId,
    status: o.status,
    jobTitle: o.jobTitle,
    salaryMinor: o.salaryMinor,
    salaryCurrency: o.salaryCurrency,
    salaryPeriod: o.salaryPeriod,
    benefits: o.benefits,
    countryCode: o.countryCode,
    workLocation: o.workLocation,
    startDate: o.startDate,
    contractDurationMonths: o.contractDurationMonths,
    offerFileId: o.offerFileId,
    signedOfferFileId: o.signedOfferFileId,
    supersedesOfferId: o.supersedesOfferId,
    issuedAt: o.issuedAt,
    respondedAt: o.respondedAt,
    expiresAt: o.expiresAt,
    declineReason: o.declineReason,
    withdrawnAt: o.withdrawnAt,
    withdrawalReason: o.withdrawalReason,
    internalNotes: o.internalNotes,
    createdAt: o.createdAt,
  };
}

function toCandidateOfferView(r: OfferQueryRow, now: Date): CandidateOfferView {
  const v = toOfferView(r);
  return {
    id: v.id,
    code: v.code,
    applicationId: v.applicationId,
    applicationCode: v.applicationCode,
    jobId: v.jobId,
    status: v.status,
    jobTitle: v.jobTitle,
    salaryMinor: v.salaryMinor,
    salaryCurrency: v.salaryCurrency,
    salaryPeriod: v.salaryPeriod,
    benefits: v.benefits,
    countryCode: v.countryCode,
    workLocation: v.workLocation,
    startDate: v.startDate,
    contractDurationMonths: v.contractDurationMonths,
    offerFileId: v.offerFileId,
    signedOfferFileId: v.signedOfferFileId,
    issuedAt: v.issuedAt,
    respondedAt: v.respondedAt,
    expiresAt: v.expiresAt,
    declineReason: v.declineReason,
    withdrawnAt: v.withdrawnAt,
    // Withdrawal reasons may be internal; the candidate only sees that the offer was withdrawn.
    withdrawalReason: null,
    createdAt: v.createdAt,
    employerName: publicEmployerName({ isConfidential: r.isConfidential, confidentialEmployerName: r.confidentialEmployerName, organizationId: r.jobOrganizationId }, r.organizationName),
    canRespond: r.offer.status === "issued" && (!r.offer.expiresAt || r.offer.expiresAt.getTime() > now.getTime()),
  };
}

/** Offers of an application for staff / the employer (all statuses). */
export async function listOffersForApplication(actor: RecruitmentActor, applicationId: string): Promise<OfferView[]> {
  const scope = await loadApplicationScope(applicationId);
  if (!scope) throw notFoundError("Application");
  assertApplicationAccess(actor, scope, "view");
  if (actor.kind === "candidate" || actor.kind === "partner") throw notFoundError("Application");
  if (actor.kind === "employer") assertOrg(actor.ctx, ["employer.offers.manage", "employer.pipeline.view"], "any");
  const rows = await baseOfferQuery(db).where(eq(offers.applicationId, scope.id)).orderBy(desc(offers.createdAt)).limit(50);
  return rows.map(toOfferView);
}

/** The candidate's offers (issued or later — never drafts), optionally for one application. */
export async function listOffersForCandidate(actor: CandidateActor, opts: { applicationId?: string } = {}, tx: DbOrTx = db): Promise<CandidateOfferView[]> {
  const now = new Date();
  const where: SQL[] = [eq(applications.candidateId, actor.candidateId), inArray(offers.status, ["issued", "accepted", "declined", "withdrawn", "expired"]), isNotNull(offers.issuedAt)];
  if (opts.applicationId) {
    if (!isUuid(opts.applicationId)) return [];
    where.push(eq(offers.applicationId, opts.applicationId));
  }
  const rows = await baseOfferQuery(tx).where(and(...where)).orderBy(desc(offers.issuedAt)).limit(100);
  return rows.map((r) => toCandidateOfferView(r, now));
}

export async function listOffersForEmployer(ctx: OrgContext<"employer">, filters: { status?: OfferStatus }, page: PageQuery): Promise<Paginated<OfferView>> {
  assertOrg(ctx, "employer.offers.manage");
  const where = and(eq(jobs.organizationId, ctx.organization.id), isNotNull(applications.sharedWithEmployerAt), filters.status ? eq(offers.status, filters.status) : undefined);
  const [rows, total] = await Promise.all([
    baseOfferQuery(db).where(where).orderBy(desc(offers.createdAt)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(offers).innerJoin(applications, eq(applications.id, offers.applicationId)).innerJoin(jobs, eq(jobs.id, applications.jobId)).where(where),
  ]);
  return paginated(rows.map(toOfferView), total[0]?.value ?? 0, page);
}

export async function listOffersForStaff(ctx: StaffContext, filters: { status?: OfferStatus; organizationId?: string }, page: PageQuery): Promise<Paginated<OfferView>> {
  assertStaff(ctx, ["recruitment.view", "recruitment.mobilisation"], "any");
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(offers.status, filters.status));
  if (filters.organizationId && isUuid(filters.organizationId)) conditions.push(eq(offers.organizationId, filters.organizationId));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, total] = await Promise.all([
    baseOfferQuery(db).where(where).orderBy(desc(offers.createdAt)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(offers).where(where),
  ]);
  return paginated(rows.map(toOfferView), total[0]?.value ?? 0, page);
}
