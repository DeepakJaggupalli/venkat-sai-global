import "server-only";

import { and, asc, count, eq, inArray, isNull, max } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { batches, courseModules, courses, currencies, institutionProfiles, languages, organizations, skills } from "@/db/schema";
import { nextCode } from "@/lib/codes";
import { toMinorUnits } from "@/lib/format";
import { uniqueSlug } from "@/lib/http";
import { sanitizeRichText } from "@/lib/sanitize";
import { cancelApprovalsForEntity, submitForApproval } from "@/modules/approvals/service";
import { audit } from "@/modules/audit";
import { checkEntitlement } from "@/modules/commercial/entitlements";
import { requireUploadedFile, setFileVisibility } from "@/modules/files";
import type { StaffContext } from "@/modules/identity/authz";
import { conflictError, forbiddenError, invalidStateError, notFoundError, validationError, withConstraintMessages } from "@/modules/organizations/errors";
import { isAuthorisedIssuerNow } from "@/modules/organizations/institution";
import { hasValidVerification } from "@/modules/organizations/rules";

import { actorInstitutionId, assertStaffPermission, isInstitutionActor, loadCourseForActor, trainingActorUserId, type CourseRow, type TrainingActor } from "./access";
import type { CourseInput, CourseModuleInput } from "./schemas";

export type CourseModuleRow = typeof courseModules.$inferSelect;

const MANAGE = { member: "institution.courses.manage", staff: "training.manage" } as const;
/** Statuses an institution can submit from. */
const SUBMITTABLE = new Set(["draft", "changes_requested", "rejected", "pending_approval"]);

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

async function assertSkills(tx: DbOrTx, ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  const found = await tx.select({ id: skills.id }).from(skills).where(inArray(skills.id, [...ids]));
  if (found.length !== new Set(ids).size) throw validationError("Choose skills from the list.", { skillIds: ["Choose skills from the list"] });
}

async function assertLanguages(tx: DbOrTx, codes: readonly string[]): Promise<void> {
  if (!codes.length) return;
  const found = await tx.select({ code: languages.code }).from(languages).where(inArray(languages.code, [...codes]));
  if (found.length !== new Set(codes).size) throw validationError("Choose languages from the list.", { languageCodes: ["Choose languages from the list"] });
}

export async function assertCurrency(tx: DbOrTx, code: string | undefined, field: string): Promise<void> {
  if (!code) return;
  const [row] = await tx.select({ code: currencies.code }).from(currencies).where(eq(currencies.code, code)).limit(1);
  if (!row) throw validationError("Choose a valid currency.", { [field]: ["Choose a valid currency"] });
}

/** Course files (purpose course_material) uploaded for the owning organisation or by the actor. */
async function requireCourseFile(tx: DbOrTx, fileId: string, organizationId: string | null, actorUserId: string, opts: { image?: boolean } = {}): Promise<string> {
  const file = await requireUploadedFile(fileId, { purposes: ["course_material"], ownerUserId: actorUserId, ...(organizationId ? { organizationId } : {}) }, tx);
  if (opts.image) {
    if (!file.mimeType.startsWith("image/")) throw validationError("The cover must be an image.", { coverFileId: ["Upload a JPG, PNG or WebP image"] });
    if (file.visibility !== "public") await setFileVisibility(file.id, "public", { actorUserId, tx });
  }
  return file.id;
}

function courseValues(input: CourseInput) {
  const fixed = input.feeType === "fixed" && input.feeAmount !== undefined && input.feeCurrency;
  return {
    title: input.title,
    summary: input.summary ?? null,
    descriptionHtml: sanitizeRichText(input.descriptionHtml) || null,
    category: input.category,
    skillIds: input.skillIds,
    mode: input.mode,
    durationHours: input.durationHours ?? null,
    durationWeeks: input.durationWeeks ?? null,
    eligibility: input.eligibility ?? null,
    prerequisites: input.prerequisites ?? null,
    outcomes: input.outcomes,
    feeType: input.feeType,
    feeMinor: fixed ? toMinorUnits(input.feeAmount!, input.feeCurrency!) : null,
    feeCurrency: fixed ? input.feeCurrency! : null,
    feeNotes: input.feeNotes ?? null,
    languageCodes: input.languageCodes,
    certificationType: input.certificationType,
    accreditationBody: input.accreditationBody ?? null,
  };
}

async function validateCourseInput(tx: DbOrTx, input: CourseInput): Promise<void> {
  await assertSkills(tx, input.skillIds);
  await assertLanguages(tx, input.languageCodes);
  await assertCurrency(tx, input.feeType === "fixed" ? input.feeCurrency : undefined, "feeCurrency");
}

const COURSE_CONSTRAINTS = {
  courses_slug_uq: "Another course was created with the same title at the same moment. Please try again.",
  courses_fee_chk: "A fixed fee needs an amount and a currency; free and on-request courses carry no amount.",
  courses_accreditation_body_chk: "Name the external awarding body for an accredited course.",
};

/** Snapshot for the approval centre: what exactly would be published. */
async function courseSnapshot(tx: DbOrTx, course: CourseRow): Promise<Record<string, unknown>> {
  const modules = await tx.select().from(courseModules).where(eq(courseModules.courseId, course.id)).orderBy(asc(courseModules.sortOrder));
  const [org] = course.organizationId ? await tx.select({ id: organizations.id, name: organizations.name, status: organizations.status }).from(organizations).where(eq(organizations.id, course.organizationId)).limit(1) : [];
  return {
    courseId: course.id,
    code: course.code,
    title: course.title,
    summary: course.summary,
    descriptionHtml: course.descriptionHtml,
    category: course.category,
    mode: course.mode,
    durationHours: course.durationHours,
    durationWeeks: course.durationWeeks,
    eligibility: course.eligibility,
    prerequisites: course.prerequisites,
    outcomes: course.outcomes,
    feeType: course.feeType,
    feeMinor: course.feeMinor,
    feeCurrency: course.feeCurrency,
    feeNotes: course.feeNotes,
    languageCodes: course.languageCodes,
    certificationType: course.certificationType,
    accreditationBody: course.accreditationBody,
    institution: org ? { id: org.id, name: org.name, status: org.status } : null,
    claimsVenkatSaiAssessment: course.organizationId !== null && course.certificationType === "venkat_sai_assessment",
    modules: modules.map((m) => ({ title: m.title, description: m.description, durationHours: m.durationHours })),
  };
}

async function fileCourseApproval(tx: DbOrTx, course: CourseRow, actorUserId: string): Promise<{ id: string; code: string }> {
  const approval = await submitForApproval(
    {
      type: "course_publication",
      entityType: "course",
      entityId: course.id,
      organizationId: course.organizationId,
      title: `${course.title} (${course.code})`,
      summary: course.summary ?? null,
      payload: await courseSnapshot(tx, course),
      submittedByUserId: actorUserId,
    },
    tx,
  );
  return { id: approval.id, code: approval.code };
}

/**
 * After an institution edits a published or in-review course, it goes (back) to review: published
 * institution courses are hidden from the catalogue until the change is approved, so nothing reaches the
 * public site unreviewed. Venkat Sai courses are edited in place.
 */
async function afterContentEdit(tx: DbOrTx, courseId: string, actorUserId: string): Promise<void> {
  const [course] = await tx.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course || course.organizationId === null) return;
  if (course.status !== "published" && course.status !== "pending_approval") return;
  if (course.status === "published") await tx.update(courses).set({ status: "pending_approval" }).where(eq(courses.id, course.id));
  await fileCourseApproval(tx, { ...course, status: "pending_approval" }, actorUserId);
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

/**
 * Create a course: institution members (institution.courses.manage) create courses of their institution;
 * staff (training.manage) create Venkat Sai courses (organisation null). Starts as a draft.
 */
export async function createCourse(actor: TrainingActor, input: CourseInput): Promise<CourseRow> {
  const organizationId = actorInstitutionId(actor);
  if (isInstitutionActor(actor)) {
    if (!actor.permissions.has(MANAGE.member)) throw forbiddenError("You do not have permission to manage courses.");
    if (actor.organization.status === "suspended") throw invalidStateError("A suspended institution cannot create courses.");
    const entitlement = await checkEntitlement(actor.organization.id, "courses");
    if (!entitlement.allowed) throw invalidStateError(entitlement.reason ?? "Your plan does not allow more courses. Upgrade the plan or archive a course first.");
  } else {
    assertStaffPermission(actor, MANAGE.staff);
  }
  const userId = trainingActorUserId(actor);
  return withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        await validateCourseInput(tx, input);
        const coverFileId = input.coverFileId ? await requireCourseFile(tx, input.coverFileId, organizationId, userId, { image: true }) : null;
        const slug = await uniqueSlug(input.title, async (candidate) => (await tx.select({ id: courses.id }).from(courses).where(eq(courses.slug, candidate)).limit(1)).length > 0);
        const code = await nextCode("CRS", { tx });
        const [course] = await tx
          .insert(courses)
          .values({ code, slug, organizationId, ...courseValues(input), coverFileId, status: "draft", createdByUserId: userId })
          .returning();
        await audit({
          action: "course.created",
          entityType: "course",
          entityId: course!.id,
          organizationId,
          actorUserId: userId,
          actorType: isInstitutionActor(actor) ? "user" : "staff",
          metadata: { code, title: course!.title },
          tx,
        });
        return course!;
      }),
    COURSE_CONSTRAINTS,
  );
}

/** Edit a course. Institution edits to a published course send it back to review (see afterContentEdit). */
export async function updateCourse(actor: TrainingActor, courseId: string, input: CourseInput): Promise<CourseRow> {
  const userId = trainingActorUserId(actor);
  return withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const course = await loadCourseForActor(actor, courseId, MANAGE, { tx, lock: true });
        if (course.status === "archived") throw invalidStateError("Restore the course before editing it.");
        await validateCourseInput(tx, input);
        let coverFileId = course.coverFileId;
        if (input.coverFileId !== course.coverFileId) {
          coverFileId = input.coverFileId ? await requireCourseFile(tx, input.coverFileId, course.organizationId, userId, { image: true }) : null;
        }
        const [updated] = await tx.update(courses).set({ ...courseValues(input), coverFileId }).where(eq(courses.id, course.id)).returning();
        await afterContentEdit(tx, course.id, userId);
        await audit({
          action: "course.updated",
          entityType: "course",
          entityId: course.id,
          organizationId: course.organizationId,
          actorUserId: userId,
          metadata: { previousStatus: course.status },
          tx,
        });
        const [fresh] = await tx.select().from(courses).where(eq(courses.id, course.id)).limit(1);
        return fresh ?? updated!;
      }),
    COURSE_CONSTRAINTS,
  );
}

/** Completeness required before a course can be published. */
async function assertPublishable(tx: DbOrTx, course: CourseRow, now: Date): Promise<void> {
  const problems: string[] = [];
  if (!course.summary && !course.descriptionHtml) problems.push("Add a summary or a description.");
  if (!course.durationHours && !course.durationWeeks) problems.push("Add the course duration.");
  const [modules] = await tx.select({ value: count() }).from(courseModules).where(eq(courseModules.courseId, course.id));
  if ((modules?.value ?? 0) === 0) problems.push("Add at least one syllabus module.");
  if (course.organizationId) {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, course.organizationId)).limit(1);
    if (!org || !hasValidVerification(org, now)) problems.push("Your institution must be verified before its courses can be published.");
    if (course.certificationType === "accredited_external") {
      const [profile] = await tx.select().from(institutionProfiles).where(eq(institutionProfiles.organizationId, course.organizationId)).limit(1);
      if (!isAuthorisedIssuerNow(profile ?? null, now)) {
        problems.push("Only institutions authorised by Venkat Sai as certificate issuers can offer accredited certificates. Choose another certification type or ask Venkat Sai to verify your accreditation.");
      }
    }
  }
  if (problems.length) throw validationError(problems.join(" "), { _form: problems });
}

/**
 * Publish a course: Venkat Sai courses (staff, training.manage) are published directly; institution courses
 * go to the approval centre (course_publication) with a snapshot and become "pending_approval".
 */
export async function submitCourseForPublication(actor: TrainingActor, courseId: string, now: Date = new Date()): Promise<{ status: CourseRow["status"]; approvalRequestId: string | null; approvalCode: string | null }> {
  const userId = trainingActorUserId(actor);
  return db.transaction(async (tx) => {
    const course = await loadCourseForActor(actor, courseId, MANAGE, { tx, lock: true });
    if (course.organizationId === null) {
      if (course.status === "published") return { status: course.status, approvalRequestId: null, approvalCode: null };
      if (course.status === "archived") throw invalidStateError("Restore the course before publishing it.");
      await assertPublishable(tx, course, now);
      await tx.update(courses).set({ status: "published", publishedAt: course.publishedAt ?? now }).where(eq(courses.id, course.id));
      await audit({ action: "course.published", entityType: "course", entityId: course.id, actorUserId: userId, actorType: "staff", metadata: { direct: true }, tx });
      return { status: "published" as const, approvalRequestId: null, approvalCode: null };
    }
    if (!SUBMITTABLE.has(course.status)) {
      throw invalidStateError(course.status === "published" ? "This course is already published." : "Restore the course before submitting it.");
    }
    await assertPublishable(tx, course, now);
    await tx.update(courses).set({ status: "pending_approval" }).where(eq(courses.id, course.id));
    const approval = await fileCourseApproval(tx, { ...course, status: "pending_approval" }, userId);
    await audit({
      action: "course.submitted",
      entityType: "course",
      entityId: course.id,
      organizationId: course.organizationId,
      actorUserId: userId,
      metadata: { approvalRequestId: approval.id },
      tx,
    });
    return { status: "pending_approval" as const, approvalRequestId: approval.id, approvalCode: approval.code };
  });
}

/** Archive (hide from the catalogue; existing batches continue). Open publication requests are cancelled. */
export async function archiveCourse(actor: TrainingActor, courseId: string): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const course = await loadCourseForActor(actor, courseId, MANAGE, { tx, lock: true });
    if (course.status === "archived") return;
    await cancelApprovalsForEntity("course_publication", course.id, userId, "Course archived", tx);
    await tx.update(courses).set({ status: "archived", isFeatured: false }).where(eq(courses.id, course.id));
    await audit({ action: "course.archived", entityType: "course", entityId: course.id, organizationId: course.organizationId, actorUserId: userId, metadata: { previousStatus: course.status }, tx });
  });
}

/** Bring an archived course back as a draft (it must be published again). */
export async function restoreCourse(actor: TrainingActor, courseId: string): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const course = await loadCourseForActor(actor, courseId, MANAGE, { tx, lock: true });
    if (course.status !== "archived") throw invalidStateError("Only archived courses can be restored.");
    await tx.update(courses).set({ status: "draft" }).where(eq(courses.id, course.id));
    await audit({ action: "course.restored", entityType: "course", entityId: course.id, organizationId: course.organizationId, actorUserId: userId, tx });
  });
}

/** Delete a course that never had batches (soft delete). Courses with batches must be archived. */
export async function deleteCourse(actor: TrainingActor, courseId: string): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const course = await loadCourseForActor(actor, courseId, MANAGE, { tx, lock: true });
    const [used] = await tx.select({ value: count() }).from(batches).where(eq(batches.courseId, course.id));
    if ((used?.value ?? 0) > 0) throw conflictError("This course has batches. Archive it instead.");
    await cancelApprovalsForEntity("course_publication", course.id, userId, "Course deleted", tx);
    await tx.update(courses).set({ deletedAt: new Date(), isFeatured: false }).where(eq(courses.id, course.id));
    await audit({ action: "course.deleted", entityType: "course", entityId: course.id, organizationId: course.organizationId, actorUserId: userId, tx });
  });
}

/** Staff (training.manage) feature a published course in the catalogue. */
export async function setCourseFeatured(staff: StaffContext, courseId: string, isFeatured: boolean): Promise<void> {
  assertStaffPermission(staff, "training.manage");
  await db.transaction(async (tx) => {
    const course = await loadCourseForActor(staff, courseId, MANAGE, { tx, lock: true });
    if (isFeatured && course.status !== "published") throw invalidStateError("Only published courses can be featured.");
    await tx.update(courses).set({ isFeatured }).where(eq(courses.id, course.id));
    await audit({ action: isFeatured ? "course.featured" : "course.unfeatured", entityType: "course", entityId: course.id, organizationId: course.organizationId, actorUserId: staff.user.id, actorType: "staff", tx });
  });
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

export async function listCourseModules(courseId: string, tx: DbOrTx = db): Promise<CourseModuleRow[]> {
  return tx.select().from(courseModules).where(eq(courseModules.courseId, courseId)).orderBy(asc(courseModules.sortOrder), asc(courseModules.createdAt));
}

async function moduleValues(tx: DbOrTx, course: CourseRow, input: CourseModuleInput, actorUserId: string) {
  const materialFileIds: string[] = [];
  for (const id of input.materialFileIds) materialFileIds.push(await requireCourseFile(tx, id, course.organizationId, actorUserId));
  return { title: input.title, description: input.description ?? null, durationHours: input.durationHours ?? null, materialFileIds };
}

export async function addCourseModule(actor: TrainingActor, courseId: string, input: CourseModuleInput): Promise<CourseModuleRow> {
  const userId = trainingActorUserId(actor);
  return db.transaction(async (tx) => {
    const course = await loadCourseForActor(actor, courseId, MANAGE, { tx, lock: true });
    if (course.status === "archived") throw invalidStateError("Restore the course before editing it.");
    const [last] = await tx.select({ value: max(courseModules.sortOrder) }).from(courseModules).where(eq(courseModules.courseId, course.id));
    const [row] = await tx
      .insert(courseModules)
      .values({ courseId: course.id, sortOrder: (last?.value ?? -1) + 1, ...(await moduleValues(tx, course, input, userId)) })
      .returning();
    await afterContentEdit(tx, course.id, userId);
    await audit({ action: "course.module_added", entityType: "course", entityId: course.id, organizationId: course.organizationId, actorUserId: userId, metadata: { moduleId: row!.id }, tx });
    return row!;
  });
}

async function loadModuleForUpdate(tx: DbOrTx, moduleId: string): Promise<CourseModuleRow> {
  const [row] = await tx.select().from(courseModules).where(eq(courseModules.id, moduleId)).limit(1).for("update");
  if (!row) throw notFoundError("Module not found.");
  return row;
}

export async function updateCourseModule(actor: TrainingActor, moduleId: string, input: CourseModuleInput): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const mod = await loadModuleForUpdate(tx, moduleId);
    const course = await loadCourseForActor(actor, mod.courseId, MANAGE, { tx, lock: true });
    if (course.status === "archived") throw invalidStateError("Restore the course before editing it.");
    await tx.update(courseModules).set(await moduleValues(tx, course, input, userId)).where(eq(courseModules.id, mod.id));
    await afterContentEdit(tx, course.id, userId);
    await audit({ action: "course.module_updated", entityType: "course", entityId: course.id, organizationId: course.organizationId, actorUserId: userId, metadata: { moduleId }, tx });
  });
}

export async function removeCourseModule(actor: TrainingActor, moduleId: string): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const mod = await loadModuleForUpdate(tx, moduleId);
    const course = await loadCourseForActor(actor, mod.courseId, MANAGE, { tx, lock: true });
    if (course.status === "archived") throw invalidStateError("Restore the course before editing it.");
    await tx.delete(courseModules).where(eq(courseModules.id, mod.id));
    await afterContentEdit(tx, course.id, userId);
    await audit({ action: "course.module_removed", entityType: "course", entityId: course.id, organizationId: course.organizationId, actorUserId: userId, metadata: { moduleId }, tx });
  });
}

/** Reorder modules: `moduleIds` must list every module of the course exactly once. */
export async function reorderCourseModules(actor: TrainingActor, courseId: string, moduleIds: readonly string[]): Promise<void> {
  const userId = trainingActorUserId(actor);
  await db.transaction(async (tx) => {
    const course = await loadCourseForActor(actor, courseId, MANAGE, { tx, lock: true });
    const existing = await tx.select({ id: courseModules.id }).from(courseModules).where(eq(courseModules.courseId, course.id));
    const ids = new Set(existing.map((m) => m.id));
    if (moduleIds.length !== ids.size || new Set(moduleIds).size !== ids.size || !moduleIds.every((id) => ids.has(id))) {
      throw validationError("The module list is out of date. Refresh the page and try again.");
    }
    for (const [index, id] of moduleIds.entries()) {
      await tx.update(courseModules).set({ sortOrder: index }).where(and(eq(courseModules.id, id), eq(courseModules.courseId, course.id)));
    }
    await afterContentEdit(tx, course.id, userId);
    await audit({ action: "course.modules_reordered", entityType: "course", entityId: course.id, organizationId: course.organizationId, actorUserId: userId, tx });
  });
}

/** Courses of an institution that are published and not deleted (helper for other modules). */
export async function countPublishedCourses(organizationId: string | null): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(courses)
    .where(and(organizationId ? eq(courses.organizationId, organizationId) : isNull(courses.organizationId), eq(courses.status, "published"), isNull(courses.deletedAt)));
  return row?.value ?? 0;
}
