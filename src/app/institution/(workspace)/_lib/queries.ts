import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { attendanceRecords, attendanceSessions, assessmentScores, batches, campusDrives, candidateProfiles, certificates, courseAssessments, courses, enrolments, placementOutcomes, users } from "@/db/schema";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import type { OrgContext } from "@/modules/identity/authz";

/**
 * Read-only queries the Institution Portal needs and the training module does not expose yet
 * (reported as cross-module needs). Every query is scoped to the caller's institution, and members
 * without institution.batches.manage (instructors) only see batches they are assigned to — the same rule
 * as the training module's listBatches().
 */

type InstitutionCtx = OrgContext<"institution">;

function assignedBatchFilter(ctx: InstitutionCtx): SQL | undefined {
  if (ctx.permissions.has("institution.batches.manage")) return undefined;
  return sql`exists (select 1 from batch_instructors bi where bi.batch_id = ${batches.id} and bi.user_id = ${ctx.user.id})`;
}

function orgBatches(ctx: InstitutionCtx): SQL {
  return and(eq(batches.organizationId, ctx.organization.id), assignedBatchFilter(ctx))!;
}

const countWhere = (condition: SQL) => sql<number>`count(*) filter (where ${condition})`.mapWith(Number);

// ---------------------------------------------------------------------------
// Outcome rates (dashboard, reports)
// ---------------------------------------------------------------------------

export type OutcomeRates = {
  attendance: { attended: number; counted: number };
  results: { passed: number; failed: number };
  completion: { completed: number; dropped: number };
  placements: { placedLearners: number; verifiedLearners: number; completedLearners: number };
};

/** Raw counts behind attendance, pass, completion and placement rates. Rates are derived by the caller (null when nothing to divide by). */
export async function getOutcomeRates(ctx: InstitutionCtx): Promise<OutcomeRates> {
  const orgId = ctx.organization.id;
  const [attendance, results, placed, completedLearners] = await Promise.all([
    db
      .select({
        attended: countWhere(sql`${attendanceRecords.status} in ('present', 'late')`),
        counted: countWhere(sql`${attendanceRecords.status} <> 'excused'`),
      })
      .from(attendanceRecords)
      .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
      .innerJoin(batches, eq(batches.id, attendanceSessions.batchId))
      .where(eq(batches.organizationId, orgId)),
    db
      .select({
        passed: countWhere(sql`${enrolments.resultStatus} = 'passed'`),
        failed: countWhere(sql`${enrolments.resultStatus} = 'failed'`),
        completed: countWhere(sql`${enrolments.status} = 'completed'`),
        dropped: countWhere(sql`${enrolments.status} = 'dropped'`),
      })
      .from(enrolments)
      .innerJoin(batches, eq(batches.id, enrolments.batchId))
      .where(eq(batches.organizationId, orgId)),
    db
      .select({
        placed: sql<number>`count(distinct ${placementOutcomes.candidateId})`.mapWith(Number),
        verified: sql<number>`count(distinct ${placementOutcomes.candidateId}) filter (where ${placementOutcomes.verified})`.mapWith(Number),
      })
      .from(placementOutcomes)
      .where(eq(placementOutcomes.organizationId, orgId)),
    db
      .select({ value: sql<number>`count(distinct ${enrolments.candidateId})`.mapWith(Number) })
      .from(enrolments)
      .innerJoin(batches, eq(batches.id, enrolments.batchId))
      .where(and(eq(batches.organizationId, orgId), eq(enrolments.status, "completed"))),
  ]);
  const r = results[0];
  return {
    attendance: { attended: attendance[0]?.attended ?? 0, counted: attendance[0]?.counted ?? 0 },
    results: { passed: r?.passed ?? 0, failed: r?.failed ?? 0 },
    completion: { completed: r?.completed ?? 0, dropped: r?.dropped ?? 0 },
    placements: { placedLearners: placed[0]?.placed ?? 0, verifiedLearners: placed[0]?.verified ?? 0, completedLearners: completedLearners[0]?.value ?? 0 },
  };
}

// ---------------------------------------------------------------------------
// Students across batches
// ---------------------------------------------------------------------------

export type InstitutionEnrolmentItem = {
  id: string;
  status: (typeof enrolments.$inferSelect)["status"];
  resultStatus: (typeof enrolments.$inferSelect)["resultStatus"];
  feeStatus: (typeof enrolments.$inferSelect)["feeStatus"];
  feeMinor: number | null;
  feeCurrency: string | null;
  attendancePercent: number | null;
  finalScore: number | null;
  appliedAt: Date;
  candidateName: string;
  email: string | null;
  phone: string | null;
  batchId: string;
  batchCode: string;
  batchTitle: string;
  batchStatus: (typeof batches.$inferSelect)["status"];
  courseTitle: string;
  certificationType: (typeof courses.$inferSelect)["certificationType"];
};

/**
 * Enrolments of the institution's batches. Contact details are included because applying to a batch shares
 * the candidate's name, email and phone with the organisation running it (stated on the application form).
 */
export async function listInstitutionEnrolments(
  ctx: InstitutionCtx,
  filters: { status?: InstitutionEnrolmentItem["status"]; q?: string; courseId?: string },
  page: PageQuery,
): Promise<Paginated<InstitutionEnrolmentItem>> {
  const where: SQL[] = [orgBatches(ctx)];
  if (filters.status) where.push(eq(enrolments.status, filters.status));
  if (filters.courseId) where.push(eq(batches.courseId, filters.courseId));
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim().replace(/[%_\\]/g, "")}%`;
    where.push(or(ilike(users.displayName, q), ilike(batches.code, q), ilike(courses.title, q))!);
  }
  const condition = and(...where);
  const base = () =>
    db
      .select({
        e: enrolments,
        candidateName: users.displayName,
        email: users.email,
        phone: users.phone,
        batchCode: batches.code,
        batchTitle: batches.title,
        batchStatus: batches.status,
        courseTitle: courses.title,
        certificationType: courses.certificationType,
      })
      .from(enrolments)
      .innerJoin(batches, eq(batches.id, enrolments.batchId))
      .innerJoin(courses, eq(courses.id, batches.courseId))
      .innerJoin(candidateProfiles, eq(candidateProfiles.id, enrolments.candidateId))
      .innerJoin(users, eq(users.id, candidateProfiles.userId));
  const [rows, total] = await Promise.all([
    base()
      .where(condition)
      .orderBy(sql`case ${enrolments.status} when 'applied' then 0 when 'waitlisted' then 1 else 2 end`, desc(enrolments.appliedAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db
      .select({ value: count() })
      .from(enrolments)
      .innerJoin(batches, eq(batches.id, enrolments.batchId))
      .innerJoin(courses, eq(courses.id, batches.courseId))
      .innerJoin(candidateProfiles, eq(candidateProfiles.id, enrolments.candidateId))
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .where(condition),
  ]);
  return paginated(
    rows.map((r) => ({
      id: r.e.id,
      status: r.e.status,
      resultStatus: r.e.resultStatus,
      feeStatus: r.e.feeStatus,
      feeMinor: r.e.feeMinor,
      feeCurrency: r.e.feeCurrency,
      attendancePercent: r.e.attendancePercent,
      finalScore: r.e.finalScore,
      appliedAt: r.e.appliedAt,
      candidateName: r.candidateName,
      email: r.email,
      phone: r.phone,
      batchId: r.e.batchId,
      batchCode: r.batchCode,
      batchTitle: r.batchTitle,
      batchStatus: r.batchStatus,
      courseTitle: r.courseTitle,
      certificationType: r.certificationType,
    })),
    total[0]?.value ?? 0,
    page,
  );
}

/** Enrolment counts by status for the students page tabs. */
export async function countInstitutionEnrolmentsByStatus(ctx: InstitutionCtx): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: enrolments.status, value: count() })
    .from(enrolments)
    .innerJoin(batches, eq(batches.id, enrolments.batchId))
    .where(orgBatches(ctx))
    .groupBy(enrolments.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.value]));
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

export type IssuableEnrolment = {
  enrolmentId: string;
  candidateName: string;
  courseTitle: string;
  batchCode: string;
  batchTitle: string;
  certificationType: (typeof courses.$inferSelect)["certificationType"];
  accreditationBody: string | null;
  resultStatus: (typeof enrolments.$inferSelect)["resultStatus"];
  completedAt: Date | null;
};

/**
 * Completed enrolments of the institution's own courses that can still receive a certificate (no active
 * certificate yet). The training service re-checks every issuing rule on submit.
 */
export async function listIssuableEnrolments(ctx: InstitutionCtx, limit = 200): Promise<IssuableEnrolment[]> {
  const rows = await db
    .select({
      enrolmentId: enrolments.id,
      candidateName: users.displayName,
      courseTitle: courses.title,
      batchCode: batches.code,
      batchTitle: batches.title,
      certificationType: courses.certificationType,
      accreditationBody: courses.accreditationBody,
      resultStatus: enrolments.resultStatus,
      completedAt: enrolments.completedAt,
    })
    .from(enrolments)
    .innerJoin(batches, eq(batches.id, enrolments.batchId))
    .innerJoin(courses, eq(courses.id, batches.courseId))
    .innerJoin(candidateProfiles, eq(candidateProfiles.id, enrolments.candidateId))
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(
      and(
        eq(batches.organizationId, ctx.organization.id),
        eq(courses.organizationId, ctx.organization.id),
        eq(enrolments.status, "completed"),
        ne(courses.certificationType, "none"),
        sql`not exists (select 1 from certificates c where c.enrolment_id = ${enrolments.id} and c.status = 'active')`,
      ),
    )
    .orderBy(desc(enrolments.completedAt))
    .limit(limit);
  return rows;
}

// ---------------------------------------------------------------------------
// Course assessments across batches
// ---------------------------------------------------------------------------

export type InstitutionAssessmentItem = {
  id: string;
  title: string;
  type: (typeof courseAssessments.$inferSelect)["type"];
  maxScore: number;
  passScore: number | null;
  weightPercent: number | null;
  scheduledAt: Date | null;
  resultsPublishedAt: Date | null;
  batchId: string;
  batchCode: string;
  batchTitle: string;
  courseTitle: string;
  scored: number;
};

export async function listInstitutionAssessments(ctx: InstitutionCtx, filters: { published?: boolean }, page: PageQuery): Promise<Paginated<InstitutionAssessmentItem>> {
  const where: SQL[] = [orgBatches(ctx)];
  if (filters.published === true) where.push(sql`${courseAssessments.resultsPublishedAt} is not null`);
  if (filters.published === false) where.push(isNull(courseAssessments.resultsPublishedAt));
  const condition = and(...where);
  const scored = db
    .select({ assessmentId: assessmentScores.assessmentId, value: count().as("scored") })
    .from(assessmentScores)
    .where(or(sql`${assessmentScores.score} is not null`, eq(assessmentScores.isAbsent, true)))
    .groupBy(assessmentScores.assessmentId)
    .as("scored");
  const [rows, total] = await Promise.all([
    db
      .select({ a: courseAssessments, batchCode: batches.code, batchTitle: batches.title, courseTitle: courses.title, scored: scored.value })
      .from(courseAssessments)
      .innerJoin(batches, eq(batches.id, courseAssessments.batchId))
      .innerJoin(courses, eq(courses.id, batches.courseId))
      .leftJoin(scored, eq(scored.assessmentId, courseAssessments.id))
      .where(condition)
      .orderBy(sql`${courseAssessments.scheduledAt} desc nulls last`, desc(courseAssessments.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(courseAssessments).innerJoin(batches, eq(batches.id, courseAssessments.batchId)).where(condition),
  ]);
  return paginated(
    rows.map((r) => ({
      id: r.a.id,
      title: r.a.title,
      type: r.a.type,
      maxScore: r.a.maxScore,
      passScore: r.a.passScore,
      weightPercent: r.a.weightPercent,
      scheduledAt: r.a.scheduledAt,
      resultsPublishedAt: r.a.resultsPublishedAt,
      batchId: r.a.batchId,
      batchCode: r.batchCode,
      batchTitle: r.batchTitle,
      courseTitle: r.courseTitle,
      scored: Number(r.scored ?? 0),
    })),
    total[0]?.value ?? 0,
    page,
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type CourseReportRow = {
  courseId: string;
  code: string;
  title: string;
  status: (typeof courses.$inferSelect)["status"];
  batches: number;
  enrolled: number;
  completed: number;
  dropped: number;
  passed: number;
  failed: number;
  certificates: number;
  placedLearners: number;
  verifiedPlacedLearners: number;
};

/** Per-course outcome counts for the institution (live data; rates derived by the caller). */
export async function getCourseReport(ctx: InstitutionCtx): Promise<CourseReportRow[]> {
  const orgId = ctx.organization.id;
  const [courseRows, batchCounts, enrolmentCounts, certCounts, placementCounts] = await Promise.all([
    db
      .select({ id: courses.id, code: courses.code, title: courses.title, status: courses.status })
      .from(courses)
      .where(and(eq(courses.organizationId, orgId), isNull(courses.deletedAt)))
      .orderBy(asc(courses.title)),
    db.select({ courseId: batches.courseId, value: count() }).from(batches).where(and(eq(batches.organizationId, orgId), ne(batches.status, "cancelled"))).groupBy(batches.courseId),
    db
      .select({
        courseId: batches.courseId,
        enrolled: countWhere(sql`${enrolments.status} in ('confirmed', 'in_progress', 'completed', 'dropped')`),
        completed: countWhere(sql`${enrolments.status} = 'completed'`),
        dropped: countWhere(sql`${enrolments.status} = 'dropped'`),
        passed: countWhere(sql`${enrolments.resultStatus} = 'passed'`),
        failed: countWhere(sql`${enrolments.resultStatus} = 'failed'`),
      })
      .from(enrolments)
      .innerJoin(batches, eq(batches.id, enrolments.batchId))
      .where(eq(batches.organizationId, orgId))
      .groupBy(batches.courseId),
    db
      .select({ courseId: certificates.courseId, value: count() })
      .from(certificates)
      .where(and(eq(certificates.issuerOrganizationId, orgId), eq(certificates.status, "active")))
      .groupBy(certificates.courseId),
    db
      .select({
        courseId: batches.courseId,
        placed: sql<number>`count(distinct ${placementOutcomes.candidateId})`.mapWith(Number),
        verified: sql<number>`count(distinct ${placementOutcomes.candidateId}) filter (where ${placementOutcomes.verified})`.mapWith(Number),
      })
      .from(placementOutcomes)
      .innerJoin(enrolments, eq(enrolments.id, placementOutcomes.enrolmentId))
      .innerJoin(batches, eq(batches.id, enrolments.batchId))
      .where(eq(placementOutcomes.organizationId, orgId))
      .groupBy(batches.courseId),
  ]);
  const byId = <T extends { courseId: string | null }>(rows: T[]) => new Map(rows.map((r) => [r.courseId, r]));
  const b = byId(batchCounts);
  const e = byId(enrolmentCounts);
  const c = byId(certCounts);
  const p = byId(placementCounts);
  return courseRows.map((course) => ({
    courseId: course.id,
    code: course.code,
    title: course.title,
    status: course.status,
    batches: b.get(course.id)?.value ?? 0,
    enrolled: e.get(course.id)?.enrolled ?? 0,
    completed: e.get(course.id)?.completed ?? 0,
    dropped: e.get(course.id)?.dropped ?? 0,
    passed: e.get(course.id)?.passed ?? 0,
    failed: e.get(course.id)?.failed ?? 0,
    certificates: c.get(course.id)?.value ?? 0,
    placedLearners: p.get(course.id)?.placed ?? 0,
    verifiedPlacedLearners: p.get(course.id)?.verified ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

/** Learners of the institution's batches for the placement-outcome form (confirmed, in progress or completed). */
export async function listLearnerOptions(ctx: InstitutionCtx, limit = 500): Promise<{ value: string; label: string }[]> {
  const rows = await db
    .select({ id: enrolments.id, name: users.displayName, courseTitle: courses.title, batchCode: batches.code })
    .from(enrolments)
    .innerJoin(batches, eq(batches.id, enrolments.batchId))
    .innerJoin(courses, eq(courses.id, batches.courseId))
    .innerJoin(candidateProfiles, eq(candidateProfiles.id, enrolments.candidateId))
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(and(eq(batches.organizationId, ctx.organization.id), inArray(enrolments.status, ["confirmed", "in_progress", "completed"])))
    .orderBy(asc(users.displayName))
    .limit(limit);
  return rows.map((r) => ({ value: r.id, label: `${r.name} · ${r.courseTitle} (${r.batchCode})` }));
}

/** The institution's courses for pickers (batch scheduling, filters). Archived courses are left out. */
export async function listCourseOptions(ctx: InstitutionCtx): Promise<{ value: string; label: string; status: (typeof courses.$inferSelect)["status"] }[]> {
  const rows = await db
    .select({ id: courses.id, title: courses.title, code: courses.code, status: courses.status })
    .from(courses)
    .where(and(eq(courses.organizationId, ctx.organization.id), isNull(courses.deletedAt), ne(courses.status, "archived")))
    .orderBy(asc(courses.title));
  return rows.map((r) => ({ value: r.id, label: `${r.title} (${r.code})`, status: r.status }));
}

/** One campus drive organised by the caller's institution, or null (the training module has no single-drive getter yet). */
export async function getInstitutionDrive(ctx: InstitutionCtx, driveId: string): Promise<typeof campusDrives.$inferSelect | null> {
  const [drive] = await db
    .select()
    .from(campusDrives)
    .where(and(eq(campusDrives.id, driveId), eq(campusDrives.organizationId, ctx.organization.id)))
    .limit(1);
  return drive ?? null;
}
