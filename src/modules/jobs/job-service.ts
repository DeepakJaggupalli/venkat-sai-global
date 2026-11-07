import "server-only";

import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { applicationWorkflows, jobLocations, jobs, jobScreeningQuestions, jobSkills, organizations, requirementRequests, skills } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { env } from "@/lib/env";
import { toMinorUnits } from "@/lib/format";
import { sanitizeRichText } from "@/lib/sanitize";
import { cancelApprovalsForEntity, submitForApproval } from "@/modules/approvals/service";
import { audit } from "@/modules/audit";
import { runQueries } from "@/modules/candidates/db-utils";
import { assertCountries, assertCurrency, assertEducationLevel, assertIndustry, assertJobCategories } from "@/modules/candidates/refs";
import { isFeatureEnabled } from "@/modules/settings";

import { actorAudit, actorUserId, assertCapability, assertJobSkills, buildJobSlug, lockJob, refreshJobDerived } from "./access";
import { canTransition, changedReviewedFields, childSignature, transitionError, zonedEndOfDay } from "./lifecycle";
import { jobReviewSnapshot, notifyJobOwner } from "./publication";
import type { JobFormInput, ScreeningQuestionInput } from "./schemas";
import type { JobActor, JobRow } from "./types";

/**
 * Job drafts: create, edit, duplicate, delete. Employers (employer.jobs.manage, flag
 * employer.self_serve_jobs) work on their organisation's jobs; staff (jobs.manage) on any job,
 * including Venkat Sai-managed confidential jobs without an organisation. Rich text is sanitised on
 * write. An employer's substantive edit to a live job sends it back to review (hidden until approved).
 */

type JobValues = Omit<typeof jobs.$inferInsert, "id" | "code" | "slug" | "createdAt" | "updatedAt">;

/** Form input → column values (salaries in minor units of the job's currency, deadlines at end of day). */
function valuesFromInput(input: JobFormInput, timeZone: string): Partial<JobValues> {
  const hasSalary = input.salaryCurrency && input.salaryPeriod && (input.salaryMin !== undefined || input.salaryMax !== undefined);
  const description = sanitizeRichText(input.descriptionHtml);
  return {
    title: input.title,
    summary: input.summary ?? null,
    descriptionHtml: description || null,
    responsibilities: input.responsibilities ?? null,
    qualificationsText: input.qualificationsText ?? null,
    jobCategoryId: input.jobCategoryId ?? null,
    industryId: input.industryId ?? null,
    employmentType: input.employmentType,
    workMode: input.workMode,
    experienceLevel: input.experienceLevel ?? null,
    experienceMinYears: input.experienceMinYears ?? null,
    experienceMaxYears: input.experienceMaxYears ?? null,
    minEducationLevelId: input.minEducationLevelId ?? null,
    openings: input.openings,
    salaryMinMinor: hasSalary && input.salaryMin !== undefined ? toMinorUnits(input.salaryMin, input.salaryCurrency!) : null,
    salaryMaxMinor: hasSalary && input.salaryMax !== undefined ? toMinorUnits(input.salaryMax, input.salaryCurrency!) : null,
    salaryCurrency: hasSalary ? input.salaryCurrency! : null,
    salaryPeriod: hasSalary ? input.salaryPeriod! : null,
    salaryVisible: input.salaryVisible,
    benefits: input.benefits,
    countryCode: input.countryCode ?? null,
    stateRegion: input.stateRegion ?? null,
    city: input.city ?? null,
    visaSponsorship: input.visaSponsorship,
    sponsorshipDetails: input.visaSponsorship === "provided" ? (input.sponsorshipDetails ?? null) : null,
    accommodationProvided: input.accommodationProvided,
    foodProvided: input.foodProvided,
    transportProvided: input.transportProvided,
    contractDurationMonths: input.contractDurationMonths ?? null,
    workingHours: input.workingHours ?? null,
    recruitmentProcess: input.recruitmentProcess ?? null,
    applicationDeadline: input.applicationDeadline ? zonedEndOfDay(input.applicationDeadline, timeZone) : null,
    expiresAt: input.expiresAt ? zonedEndOfDay(input.expiresAt, timeZone) : null,
    startDate: input.startDate ?? null,
    applyMode: input.applyMode,
    externalApplyUrl: input.applyMode === "external_url" ? (input.externalApplyUrl ?? null) : null,
    screeningRequired: input.screeningRequired,
    isConfidential: input.isConfidential,
    confidentialEmployerName: input.confidentialEmployerName ?? null,
    employerReference: input.employerReference ?? null,
  };
}

async function assertReferences(input: JobFormInput, tx: DbOrTx): Promise<void> {
  await assertJobCategories([input.jobCategoryId], "jobCategoryId", tx);
  await assertIndustry(input.industryId, "industryId", tx);
  await assertEducationLevel(input.minEducationLevelId, "minEducationLevelId", tx);
  await assertCurrency(input.salaryCurrency, "salaryCurrency", tx);
  await assertCountries([input.countryCode], "countryCode", tx);
  await assertCountries(input.locations.map((l) => l.countryCode), "locations", tx);
  await assertJobSkills(input.skills.map((s) => s.skillId), tx);
}

async function replaceSkills(jobId: string, input: JobFormInput, tx: DbOrTx): Promise<void> {
  await tx.delete(jobSkills).where(eq(jobSkills.jobId, jobId));
  if (input.skills.length) {
    await tx.insert(jobSkills).values(input.skills.map((s, index) => ({ jobId, skillId: s.skillId, isRequired: s.isRequired, minYears: s.minYears, sortOrder: index })));
  }
}

async function replaceLocations(jobId: string, input: JobFormInput, tx: DbOrTx): Promise<void> {
  // Child list replaced in one transaction (job_locations_place_uq is a coalesce index — no ON CONFLICT target).
  await tx.delete(jobLocations).where(eq(jobLocations.jobId, jobId));
  if (input.locations.length) {
    await tx.insert(jobLocations).values(
      input.locations.map((l, index) => ({ jobId, countryCode: l.countryCode, stateRegion: l.stateRegion ?? null, city: l.city ?? null, openings: l.openings, sortOrder: index })),
    );
  }
}

/** Questions are diffed by id so application answers keep pointing at the question they answered. */
async function syncScreeningQuestions(jobId: string, questions: ScreeningQuestionInput[], tx: DbOrTx): Promise<void> {
  const existing = await tx.select({ id: jobScreeningQuestions.id }).from(jobScreeningQuestions).where(eq(jobScreeningQuestions.jobId, jobId));
  const existingIds = new Set(existing.map((q) => q.id));
  const keep = questions.map((q) => q.id).filter((id): id is string => Boolean(id) && existingIds.has(id!));
  await tx
    .delete(jobScreeningQuestions)
    .where(and(eq(jobScreeningQuestions.jobId, jobId), keep.length ? notInArray(jobScreeningQuestions.id, keep) : sql`true`));
  for (const [index, q] of questions.entries()) {
    const values = { question: q.question, helpText: q.helpText ?? null, type: q.type, options: q.options, isRequired: q.isRequired, knockoutAnswer: q.knockout ?? null, sortOrder: index };
    if (q.id && existingIds.has(q.id)) await tx.update(jobScreeningQuestions).set(values).where(eq(jobScreeningQuestions.id, q.id));
    else await tx.insert(jobScreeningQuestions).values({ ...values, jobId });
  }
}

async function loadChildren(jobId: string, tx: DbOrTx) {
  const [skillRows, locationRows, questionRows] = await runQueries(
    tx,
    () => tx.select().from(jobSkills).where(eq(jobSkills.jobId, jobId)).orderBy(asc(jobSkills.sortOrder)),
    () => tx.select().from(jobLocations).where(eq(jobLocations.jobId, jobId)).orderBy(asc(jobLocations.sortOrder)),
    () => tx.select().from(jobScreeningQuestions).where(eq(jobScreeningQuestions.jobId, jobId)).orderBy(asc(jobScreeningQuestions.sortOrder)),
  );
  return { skillRows, locationRows, questionRows };
}

/** Submit (or refresh) the job_publication approval with a fresh snapshot. */
export async function submitJobForReview(job: JobRow, submittedByUserId: string, tx: DbOrTx): Promise<{ id: string; code: string; resubmitted: boolean }> {
  const [org] = job.organizationId ? await tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, job.organizationId)).limit(1) : [];
  const { skillRows, locationRows, questionRows } = await loadChildren(job.id, tx);
  const skillNames = skillRows.length ? await tx.select({ name: skills.name }).from(skills).where(inArray(skills.id, skillRows.map((s) => s.skillId))) : [];
  const payload = await jobReviewSnapshot(job, {
    organizationName: org?.name ?? null,
    skills: skillNames.map((r) => r.name),
    screeningQuestionCount: questionRows.length,
    locations: locationRows.map((l) => [l.city, l.stateRegion, l.countryCode].filter(Boolean).join(", ")),
  });
  return submitForApproval(
    {
      type: "job_publication",
      entityType: "job",
      entityId: job.id,
      organizationId: job.organizationId,
      title: `${job.title} — ${org?.name ?? job.confidentialEmployerName ?? "Venkat Sai managed"}`,
      summary: [job.city, job.countryCode].filter(Boolean).join(", ") || null,
      payload,
      submittedByUserId,
    },
    tx,
  );
}

/** Create a draft job. Staff may create jobs for an employer organisation or Venkat Sai-managed confidential jobs. */
export async function createJob(actor: JobActor, input: JobFormInput): Promise<JobRow> {
  assertCapability(actor, "manage");
  if (actor.kind === "employer" && !(await isFeatureEnabled("employer.self_serve_jobs", { portal: "employer", organizationId: actor.ctx.organization.id }))) {
    throw new ActionError("Job posting by employers is switched off. Contact Venkat Sai to post this job.", { code: "feature_disabled" });
  }
  const timeZone = env().DEFAULT_TIMEZONE;
  return db.transaction(async (tx) => {
    await assertReferences(input, tx);
    let organizationId: string | null;
    let managedByVenkatSai = false;
    let requirementId: string | null = null;
    let workflowId: string | null = null;
    if (actor.kind === "employer") {
      organizationId = actor.ctx.organization.id;
    } else {
      organizationId = input.organizationId ?? null;
      managedByVenkatSai = input.managedByVenkatSai || !organizationId;
      if (organizationId) {
        const [org] = await tx.select({ type: organizations.type, deletedAt: organizations.deletedAt }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
        if (!org || org.deletedAt || org.type !== "employer") throw new ActionError("Choose an employer organisation.", { fieldErrors: { organizationId: ["Choose an employer organisation"] } });
      } else if (!input.confidentialEmployerName) {
        throw new ActionError("Describe the confidential employer.", { fieldErrors: { confidentialEmployerName: ["Required for jobs without an employer organisation"] } });
      }
      if (input.requirementId) {
        const [req] = await tx.select({ id: requirementRequests.id }).from(requirementRequests).where(eq(requirementRequests.id, input.requirementId)).limit(1);
        if (!req) throw new ActionError("Requirement not found.", { fieldErrors: { requirementId: ["Requirement not found"] } });
        requirementId = req.id;
      }
      if (input.workflowId) {
        const [wf] = await tx.select({ id: applicationWorkflows.id }).from(applicationWorkflows).where(eq(applicationWorkflows.id, input.workflowId)).limit(1);
        if (!wf) throw new ActionError("Workflow not found.", { fieldErrors: { workflowId: ["Workflow not found"] } });
        workflowId = wf.id;
      }
    }
    const code = await nextCode("JOB", { tx });
    const values = valuesFromInput(input, timeZone);
    const [job] = await tx
      .insert(jobs)
      .values({
        ...values,
        title: input.title,
        code,
        slug: buildJobSlug(input.title, input.city, code),
        organizationId,
        managedByVenkatSai,
        requirementId,
        workflowId,
        postedByUserId: actorUserId(actor),
        status: "draft",
        infoSource: "pending_review",
      })
      .returning();
    await replaceSkills(job!.id, input, tx);
    await replaceLocations(job!.id, input, tx);
    await syncScreeningQuestions(job!.id, input.screeningQuestions, tx);
    await refreshJobDerived(job!.id, tx);
    await audit({ action: "job.created", entityType: "job", entityId: job!.id, organizationId, metadata: { code, managedByVenkatSai }, ...actorAudit(actor), tx });
    const [fresh] = await tx.select().from(jobs).where(eq(jobs.id, job!.id)).limit(1);
    return fresh!;
  });
}

export type UpdateJobResult = { job: JobRow; sentForReview: boolean };

/**
 * Edit a job. Drafts and jobs under review change freely (an open review gets the new snapshot);
 * an employer's change to what candidates read on a live job sends it back to review — the job is
 * hidden until approved again. Staff edits keep the status.
 */
export async function updateJob(actor: JobActor, jobId: string, input: JobFormInput): Promise<UpdateJobResult> {
  const timeZone = env().DEFAULT_TIMEZONE;
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "manage");
    if (!canTransition("edit", job.status)) throw new ActionError(transitionError("edit", job.status), { code: "invalid_status" });
    await assertReferences(input, tx);
    const values = valuesFromInput(input, timeZone);
    // Once published, the listing end is managed by publication / extend: an empty field keeps it.
    if (job.publishedAt && input.expiresAt === undefined) delete values.expiresAt;
    const live = job.status === "published" || job.status === "paused";
    if (live && values.applicationDeadline && values.applicationDeadline <= new Date()) {
      throw new ActionError("The application deadline must be in the future.", { fieldErrors: { applicationDeadline: ["Choose a later date"] } });
    }

    const before = await loadChildren(job.id, tx);
    const childrenChanged =
      childSignature(before.skillRows, ["skillId", "isRequired", "minYears"]) !== childSignature(input.skills, ["skillId", "isRequired", "minYears"]) ||
      childSignature(before.locationRows, ["countryCode", "stateRegion", "city", "openings"]) !== childSignature(input.locations, ["countryCode", "stateRegion", "city", "openings"]) ||
      childSignature(
        before.questionRows.map((q) => ({ ...q, knockout: q.knockoutAnswer ? JSON.stringify(q.knockoutAnswer) : null, options: JSON.stringify(q.options) })),
        ["question", "type", "options", "isRequired", "knockout"],
      ) !== childSignature(input.screeningQuestions.map((q) => ({ ...q, knockout: q.knockout ? JSON.stringify(q.knockout) : null, options: JSON.stringify(q.options) })), ["question", "type", "options", "isRequired", "knockout"]);
    const changedFields = changedReviewedFields(job, values);
    const sendForReview = actor.kind === "employer" && live && (changedFields.length > 0 || childrenChanged);

    const staffOnly: Partial<JobValues> = {};
    if (actor.kind === "staff") {
      staffOnly.managedByVenkatSai = job.organizationId ? input.managedByVenkatSai : true;
      if (input.requirementId !== undefined) staffOnly.requirementId = input.requirementId ?? null;
      if (input.workflowId !== undefined) staffOnly.workflowId = input.workflowId ?? null;
    }
    const slug = !job.publishedAt && (job.title !== input.title || (job.city ?? null) !== (input.city ?? null)) ? buildJobSlug(input.title, input.city, job.code) : job.slug;
    await tx
      .update(jobs)
      .set({
        ...values,
        ...staffOnly,
        slug,
        ...(sendForReview ? { status: "pending_approval" as const, infoSource: "pending_review" as const } : {}),
      })
      .where(eq(jobs.id, job.id));
    await replaceSkills(job.id, input, tx);
    await replaceLocations(job.id, input, tx);
    await syncScreeningQuestions(job.id, input.screeningQuestions, tx);
    await refreshJobDerived(job.id, tx);
    const [updated] = await tx.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);

    if (sendForReview || job.status === "pending_approval") {
      await submitJobForReview(updated!, actorUserId(actor), tx);
    }
    if (sendForReview) {
      await notifyJobOwner(updated!, "job.submitted", { resubmitted: true }, { tx });
    }
    await audit({
      action: "job.updated",
      entityType: "job",
      entityId: job.id,
      organizationId: job.organizationId,
      metadata: { changedFields, childrenChanged, sentForReview: sendForReview, status: updated!.status },
      ...actorAudit(actor),
      tx,
    });
    return { job: updated!, sentForReview: sendForReview };
  });
}

/** Copy a job (fields, skills, locations, screening questions) into a new draft. */
export async function duplicateJob(actor: JobActor, jobId: string): Promise<JobRow> {
  return db.transaction(async (tx) => {
    const source = await lockJob(actor, jobId, tx, "manage");
    if (actor.kind === "employer" && !(await isFeatureEnabled("employer.self_serve_jobs", { portal: "employer", organizationId: actor.ctx.organization.id }))) {
      throw new ActionError("Job posting by employers is switched off. Contact Venkat Sai to post this job.", { code: "feature_disabled" });
    }
    const code = await nextCode("JOB", { tx });
    const rest: Partial<JobRow> = { ...source };
    for (const key of ["id", "code", "slug", "createdAt", "updatedAt", "searchVector"] as const) delete rest[key];
    const [copy] = await tx
      .insert(jobs)
      .values({
        ...rest,
        title: source.title,
        code,
        slug: buildJobSlug(source.title, source.city, code),
        postedByUserId: actorUserId(actor),
        status: "draft",
        moderationNote: null,
        publishedAt: null,
        closedAt: null,
        closedReason: null,
        scheduledPublishAt: null,
        expiresAt: null,
        applicationDeadline: null,
        isFeatured: false,
        featuredUntil: null,
        verifiedEmployer: false,
        infoSource: "pending_review",
        viewCount: 0,
        applicationCount: 0,
        // Recruiting-agent details are re-checked for every posting.
        recruitingAgentLicenceId: null,
        recruitingAgentName: null,
        recruitingAgentCertificateNumber: null,
        recruitingAgentCertificateValidUntil: null,
        recruitingAgentVerifiedAt: null,
        recruitingAgentVerifiedByUserId: null,
        deletedAt: null,
      })
      .returning();
    const { skillRows, locationRows, questionRows } = await loadChildren(source.id, tx);
    if (skillRows.length) await tx.insert(jobSkills).values(skillRows.map((s) => ({ jobId: copy!.id, skillId: s.skillId, isRequired: s.isRequired, minYears: s.minYears, sortOrder: s.sortOrder })));
    if (locationRows.length) {
      await tx.insert(jobLocations).values(locationRows.map((l) => ({ jobId: copy!.id, countryCode: l.countryCode, stateRegion: l.stateRegion, city: l.city, openings: l.openings, sortOrder: l.sortOrder })));
    }
    if (questionRows.length) {
      await tx.insert(jobScreeningQuestions).values(
        questionRows.map((q) => ({ jobId: copy!.id, question: q.question, helpText: q.helpText, type: q.type, options: q.options, isRequired: q.isRequired, knockoutAnswer: q.knockoutAnswer, sortOrder: q.sortOrder })),
      );
    }
    await audit({ action: "job.duplicated", entityType: "job", entityId: copy!.id, organizationId: copy!.organizationId, metadata: { sourceJobId: source.id, code }, ...actorAudit(actor), tx });
    return copy!;
  });
}

/** Soft-delete a job that is not live (drafts, closed, rejected, archived). Applications keep their record. */
export async function deleteJob(actor: JobActor, jobId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "manage");
    if (!canTransition("delete", job.status)) {
      throw new ActionError(job.status === "pending_approval" ? "Withdraw the job from review before deleting it." : "Close the job before deleting it.", { code: "invalid_status" });
    }
    await tx.update(jobs).set({ deletedAt: new Date(), isFeatured: false, featuredUntil: null }).where(eq(jobs.id, job.id));
    await cancelApprovalsForEntity("job_publication", job.id, actorUserId(actor), "The job was deleted", tx);
    await audit({ action: "job.deleted", entityType: "job", entityId: job.id, organizationId: job.organizationId, metadata: { status: job.status }, ...actorAudit(actor), tx });
  });
}

/** Load several jobs an actor may manage (bulk actions). Missing or foreign ids are left out. */
export async function filterManageableJobIds(actor: JobActor, jobIds: string[]): Promise<string[]> {
  assertCapability(actor, "manage");
  if (!jobIds.length) return [];
  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(inArray(jobs.id, jobIds), sql`${jobs.deletedAt} is null`, actor.kind === "employer" ? eq(jobs.organizationId, actor.ctx.organization.id) : undefined));
  return rows.map((r) => r.id);
}
