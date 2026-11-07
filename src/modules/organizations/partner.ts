import "server-only";

import { and, asc, count, desc, eq, inArray, isNull, ne, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { currencies, industries, organizations, partnerAgreements, partnerLicences, partnerProfiles, partnerTerritories } from "@/db/schema";
import type { PartnerLicenceVerificationMethod } from "@/db/schema/partners";
import { sha256Hex } from "@/lib/crypto";
import { toMinorUnits } from "@/lib/format";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { sanitizeRichText } from "@/lib/sanitize";
import { audit } from "@/modules/audit";
import { requireUploadedFile } from "@/modules/files";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import { notifyOrganization } from "@/modules/notifications";

import { assertStaff, authorizeOrg, isMemberActor, ORG_PERMISSION, type OrgActor } from "./access";
import { PARTNER_LICENCE_TYPE_LABELS } from "./constants";
import { forbiddenError, invalidStateError, notFoundError, validationError, withConstraintMessages } from "./errors";
import { omit } from "./objects";
import { ORG_PROFILE_PATH } from "./paths";
import type { PartnerLicenceRow, PartnerProfileRow, PartnerTerritoryRow } from "./readiness";
import { evaluatePartnerLicenceRequirement, hasValidVerification, toIsoDate } from "./rules";
import type { PartnerAgreementInput, PartnerLicenceInput, PartnerProfileInput, PartnerTerritoryInput } from "./schemas";
import { assertCountryExists } from "./service";

export type PartnerAgreementRow = typeof partnerAgreements.$inferSelect;

const PARTNER_ONLY = ["recruitment_partner"] as const;
const PROFILE_RULE = { member: ORG_PERMISSION.profile, staff: "orgs.manage" as const, types: PARTNER_ONLY };

/** Partner-facing view of the profile: internal quality score and staff notes are removed. */
export type PartnerProfileView = Omit<PartnerProfileRow, "qualityScore" | "qualityScoreUpdatedAt" | "statusNotes"> & {
  qualityScore?: number | null;
  qualityScoreUpdatedAt?: Date | null;
  statusNotes?: string | null;
};
/** Partner-facing licence: staff review notes removed. */
export type PartnerLicenceView = Omit<PartnerLicenceRow, "notes"> & { notes?: string | null };
export type PartnerTerritoryView = Omit<PartnerTerritoryRow, "notes"> & { notes?: string | null };
export type LicenceReviewItem = PartnerLicenceRow & { organizationName: string; organizationSlug: string };

export function normalizeLicenceNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function getPartnerProfile(actor: OrgActor, organizationId: string): Promise<PartnerProfileView | null> {
  const access = await authorizeOrg(actor, organizationId, { member: "any", staff: ["orgs.view", "partners.view"], staffMode: "any", types: PARTNER_ONLY });
  const [row] = await db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, organizationId)).limit(1);
  if (!row) return null;
  if (access.via === "staff") return row;
  return omit(row, ["qualityScore", "qualityScoreUpdatedAt", "statusNotes"]);
}

/**
 * Update the agency profile (partner.profile.manage / staff orgs.manage). A verified partner cannot
 * declare regulated (overseas) recruitment without a verified, active recruitment licence on record.
 */
export async function updatePartnerProfile(actor: OrgActor, organizationId: string, input: PartnerProfileInput): Promise<void> {
  await db.transaction(async (tx) => {
    const access = await authorizeOrg(actor, organizationId, PROFILE_RULE, { tx, lock: true });
    const org = access.organization;
    if (input.industryIds.length) {
      const found = await tx.select({ id: industries.id }).from(industries).where(inArray(industries.id, input.industryIds));
      if (found.length !== input.industryIds.length) throw validationError("Choose valid industries.", { industryIds: ["Choose valid industries"] });
    }
    if (hasValidVerification(org, new Date())) {
      const licences = await tx.select().from(partnerLicences).where(and(eq(partnerLicences.organizationId, org.id), isNull(partnerLicences.deletedAt)));
      const territories = await tx
        .select({ countryCode: partnerTerritories.countryCode, scope: partnerTerritories.scope })
        .from(partnerTerritories)
        .where(eq(partnerTerritories.organizationId, org.id));
      const check = evaluatePartnerLicenceRequirement({
        homeCountryCode: org.countryCode,
        businessType: input.businessType ?? null,
        servicesProvided: input.servicesProvided,
        territories,
        licences,
        today: toIsoDate(new Date()),
        stage: "approval",
      });
      if (check.required && !check.satisfied) {
        throw validationError("Add your recruitment licence and have it verified before declaring overseas recruitment services.", {
          servicesProvided: ["A verified recruitment licence is required for these services"],
        });
      }
    }
    const values = {
      businessType: input.businessType ?? null,
      servicesProvided: input.servicesProvided,
      yearsInOperation: input.yearsInOperation ?? null,
      specialisations: input.specialisations,
      industryIds: input.industryIds,
      placementsClaimed: input.placementsClaimed ?? null,
    };
    await tx
      .insert(partnerProfiles)
      .values({ organizationId: org.id, ...values })
      .onConflictDoUpdate({ target: partnerProfiles.organizationId, set: values });
    await audit({
      action: "partner.profile_updated",
      entityType: "organization",
      entityId: org.id,
      organizationId: org.id,
      actorUserId: access.actorUserId,
      metadata: { businessType: values.businessType, servicesProvided: values.servicesProvided },
      tx,
    });
  });
}

/** Staff-only notes on a partner's standing (partners.manage). Never shown to the partner. */
export async function setPartnerStatusNotes(staff: StaffContext, organizationId: string, statusNotes: string | null): Promise<void> {
  assertStaff(staff, "partners.manage");
  await db.transaction(async (tx) => {
    await authorizeOrg(staff, organizationId, { member: null, staff: "partners.manage", types: PARTNER_ONLY }, { tx });
    await tx
      .insert(partnerProfiles)
      .values({ organizationId, statusNotes })
      .onConflictDoUpdate({ target: partnerProfiles.organizationId, set: { statusNotes } });
    await audit({ action: "partner.status_notes_updated", entityType: "organization", entityId: organizationId, organizationId, actorUserId: staff.user.id, actorType: "staff", tx });
  });
}

// ---------------------------------------------------------------------------
// Licences
// ---------------------------------------------------------------------------

function licenceValues(input: PartnerLicenceInput) {
  return {
    licenceType: input.licenceType,
    licenceNumber: normalizeLicenceNumber(input.licenceNumber),
    issuingAuthority: input.issuingAuthority ?? null,
    issuingCountryCode: input.issuingCountryCode,
    issuingRegion: input.issuingRegion ?? null,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    details: {
      ...(input.holderName ? { holderName: input.holderName } : {}),
      ...(input.registeredAddress ? { registeredAddress: input.registeredAddress } : {}),
      ...(input.authorisedActivities.length ? { authorisedActivities: input.authorisedActivities } : {}),
      ...(input.branchOffices.length ? { branchOffices: input.branchOffices } : {}),
    },
  };
}

const LICENCE_CONSTRAINTS = {
  partner_licences_org_number_uq: "This licence is already recorded for your organisation.",
  partner_licences_india_ra_country_chk: "Recruiting Agent registrations are issued in India.",
  partner_licences_foreign_country_chk: "Choose the country outside India that issued the licence.",
  partner_licences_validity_chk: "The licence must end after it starts.",
};

export async function listPartnerLicences(actor: OrgActor, organizationId: string): Promise<PartnerLicenceView[]> {
  const access = await authorizeOrg(actor, organizationId, { member: "any", staff: ["orgs.view", "partners.view"], staffMode: "any", types: PARTNER_ONLY });
  const rows = await db
    .select()
    .from(partnerLicences)
    .where(and(eq(partnerLicences.organizationId, organizationId), isNull(partnerLicences.deletedAt)))
    .orderBy(asc(partnerLicences.createdAt));
  if (access.via === "staff") return rows;
  return rows.map((row) => omit(row, ["notes"]));
}

/** Record a licence (pending staff verification). The scan must be a partner_licence / org_document file of this organisation. */
export async function addPartnerLicence(actor: OrgActor, organizationId: string, input: PartnerLicenceInput): Promise<PartnerLicenceRow> {
  return withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const access = await authorizeOrg(actor, organizationId, { ...PROFILE_RULE, staff: ["orgs.manage", "orgs.verify"], staffMode: "any" }, { tx });
        await assertCountryExists(tx, input.issuingCountryCode, "issuingCountryCode");
        const fileId = input.fileId
          ? (await requireUploadedFile(input.fileId, { purposes: ["partner_licence", "org_document"], organizationId, ownerUserId: access.actorUserId }, tx)).id
          : null;
        const [row] = await tx
          .insert(partnerLicences)
          .values({ organizationId, ...licenceValues(input), fileId, verificationStatus: "pending", submittedByUserId: access.actorUserId })
          .returning();
        await audit({
          action: "partner.licence_added",
          entityType: "partner_licence",
          entityId: row!.id,
          organizationId,
          actorUserId: access.actorUserId,
          metadata: { licenceType: row!.licenceType, issuingCountryCode: row!.issuingCountryCode, validUntil: row!.validUntil },
          tx,
        });
        return row!;
      }),
    LICENCE_CONSTRAINTS,
  );
}

async function loadLicenceForUpdate(tx: DbOrTx, licenceId: string): Promise<PartnerLicenceRow> {
  const [row] = await tx
    .select()
    .from(partnerLicences)
    .where(and(eq(partnerLicences.id, licenceId), isNull(partnerLicences.deletedAt)))
    .limit(1)
    .for("update");
  if (!row) throw notFoundError("Licence not found.");
  return row;
}

/**
 * Update a licence. Partner edits (including renewals of a verified or expired licence) send it back to
 * pending review; staff corrections (orgs.verify) keep the current verification status.
 */
export async function updatePartnerLicence(actor: OrgActor, licenceId: string, input: PartnerLicenceInput): Promise<void> {
  await withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const licence = await loadLicenceForUpdate(tx, licenceId);
        const access = await authorizeOrg(actor, licence.organizationId, { ...PROFILE_RULE, staff: "orgs.verify" }, { tx });
        await assertCountryExists(tx, input.issuingCountryCode, "issuingCountryCode");
        let fileId = licence.fileId;
        if (input.fileId && input.fileId !== licence.fileId) {
          fileId = (await requireUploadedFile(input.fileId, { purposes: ["partner_licence", "org_document"], organizationId: licence.organizationId, ownerUserId: access.actorUserId }, tx)).id;
        }
        const resetReview = access.via === "member";
        await tx
          .update(partnerLicences)
          .set({
            ...licenceValues(input),
            fileId,
            ...(resetReview
              ? { verificationStatus: "pending" as const, verificationMethod: null, verifiedAt: null, verifiedByUserId: null, rejectionReason: null, expiryReminderSentAt: null, submittedByUserId: access.actorUserId }
              : {}),
          })
          .where(eq(partnerLicences.id, licence.id));
        await audit({
          action: "partner.licence_updated",
          entityType: "partner_licence",
          entityId: licence.id,
          organizationId: licence.organizationId,
          actorUserId: access.actorUserId,
          actorType: access.via === "staff" ? "staff" : "user",
          metadata: { previousStatus: licence.verificationStatus, resetReview, validUntil: input.validUntil ?? null },
          tx,
        });
      }),
    LICENCE_CONSTRAINTS,
  );
}

/** Remove a licence record (soft delete). Partners cannot remove a verified licence; staff (orgs.manage) can. */
export async function deletePartnerLicence(actor: OrgActor, licenceId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const licence = await loadLicenceForUpdate(tx, licenceId);
    const access = await authorizeOrg(actor, licence.organizationId, PROFILE_RULE, { tx });
    if (access.via === "member" && licence.verificationStatus === "verified") {
      throw forbiddenError("A verified licence can only be removed by Venkat Sai. Contact support, or upload a renewal instead.");
    }
    await tx.update(partnerLicences).set({ deletedAt: new Date() }).where(eq(partnerLicences.id, licence.id));
    await audit({
      action: "partner.licence_deleted",
      entityType: "partner_licence",
      entityId: licence.id,
      organizationId: licence.organizationId,
      actorUserId: access.actorUserId,
      metadata: { licenceType: licence.licenceType, status: licence.verificationStatus },
      tx,
    });
  });
}

async function notifyLicenceDecision(tx: DbOrTx, licence: PartnerLicenceRow, decision: "verified" | "rejected" | "expired", reason: string | null): Promise<void> {
  await notifyOrganization(
    {
      event: "partner.licence_reviewed",
      organizationId: licence.organizationId,
      permission: ORG_PERMISSION.profile.recruitment_partner,
      data: { licenceType: PARTNER_LICENCE_TYPE_LABELS[licence.licenceType], licenceNumber: licence.licenceNumber, decision, reason },
      link: ORG_PROFILE_PATH.recruitment_partner,
    },
    { tx },
  );
}

/** Staff (orgs.verify) verify a licence against its scan / the issuer's registry. */
export async function verifyPartnerLicence(
  staff: StaffContext,
  input: { licenceId: string; method: PartnerLicenceVerificationMethod; notes?: string | null },
  now: Date = new Date(),
): Promise<void> {
  assertStaff(staff, "orgs.verify");
  await db.transaction(async (tx) => {
    const licence = await loadLicenceForUpdate(tx, input.licenceId);
    if (!licence.fileId) throw invalidStateError("Ask the partner to upload the licence scan before verifying it.");
    if (licence.validUntil && licence.validUntil < toIsoDate(now)) throw invalidStateError("This licence has expired. Ask the partner to upload the renewal.");
    await tx
      .update(partnerLicences)
      .set({
        verificationStatus: "verified",
        verificationMethod: input.method,
        verifiedByUserId: staff.user.id,
        verifiedAt: now,
        rejectionReason: null,
        notes: input.notes ?? licence.notes,
      })
      .where(eq(partnerLicences.id, licence.id));
    await notifyLicenceDecision(tx, licence, "verified", null);
    await audit({
      action: "partner.licence_verified",
      entityType: "partner_licence",
      entityId: licence.id,
      organizationId: licence.organizationId,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { method: input.method },
      tx,
    });
  });
}

/** Staff (orgs.verify) reject a licence; the reason is shown to the partner. */
export async function rejectPartnerLicence(staff: StaffContext, input: { licenceId: string; reason: string; notes?: string | null }): Promise<void> {
  assertStaff(staff, "orgs.verify");
  await db.transaction(async (tx) => {
    const licence = await loadLicenceForUpdate(tx, input.licenceId);
    await tx
      .update(partnerLicences)
      .set({ verificationStatus: "rejected", rejectionReason: input.reason, verifiedAt: null, verifiedByUserId: staff.user.id, verificationMethod: null, notes: input.notes ?? licence.notes })
      .where(eq(partnerLicences.id, licence.id));
    await notifyLicenceDecision(tx, licence, "rejected", input.reason);
    await audit({
      action: "partner.licence_rejected",
      entityType: "partner_licence",
      entityId: licence.id,
      organizationId: licence.organizationId,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { reason: input.reason, previousStatus: licence.verificationStatus },
      tx,
    });
  });
}

/** Staff (orgs.verify) mark a licence expired (also done automatically once validUntil passes). */
export async function expirePartnerLicence(staff: StaffContext, input: { licenceId: string; notes?: string | null }): Promise<void> {
  assertStaff(staff, "orgs.verify");
  await db.transaction(async (tx) => {
    const licence = await loadLicenceForUpdate(tx, input.licenceId);
    if (licence.verificationStatus === "expired") return;
    await tx.update(partnerLicences).set({ verificationStatus: "expired", notes: input.notes ?? licence.notes }).where(eq(partnerLicences.id, licence.id));
    await notifyLicenceDecision(tx, licence, "expired", null);
    await audit({
      action: "partner.licence_expired",
      entityType: "partner_licence",
      entityId: licence.id,
      organizationId: licence.organizationId,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { manual: true },
      tx,
    });
  });
}

/** Staff review queue of licences (orgs.verify or orgs.view), newest first. */
export async function listLicencesForReview(
  staff: StaffContext,
  filters: { status?: PartnerLicenceRow["verificationStatus"] },
  page: PageQuery,
): Promise<Paginated<LicenceReviewItem>> {
  assertStaff(staff, ["orgs.verify", "orgs.view"], "any");
  const where: SQL[] = [isNull(partnerLicences.deletedAt), isNull(organizations.deletedAt)];
  if (filters.status) where.push(eq(partnerLicences.verificationStatus, filters.status));
  const condition = and(...where);
  const [rows, total] = await Promise.all([
    db
      .select({ licence: partnerLicences, organizationName: organizations.name, organizationSlug: organizations.slug })
      .from(partnerLicences)
      .innerJoin(organizations, eq(organizations.id, partnerLicences.organizationId))
      .where(condition)
      .orderBy(desc(partnerLicences.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(partnerLicences).innerJoin(organizations, eq(organizations.id, partnerLicences.organizationId)).where(condition),
  ]);
  return paginated(
    rows.map((r) => ({ ...r.licence, organizationName: r.organizationName, organizationSlug: r.organizationSlug })),
    total[0]?.value ?? 0,
    page,
  );
}

// ---------------------------------------------------------------------------
// Agreements
// ---------------------------------------------------------------------------

async function commercialTermsFromInput(tx: DbOrTx, input: PartnerAgreementInput["commercialTerms"]): Promise<PartnerAgreementRow["commercialTerms"]> {
  if (!input) return {};
  if (input.currency) {
    const [currency] = await tx.select({ code: currencies.code }).from(currencies).where(eq(currencies.code, input.currency)).limit(1);
    if (!currency) throw validationError("Choose a valid currency.", { "commercialTerms.currency": ["Choose a valid currency"] });
  }
  return {
    ...(input.feeModel ? { feeModel: input.feeModel } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.amount !== undefined && input.currency ? { amountMinor: toMinorUnits(input.amount, input.currency) } : {}),
    ...(input.rateBasisPoints !== undefined ? { rateBasisPoints: input.rateBasisPoints } : {}),
    ...(input.payableAfterJoiningDays !== undefined ? { payableAfterJoiningDays: input.payableAfterJoiningDays } : {}),
    ...(input.replacementWindowDays !== undefined ? { replacementWindowDays: input.replacementWindowDays } : {}),
    ...(input.paymentTermsDays !== undefined ? { paymentTermsDays: input.paymentTermsDays } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

async function issueAgreementInTx(tx: DbOrTx, staff: StaffContext, organizationId: string, input: PartnerAgreementInput, termsSnapshot: string): Promise<PartnerAgreementRow> {
  const { organization: org } = await authorizeOrg(staff, organizationId, { member: null, staff: "partners.manage", types: PARTNER_ONLY }, { tx, lock: true });
  const documentFileId = input.documentFileId
    ? (await requireUploadedFile(input.documentFileId, { purposes: ["org_document"], organizationId, ownerUserId: staff.user.id }, tx)).id
    : null;
  const [row] = await tx
    .insert(partnerAgreements)
    .values({
      organizationId,
      version: input.version,
      title: input.title,
      termsSnapshot,
      termsSha256: sha256Hex(termsSnapshot),
      commercialTerms: await commercialTermsFromInput(tx, input.commercialTerms),
      documentFileId,
      status: "pending",
      issuedByUserId: staff.user.id,
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveUntil: input.effectiveUntil ?? null,
    })
    .returning();
  // An unaccepted older offer is replaced by the new version.
  await tx
    .update(partnerAgreements)
    .set({ status: "superseded", supersededByAgreementId: row!.id })
    .where(and(eq(partnerAgreements.organizationId, organizationId), eq(partnerAgreements.status, "pending"), ne(partnerAgreements.id, row!.id)));
  await notifyOrganization(
    {
      event: "partner.agreement_issued",
      organizationId,
      permission: ORG_PERMISSION.profile.recruitment_partner,
      data: { organizationName: org.name, version: row!.version, title: row!.title },
      link: ORG_PROFILE_PATH.recruitment_partner,
    },
    { tx },
  );
  await audit({
    action: "partner.agreement_issued",
    entityType: "partner_agreement",
    entityId: row!.id,
    organizationId,
    actorUserId: staff.user.id,
    actorType: "staff",
    metadata: { version: row!.version, termsSha256: row!.termsSha256 },
    tx,
  });
  return row!;
}

/**
 * Staff (partners.manage) issue a versioned agreement to one partner: the sanitised terms are frozen
 * with their SHA-256 and the partner is asked to accept. An older pending offer is superseded.
 */
export async function issuePartnerAgreement(staff: StaffContext, organizationId: string, input: PartnerAgreementInput): Promise<PartnerAgreementRow> {
  assertStaff(staff, "partners.manage");
  const termsSnapshot = sanitizeRichText(input.termsHtml);
  if (!termsSnapshot) throw validationError("Enter the agreement text.", { termsHtml: ["Enter the agreement text"] });
  return withConstraintMessages(() => db.transaction((tx) => issueAgreementInTx(tx, staff, organizationId, input, termsSnapshot)), {
    partner_agreements_org_version_uq: "This version was already issued to this partner. Use a new version label.",
  });
}

/**
 * Publish one agreement version to many partners (default: every verified partner). Partners that
 * already received this version are skipped.
 */
export async function issuePartnerAgreementToPartners(
  staff: StaffContext,
  input: PartnerAgreementInput,
  opts: { organizationIds?: string[] } = {},
): Promise<{ issued: number; skipped: number }> {
  assertStaff(staff, "partners.manage");
  const termsSnapshot = sanitizeRichText(input.termsHtml);
  if (!termsSnapshot) throw validationError("Enter the agreement text.", { termsHtml: ["Enter the agreement text"] });
  return db.transaction(async (tx) => {
    const targets = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        and(
          eq(organizations.type, "recruitment_partner"),
          isNull(organizations.deletedAt),
          opts.organizationIds?.length ? inArray(organizations.id, opts.organizationIds) : eq(organizations.status, "verified"),
        ),
      );
    const already = targets.length
      ? await tx
          .select({ organizationId: partnerAgreements.organizationId })
          .from(partnerAgreements)
          .where(and(eq(partnerAgreements.version, input.version), inArray(partnerAgreements.organizationId, targets.map((t) => t.id))))
      : [];
    const skip = new Set(already.map((a) => a.organizationId));
    let issued = 0;
    for (const target of targets) {
      if (skip.has(target.id)) continue;
      await issueAgreementInTx(tx, staff, target.id, input, termsSnapshot);
      issued += 1;
    }
    return { issued, skipped: skip.size };
  });
}

export async function listPartnerAgreements(actor: OrgActor, organizationId: string): Promise<PartnerAgreementRow[]> {
  await authorizeOrg(actor, organizationId, { member: "any", staff: ["partners.view", "orgs.view"], staffMode: "any", types: PARTNER_ONLY });
  return db.select().from(partnerAgreements).where(eq(partnerAgreements.organizationId, organizationId)).orderBy(desc(partnerAgreements.issuedAt));
}

/** The agreement in force for a partner, if any (used by assignment rules in other modules). */
export async function getActivePartnerAgreement(organizationId: string, tx: DbOrTx = db): Promise<PartnerAgreementRow | null> {
  const [row] = await tx
    .select()
    .from(partnerAgreements)
    .where(and(eq(partnerAgreements.organizationId, organizationId), eq(partnerAgreements.status, "active")))
    .limit(1);
  return row ?? null;
}

/**
 * Accept a pending agreement (partner.profile.manage). The previously active agreement is superseded,
 * so exactly one agreement stays in force. Evidence: user, typed name, time, hashed IP and user agent.
 */
export async function acceptPartnerAgreement(
  ctx: OrgContext,
  input: { agreementId: string; acceptedByName: string },
  evidence: { ipHash: string | null; userAgent: string | null },
  now: Date = new Date(),
): Promise<void> {
  if (!isMemberActor(ctx)) throw forbiddenError();
  await db.transaction(async (tx) => {
    const access = await authorizeOrg(ctx, ctx.organization.id, { member: ORG_PERMISSION.profile, staff: null, types: PARTNER_ONLY }, { tx, lock: true });
    const [agreement] = await tx
      .select()
      .from(partnerAgreements)
      .where(and(eq(partnerAgreements.id, input.agreementId), eq(partnerAgreements.organizationId, access.organization.id)))
      .limit(1)
      .for("update");
    if (!agreement) throw notFoundError("Agreement not found.");
    if (agreement.status !== "pending") throw invalidStateError("This agreement is no longer open for acceptance.");
    const today = toIsoDate(now);
    if (agreement.effectiveUntil && agreement.effectiveUntil < today) throw invalidStateError("This agreement offer has expired. Ask Venkat Sai for a current version.");
    if (sha256Hex(agreement.termsSnapshot) !== agreement.termsSha256) throw invalidStateError("This agreement could not be verified. Contact Venkat Sai support.");

    await tx
      .update(partnerAgreements)
      .set({ status: "superseded", supersededByAgreementId: agreement.id })
      .where(and(eq(partnerAgreements.organizationId, agreement.organizationId), eq(partnerAgreements.status, "active")));
    await tx
      .update(partnerAgreements)
      .set({
        status: "active",
        acceptedByUserId: ctx.user.id,
        acceptedByName: input.acceptedByName.trim(),
        acceptedAt: now,
        ipHash: evidence.ipHash,
        userAgent: evidence.userAgent?.slice(0, 400) ?? null,
        effectiveFrom: agreement.effectiveFrom ?? today,
      })
      .where(eq(partnerAgreements.id, agreement.id));
    await audit({
      action: "partner.agreement_accepted",
      entityType: "partner_agreement",
      entityId: agreement.id,
      organizationId: agreement.organizationId,
      actorUserId: ctx.user.id,
      metadata: { version: agreement.version, termsSha256: agreement.termsSha256 },
      tx,
    });
  });
}

/** Staff (partners.manage) terminate an agreement with a reason. */
export async function terminatePartnerAgreement(staff: StaffContext, input: { agreementId: string; reason: string }): Promise<void> {
  assertStaff(staff, "partners.manage");
  await db.transaction(async (tx) => {
    const [agreement] = await tx.select().from(partnerAgreements).where(eq(partnerAgreements.id, input.agreementId)).limit(1).for("update");
    if (!agreement) throw notFoundError("Agreement not found.");
    if (agreement.status !== "active" && agreement.status !== "pending") throw invalidStateError("Only a pending or active agreement can be terminated.");
    await tx
      .update(partnerAgreements)
      .set({ status: "terminated", terminatedAt: new Date(), terminationReason: input.reason })
      .where(eq(partnerAgreements.id, agreement.id));
    await audit({
      action: "partner.agreement_terminated",
      entityType: "partner_agreement",
      entityId: agreement.id,
      organizationId: agreement.organizationId,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { reason: input.reason, previousStatus: agreement.status },
      tx,
    });
  });
}

// ---------------------------------------------------------------------------
// Territories
// ---------------------------------------------------------------------------

export async function listPartnerTerritories(actor: OrgActor, organizationId: string): Promise<PartnerTerritoryView[]> {
  const access = await authorizeOrg(actor, organizationId, { member: "any", staff: ["orgs.view", "partners.view"], staffMode: "any", types: PARTNER_ONLY });
  const rows = await db.select().from(partnerTerritories).where(eq(partnerTerritories.organizationId, organizationId)).orderBy(asc(partnerTerritories.countryCode));
  if (access.via === "staff") return rows;
  return rows.map((row) => omit(row, ["notes"]));
}

const TERRITORY_CONSTRAINTS = { partner_territories_org_area_uq: "This territory is already listed." };

export async function addPartnerTerritory(actor: OrgActor, organizationId: string, input: PartnerTerritoryInput): Promise<PartnerTerritoryRow> {
  return withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const access = await authorizeOrg(actor, organizationId, { ...PROFILE_RULE, staff: "partners.manage" }, { tx });
        await assertCountryExists(tx, input.countryCode);
        const [row] = await tx
          .insert(partnerTerritories)
          .values({ organizationId, countryCode: input.countryCode, stateRegion: input.stateRegion ?? null, scope: input.scope })
          .returning();
        await audit({
          action: "partner.territory_added",
          entityType: "partner_territory",
          entityId: row!.id,
          organizationId,
          actorUserId: access.actorUserId,
          metadata: { countryCode: input.countryCode, stateRegion: input.stateRegion ?? null, scope: input.scope },
          tx,
        });
        return row!;
      }),
    TERRITORY_CONSTRAINTS,
  );
}

/** Change a territory's scope / region; a change clears the staff authorisation. */
export async function updatePartnerTerritory(actor: OrgActor, territoryId: string, input: PartnerTerritoryInput): Promise<void> {
  await withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const [territory] = await tx.select().from(partnerTerritories).where(eq(partnerTerritories.id, territoryId)).limit(1).for("update");
        if (!territory) throw notFoundError("Territory not found.");
        const access = await authorizeOrg(actor, territory.organizationId, { ...PROFILE_RULE, staff: "partners.manage" }, { tx });
        await assertCountryExists(tx, input.countryCode);
        const changed = territory.countryCode !== input.countryCode || (territory.stateRegion ?? null) !== (input.stateRegion ?? null) || territory.scope !== input.scope;
        if (!changed) return;
        await tx
          .update(partnerTerritories)
          .set({ countryCode: input.countryCode, stateRegion: input.stateRegion ?? null, scope: input.scope, isAuthorised: false, authorisedAt: null, authorisedByUserId: null })
          .where(eq(partnerTerritories.id, territory.id));
        await audit({
          action: "partner.territory_updated",
          entityType: "partner_territory",
          entityId: territory.id,
          organizationId: territory.organizationId,
          actorUserId: access.actorUserId,
          metadata: { countryCode: input.countryCode, scope: input.scope },
          tx,
        });
      }),
    TERRITORY_CONSTRAINTS,
  );
}

export async function removePartnerTerritory(actor: OrgActor, territoryId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [territory] = await tx.select().from(partnerTerritories).where(eq(partnerTerritories.id, territoryId)).limit(1).for("update");
    if (!territory) throw notFoundError("Territory not found.");
    const access = await authorizeOrg(actor, territory.organizationId, { ...PROFILE_RULE, staff: "partners.manage" }, { tx });
    await tx.delete(partnerTerritories).where(eq(partnerTerritories.id, territory.id));
    await audit({
      action: "partner.territory_removed",
      entityType: "partner_territory",
      entityId: territory.id,
      organizationId: territory.organizationId,
      actorUserId: access.actorUserId,
      metadata: { countryCode: territory.countryCode, scope: territory.scope },
      tx,
    });
  });
}

/** Staff (partners.manage) confirm that the partner's licences cover a territory (or withdraw it). */
export async function setTerritoryAuthorisation(staff: StaffContext, input: { territoryId: string; isAuthorised: boolean; notes?: string | null }): Promise<void> {
  assertStaff(staff, "partners.manage");
  await db.transaction(async (tx) => {
    const [territory] = await tx.select().from(partnerTerritories).where(eq(partnerTerritories.id, input.territoryId)).limit(1).for("update");
    if (!territory) throw notFoundError("Territory not found.");
    await tx
      .update(partnerTerritories)
      .set({
        isAuthorised: input.isAuthorised,
        authorisedAt: input.isAuthorised ? new Date() : null,
        authorisedByUserId: input.isAuthorised ? staff.user.id : null,
        notes: input.notes ?? territory.notes,
      })
      .where(eq(partnerTerritories.id, territory.id));
    await audit({
      action: input.isAuthorised ? "partner.territory_authorised" : "partner.territory_unauthorised",
      entityType: "partner_territory",
      entityId: territory.id,
      organizationId: territory.organizationId,
      actorUserId: staff.user.id,
      actorType: "staff",
      tx,
    });
  });
}
