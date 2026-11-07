import "server-only";

import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  applicationStageHistory,
  applications,
  candidateAttributions,
  candidatePrivacySettings,
  candidateProfiles,
  duplicateFlags,
  jobs,
  organizations,
  partnerAssignments,
  partnerSubmissions,
  placements,
  requirementLines,
  requirementRequests,
  supportTickets,
  users,
  workflowStages,
  type ApplicationRejectionReason,
  type ApplicationStatus,
  type PartnerAssignmentStatus,
  type PartnerCommissionTerms,
  type PartnerSubmissionStatus,
} from "@/db/schema";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";

import { assertOrg, assertStaff, isUuid } from "./access";
import { notFoundError } from "./errors";
import { listApplicationNotes, type ApplicationNoteView } from "./notes";
import { privacyOrDefault } from "./visibility";

export type { SubmissionResult } from "./partner-submissions";

/**
 * Partner-scoped read models (a partner only ever sees its own assignments, submissions and the
 * progress of applications credited to it — never Venkat Sai's commercial terms with employers or
 * other partners' data), the staff review queue and partner performance metrics.
 */

type PartnerContext = OrgContext<"recruitment_partner">;

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export type PartnerAssignmentListItem = {
  id: string;
  status: PartnerAssignmentStatus;
  title: string;
  requirement: { id: string; code: string; title: string; countryCode: string | null; locations: string | null; totalPositions: number } | null;
  job: { id: string; code: string; title: string; countryCode: string | null; city: string | null } | null;
  positionsTarget: number | null;
  submissionLimit: number | null;
  submissionsUsed: number;
  dueDate: string | null;
  createdAt: Date;
};

export type PartnerAssignmentView = PartnerAssignmentListItem & {
  instructions: string | null;
  /** The partner's own commission terms for this assignment. */
  commissionTerms: PartnerCommissionTerms;
  requirementLines: {
    roleTitle: string;
    positions: number;
    experienceMinYears: number | null;
    experienceMaxYears: number | null;
    qualification: string | null;
    requiredSkills: string[];
    salaryMinMinor: number | null;
    salaryMaxMinor: number | null;
    salaryCurrency: string | null;
    salaryPeriod: string | null;
  }[];
  /** Jobs of the requirement the partner may target with a submission. */
  targetJobs: { id: string; code: string; title: string; status: string }[];
  submissionCounts: Partial<Record<PartnerSubmissionStatus, number>>;
};

const usedCount = sql<number>`(select count(*)::int from ${partnerSubmissions} where ${partnerSubmissions.assignmentId} = ${partnerAssignments.id} and ${partnerSubmissions.status} <> 'withdrawn')`;

function assignmentListQuery() {
  return db
    .select({
      assignment: partnerAssignments,
      requirement: {
        id: requirementRequests.id,
        code: requirementRequests.code,
        title: requirementRequests.title,
        countryCode: requirementRequests.countryCode,
        locations: requirementRequests.locations,
        totalPositions: requirementRequests.totalPositions,
      },
      job: { id: jobs.id, code: jobs.code, title: jobs.title, countryCode: jobs.countryCode, city: jobs.city },
      submissionsUsed: usedCount,
    })
    .from(partnerAssignments)
    .leftJoin(requirementRequests, eq(requirementRequests.id, partnerAssignments.requirementId))
    .leftJoin(jobs, eq(jobs.id, partnerAssignments.jobId));
}

type AssignmentListRow = Awaited<ReturnType<ReturnType<typeof assignmentListQuery>["execute"]>>[number];

function toAssignmentListItem(r: AssignmentListRow): PartnerAssignmentListItem {
  const a = r.assignment;
  const requirement = r.requirement?.id ? (r.requirement as NonNullable<PartnerAssignmentListItem["requirement"]>) : null;
  const job = r.job?.id ? (r.job as NonNullable<PartnerAssignmentListItem["job"]>) : null;
  return {
    id: a.id,
    status: a.status,
    title: job?.title ?? requirement?.title ?? "",
    requirement,
    job,
    positionsTarget: a.positionsTarget,
    submissionLimit: a.submissionLimit,
    submissionsUsed: Number(r.submissionsUsed),
    dueDate: a.dueDate,
    createdAt: a.createdAt,
  };
}

/** The partner's assignments (partner.requirements.view), newest first. */
export async function listAssignmentsForPartner(ctx: PartnerContext, filters: { status?: PartnerAssignmentStatus }, page: PageQuery): Promise<Paginated<PartnerAssignmentListItem>> {
  assertOrg(ctx, "partner.requirements.view");
  const where = and(eq(partnerAssignments.partnerOrganizationId, ctx.organization.id), filters.status ? eq(partnerAssignments.status, filters.status) : undefined);
  const [rows, total] = await Promise.all([
    assignmentListQuery().where(where).orderBy(desc(partnerAssignments.createdAt)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(partnerAssignments).where(where),
  ]);
  return paginated(rows.map(toAssignmentListItem), total[0]?.value ?? 0, page);
}

/** One assignment for the partner, with requirement lines, target jobs and its submission counts. */
export async function getAssignmentForPartner(ctx: PartnerContext, assignmentId: string): Promise<PartnerAssignmentView> {
  assertOrg(ctx, "partner.requirements.view");
  if (!isUuid(assignmentId)) throw notFoundError("Assignment");
  const [row] = await assignmentListQuery()
    .where(and(eq(partnerAssignments.id, assignmentId), eq(partnerAssignments.partnerOrganizationId, ctx.organization.id)))
    .limit(1);
  if (!row) throw notFoundError("Assignment");
  const a = row.assignment;
  const [lines, targetJobs, counts] = await Promise.all([
    a.requirementId
      ? db
          .select({
            roleTitle: requirementLines.roleTitle,
            positions: requirementLines.positions,
            experienceMinYears: requirementLines.experienceMinYears,
            experienceMaxYears: requirementLines.experienceMaxYears,
            qualification: requirementLines.qualification,
            requiredSkills: requirementLines.requiredSkills,
            salaryMinMinor: requirementLines.salaryMinMinor,
            salaryMaxMinor: requirementLines.salaryMaxMinor,
            salaryCurrency: requirementLines.salaryCurrency,
            salaryPeriod: requirementLines.salaryPeriod,
          })
          .from(requirementLines)
          .where(eq(requirementLines.requirementId, a.requirementId))
          .orderBy(asc(requirementLines.sortOrder))
      : Promise.resolve([]),
    a.requirementId
      ? db
          .select({ id: jobs.id, code: jobs.code, title: jobs.title, status: jobs.status })
          .from(jobs)
          .where(and(eq(jobs.requirementId, a.requirementId), sql`${jobs.deletedAt} is null`, inArray(jobs.status, ["published", "paused", "draft", "pending_approval"])))
          .orderBy(asc(jobs.title))
      : Promise.resolve([]),
    db.select({ status: partnerSubmissions.status, value: count() }).from(partnerSubmissions).where(eq(partnerSubmissions.assignmentId, a.id)).groupBy(partnerSubmissions.status),
  ]);
  return {
    ...toAssignmentListItem(row),
    instructions: a.instructions,
    commissionTerms: a.commissionTerms,
    requirementLines: lines.map((l) => ({ ...l, requiredSkills: l.requiredSkills ?? [] })),
    targetJobs,
    submissionCounts: Object.fromEntries(counts.map((c) => [c.status, c.value])),
  };
}

export type StaffAssignmentListItem = PartnerAssignmentListItem & { partnerOrganizationId: string; partnerName: string; internalNotes: string | null; commissionTerms: PartnerCommissionTerms };

/** Command Centre list of assignments (partners.view). */
export async function listAssignmentsForStaff(
  ctx: StaffContext,
  filters: { partnerOrganizationId?: string; requirementId?: string; jobId?: string; status?: PartnerAssignmentStatus },
  page: PageQuery,
): Promise<Paginated<StaffAssignmentListItem>> {
  assertStaff(ctx, ["partners.view", "partners.assign"], "any");
  const conditions: SQL[] = [];
  if (filters.partnerOrganizationId && isUuid(filters.partnerOrganizationId)) conditions.push(eq(partnerAssignments.partnerOrganizationId, filters.partnerOrganizationId));
  if (filters.requirementId && isUuid(filters.requirementId)) conditions.push(eq(partnerAssignments.requirementId, filters.requirementId));
  if (filters.jobId && isUuid(filters.jobId)) conditions.push(eq(partnerAssignments.jobId, filters.jobId));
  if (filters.status) conditions.push(eq(partnerAssignments.status, filters.status));
  const where = conditions.length ? and(...conditions) : undefined;
  const partner = alias(organizations, "partner");
  const [rows, total] = await Promise.all([
    db
      .select({
        assignment: partnerAssignments,
        requirement: {
          id: requirementRequests.id,
          code: requirementRequests.code,
          title: requirementRequests.title,
          countryCode: requirementRequests.countryCode,
          locations: requirementRequests.locations,
          totalPositions: requirementRequests.totalPositions,
        },
        job: { id: jobs.id, code: jobs.code, title: jobs.title, countryCode: jobs.countryCode, city: jobs.city },
        submissionsUsed: usedCount,
        partnerName: partner.name,
      })
      .from(partnerAssignments)
      .innerJoin(partner, eq(partner.id, partnerAssignments.partnerOrganizationId))
      .leftJoin(requirementRequests, eq(requirementRequests.id, partnerAssignments.requirementId))
      .leftJoin(jobs, eq(jobs.id, partnerAssignments.jobId))
      .where(where)
      .orderBy(desc(partnerAssignments.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(partnerAssignments).where(where),
  ]);
  return paginated(
    rows.map((r) => ({
      ...toAssignmentListItem(r),
      partnerOrganizationId: r.assignment.partnerOrganizationId,
      partnerName: r.partnerName,
      internalNotes: r.assignment.internalNotes,
      commissionTerms: r.assignment.commissionTerms,
    })),
    total[0]?.value ?? 0,
    page,
  );
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export type PartnerSubmissionListItem = {
  id: string;
  code: string;
  status: PartnerSubmissionStatus;
  createdAt: Date;
  candidate: { id: string; displayName: string };
  assignmentId: string;
  jobId: string | null;
  jobTitle: string | null;
  application: { id: string; code: string; status: ApplicationStatus; stageName: string } | null;
  partnerFeedback: string | null;
  rejectionReasonCode: ApplicationRejectionReason | null;
  reviewedAt: Date | null;
};

export type PartnerSubmissionView = PartnerSubmissionListItem & {
  partnerNotes: string | null;
  candidateProfile: { headline: string | null; currentJobTitle: string | null; totalExperienceMonths: number | null; city: string | null; countryCode: string | null; verificationLevel: string };
  placement: { code: string; status: string; joinedOn: string | null } | null;
  /** Notes Venkat Sai shared with the partner on the application. */
  notes: ApplicationNoteView[];
};

function submissionQuery() {
  return db
    .select({
      submission: partnerSubmissions,
      candidateName: users.displayName,
      jobTitle: jobs.title,
      applicationCode: applications.code,
      applicationStatus: applications.status,
      stageName: workflowStages.name,
    })
    .from(partnerSubmissions)
    .innerJoin(candidateProfiles, eq(candidateProfiles.id, partnerSubmissions.candidateId))
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .leftJoin(jobs, eq(jobs.id, partnerSubmissions.jobId))
    .leftJoin(applications, eq(applications.id, partnerSubmissions.applicationId))
    .leftJoin(workflowStages, eq(workflowStages.id, applications.currentStageId));
}

type SubmissionRow = Awaited<ReturnType<ReturnType<typeof submissionQuery>["execute"]>>[number];

function toSubmissionListItem(r: SubmissionRow): PartnerSubmissionListItem {
  const s = r.submission;
  return {
    id: s.id,
    code: s.code,
    status: s.status,
    createdAt: s.createdAt,
    candidate: { id: s.candidateId, displayName: r.candidateName },
    assignmentId: s.assignmentId,
    jobId: s.jobId,
    jobTitle: r.jobTitle,
    application: s.applicationId && r.applicationCode && r.applicationStatus ? { id: s.applicationId, code: r.applicationCode, status: r.applicationStatus, stageName: r.stageName ?? "" } : null,
    partnerFeedback: s.partnerFeedback,
    rejectionReasonCode: s.rejectionReasonCode,
    reviewedAt: s.reviewedAt,
  };
}

/** The partner's submissions (partner.submissions.view). */
export async function listSubmissionsForPartner(ctx: PartnerContext, filters: { status?: PartnerSubmissionStatus; assignmentId?: string }, page: PageQuery): Promise<Paginated<PartnerSubmissionListItem>> {
  assertOrg(ctx, "partner.submissions.view");
  const where = and(
    eq(partnerSubmissions.partnerOrganizationId, ctx.organization.id),
    filters.status ? eq(partnerSubmissions.status, filters.status) : undefined,
    filters.assignmentId && isUuid(filters.assignmentId) ? eq(partnerSubmissions.assignmentId, filters.assignmentId) : undefined,
  );
  const [rows, total] = await Promise.all([
    submissionQuery().where(where).orderBy(desc(partnerSubmissions.createdAt)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(partnerSubmissions).where(where),
  ]);
  return paginated(rows.map(toSubmissionListItem), total[0]?.value ?? 0, page);
}

export async function getSubmissionForPartner(ctx: PartnerContext, submissionId: string): Promise<PartnerSubmissionView> {
  assertOrg(ctx, "partner.submissions.view");
  if (!isUuid(submissionId)) throw notFoundError("Submission");
  const [row] = await submissionQuery()
    .where(and(eq(partnerSubmissions.id, submissionId), eq(partnerSubmissions.partnerOrganizationId, ctx.organization.id)))
    .limit(1);
  if (!row) throw notFoundError("Submission");
  const [profile] = await db
    .select({
      headline: candidateProfiles.headline,
      currentJobTitle: candidateProfiles.currentJobTitle,
      totalExperienceMonths: candidateProfiles.totalExperienceMonths,
      city: candidateProfiles.city,
      countryCode: candidateProfiles.currentCountryCode,
      verificationLevel: candidateProfiles.verificationLevel,
    })
    .from(candidateProfiles)
    .where(eq(candidateProfiles.id, row.submission.candidateId))
    .limit(1);
  const applicationId = row.submission.applicationId;
  const [placement, notes] = await Promise.all([
    applicationId ? db.select({ code: placements.code, status: placements.status, joinedOn: placements.joinedOn }).from(placements).where(eq(placements.applicationId, applicationId)).limit(1) : Promise.resolve([]),
    applicationId ? listApplicationNotes({ kind: "partner", ctx }, applicationId).catch(() => []) : Promise.resolve([]),
  ]);
  return {
    ...toSubmissionListItem(row),
    partnerNotes: row.submission.partnerNotes,
    candidateProfile: profile ?? { headline: null, currentJobTitle: null, totalExperienceMonths: null, city: null, countryCode: null, verificationLevel: "none" },
    placement: placement[0] ?? null,
    notes,
  };
}

export type StaffSubmissionReviewItem = PartnerSubmissionListItem & {
  partner: { id: string; name: string };
  assignment: { id: string; requirementId: string | null; jobId: string | null; status: PartnerAssignmentStatus };
  candidateSource: string;
  candidateSourcedByPartnerOrgId: string | null;
  /** The candidate's privacy setting; false = confirm consent with the candidate before accepting. */
  candidateAllowsPartnerSubmissions: boolean;
  hasConsentRecord: boolean;
  duplicateOfCandidateId: string | null;
  openDuplicateFlags: number;
  activeAttribution: { partnerOrganizationId: string; partnerName: string | null; expiresAt: Date | null } | null;
  partnerNotes: string | null;
  reviewNotes: string | null;
};

/** Staff review queue / submission list (recruitment.view or partners.view). `queue` = submitted, under review or duplicate. */
export async function listSubmissionsForStaff(
  ctx: StaffContext,
  filters: { status?: PartnerSubmissionStatus; queue?: boolean; partnerOrganizationId?: string; assignmentId?: string },
  page: PageQuery,
): Promise<Paginated<StaffSubmissionReviewItem>> {
  assertStaff(ctx, ["recruitment.view", "recruitment.manage", "partners.view"], "any");
  const conditions: SQL[] = [];
  if (filters.queue) conditions.push(inArray(partnerSubmissions.status, ["submitted", "under_review", "duplicate"]));
  else if (filters.status) conditions.push(eq(partnerSubmissions.status, filters.status));
  if (filters.partnerOrganizationId && isUuid(filters.partnerOrganizationId)) conditions.push(eq(partnerSubmissions.partnerOrganizationId, filters.partnerOrganizationId));
  if (filters.assignmentId && isUuid(filters.assignmentId)) conditions.push(eq(partnerSubmissions.assignmentId, filters.assignmentId));
  const where = conditions.length ? and(...conditions) : undefined;
  const partner = alias(organizations, "submitting_partner");
  const attributedPartner = alias(organizations, "attributed_partner");
  const openFlags = sql<number>`(select count(*)::int from ${duplicateFlags} where ${duplicateFlags.status} = 'open' and (${duplicateFlags.candidateId} = ${partnerSubmissions.candidateId} or ${duplicateFlags.possibleDuplicateCandidateId} = ${partnerSubmissions.candidateId}))`;
  const [rows, total] = await Promise.all([
    db
      .select({
        submission: partnerSubmissions,
        candidateName: users.displayName,
        candidateSource: candidateProfiles.source,
        sourcedBy: candidateProfiles.sourcedByPartnerOrgId,
        allowPartnerSubmissions: candidatePrivacySettings.allowPartnerSubmissions,
        jobTitle: jobs.title,
        applicationCode: applications.code,
        applicationStatus: applications.status,
        stageName: workflowStages.name,
        partnerName: partner.name,
        assignmentStatus: partnerAssignments.status,
        assignmentRequirementId: partnerAssignments.requirementId,
        assignmentJobId: partnerAssignments.jobId,
        openFlags,
        attributionPartnerId: candidateAttributions.partnerOrganizationId,
        attributionExpiresAt: candidateAttributions.expiresAt,
        attributionPartnerName: attributedPartner.name,
      })
      .from(partnerSubmissions)
      .innerJoin(partner, eq(partner.id, partnerSubmissions.partnerOrganizationId))
      .innerJoin(partnerAssignments, eq(partnerAssignments.id, partnerSubmissions.assignmentId))
      .innerJoin(candidateProfiles, eq(candidateProfiles.id, partnerSubmissions.candidateId))
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .leftJoin(candidatePrivacySettings, eq(candidatePrivacySettings.candidateId, candidateProfiles.id))
      .leftJoin(jobs, eq(jobs.id, partnerSubmissions.jobId))
      .leftJoin(applications, eq(applications.id, partnerSubmissions.applicationId))
      .leftJoin(workflowStages, eq(workflowStages.id, applications.currentStageId))
      .leftJoin(candidateAttributions, and(eq(candidateAttributions.candidateId, partnerSubmissions.candidateId), eq(candidateAttributions.status, "active")))
      .leftJoin(attributedPartner, eq(attributedPartner.id, candidateAttributions.partnerOrganizationId))
      .where(where)
      .orderBy(asc(partnerSubmissions.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(partnerSubmissions).where(where),
  ]);
  return paginated(
    rows.map((r) => ({
      ...toSubmissionListItem({ submission: r.submission, candidateName: r.candidateName, jobTitle: r.jobTitle, applicationCode: r.applicationCode, applicationStatus: r.applicationStatus, stageName: r.stageName }),
      partner: { id: r.submission.partnerOrganizationId, name: r.partnerName },
      assignment: { id: r.submission.assignmentId, requirementId: r.assignmentRequirementId, jobId: r.assignmentJobId, status: r.assignmentStatus },
      candidateSource: r.candidateSource,
      candidateSourcedByPartnerOrgId: r.sourcedBy,
      candidateAllowsPartnerSubmissions: privacyOrDefault({ allowPartnerSubmissions: r.allowPartnerSubmissions }).allowPartnerSubmissions,
      hasConsentRecord: Boolean(r.submission.consentRecordId),
      duplicateOfCandidateId: r.submission.duplicateOfCandidateId,
      openDuplicateFlags: Number(r.openFlags),
      activeAttribution: r.attributionPartnerId ? { partnerOrganizationId: r.attributionPartnerId, partnerName: r.attributionPartnerName, expiresAt: r.attributionExpiresAt } : null,
      partnerNotes: r.submission.partnerNotes,
      reviewNotes: r.submission.reviewNotes,
    })),
    total[0]?.value ?? 0,
    page,
  );
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

export type PartnerPerformance = {
  partnerOrganizationId: string;
  period: { from: Date | null; to: Date | null };
  /** Submissions made in the period (withdrawn excluded). */
  profilesSubmitted: number;
  uniqueCandidates: number;
  /** Submitted candidates whose profile Venkat Sai has verified (any level above "none"). */
  verifiedProfiles: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  pendingReview: number;
  /** Applications from these submissions that reached shortlist or later / an interview / a placement / joining. */
  shortlisted: number;
  interviewed: number;
  placed: number;
  joined: number;
  /** Conversion relative to profilesSubmitted (null when nothing was submitted). */
  rates: { acceptance: number | null; shortlist: number | null; interview: number | null; placement: number | null };
  timeliness: { submissionsWithDueDate: number; onTime: number; onTimeRate: number | null; medianHoursToFirstSubmission: number | null };
  /** Complaint / grievance tickets linked to the partner in the period. Staff only (null for partners). */
  complaints: number | null;
};

const ratio = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null);

type PerformanceViewer = { kind: "partner"; ctx: PartnerContext } | { kind: "staff"; ctx: StaffContext; partnerOrganizationId: string };

/**
 * Performance of a recruitment partner over a period (defaults to all time). Partners see their own
 * figures (partner.performance.view); staff (partners.view) see any partner, including complaints.
 * All figures are live counts from the platform's records.
 */
export async function getPartnerPerformance(viewer: PerformanceViewer, period: { from?: Date; to?: Date } = {}): Promise<PartnerPerformance> {
  let partnerOrganizationId: string;
  if (viewer.kind === "partner") {
    assertOrg(viewer.ctx, ["partner.performance.view", "partner.dashboard"], "any");
    partnerOrganizationId = viewer.ctx.organization.id;
  } else {
    assertStaff(viewer.ctx, ["partners.view", "partners.manage"], "any");
    if (!isUuid(viewer.partnerOrganizationId)) throw notFoundError("Recruitment partner");
    partnerOrganizationId = viewer.partnerOrganizationId;
  }

  const inPeriod: SQL[] = [eq(partnerSubmissions.partnerOrganizationId, partnerOrganizationId), ne(partnerSubmissions.status, "withdrawn")];
  if (period.from) inPeriod.push(gte(partnerSubmissions.createdAt, period.from));
  if (period.to) inPeriod.push(lte(partnerSubmissions.createdAt, period.to));
  const submissionWhere = and(...inPeriod);

  const [statusCounts, uniqueRows, verifiedRows, timelinessRows, medianRows] = await Promise.all([
    db.select({ status: partnerSubmissions.status, value: count() }).from(partnerSubmissions).where(submissionWhere).groupBy(partnerSubmissions.status),
    db.select({ value: sql<number>`count(distinct ${partnerSubmissions.candidateId})::int` }).from(partnerSubmissions).where(submissionWhere),
    db
      .select({ value: sql<number>`count(distinct ${partnerSubmissions.candidateId})::int` })
      .from(partnerSubmissions)
      .innerJoin(candidateProfiles, eq(candidateProfiles.id, partnerSubmissions.candidateId))
      .where(and(submissionWhere, ne(candidateProfiles.verificationLevel, "none"))),
    db
      .select({
        withDue: sql<number>`count(*) filter (where ${partnerAssignments.dueDate} is not null)::int`,
        onTime: sql<number>`count(*) filter (where ${partnerAssignments.dueDate} is not null and ${partnerSubmissions.createdAt}::date <= ${partnerAssignments.dueDate})::int`,
      })
      .from(partnerSubmissions)
      .innerJoin(partnerAssignments, eq(partnerAssignments.id, partnerSubmissions.assignmentId))
      .where(submissionWhere),
    db.execute<{ median: string | number | null }>(sql`
      select percentile_cont(0.5) within group (order by hours) as median from (
        select extract(epoch from (min(s.created_at) - a.created_at)) / 3600.0 as hours
        from ${partnerAssignments} a
        join ${partnerSubmissions} s on s.assignment_id = a.id and s.status <> 'withdrawn'
        where a.partner_organization_id = ${partnerOrganizationId}
          ${period.from ? sql`and a.created_at >= ${period.from}` : sql``}
          ${period.to ? sql`and a.created_at <= ${period.to}` : sql``}
        group by a.id, a.created_at
      ) t`),
  ]);
  const byStatus = new Map(statusCounts.map((c) => [c.status, c.value]));
  const profilesSubmitted = statusCounts.reduce((sum, c) => sum + c.value, 0);

  const applicationIds = (
    await db
      .select({ id: partnerSubmissions.applicationId })
      .from(partnerSubmissions)
      .where(and(submissionWhere, isNotNull(partnerSubmissions.applicationId)))
  )
    .map((r) => r.id)
    .filter((id): id is string => Boolean(id));

  let shortlisted = 0;
  let interviewed = 0;
  let placed = 0;
  let joined = 0;
  if (applicationIds.length) {
    const [funnel, placementRows] = await Promise.all([
      db
        .select({
          applicationId: applicationStageHistory.applicationId,
          shortlisted: sql<boolean>`bool_or(${workflowStages.key} = 'shortlisted' or ${workflowStages.category} in ('assessment', 'interview', 'decision', 'offer', 'pre_joining', 'joined'))`,
          interviewed: sql<boolean>`bool_or(${workflowStages.category} in ('interview', 'decision', 'offer', 'pre_joining', 'joined')) or exists (select 1 from interviews i where i.application_id = ${applicationStageHistory.applicationId} and i.status = 'completed')`,
        })
        .from(applicationStageHistory)
        .innerJoin(workflowStages, eq(workflowStages.id, applicationStageHistory.toStageId))
        .where(inArray(applicationStageHistory.applicationId, applicationIds))
        .groupBy(applicationStageHistory.applicationId),
      db
        .select({ status: placements.status, value: count() })
        .from(placements)
        .where(and(inArray(placements.applicationId, applicationIds), ne(placements.status, "cancelled")))
        .groupBy(placements.status),
    ]);
    shortlisted = funnel.filter((f) => f.shortlisted).length;
    interviewed = funnel.filter((f) => f.interviewed).length;
    placed = placementRows.reduce((sum, p) => sum + p.value, 0);
    joined = placementRows.filter((p) => ["joined", "completed", "replacement_required"].includes(p.status)).reduce((sum, p) => sum + p.value, 0);
  }

  let complaints: number | null = null;
  if (viewer.kind === "staff") {
    const ticketWhere: SQL[] = [
      or(inArray(supportTickets.category, ["complaint", "grievance"]), eq(supportTickets.isGrievance, true))!,
      inArray(supportTickets.relatedType, ["organization", "partner", "recruitment_partner"]),
      eq(supportTickets.relatedId, partnerOrganizationId),
    ];
    if (period.from) ticketWhere.push(gte(supportTickets.createdAt, period.from));
    if (period.to) ticketWhere.push(lte(supportTickets.createdAt, period.to));
    const [row] = await db.select({ value: count() }).from(supportTickets).where(and(...ticketWhere));
    complaints = row?.value ?? 0;
  }

  const timeliness = timelinessRows[0] ?? { withDue: 0, onTime: 0 };
  const medianRaw = medianRows.rows[0]?.median;
  const median = medianRaw === null || medianRaw === undefined ? null : Math.round(Number(medianRaw) * 10) / 10;
  const accepted = byStatus.get("accepted") ?? 0;
  return {
    partnerOrganizationId,
    period: { from: period.from ?? null, to: period.to ?? null },
    profilesSubmitted,
    uniqueCandidates: Number(uniqueRows[0]?.value ?? 0),
    verifiedProfiles: Number(verifiedRows[0]?.value ?? 0),
    accepted,
    rejected: byStatus.get("rejected") ?? 0,
    duplicates: byStatus.get("duplicate") ?? 0,
    pendingReview: (byStatus.get("submitted") ?? 0) + (byStatus.get("under_review") ?? 0),
    shortlisted,
    interviewed,
    placed,
    joined,
    rates: {
      acceptance: ratio(accepted, profilesSubmitted),
      shortlist: ratio(shortlisted, profilesSubmitted),
      interview: ratio(interviewed, profilesSubmitted),
      placement: ratio(placed, profilesSubmitted),
    },
    timeliness: {
      submissionsWithDueDate: Number(timeliness.withDue),
      onTime: Number(timeliness.onTime),
      onTimeRate: ratio(Number(timeliness.onTime), Number(timeliness.withDue)),
      medianHoursToFirstSubmission: Number.isFinite(median as number) ? median : null,
    },
    complaints,
  };
}
