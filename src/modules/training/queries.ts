import "server-only";

import { and, asc, count, desc, eq, gt, gte, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  batches,
  campusDrives,
  candidateProfiles,
  certificates,
  courseModules,
  courses,
  enrolments,
  files,
  institutionProfiles,
  organizations,
  placementOutcomes,
  users,
} from "@/db/schema";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { getLatestApprovalForEntity } from "@/modules/approvals/service";
import { fileUrl, thumbnailUrl } from "@/modules/files";
import { staffCan, type OrgContext } from "@/modules/identity/authz";
import { forbiddenError } from "@/modules/organizations/errors";
import { isAuthorisedIssuerNow } from "@/modules/organizations/institution";

import { assertTrainingAccess, isInstitutionActor, loadBatchForActor, loadCourseForActor, type BatchRow, type CourseRow, type EnrolmentRow, type TrainingActor } from "./access";
import { listBatchInstructors, type BatchInstructorRow } from "./batches";
import type { CandidateActor } from "./candidate";
import type { CourseModuleRow } from "./courses";
import { toIsoDate } from "./rules";
import type { CatalogueFilters } from "./schemas";

type Image = { url: string; thumbnailUrl: string | null };
export type CourseProvider = { kind: "venkat_sai"; name: string } | { kind: "institution"; id: string; name: string; slug: string; logo: Image | null };
export type CatalogueBatch = Pick<BatchRow, "id" | "code" | "title" | "startsOn" | "endsOn" | "schedule" | "mode" | "venue" | "city" | "countryCode" | "registrationDeadline" | "status"> & {
  seatsLeft: number | null;
};
export type CatalogueCourse = Pick<
  CourseRow,
  | "id"
  | "slug"
  | "code"
  | "title"
  | "summary"
  | "category"
  | "mode"
  | "durationHours"
  | "durationWeeks"
  | "feeType"
  | "feeMinor"
  | "feeCurrency"
  | "certificationType"
  | "accreditationBody"
  | "languageCodes"
  | "isFeatured"
  | "publishedAt"
> & { cover: Image | null; provider: CourseProvider; nextBatch: CatalogueBatch | null; openBatchCount: number };
export type PublicCourseDetail = CatalogueCourse & {
  descriptionHtml: string | null;
  eligibility: string | null;
  prerequisites: string | null;
  outcomes: string[];
  feeNotes: string | null;
  modules: Pick<CourseModuleRow, "id" | "title" | "description" | "durationHours" | "sortOrder">[];
  batches: CatalogueBatch[];
};

const VENKAT_SAI_PROVIDER: CourseProvider = { kind: "venkat_sai", name: "Venkat Sai" };

function image(file: typeof files.$inferSelect | null | undefined): Image | null {
  if (!file || file.visibility !== "public" || file.deletedAt || file.scanStatus === "infected") return null;
  return { url: fileUrl(file, { variant: "lg" }), thumbnailUrl: thumbnailUrl(file) };
}

/** Courses visible publicly: published, not deleted, and Venkat Sai's own or from a verified (not lapsed) institution. */
function listableCourse(now: Date): SQL {
  return and(
    eq(courses.status, "published"),
    isNull(courses.deletedAt),
    or(
      isNull(courses.organizationId),
      and(eq(organizations.status, "verified"), isNull(organizations.deletedAt), or(isNull(organizations.verificationExpiresAt), gt(organizations.verificationExpiresAt, now))),
    ),
  )!;
}

function openBatchCondition(today: string): SQL {
  return and(inArray(batches.status, ["open", "full"]), or(isNull(batches.registrationDeadline), gte(batches.registrationDeadline, today)))!;
}

function toCatalogueBatch(b: BatchRow): CatalogueBatch {
  return {
    id: b.id,
    code: b.code,
    title: b.title,
    startsOn: b.startsOn,
    endsOn: b.endsOn,
    schedule: b.schedule,
    mode: b.mode,
    venue: b.venue,
    city: b.city,
    countryCode: b.countryCode,
    registrationDeadline: b.registrationDeadline,
    status: b.status,
    seatsLeft: b.capacity === null ? null : Math.max(0, b.capacity - b.enrolledCount),
  };
}

/**
 * Public training catalogue: published courses (Venkat Sai and verified institutions) with their next
 * open batch. Filters: free text, category, mode, fee type, certification type, language, provider,
 * batch country / city, open batches only.
 */
export async function listPublicCourses(filters: CatalogueFilters, page: PageQuery, now: Date = new Date()): Promise<Paginated<CatalogueCourse>> {
  const today = toIsoDate(now);
  const where: SQL[] = [listableCourse(now)];
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.push(or(sql`${courses.searchVector} @@ websearch_to_tsquery('simple', ${q})`, ilike(courses.title, `%${q.replace(/[%_\\]/g, "")}%`))!);
  }
  if (filters.category) where.push(eq(courses.category, filters.category));
  if (filters.mode) where.push(eq(courses.mode, filters.mode));
  if (filters.feeType) where.push(eq(courses.feeType, filters.feeType));
  if (filters.certificationType) where.push(eq(courses.certificationType, filters.certificationType));
  if (filters.language) where.push(sql`${courses.languageCodes} @> array[${filters.language}]::text[]`);
  if (filters.venkatSaiOnly) where.push(isNull(courses.organizationId));
  else if (filters.institution) where.push(eq(organizations.slug, filters.institution));
  const batchFilters: SQL[] = [eq(batches.courseId, courses.id), openBatchCondition(today)];
  if (filters.countryCode) batchFilters.push(eq(batches.countryCode, filters.countryCode));
  if (filters.city?.trim()) batchFilters.push(ilike(batches.city, filters.city.trim().replace(/[%_\\]/g, "")));
  const hasBatch = sql`exists (select 1 from ${batches} where ${and(...batchFilters)})`;
  if (filters.openBatchesOnly || filters.countryCode || filters.city) where.push(hasBatch);
  const condition = and(...where);

  const [rows, total] = await Promise.all([
    db
      .select({ course: courses, org: organizations, cover: files })
      .from(courses)
      .leftJoin(organizations, eq(organizations.id, courses.organizationId))
      .leftJoin(files, eq(files.id, courses.coverFileId))
      .where(condition)
      .orderBy(desc(courses.isFeatured), desc(sql`${hasBatch}`), desc(courses.publishedAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(courses).leftJoin(organizations, eq(organizations.id, courses.organizationId)).where(condition),
  ]);
  const items = await decorateCourses(rows, today);
  return paginated(items, total[0]?.value ?? 0, page);
}

async function decorateCourses(rows: { course: CourseRow; org: typeof organizations.$inferSelect | null; cover: typeof files.$inferSelect | null }[], today: string): Promise<CatalogueCourse[]> {
  if (!rows.length) return [];
  const courseIds = rows.map((r) => r.course.id);
  const open = await db
    .select()
    .from(batches)
    .where(and(inArray(batches.courseId, courseIds), openBatchCondition(today)))
    .orderBy(sql`${batches.startsOn} asc nulls last`, asc(batches.createdAt));
  const logoIds = rows.map((r) => r.org?.logoFileId).filter((v): v is string => !!v);
  const logos = logoIds.length ? await db.select().from(files).where(inArray(files.id, logoIds)) : [];
  const logoById = new Map(logos.map((f) => [f.id, f]));
  return rows.map(({ course, org, cover }) => {
    const courseBatches = open.filter((b) => b.courseId === course.id);
    return {
      id: course.id,
      slug: course.slug,
      code: course.code,
      title: course.title,
      summary: course.summary,
      category: course.category,
      mode: course.mode,
      durationHours: course.durationHours,
      durationWeeks: course.durationWeeks,
      feeType: course.feeType,
      feeMinor: course.feeMinor,
      feeCurrency: course.feeCurrency,
      certificationType: course.certificationType,
      accreditationBody: course.accreditationBody,
      languageCodes: course.languageCodes,
      isFeatured: course.isFeatured,
      publishedAt: course.publishedAt,
      cover: image(cover),
      provider: org ? { kind: "institution", id: org.id, name: org.name, slug: org.slug, logo: org.logoFileId ? image(logoById.get(org.logoFileId)) : null } : VENKAT_SAI_PROVIDER,
      nextBatch: courseBatches[0] ? toCatalogueBatch(courseBatches[0]) : null,
      openBatchCount: courseBatches.length,
    };
  });
}

/** Public course page by slug: syllabus (titles only, no materials) and upcoming batches. */
export async function getPublicCourse(slug: string, now: Date = new Date()): Promise<PublicCourseDetail | null> {
  const today = toIsoDate(now);
  const [row] = await db
    .select({ course: courses, org: organizations, cover: files })
    .from(courses)
    .leftJoin(organizations, eq(organizations.id, courses.organizationId))
    .leftJoin(files, eq(files.id, courses.coverFileId))
    .where(and(eq(courses.slug, slug), listableCourse(now)))
    .limit(1);
  if (!row) return null;
  const [base] = await decorateCourses([row], today);
  const modules = await db
    .select({ id: courseModules.id, title: courseModules.title, description: courseModules.description, durationHours: courseModules.durationHours, sortOrder: courseModules.sortOrder })
    .from(courseModules)
    .where(eq(courseModules.courseId, row.course.id))
    .orderBy(asc(courseModules.sortOrder));
  const upcoming = await db
    .select()
    .from(batches)
    .where(and(eq(batches.courseId, row.course.id), inArray(batches.status, ["planned", "open", "full"]), or(isNull(batches.startsOn), gte(batches.startsOn, today))))
    .orderBy(sql`${batches.startsOn} asc nulls last`);
  return {
    ...base!,
    descriptionHtml: row.course.descriptionHtml,
    eligibility: row.course.eligibility,
    prerequisites: row.course.prerequisites,
    outcomes: row.course.outcomes,
    feeNotes: row.course.feeNotes,
    modules,
    batches: upcoming.map(toCatalogueBatch),
  };
}

// ---------------------------------------------------------------------------
// Institution dashboard
// ---------------------------------------------------------------------------

export type InstitutionDashboardStats = {
  courses: Record<CourseRow["status"], number>;
  batches: Record<BatchRow["status"], number>;
  enrolments: { applied: number; waitlisted: number; active: number; completed: number };
  certificates: { active: number; issuedLast30Days: number };
  upcomingBatches: Pick<BatchRow, "id" | "code" | "title" | "startsOn" | "enrolledCount" | "capacity" | "status">[];
  upcomingDrives: number;
  placementOutcomes: { total: number; verified: number };
  isAuthorisedCertificateIssuer: boolean;
};

/** Live counts for the Institution Portal dashboard (institution.dashboard). No figures are estimated. */
export async function getInstitutionDashboardStats(ctx: OrgContext, now: Date = new Date()): Promise<InstitutionDashboardStats> {
  if (ctx.orgType !== "institution" || !ctx.permissions.has("institution.dashboard")) throw forbiddenError();
  const orgId = ctx.organization.id;
  const today = toIsoDate(now);
  const [courseRows, batchRows, enrolmentRows, certRows, recentCerts, upcoming, drives, outcomes, profile] = await Promise.all([
    db.select({ status: courses.status, value: count() }).from(courses).where(and(eq(courses.organizationId, orgId), isNull(courses.deletedAt))).groupBy(courses.status),
    db.select({ status: batches.status, value: count() }).from(batches).where(eq(batches.organizationId, orgId)).groupBy(batches.status),
    db
      .select({ status: enrolments.status, value: count() })
      .from(enrolments)
      .innerJoin(batches, eq(batches.id, enrolments.batchId))
      .where(eq(batches.organizationId, orgId))
      .groupBy(enrolments.status),
    db.select({ value: count() }).from(certificates).where(and(eq(certificates.issuerOrganizationId, orgId), eq(certificates.status, "active"))),
    db.select({ value: count() }).from(certificates).where(and(eq(certificates.issuerOrganizationId, orgId), gte(certificates.issuedAt, new Date(now.getTime() - 30 * 86_400_000)))),
    db
      .select({ id: batches.id, code: batches.code, title: batches.title, startsOn: batches.startsOn, enrolledCount: batches.enrolledCount, capacity: batches.capacity, status: batches.status })
      .from(batches)
      .where(and(eq(batches.organizationId, orgId), inArray(batches.status, ["planned", "open", "full"]), gte(batches.startsOn, today)))
      .orderBy(asc(batches.startsOn))
      .limit(5),
    db.select({ value: count() }).from(campusDrives).where(and(eq(campusDrives.organizationId, orgId), inArray(campusDrives.status, ["planned", "open"]), or(isNull(campusDrives.driveDate), gte(campusDrives.driveDate, today)))),
    db.select({ verified: placementOutcomes.verified, value: count() }).from(placementOutcomes).where(eq(placementOutcomes.organizationId, orgId)).groupBy(placementOutcomes.verified),
    db.select().from(institutionProfiles).where(eq(institutionProfiles.organizationId, orgId)).limit(1),
  ]);
  const by = <K extends string>(rows: { status: K; value: number }[], keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, rows.find((r) => r.status === k)?.value ?? 0])) as Record<K, number>;
  const enrol = by(enrolmentRows, ["applied", "waitlisted", "confirmed", "in_progress", "completed", "rejected", "dropped", "cancelled"] as const);
  return {
    courses: by(courseRows, ["draft", "pending_approval", "changes_requested", "published", "rejected", "archived"] as const),
    batches: by(batchRows, ["planned", "open", "full", "in_progress", "completed", "cancelled"] as const),
    enrolments: { applied: enrol.applied, waitlisted: enrol.waitlisted, active: enrol.confirmed + enrol.in_progress, completed: enrol.completed },
    certificates: { active: certRows[0]?.value ?? 0, issuedLast30Days: recentCerts[0]?.value ?? 0 },
    upcomingBatches: upcoming,
    upcomingDrives: drives[0]?.value ?? 0,
    placementOutcomes: { total: outcomes.reduce((s, r) => s + r.value, 0), verified: outcomes.find((r) => r.verified)?.value ?? 0 },
    isAuthorisedCertificateIssuer: isAuthorisedIssuerNow(profile[0] ?? null, now),
  };
}

// ---------------------------------------------------------------------------
// Management lists (institution members / staff)
// ---------------------------------------------------------------------------

const VIEW_COURSES = { member: "institution.courses.manage", staff: ["training.view", "training.manage"] } as const;

export async function listCourses(
  actor: TrainingActor,
  filters: { status?: CourseRow["status"]; q?: string; organizationId?: string | "venkat_sai" },
  page: PageQuery,
): Promise<Paginated<CourseRow & { batchCount: number }>> {
  const where: SQL[] = [isNull(courses.deletedAt)];
  if (isInstitutionActor(actor)) {
    assertTrainingAccess(actor, actor.organization.id, VIEW_COURSES);
    where.push(eq(courses.organizationId, actor.organization.id));
  } else {
    if (!staffCan(actor, ["training.view", "training.manage"], "any")) throw forbiddenError();
    if (filters.organizationId === "venkat_sai") where.push(isNull(courses.organizationId));
    else if (filters.organizationId) where.push(eq(courses.organizationId, filters.organizationId));
  }
  if (filters.status) where.push(eq(courses.status, filters.status));
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim().replace(/[%_\\]/g, "")}%`;
    where.push(or(ilike(courses.title, q), ilike(courses.code, q))!);
  }
  const condition = and(...where);
  const [rows, total] = await Promise.all([
    db.select().from(courses).where(condition).orderBy(desc(courses.updatedAt)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(courses).where(condition),
  ]);
  // Counted separately: correlated sub-selects in a single-table select list lose their table qualifiers.
  const counts = rows.length
    ? await db.select({ courseId: batches.courseId, value: count() }).from(batches).where(inArray(batches.courseId, rows.map((r) => r.id))).groupBy(batches.courseId)
    : [];
  const byCourse = new Map(counts.map((c) => [c.courseId, c.value]));
  return paginated(rows.map((r) => ({ ...r, batchCount: byCourse.get(r.id) ?? 0 })), total[0]?.value ?? 0, page);
}

/** Course with syllabus and the latest publication decision (reason shown when changes were requested). */
export async function getCourseForActor(actor: TrainingActor, courseId: string): Promise<{ course: CourseRow; modules: CourseModuleRow[]; latestDecision: { status: string; reason: string | null; decidedAt: Date | null } | null }> {
  const course = await loadCourseForActor(actor, courseId, VIEW_COURSES);
  const modules = await db.select().from(courseModules).where(eq(courseModules.courseId, course.id)).orderBy(asc(courseModules.sortOrder));
  const approval = course.organizationId ? await getLatestApprovalForEntity("course_publication", course.id) : null;
  return { course, modules, latestDecision: approval ? { status: approval.status, reason: approval.decisionReason, decidedAt: approval.decidedAt } : null };
}

export async function listBatches(
  actor: TrainingActor,
  filters: { courseId?: string; status?: BatchRow["status"]; organizationId?: string | "venkat_sai" },
  page: PageQuery,
): Promise<Paginated<BatchRow & { courseTitle: string; courseCode: string }>> {
  const where: SQL[] = [];
  if (isInstitutionActor(actor)) {
    if (actor.orgType !== "institution") throw forbiddenError();
    where.push(eq(batches.organizationId, actor.organization.id));
    if (!actor.permissions.has("institution.batches.manage")) {
      // Instructors see their assigned batches only.
      if (!actor.permissions.has("institution.students.manage") && !actor.permissions.has("institution.assessments.manage")) throw forbiddenError();
      where.push(sql`exists (select 1 from batch_instructors bi where bi.batch_id = ${batches.id} and bi.user_id = ${actor.user.id})`);
    }
  } else {
    if (!staffCan(actor, ["training.view", "training.manage"], "any")) throw forbiddenError();
    if (filters.organizationId === "venkat_sai") where.push(isNull(batches.organizationId));
    else if (filters.organizationId) where.push(eq(batches.organizationId, filters.organizationId));
  }
  if (filters.courseId) where.push(eq(batches.courseId, filters.courseId));
  if (filters.status) where.push(eq(batches.status, filters.status));
  const condition = where.length ? and(...where) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select({ batch: batches, courseTitle: courses.title, courseCode: courses.code })
      .from(batches)
      .innerJoin(courses, eq(courses.id, batches.courseId))
      .where(condition)
      .orderBy(sql`${batches.startsOn} desc nulls last`, desc(batches.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(batches).where(condition),
  ]);
  return paginated(rows.map((r) => ({ ...r.batch, courseTitle: r.courseTitle, courseCode: r.courseCode })), total[0]?.value ?? 0, page);
}

export type BatchDetail = { batch: BatchRow; course: CourseRow; instructors: BatchInstructorRow[]; enrolmentCounts: Record<EnrolmentRow["status"], number> };

export async function getBatchForActor(actor: TrainingActor, batchId: string): Promise<BatchDetail> {
  const { batch, course } = await loadBatchForActor(actor, batchId, { member: "institution.students.manage", staff: ["training.view", "training.manage"], instructorScoped: true });
  const [instructors, counts] = await Promise.all([
    listBatchInstructors(batch.id),
    db.select({ status: enrolments.status, value: count() }).from(enrolments).where(eq(enrolments.batchId, batch.id)).groupBy(enrolments.status),
  ]);
  const statuses = ["applied", "confirmed", "waitlisted", "rejected", "in_progress", "completed", "dropped", "cancelled"] as const;
  return {
    batch,
    course,
    instructors,
    enrolmentCounts: Object.fromEntries(statuses.map((s) => [s, counts.find((c) => c.status === s)?.value ?? 0])) as Record<EnrolmentRow["status"], number>,
  };
}

export type BatchEnrolmentItem = EnrolmentRow & { candidateName: string; email: string | null; phone: string | null };

/**
 * Learners of a batch with contact details — applying to a batch shares the candidate's name, email and
 * phone with the organisation running it (stated on the application form).
 */
export async function listBatchEnrolments(actor: TrainingActor, batchId: string, filters: { status?: EnrolmentRow["status"] } = {}): Promise<BatchEnrolmentItem[]> {
  const { batch } = await loadBatchForActor(actor, batchId, { member: "institution.students.manage", staff: ["training.view", "training.manage"], instructorScoped: true });
  const rows = await db
    .select({ e: enrolments, candidateName: users.displayName, email: users.email, phone: users.phone })
    .from(enrolments)
    .innerJoin(candidateProfiles, eq(candidateProfiles.id, enrolments.candidateId))
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(and(eq(enrolments.batchId, batch.id), filters.status ? eq(enrolments.status, filters.status) : undefined))
    .orderBy(asc(enrolments.appliedAt));
  return rows.map((r) => ({ ...r.e, candidateName: r.candidateName, email: r.email, phone: r.phone }));
}

export type CandidateEnrolmentItem = EnrolmentRow & {
  batch: Pick<BatchRow, "id" | "code" | "title" | "startsOn" | "endsOn" | "schedule" | "mode" | "venue" | "city" | "countryCode" | "status" | "cancellationReason">;
  course: Pick<CourseRow, "id" | "slug" | "code" | "title" | "certificationType">;
  providerName: string;
};

/** The candidate's own enrolments (People Portal). */
export async function listCandidateEnrolments(candidate: CandidateActor): Promise<CandidateEnrolmentItem[]> {
  const rows = await db
    .select({ e: enrolments, batch: batches, course: courses, providerName: organizations.name })
    .from(enrolments)
    .innerJoin(batches, eq(batches.id, enrolments.batchId))
    .innerJoin(courses, eq(courses.id, batches.courseId))
    .leftJoin(organizations, eq(organizations.id, batches.organizationId))
    .where(eq(enrolments.candidateId, candidate.candidateId))
    .orderBy(desc(enrolments.appliedAt));
  return rows.map((r) => ({
    ...r.e,
    batch: {
      id: r.batch.id,
      code: r.batch.code,
      title: r.batch.title,
      startsOn: r.batch.startsOn,
      endsOn: r.batch.endsOn,
      schedule: r.batch.schedule,
      mode: r.batch.mode,
      venue: r.batch.venue,
      city: r.batch.city,
      countryCode: r.batch.countryCode,
      status: r.batch.status,
      cancellationReason: r.batch.cancellationReason,
    },
    course: { id: r.course.id, slug: r.course.slug, code: r.course.code, title: r.course.title, certificationType: r.course.certificationType },
    providerName: r.providerName ?? "Venkat Sai",
  }));
}

/** Command Centre training overview counts (training.view). */
export async function getTrainingOverview(actor: TrainingActor): Promise<{ publishedCourses: number; pendingCourses: number; openBatches: number; activeLearners: number; activeCertificates: number }> {
  if (isInstitutionActor(actor) || !staffCan(actor, ["training.view", "training.manage"], "any")) throw forbiddenError();
  const [published, pending, open, learners, certs] = await Promise.all([
    db.select({ value: count() }).from(courses).where(and(eq(courses.status, "published"), isNull(courses.deletedAt))),
    db.select({ value: count() }).from(courses).where(and(eq(courses.status, "pending_approval"), isNull(courses.deletedAt))),
    db.select({ value: count() }).from(batches).where(inArray(batches.status, ["open", "full"])),
    db.select({ value: count() }).from(enrolments).where(inArray(enrolments.status, ["confirmed", "in_progress"])),
    db.select({ value: count() }).from(certificates).where(eq(certificates.status, "active")),
  ]);
  return {
    publishedCourses: published[0]?.value ?? 0,
    pendingCourses: pending[0]?.value ?? 0,
    openBatches: open[0]?.value ?? 0,
    activeLearners: learners[0]?.value ?? 0,
    activeCertificates: certs[0]?.value ?? 0,
  };
}
