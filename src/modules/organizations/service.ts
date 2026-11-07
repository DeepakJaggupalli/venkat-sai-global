import "server-only";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { ORG_OWNER_ROLE_KEY } from "@/config/permissions";
import { db, type DbOrTx } from "@/db";
import {
  companyProfiles,
  countries,
  industries,
  institutionProfiles,
  organizationDocuments,
  organizationMembers,
  organizations,
  organizationVerifications,
  partnerLicences,
  partnerProfiles,
  roles,
} from "@/db/schema";
import type { OrgType } from "@/db/schema/_constants";
import { uniqueSlug } from "@/lib/http";
import { trackServer } from "@/modules/analytics/server";
import { cancelApprovalsForEntity, submitForApproval } from "@/modules/approvals/service";
import { audit } from "@/modules/audit";
import { requireUploadedFile, setFileVisibility, softDeleteFile } from "@/modules/files";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import type { SessionUser } from "@/modules/identity/session";
import { notifyOrganization } from "@/modules/notifications";

import { assertStaff, authorizeOrg, ORG_PERMISSION, type OrganizationRow, type OrgActor } from "./access";
import { ORG_TYPE_LABELS } from "./constants";
import { forbiddenError, invalidStateError, notFoundError, validationError, withConstraintMessages } from "./errors";
import { adminOrganizationPath, ORG_PROFILE_PATH } from "./paths";
import { loadVerificationContext, type OrganizationDocumentRow } from "./readiness";
import { isCurrentDocument, statusAfterReactivation, verificationSubmissionCheck } from "./rules";
import type { OrganizationDetailsInput, OrganizationDocumentInput, ReviewOrganizationDocumentInput } from "./schemas";
import { VERIFICATION_APPROVAL_TYPE, type VerificationApprovalPayload } from "./verification-decisions";

/** Statuses in which members can no longer change the identity details reviewers verified. */
const IDENTITY_LOCKED_STATUSES = new Set(["pending", "under_review", "verified", "suspended"]);
const IDENTITY_FIELDS = ["name", "legalName", "registrationNumber", "taxId", "countryCode"] as const;

export type OrganizationOwner = Pick<SessionUser, "id" | "status">;

// ---------------------------------------------------------------------------
// Validation helpers (reference data)
// ---------------------------------------------------------------------------

export async function assertCountryExists(tx: DbOrTx, code: string | null | undefined, field = "countryCode"): Promise<void> {
  if (!code) return;
  const [row] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, code)).limit(1);
  if (!row) throw validationError("Choose a valid country.", { [field]: ["Choose a valid country"] });
}

async function assertIndustryExists(tx: DbOrTx, id: string | null | undefined): Promise<void> {
  if (!id) return;
  const [row] = await tx.select({ id: industries.id }).from(industries).where(eq(industries.id, id)).limit(1);
  if (!row) throw validationError("Choose a valid industry.", { industryId: ["Choose a valid industry"] });
}

function detailsToColumns(input: OrganizationDetailsInput) {
  return {
    name: input.name,
    legalName: input.legalName ?? null,
    description: input.description ?? null,
    websiteUrl: input.websiteUrl ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    industryId: input.industryId ?? null,
    countryCode: input.countryCode,
    stateRegion: input.stateRegion ?? null,
    city: input.city ?? null,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    postalCode: input.postalCode ?? null,
    registrationNumber: input.registrationNumber ?? null,
    taxId: input.taxId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

/**
 * Create an organisation of `type` (status draft) owned by `owner`: unique slug, owner membership with
 * the "owner" template role of that scope, and the empty type profile row
 * (company_profiles / partner_profiles / institution_profiles). Audited.
 */
export async function createOrganization(
  type: OrgType,
  input: OrganizationDetailsInput,
  owner: OrganizationOwner,
  opts: { createdByUserId?: string | null } = {},
): Promise<OrganizationRow> {
  if (owner.status !== "active") throw forbiddenError("Your account must be active to create an organisation.");
  return withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        await assertCountryExists(tx, input.countryCode);
        await assertIndustryExists(tx, input.industryId);
        const [ownerRole] = await tx
          .select({ id: roles.id })
          .from(roles)
          .where(and(eq(roles.scope, type), eq(roles.key, ORG_OWNER_ROLE_KEY), isNull(roles.organizationId)))
          .limit(1);
        if (!ownerRole) throw new Error(`The "${ORG_OWNER_ROLE_KEY}" role template for ${type} is missing. Run npm run db:seed.`);

        const slug = await uniqueSlug(input.name, async (candidate) => {
          const rows = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, candidate)).limit(1);
          return rows.length > 0;
        });
        const now = new Date();
        const [org] = await tx
          .insert(organizations)
          .values({ type, slug, status: "draft", createdByUserId: opts.createdByUserId ?? owner.id, ...detailsToColumns(input) })
          .returning();
        await tx.insert(organizationMembers).values({ organizationId: org!.id, userId: owner.id, roleId: ownerRole.id, status: "active", joinedAt: now, lastActiveAt: now });
        if (type === "employer") await tx.insert(companyProfiles).values({ organizationId: org!.id });
        else if (type === "recruitment_partner") await tx.insert(partnerProfiles).values({ organizationId: org!.id });
        else await tx.insert(institutionProfiles).values({ organizationId: org!.id });

        await audit({
          action: "organization.created",
          entityType: "organization",
          entityId: org!.id,
          organizationId: org!.id,
          actorUserId: opts.createdByUserId ?? owner.id,
          metadata: { type, name: org!.name, slug, ownerUserId: owner.id },
          tx,
        });
        return org!;
      }),
    { organizations_slug_uq: "Another organisation was created with the same name at the same moment. Please try again." },
  );
}

/**
 * Update organisation details (members with the profile permission of their type, or staff with
 * orgs.manage). While a verification is pending or granted, members cannot change the verified identity
 * fields (name, legal name, registration number, tax id, country) — staff can, and it is audited.
 */
export async function updateOrganization(actor: OrgActor, organizationId: string, input: OrganizationDetailsInput): Promise<OrganizationRow> {
  return db.transaction(async (tx) => {
    const access = await authorizeOrg(actor, organizationId, { member: ORG_PERMISSION.profile, staff: "orgs.manage" }, { tx, lock: true });
    const org = access.organization;
    const next = detailsToColumns(input);
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => (org[k] ?? null) !== (next[k] ?? null));
    if (!changed.length) return org;

    if (access.via === "member" && IDENTITY_LOCKED_STATUSES.has(org.status)) {
      const locked = IDENTITY_FIELDS.filter((k) => changed.includes(k));
      if (locked.length) {
        throw validationError(
          "Verified details cannot be changed while your verification is pending or active. Contact Venkat Sai support to update them.",
          Object.fromEntries(locked.map((k) => [k, ["Contact support to change this verified detail"]])),
        );
      }
    }
    if (changed.includes("countryCode")) await assertCountryExists(tx, next.countryCode);
    if (changed.includes("industryId")) await assertIndustryExists(tx, next.industryId);

    const [updated] = await tx.update(organizations).set(next).where(eq(organizations.id, org.id)).returning();
    await audit({
      action: "organization.updated",
      entityType: "organization",
      entityId: org.id,
      organizationId: org.id,
      actorUserId: access.actorUserId,
      actorType: access.via === "staff" ? "staff" : "user",
      metadata: { changedFields: changed, via: access.via },
      tx,
    });
    return updated!;
  });
}

/** Set or clear the organisation logo (file purpose org_logo uploaded for this organisation or by the actor). */
export async function setOrganizationLogo(actor: OrgActor, organizationId: string, fileId: string | null): Promise<void> {
  await db.transaction(async (tx) => {
    const access = await authorizeOrg(actor, organizationId, { member: ORG_PERMISSION.profile, staff: "orgs.manage" }, { tx, lock: true });
    if (fileId) {
      const file = await requireUploadedFile(fileId, { purposes: ["org_logo"], organizationId, ownerUserId: access.actorUserId }, tx);
      if (file.visibility !== "public") await setFileVisibility(file.id, "public", { actorUserId: access.actorUserId, tx });
    }
    await tx.update(organizations).set({ logoFileId: fileId }).where(eq(organizations.id, organizationId));
    await audit({
      action: "organization.logo_updated",
      entityType: "organization",
      entityId: organizationId,
      organizationId,
      actorUserId: access.actorUserId,
      metadata: { fileId, previousFileId: access.organization.logoFileId },
      tx,
    });
  });
}

/** Turn the public organisation page on or off (it is shown only while the organisation is verified). */
export async function setOrganizationPublic(actor: OrgActor, organizationId: string, isPublic: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    const access = await authorizeOrg(actor, organizationId, { member: ORG_PERMISSION.profile, staff: "orgs.manage" }, { tx, lock: true });
    if (access.organization.isPublic === isPublic) return;
    await tx.update(organizations).set({ isPublic }).where(eq(organizations.id, organizationId));
    await audit({ action: "organization.visibility_changed", entityType: "organization", entityId: organizationId, organizationId, actorUserId: access.actorUserId, metadata: { isPublic }, tx });
  });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function isoDateToDate(value: string | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

/**
 * Attach a verification document. The file must be uploaded for this organisation (or by the actor)
 * with purpose org_document — or partner_licence for recruiting-agent licence scans.
 */
export async function addOrganizationDocument(actor: OrgActor, organizationId: string, input: OrganizationDocumentInput): Promise<OrganizationDocumentRow> {
  return db.transaction(async (tx) => {
    const access = await authorizeOrg(actor, organizationId, { member: ORG_PERMISSION.profile, staff: ["orgs.manage", "orgs.verify"], staffMode: "any" }, { tx });
    const purposes = input.documentType === "recruiting_agent_licence" ? (["org_document", "partner_licence"] as const) : (["org_document"] as const);
    const file = await requireUploadedFile(input.fileId, { purposes: [...purposes], organizationId, ownerUserId: access.actorUserId }, tx);
    const [row] = await tx
      .insert(organizationDocuments)
      .values({
        organizationId,
        documentType: input.documentType,
        title: input.title ?? null,
        fileId: file.id,
        documentNumber: input.documentNumber ?? null,
        issuedBy: input.issuedBy ?? null,
        issuedAt: isoDateToDate(input.issuedOn),
        expiresAt: isoDateToDate(input.expiresOn),
        uploadedByUserId: access.actorUserId,
      })
      .returning();
    await audit({
      action: "organization.document_added",
      entityType: "organization_document",
      entityId: row!.id,
      organizationId,
      actorUserId: access.actorUserId,
      metadata: { documentType: input.documentType, fileId: file.id, expiresOn: input.expiresOn ?? null },
      tx,
    });
    return row!;
  });
}

/**
 * Remove a document that is not part of a submitted, in-review or approved verification (those are
 * evidence; upload a newer document instead). The file is soft-deleted when nothing else uses it.
 */
export async function removeOrganizationDocument(actor: OrgActor, documentId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [doc] = await tx.select().from(organizationDocuments).where(eq(organizationDocuments.id, documentId)).limit(1).for("update");
    if (!doc) throw notFoundError("Document not found.");
    const access = await authorizeOrg(actor, doc.organizationId, { member: ORG_PERMISSION.profile, staff: "orgs.manage" }, { tx });
    if (doc.verificationId) {
      const [verification] = await tx
        .select({ status: organizationVerifications.status })
        .from(organizationVerifications)
        .where(eq(organizationVerifications.id, doc.verificationId))
        .limit(1);
      if (verification && ["submitted", "under_review", "approved"].includes(verification.status)) {
        throw invalidStateError("This document is part of a verification submission and cannot be removed. Upload a newer document instead.");
      }
    }
    await tx.delete(organizationDocuments).where(eq(organizationDocuments.id, doc.id));
    const [otherDoc] = await tx.select({ id: organizationDocuments.id }).from(organizationDocuments).where(eq(organizationDocuments.fileId, doc.fileId)).limit(1);
    const [licence] = await tx.select({ id: partnerLicences.id }).from(partnerLicences).where(eq(partnerLicences.fileId, doc.fileId)).limit(1);
    if (!otherDoc && !licence) await softDeleteFile(doc.fileId, { actorUserId: access.actorUserId, reason: "Organisation document removed", tx });
    await audit({
      action: "organization.document_removed",
      entityType: "organization_document",
      entityId: doc.id,
      organizationId: doc.organizationId,
      actorUserId: access.actorUserId,
      metadata: { documentType: doc.documentType, fileId: doc.fileId },
      tx,
    });
  });
}

/** Staff (orgs.verify) accept or reject one document with notes shown to the organisation. */
export async function reviewOrganizationDocument(staff: StaffContext, input: ReviewOrganizationDocumentInput): Promise<void> {
  assertStaff(staff, "orgs.verify");
  await db.transaction(async (tx) => {
    const [doc] = await tx.select().from(organizationDocuments).where(eq(organizationDocuments.id, input.documentId)).limit(1).for("update");
    if (!doc) throw notFoundError("Document not found.");
    await tx
      .update(organizationDocuments)
      .set({ reviewStatus: input.reviewStatus, reviewNotes: input.reviewNotes ?? null })
      .where(eq(organizationDocuments.id, doc.id));
    await audit({
      action: "organization.document_reviewed",
      entityType: "organization_document",
      entityId: doc.id,
      organizationId: doc.organizationId,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { reviewStatus: input.reviewStatus, previous: doc.reviewStatus },
      tx,
    });
  });
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type SubmitVerificationResult = { verificationId: string; approvalRequestId: string; approvalCode: string; renewal: boolean };

/**
 * Submit the organisation for verification (members with the profile permission). Checks the minimum
 * requirements (rules.evaluateVerificationReadiness: profile fields, documents per type and, for partners
 * that perform regulated recruitment, an active recruitment licence), records an organization_verifications
 * row linked to the current documents, sets the status to pending (renewals of a still-valid verification
 * keep "verified") and files an approval request (employer_ / partner_ / institution_verification) with a
 * snapshot of everything submitted.
 */
export async function submitVerification(ctx: OrgContext, now: Date = new Date()): Promise<SubmitVerificationResult> {
  const result = await db.transaction(async (tx) => {
    const access = await authorizeOrg(ctx, ctx.organization.id, { member: ORG_PERMISSION.profile, staff: null }, { tx, lock: true });
    const org = access.organization;
    const check = verificationSubmissionCheck(org.status);
    if (!check.allowed) throw invalidStateError(check.message);
    const renewal = check.renewal && (org.verificationExpiresAt === null || org.verificationExpiresAt.getTime() > now.getTime());

    const context = await loadVerificationContext(tx, org, now);
    if (!context.readiness.ready) {
      throw validationError(
        `Complete these items before submitting: ${context.readiness.issues.map((i) => i.message).join(" ")}`,
        { _form: context.readiness.issues.map((i) => i.message) },
      );
    }

    const [verification] = await tx
      .insert(organizationVerifications)
      .values({
        organizationId: org.id,
        status: "submitted",
        submittedByUserId: access.actorUserId,
        submittedAt: now,
        checklist: {
          documentRequirements: context.readiness.documentRequirements,
          licence: context.readiness.licence,
          renewal,
        },
      })
      .returning({ id: organizationVerifications.id });

    const currentDocIds = context.documents.filter((d) => isCurrentDocument(d, now)).map((d) => d.id);
    if (currentDocIds.length) {
      await tx.update(organizationDocuments).set({ verificationId: verification!.id }).where(inArray(organizationDocuments.id, currentDocIds));
    }
    if (!renewal) await tx.update(organizations).set({ status: "pending", statusReason: null }).where(eq(organizations.id, org.id));

    const payload: VerificationApprovalPayload = {
      verificationId: verification!.id,
      renewal,
      organization: {
        id: org.id,
        type: org.type,
        name: org.name,
        legalName: org.legalName,
        slug: org.slug,
        registrationNumber: org.registrationNumber,
        taxId: org.taxId,
        websiteUrl: org.websiteUrl,
        email: org.email,
        phone: org.phone,
        countryCode: org.countryCode,
        stateRegion: org.stateRegion,
        city: org.city,
        addressLine1: org.addressLine1,
        addressLine2: org.addressLine2,
        postalCode: org.postalCode,
        previousStatus: org.status,
      },
      profile: context.companyProfile ?? context.partnerProfile ?? context.institutionProfile ?? null,
      documents: context.documents
        .filter((d) => currentDocIds.includes(d.id))
        .map((d) => ({
          id: d.id,
          documentType: d.documentType,
          title: d.title,
          documentNumber: d.documentNumber,
          issuedBy: d.issuedBy,
          issuedAt: d.issuedAt?.toISOString() ?? null,
          expiresAt: d.expiresAt?.toISOString() ?? null,
          fileId: d.fileId,
          reviewStatus: d.reviewStatus,
        })),
      licences: context.licences.map((l) => ({
        id: l.id,
        licenceType: l.licenceType,
        licenceNumber: l.licenceNumber,
        issuingAuthority: l.issuingAuthority,
        issuingCountryCode: l.issuingCountryCode,
        validFrom: l.validFrom,
        validUntil: l.validUntil,
        verificationStatus: l.verificationStatus,
        fileId: l.fileId,
      })),
      territories: context.territories.map((t) => ({ countryCode: t.countryCode, stateRegion: t.stateRegion, scope: t.scope, isAuthorised: t.isAuthorised })),
      readiness: { documentRequirements: context.readiness.documentRequirements, licence: context.readiness.licence },
      submittedBy: { userId: access.actorUserId, name: ctx.user.displayName },
    };

    const label = ORG_TYPE_LABELS[org.type].toLowerCase();
    const approval = await submitForApproval(
      {
        type: VERIFICATION_APPROVAL_TYPE[org.type],
        entityType: "organization",
        entityId: org.id,
        organizationId: org.id,
        title: `${org.name} — ${renewal ? "verification renewal" : "verification"}`,
        summary: `${ORG_TYPE_LABELS[org.type]} ${renewal ? "renewal" : "verification"} with ${currentDocIds.length} document(s)${org.countryCode ? `, ${org.countryCode}` : ""}.`,
        payload,
        submittedByUserId: access.actorUserId,
      },
      tx,
    );
    await tx.update(organizationVerifications).set({ approvalRequestId: approval.id }).where(eq(organizationVerifications.id, verification!.id));

    await notifyOrganization(
      {
        event: "org.verification_submitted",
        organizationId: org.id,
        permission: ORG_PERMISSION.profile[org.type],
        data: { organizationName: org.name, organizationType: label, approvalCode: approval.code, renewal },
        link: ORG_PROFILE_PATH[org.type],
      },
      { tx },
    );
    await audit({
      action: "organization.verification_submitted",
      entityType: "organization",
      entityId: org.id,
      organizationId: org.id,
      actorUserId: access.actorUserId,
      metadata: { verificationId: verification!.id, approvalRequestId: approval.id, renewal, documentCount: currentDocIds.length },
      tx,
    });
    return { verificationId: verification!.id, approvalRequestId: approval.id, approvalCode: approval.code, renewal };
  });
  // Conversion recorded after the commit (trackServer never throws and carries no personal data).
  await trackServer("organization_verification_submitted", { orgType: ctx.organization.type, renewal: result.renewal });
  return result;
}

// ---------------------------------------------------------------------------
// Staff: suspend / reactivate / expire
// ---------------------------------------------------------------------------

async function notifyStatusChange(tx: DbOrTx, org: OrganizationRow, status: string, reason: string | null): Promise<void> {
  await notifyOrganization(
    {
      event: "org.status_changed",
      organizationId: org.id,
      permission: ORG_PERMISSION.dashboard[org.type],
      data: { organizationName: org.name, status, reason },
      link: ORG_PROFILE_PATH[org.type],
    },
    { tx },
  );
}

/**
 * Suspend an organisation (staff orgs.manage). Open verification requests are cancelled and the
 * reason is shown to the organisation. Members keep signing in; portals restrict what a suspended
 * organisation can do.
 */
export async function suspendOrganization(staff: StaffContext, organizationId: string, reason: string): Promise<void> {
  assertStaff(staff, "orgs.manage");
  await db.transaction(async (tx) => {
    const { organization: org } = await authorizeOrg(staff, organizationId, { member: null, staff: "orgs.manage" }, { tx, lock: true });
    if (org.status === "suspended") throw invalidStateError("This organisation is already suspended.");
    await cancelApprovalsForEntity(VERIFICATION_APPROVAL_TYPE[org.type], org.id, staff.user.id, "Organisation suspended", tx);
    await tx
      .update(organizationVerifications)
      .set({ status: "withdrawn" })
      .where(and(eq(organizationVerifications.organizationId, org.id), inArray(organizationVerifications.status, ["submitted", "under_review"])));
    const now = new Date();
    await tx
      .update(organizations)
      .set({ status: "suspended", suspendedAt: now, statusReason: reason, metadata: { ...(org.metadata ?? {}), statusBeforeSuspension: org.status } })
      .where(eq(organizations.id, org.id));
    await notifyStatusChange(tx, org, "suspended", reason);
    await audit({
      action: "organization.suspended",
      entityType: "organization",
      entityId: org.id,
      organizationId: org.id,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { reason, previousStatus: org.status },
      tx,
    });
  });
}

/** Lift a suspension (staff orgs.manage): verified while the verification is still valid, expired if it lapsed, otherwise draft. */
export async function reactivateOrganization(staff: StaffContext, organizationId: string, note?: string | null): Promise<OrganizationRow> {
  assertStaff(staff, "orgs.manage");
  return db.transaction(async (tx) => {
    const { organization: org } = await authorizeOrg(staff, organizationId, { member: null, staff: "orgs.manage" }, { tx, lock: true });
    if (org.status !== "suspended") throw invalidStateError("This organisation is not suspended.");
    const status = statusAfterReactivation(org, new Date());
    const metadata = { ...(org.metadata ?? {}) };
    delete metadata.statusBeforeSuspension;
    const [updated] = await tx
      .update(organizations)
      .set({ status, suspendedAt: null, statusReason: null, metadata })
      .where(eq(organizations.id, org.id))
      .returning();
    await notifyStatusChange(tx, org, status, null);
    await audit({
      action: "organization.reactivated",
      entityType: "organization",
      entityId: org.id,
      organizationId: org.id,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { status, note: note ?? null },
      tx,
    });
    return updated!;
  });
}

/** Manually end a verification (staff orgs.manage or orgs.verify), e.g. when a licence was withdrawn. */
export async function expireOrganizationVerification(staff: StaffContext, organizationId: string, reason: string): Promise<void> {
  assertStaff(staff, ["orgs.manage", "orgs.verify"], "any");
  await db.transaction(async (tx) => {
    const { organization: org } = await authorizeOrg(staff, organizationId, { member: null, staff: ["orgs.manage", "orgs.verify"], staffMode: "any" }, { tx, lock: true });
    if (org.status !== "verified") throw invalidStateError("Only a verified organisation can be expired.");
    const now = new Date();
    await tx.update(organizations).set({ status: "expired", statusReason: reason, verificationExpiresAt: now }).where(eq(organizations.id, org.id));
    await notifyOrganization(
      {
        event: "org.verification_expiring",
        organizationId: org.id,
        permission: ORG_PERMISSION.profile[org.type],
        data: { organizationName: org.name, state: "expired", reason, expiresAt: now.toISOString() },
        link: ORG_PROFILE_PATH[org.type],
      },
      { tx },
    );
    await audit({
      action: "organization.verification_expired",
      entityType: "organization",
      entityId: org.id,
      organizationId: org.id,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { reason, manual: true },
      tx,
    });
  });
}

/** Staff: assign or clear the Venkat Sai account manager (orgs.manage; the user must be active staff). */
export async function setAccountManager(staff: StaffContext, organizationId: string, accountManagerUserId: string | null): Promise<void> {
  assertStaff(staff, "orgs.manage");
  await db.transaction(async (tx) => {
    const { organization: org } = await authorizeOrg(staff, organizationId, { member: null, staff: "orgs.manage" }, { tx, lock: true });
    if (accountManagerUserId) {
      const rows = await tx.execute<{ ok: boolean }>(
        sql`select true as ok from users where id = ${accountManagerUserId} and is_staff = true and status = 'active' limit 1`,
      );
      if (!rows.rows.length) throw validationError("Choose an active Venkat Sai team member.", { accountManagerUserId: ["Choose an active team member"] });
    }
    await tx.update(organizations).set({ accountManagerUserId }).where(eq(organizations.id, org.id));
    await audit({
      action: "organization.account_manager_changed",
      entityType: "organization",
      entityId: org.id,
      organizationId: org.id,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { accountManagerUserId, previous: org.accountManagerUserId },
      tx,
    });
  });
}

/** Staff link used in notifications and approval payloads. */
export function organizationAdminLink(organizationId: string): string {
  return adminOrganizationPath(organizationId);
}

/** Organisations of a type that a user owns or belongs to (onboarding duplicates check). */
export async function countUserOrganizations(userId: string, type: OrgType): Promise<number> {
  const rows = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizations.type, type), isNull(organizations.deletedAt), ne(organizationMembers.status, "disabled")));
  return rows.length;
}
