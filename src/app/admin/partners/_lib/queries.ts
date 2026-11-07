import "server-only";

import { and, desc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { candidateAttributions, candidateProfiles, duplicateFlags, organizations, partnerAgreements, partnerAssignments, partnerSubmissions, users } from "@/db/schema";
import type { StaffContext } from "@/modules/identity/authz";
import { listAssignmentsForStaff, listSubmissionsForStaff, type StaffAssignmentListItem } from "@/modules/recruitment/queries";
import type { StaffSubmissionReviewItem } from "@/modules/recruitment/partner-queries";

/**
 * Command Centre partner reads the recruitment / organisations modules do not expose (single
 * assignment or submission for staff, duplicate flags, attributions, agreements across partners).
 * Single records are loaded through the module's staff list functions (which authorise), narrowed
 * by the record's own keys. Cross-module need: getAssignmentForStaff / getSubmissionForStaff.
 */

export async function loadAssignmentForStaff(staff: StaffContext, assignmentId: string): Promise<(StaffAssignmentListItem & { instructions: string | null; revocationReason: string | null }) | null> {
  const [row] = await db
    .select({ partnerOrganizationId: partnerAssignments.partnerOrganizationId, requirementId: partnerAssignments.requirementId, jobId: partnerAssignments.jobId, instructions: partnerAssignments.instructions, revocationReason: partnerAssignments.revocationReason })
    .from(partnerAssignments)
    .where(eq(partnerAssignments.id, assignmentId))
    .limit(1);
  if (!row) return null;
  const list = await listAssignmentsForStaff(
    staff,
    { partnerOrganizationId: row.partnerOrganizationId, requirementId: row.requirementId ?? undefined, jobId: row.jobId ?? undefined },
    { page: 1, pageSize: 100, offset: 0 },
  );
  const item = list.items.find((a) => a.id === assignmentId);
  return item ? { ...item, instructions: row.instructions, revocationReason: row.revocationReason } : null;
}

export async function loadSubmissionForStaff(staff: StaffContext, submissionId: string): Promise<StaffSubmissionReviewItem | null> {
  const [row] = await db.select({ assignmentId: partnerSubmissions.assignmentId }).from(partnerSubmissions).where(eq(partnerSubmissions.id, submissionId)).limit(1);
  if (!row) return null;
  for (let page = 1; page <= 20; page++) {
    const list = await listSubmissionsForStaff(staff, { assignmentId: row.assignmentId }, { page, pageSize: 100, offset: (page - 1) * 100 });
    const found = list.items.find((s) => s.id === submissionId);
    if (found) return found;
    if (page >= list.pageCount) break;
  }
  return null;
}

const otherProfile = alias(candidateProfiles, "other_profile");
const otherUser = alias(users, "other_user");

export type DuplicateFlagRow = {
  id: string;
  candidateId: string;
  possibleDuplicateCandidateId: string;
  otherName: string | null;
  matchedOn: string[];
  score: number | null;
  status: string;
  partnerSubmissionId: string | null;
  resolutionNotes: string | null;
  createdAt: Date;
};

/** Duplicate flags involving a candidate (either side), newest first. Staff with candidates.view only. */
export async function duplicateFlagsForCandidate(candidateId: string): Promise<DuplicateFlagRow[]> {
  const rows = await db
    .select({
      id: duplicateFlags.id,
      candidateId: duplicateFlags.candidateId,
      possibleDuplicateCandidateId: duplicateFlags.possibleDuplicateCandidateId,
      matchedOn: duplicateFlags.matchedOn,
      score: duplicateFlags.score,
      status: duplicateFlags.status,
      partnerSubmissionId: duplicateFlags.partnerSubmissionId,
      resolutionNotes: duplicateFlags.resolutionNotes,
      createdAt: duplicateFlags.createdAt,
    })
    .from(duplicateFlags)
    .where(or(eq(duplicateFlags.candidateId, candidateId), eq(duplicateFlags.possibleDuplicateCandidateId, candidateId)))
    .orderBy(desc(duplicateFlags.createdAt))
    .limit(50);
  const otherIds = [...new Set(rows.map((r) => (r.candidateId === candidateId ? r.possibleDuplicateCandidateId : r.candidateId)))];
  const names = otherIds.length
    ? await db.select({ id: otherProfile.id, name: otherUser.displayName }).from(otherProfile).innerJoin(otherUser, eq(otherUser.id, otherProfile.userId)).where(inArray(otherProfile.id, otherIds))
    : [];
  const byId = new Map(names.map((n) => [n.id, n.name]));
  return rows.map((r) => {
    const other = r.candidateId === candidateId ? r.possibleDuplicateCandidateId : r.candidateId;
    return { ...r, possibleDuplicateCandidateId: other, otherName: byId.get(other) ?? null, matchedOn: r.matchedOn as string[] };
  });
}

/** Duplicate flags raised by a partner submission. */
export async function duplicateFlagsForSubmission(submissionId: string): Promise<DuplicateFlagRow[]> {
  const [row] = await db.select({ candidateId: partnerSubmissions.candidateId }).from(partnerSubmissions).where(eq(partnerSubmissions.id, submissionId)).limit(1);
  if (!row) return [];
  return (await duplicateFlagsForCandidate(row.candidateId)).filter((f) => f.partnerSubmissionId === submissionId || f.status === "open");
}

export type AttributionRow = { id: string; partnerOrganizationId: string; partnerName: string | null; status: string; firstSubmittedAt: Date; expiresAt: Date | null; resolutionNotes: string | null };

/** Partner attributions of a candidate (who sourced them first, within the window). */
export async function attributionsForCandidate(candidateId: string): Promise<AttributionRow[]> {
  return db
    .select({
      id: candidateAttributions.id,
      partnerOrganizationId: candidateAttributions.partnerOrganizationId,
      partnerName: organizations.name,
      status: candidateAttributions.status,
      firstSubmittedAt: candidateAttributions.firstSubmittedAt,
      expiresAt: candidateAttributions.expiresAt,
      resolutionNotes: candidateAttributions.resolutionNotes,
    })
    .from(candidateAttributions)
    .leftJoin(organizations, eq(organizations.id, candidateAttributions.partnerOrganizationId))
    .where(eq(candidateAttributions.candidateId, candidateId))
    .orderBy(desc(candidateAttributions.firstSubmittedAt))
    .limit(20);
}

export type AgreementRow = {
  id: string;
  organizationId: string;
  partnerName: string;
  version: string;
  title: string;
  status: string;
  issuedAt: Date;
  acceptedAt: Date | null;
  acceptedByName: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  terminationReason: string | null;
};

/** Partner agreements across partners (staff partners.view), optionally one version. Evidence hashes are not returned. */
export async function listAgreementsForStaff(filters: { version?: string; status?: string }, page: { pageSize: number; offset: number }): Promise<AgreementRow[]> {
  const rows = await db
    .select({
      id: partnerAgreements.id,
      organizationId: partnerAgreements.organizationId,
      partnerName: organizations.name,
      version: partnerAgreements.version,
      title: partnerAgreements.title,
      status: partnerAgreements.status,
      issuedAt: partnerAgreements.issuedAt,
      acceptedAt: partnerAgreements.acceptedAt,
      acceptedByName: partnerAgreements.acceptedByName,
      effectiveFrom: partnerAgreements.effectiveFrom,
      effectiveUntil: partnerAgreements.effectiveUntil,
      terminationReason: partnerAgreements.terminationReason,
    })
    .from(partnerAgreements)
    .innerJoin(organizations, eq(organizations.id, partnerAgreements.organizationId))
    .where(
      and(
        filters.version ? eq(partnerAgreements.version, filters.version) : undefined,
        filters.status ? eq(partnerAgreements.status, filters.status as (typeof partnerAgreements.$inferSelect)["status"]) : undefined,
      ),
    )
    .orderBy(desc(partnerAgreements.issuedAt))
    .limit(page.pageSize)
    .offset(page.offset);
  return rows.map((r) => ({ ...r, effectiveFrom: r.effectiveFrom ? String(r.effectiveFrom) : null, effectiveUntil: r.effectiveUntil ? String(r.effectiveUntil) : null }));
}

/** Distinct agreement versions with issue / acceptance counts. */
export async function agreementVersionSummary(): Promise<{ version: string; title: string; issued: number; accepted: number; pending: number; lastIssuedAt: Date }[]> {
  const rows = await db
    .select({ version: partnerAgreements.version, title: partnerAgreements.title, status: partnerAgreements.status, acceptedAt: partnerAgreements.acceptedAt, issuedAt: partnerAgreements.issuedAt })
    .from(partnerAgreements)
    .orderBy(desc(partnerAgreements.issuedAt))
    .limit(5000);
  const map = new Map<string, { version: string; title: string; issued: number; accepted: number; pending: number; lastIssuedAt: Date }>();
  for (const r of rows) {
    const e = map.get(r.version) ?? { version: r.version, title: r.title, issued: 0, accepted: 0, pending: 0, lastIssuedAt: r.issuedAt };
    e.issued += 1;
    if (r.acceptedAt) e.accepted += 1;
    if (r.status === "pending") e.pending += 1;
    if (r.issuedAt > e.lastIssuedAt) e.lastIssuedAt = r.issuedAt;
    map.set(r.version, e);
  }
  return [...map.values()];
}
