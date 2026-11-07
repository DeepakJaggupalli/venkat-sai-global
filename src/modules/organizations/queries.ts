import "server-only";

import { and, asc, count, desc, eq, gt, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { files, organizationDocuments, organizationInvitations, organizationMembers, organizations, organizationVerifications, users } from "@/db/schema";
import type { OrgStatus, OrgType } from "@/db/schema/_constants";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { fileUrl, thumbnailUrl } from "@/modules/files";
import type { StaffContext } from "@/modules/identity/authz";

import { assertStaff, authorizeOrg, type OrganizationRow, type OrgActor } from "./access";
import { loadVerificationContext, type CompanyProfileRow, type InstitutionProfileRow, type OrganizationDocumentRow, type PartnerProfileRow } from "./readiness";
import { daysUntil, RECOMMENDED_DOCUMENTS, type VerificationReadiness } from "./rules";

const VIEW_RULE = { member: "any" as const, staff: "orgs.view" as const };

export type OrganizationDocumentItem = OrganizationDocumentRow & {
  file: { id: string; name: string; mimeType: string; size: number; url: string; thumbnailUrl: string | null } | null;
};

export type VerificationHistoryItem = {
  id: string;
  status: (typeof organizationVerifications.$inferSelect)["status"];
  submittedAt: Date;
  submittedByName: string | null;
  reviewedAt: Date | null;
  /** Reviewer name — staff views only. */
  reviewedByName?: string | null;
  decisionNotes: string | null;
  validUntil: Date | null;
  approvalRequestId: string | null;
};

export type OrganizationOverview = {
  organization: OrganizationRow;
  logo: { url: string; thumbnailUrl: string | null } | null;
  profile: { type: "employer"; data: CompanyProfileRow | null } | { type: "recruitment_partner"; data: PartnerProfileRow | null } | { type: "institution"; data: InstitutionProfileRow | null };
  readiness: VerificationReadiness;
  recommendedDocuments: readonly string[];
  latestVerification: VerificationHistoryItem | null;
  memberCount: number;
  pendingInvitationCount: number;
  /** Days until verificationExpiresAt (null when not verified or no expiry). */
  verificationDaysLeft: number | null;
};

export type OrganizationListItem = {
  id: string;
  type: OrgType;
  name: string;
  slug: string;
  status: OrgStatus;
  countryCode: string | null;
  city: string | null;
  verifiedAt: Date | null;
  verificationExpiresAt: Date | null;
  createdAt: Date;
  memberCount: number;
  accountManagerName: string | null;
};

/** Organisation row for a member of it or staff (orgs.view). */
export async function getOrganizationForActor(actor: OrgActor, organizationId: string): Promise<OrganizationRow> {
  const { organization } = await authorizeOrg(actor, organizationId, VIEW_RULE);
  return organization;
}

/** Everything the profile / verification page needs (members of the organisation, staff with orgs.view). */
export async function getOrganizationOverview(actor: OrgActor, organizationId: string, now: Date = new Date()): Promise<OrganizationOverview> {
  const access = await authorizeOrg(actor, organizationId, VIEW_RULE);
  const org = access.organization;
  const context = await loadVerificationContext(db, org, now);
  const [history] = await listVerificationHistoryInternal(org.id, access.via === "staff", 1);
  const [members] = await db
    .select({ value: count() })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, org.id), eq(organizationMembers.status, "active")));
  const [invites] = await db
    .select({ value: count() })
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.organizationId, org.id),
        isNull(organizationInvitations.acceptedAt),
        isNull(organizationInvitations.revokedAt),
        gt(organizationInvitations.expiresAt, now),
      ),
    );
  let logo: OrganizationOverview["logo"] = null;
  if (org.logoFileId) {
    const [file] = await db.select().from(files).where(and(eq(files.id, org.logoFileId), isNull(files.deletedAt))).limit(1);
    if (file) logo = { url: fileUrl(file, { variant: "md" }), thumbnailUrl: thumbnailUrl(file) };
  }
  const profile: OrganizationOverview["profile"] =
    org.type === "employer"
      ? { type: "employer", data: context.companyProfile }
      : org.type === "recruitment_partner"
        ? { type: "recruitment_partner", data: access.via === "staff" ? context.partnerProfile : context.partnerProfile ? { ...context.partnerProfile, qualityScore: null, qualityScoreUpdatedAt: null, statusNotes: null } : null }
        : { type: "institution", data: context.institutionProfile };
  return {
    organization: org,
    logo,
    profile,
    readiness: context.readiness,
    recommendedDocuments: RECOMMENDED_DOCUMENTS[org.type],
    latestVerification: history ?? null,
    memberCount: members?.value ?? 0,
    pendingInvitationCount: invites?.value ?? 0,
    verificationDaysLeft: org.status === "verified" && org.verificationExpiresAt ? daysUntil(org.verificationExpiresAt, now) : null,
  };
}

/** Verification checklist (what is still missing before submitting). */
export async function getVerificationReadiness(actor: OrgActor, organizationId: string): Promise<VerificationReadiness> {
  const { organization } = await authorizeOrg(actor, organizationId, VIEW_RULE);
  return (await loadVerificationContext(db, organization)).readiness;
}

/** Documents with file links (files are served through the access-checked files route). */
export async function listOrganizationDocuments(actor: OrgActor, organizationId: string): Promise<OrganizationDocumentItem[]> {
  await authorizeOrg(actor, organizationId, { member: { employer: "employer.company.manage", recruitment_partner: "partner.profile.manage", institution: "institution.profile.manage" }, staff: "orgs.view" });
  const rows = await db
    .select({ doc: organizationDocuments, file: files })
    .from(organizationDocuments)
    .leftJoin(files, and(eq(files.id, organizationDocuments.fileId), isNull(files.deletedAt)))
    .where(eq(organizationDocuments.organizationId, organizationId))
    .orderBy(desc(organizationDocuments.createdAt));
  return rows.map(({ doc, file }) => ({
    ...doc,
    file: file ? { id: file.id, name: file.originalName, mimeType: file.mimeType, size: file.sizeBytes, url: fileUrl(file), thumbnailUrl: thumbnailUrl(file) } : null,
  }));
}

async function listVerificationHistoryInternal(organizationId: string, includeReviewer: boolean, limit: number): Promise<VerificationHistoryItem[]> {
  const submitters = alias(users, "submitters");
  const rows = await db
    .select({ v: organizationVerifications, submittedByName: submitters.displayName, reviewedByName: users.displayName })
    .from(organizationVerifications)
    .leftJoin(users, eq(users.id, organizationVerifications.reviewedByUserId))
    .leftJoin(submitters, eq(submitters.id, organizationVerifications.submittedByUserId))
    .where(eq(organizationVerifications.organizationId, organizationId))
    .orderBy(desc(organizationVerifications.submittedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.v.id,
    status: r.v.status,
    submittedAt: r.v.submittedAt,
    submittedByName: r.submittedByName,
    reviewedAt: r.v.reviewedAt,
    ...(includeReviewer ? { reviewedByName: r.reviewedByName } : {}),
    decisionNotes: r.v.decisionNotes,
    validUntil: r.v.validUntil,
    approvalRequestId: r.v.approvalRequestId,
  }));
}

/** Verification submissions, newest first (reviewer names for staff only). */
export async function listVerificationHistory(actor: OrgActor, organizationId: string): Promise<VerificationHistoryItem[]> {
  const access = await authorizeOrg(actor, organizationId, VIEW_RULE);
  return listVerificationHistoryInternal(organizationId, access.via === "staff", 50);
}

/** Command Centre list of organisations (orgs.view). */
export async function listOrganizations(
  staff: StaffContext,
  filters: { type?: OrgType; status?: OrgStatus; q?: string; countryCode?: string; expiringWithinDays?: number },
  page: PageQuery,
  now: Date = new Date(),
): Promise<Paginated<OrganizationListItem>> {
  assertStaff(staff, "orgs.view");
  const where: SQL[] = [isNull(organizations.deletedAt)];
  if (filters.type) where.push(eq(organizations.type, filters.type));
  if (filters.status) where.push(eq(organizations.status, filters.status));
  if (filters.countryCode) where.push(eq(organizations.countryCode, filters.countryCode.toUpperCase()));
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim().replace(/[%_\\]/g, "")}%`;
    where.push(or(ilike(organizations.name, q), ilike(organizations.slug, q), ilike(organizations.legalName, q))!);
  }
  if (filters.expiringWithinDays) {
    where.push(eq(organizations.status, "verified"));
    where.push(sql`${organizations.verificationExpiresAt} <= ${new Date(now.getTime() + filters.expiringWithinDays * 86_400_000)}`);
  }
  const condition = and(...where);
  const activeMembers = db
    .select({ organizationId: organizationMembers.organizationId, value: count().as("member_count") })
    .from(organizationMembers)
    .where(eq(organizationMembers.status, "active"))
    .groupBy(organizationMembers.organizationId)
    .as("active_members");
  const [rows, total] = await Promise.all([
    db
      .select({ org: organizations, memberCount: activeMembers.value, accountManagerName: users.displayName })
      .from(organizations)
      .leftJoin(users, eq(users.id, organizations.accountManagerUserId))
      .leftJoin(activeMembers, eq(activeMembers.organizationId, organizations.id))
      .where(condition)
      .orderBy(desc(organizations.createdAt), asc(organizations.name))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(organizations).where(condition),
  ]);
  return paginated(
    rows.map((r) => ({
      id: r.org.id,
      type: r.org.type,
      name: r.org.name,
      slug: r.org.slug,
      status: r.org.status,
      countryCode: r.org.countryCode,
      city: r.org.city,
      verifiedAt: r.org.verifiedAt,
      verificationExpiresAt: r.org.verificationExpiresAt,
      createdAt: r.org.createdAt,
      memberCount: Number(r.memberCount),
      accountManagerName: r.accountManagerName,
    })),
    total[0]?.value ?? 0,
    page,
  );
}

/** Counts by type and status for the Command Centre dashboard (orgs.view). */
export async function countOrganizationsByStatus(staff: StaffContext): Promise<{ type: OrgType; status: OrgStatus; count: number }[]> {
  assertStaff(staff, "orgs.view");
  const rows = await db
    .select({ type: organizations.type, status: organizations.status, value: count() })
    .from(organizations)
    .where(isNull(organizations.deletedAt))
    .groupBy(organizations.type, organizations.status);
  return rows.map((r) => ({ type: r.type, status: r.status, count: r.value }));
}
