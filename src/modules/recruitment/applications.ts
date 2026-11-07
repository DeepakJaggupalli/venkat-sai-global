import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import {
  applicationAnswers,
  applicationStageHistory,
  applications,
  candidatePrivacySettings,
  candidateProfiles,
  currencies,
  jobScreeningQuestions,
  jobs,
  organizations,
  users,
  type ApplicationSource,
  type ApplicationSourceDetails,
} from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { trackServer } from "@/modules/analytics/server";
import { audit } from "@/modules/audit";
import { isMinor } from "@/modules/candidates/profile-rules";
import { hasGuardianConsentRecord } from "@/modules/candidates/refs";
import { requireUploadedFile } from "@/modules/files";
import { notify, notifyOrganization, notifyStaff } from "@/modules/notifications";

import {
  assertApplicationAccess,
  assertStaff,
  assertUuid,
  loadApplicationScope,
  loadWorkflowStages,
  publicEmployerName,
  requireApplication,
  resolveWorkflowForJob,
  type ApplicationScope,
} from "./access";
import { actorType, actorUserId, auditActorType } from "./actors";
import { insertConsentRecord } from "./consent";
import { isUniqueViolation, notFoundError, rethrowConstraint } from "./errors";
import { shareApplicationFiles } from "./lifecycle";
import { recruitmentLinks } from "./links";
import { existingApplicationDecision, jobApplicationBlocker, minorOverseasBlocker, shareWithEmployerOnCreate } from "./rules";
import {
  applicationReviewSchema,
  assignApplicationOwnerSchema,
  bulkTransitionSchema,
  candidateApplySchema,
  staffAssignSchema,
  transitionOptionsSchema,
  type CandidateApplyInput,
  type ConsentCaptureMethod,
  type ExpectedSalaryInput,
  type StaffAssignInput,
  type StaffApplicationSource,
  type TransitionOptionsInput,
} from "./schemas";
import { validateScreeningAnswers, type ScreeningQuestionInput } from "./screening";
import { buildProfileSnapshot } from "./snapshot";
import { applyStageMove, type StageMoveResult } from "./stage-move";
import type { BulkResult, CandidateActor, EmployerActor, RecruitmentActor, StaffActor } from "./types";
import { canTransition, findStageByKey, firstStageInCategory, initialStage } from "./workflow";

/**
 * Applications: creation (candidate applies, staff assigns, partner submission accepted),
 * pipeline moves (single + bulk), withdrawal, sharing with the employer, ownership and review flags.
 */

const APPLICATION_CONSTRAINTS = {
  applications_job_candidate_uq: "This candidate has already applied for this job.",
  applications_current_stage_fk: "That stage is not part of this application's workflow.",
  applications_expected_salary_chk: "An expected salary needs an amount, a currency and a period.",
  applications_partner_source_chk: "A partner application needs the partner organisation.",
} as const;

export type CreatedApplication = { id: string; code: string; reopened: boolean; knockoutFlagCount: number };

/** Who is creating the application (internal; public entry points build it). */
export type ApplicationOrigin =
  | { kind: "candidate"; actor: CandidateActor }
  | {
      kind: "staff";
      actor: StaffActor;
      source: StaffApplicationSource;
      sourceDetails: ApplicationSourceDetails;
      consentMethod: ConsentCaptureMethod;
      consentNote: string | null;
    }
  | {
      kind: "partner";
      /** Staff member accepting the partner submission. */
      actor: StaffActor;
      partnerOrganizationId: string;
      partnerUserId: string | null;
      partnerSubmissionId: string;
      partnerSubmissionCode: string;
      partnerConsentRecordId: string;
    };

export type ApplicationCoreInput = {
  jobId: string;
  candidateId: string;
  coverLetter?: string | null;
  resumeFileId?: string | null;
  answers?: Record<string, unknown>;
  expectedSalary?: ExpectedSalaryInput | null;
  assignedToUserId?: string | null;
  internalNote?: string | null;
};

const originUserId = (origin: ApplicationOrigin): string => (origin.kind === "candidate" ? origin.actor.userId : origin.actor.ctx.user.id);

async function loadJobForApplication(jobId: string, tx: DbOrTx) {
  const [job] = await tx
    .select({
      id: jobs.id,
      code: jobs.code,
      title: jobs.title,
      status: jobs.status,
      deletedAt: jobs.deletedAt,
      organizationId: jobs.organizationId,
      managedByVenkatSai: jobs.managedByVenkatSai,
      isConfidential: jobs.isConfidential,
      confidentialEmployerName: jobs.confidentialEmployerName,
      applyMode: jobs.applyMode,
      applicationDeadline: jobs.applicationDeadline,
      expiresAt: jobs.expiresAt,
      publishedAt: jobs.publishedAt,
      isOverseas: jobs.isOverseas,
      workflowId: jobs.workflowId,
      organizationName: organizations.name,
      organizationStatus: organizations.status,
      organizationDeletedAt: organizations.deletedAt,
    })
    .from(jobs)
    .leftJoin(organizations, eq(organizations.id, jobs.organizationId))
    .where(eq(jobs.id, jobId))
    .limit(1);
  return job ?? null;
}

async function loadCandidateForApplication(candidateId: string, tx: DbOrTx) {
  const [row] = await tx
    .select({
      id: candidateProfiles.id,
      userId: candidateProfiles.userId,
      deletedAt: candidateProfiles.deletedAt,
      resumeFileId: candidateProfiles.resumeFileId,
      expectedSalaryMinor: candidateProfiles.expectedSalaryMinor,
      expectedSalaryCurrency: candidateProfiles.expectedSalaryCurrency,
      expectedSalaryPeriod: candidateProfiles.expectedSalaryPeriod,
      dateOfBirth: candidateProfiles.dateOfBirth,
      userStatus: users.status,
      blockedOrganizationIds: candidatePrivacySettings.blockedOrganizationIds,
    })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .leftJoin(candidatePrivacySettings, eq(candidatePrivacySettings.candidateId, candidateProfiles.id))
    .where(eq(candidateProfiles.id, candidateId))
    .limit(1);
  return row ?? null;
}

async function loadScreeningQuestions(jobId: string, tx: DbOrTx): Promise<ScreeningQuestionInput[]> {
  const rows = await tx
    .select({
      id: jobScreeningQuestions.id,
      question: jobScreeningQuestions.question,
      type: jobScreeningQuestions.type,
      options: jobScreeningQuestions.options,
      isRequired: jobScreeningQuestions.isRequired,
      knockoutAnswer: jobScreeningQuestions.knockoutAnswer,
    })
    .from(jobScreeningQuestions)
    .where(eq(jobScreeningQuestions.jobId, jobId))
    .orderBy(asc(jobScreeningQuestions.sortOrder));
  return rows.map((r) => ({ ...r, knockoutAnswer: r.knockoutAnswer ?? null }));
}

async function assertCurrency(code: string, tx: DbOrTx): Promise<void> {
  const [row] = await tx.select({ code: currencies.code }).from(currencies).where(eq(currencies.code, code)).limit(1);
  if (!row) throw new ActionError("Choose a valid currency.", { fieldErrors: { "expectedSalary.currency": ["Choose a valid currency"] } });
}

async function assertStaffUser(userId: string, tx: DbOrTx): Promise<void> {
  const [row] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.isStaff, true), eq(users.status, "active"))).limit(1);
  if (!row) throw new ActionError("Choose an active Venkat Sai team member.", { code: "invalid_assignee" });
}

/**
 * Create (or, for a candidate re-applying after withdrawing, reopen) an application inside `tx`.
 * Validates the job (published, open, not past its deadline), the candidate, duplicates, screening
 * answers (required ones only for candidate applications), freezes the profile snapshot and resume,
 * records consent to share with the employer, writes the initial stage + history, shares files with
 * the employer when the application is visible to them, bumps jobs.applicationCount and notifies the
 * candidate, the organisation (when shared) and staff (Venkat Sai-managed jobs).
 */
export async function createApplicationInTx(tx: DbOrTx, origin: ApplicationOrigin, input: ApplicationCoreInput): Promise<CreatedApplication> {
  const now = new Date();
  assertUuid(input.jobId, "Job");
  assertUuid(input.candidateId, "Candidate");

  const job = await loadJobForApplication(input.jobId, tx);
  if (!job) throw notFoundError("Job");
  const blocker = jobApplicationBlocker(job, now);
  if (blocker) throw new ActionError(blocker.message, { code: blocker.code });

  const candidate = await loadCandidateForApplication(input.candidateId, tx);
  if (!candidate || candidate.deletedAt) throw notFoundError("Candidate");
  if (candidate.userStatus === "suspended" || candidate.userStatus === "closed") {
    throw new ActionError("This candidate's account is not active.", { code: "candidate_inactive" });
  }
  if (origin.kind !== "candidate" && job.organizationId && (candidate.blockedOrganizationIds ?? []).includes(job.organizationId)) {
    throw new ActionError("The candidate has asked not to be shared with this employer.", { code: "candidate_blocked_org" });
  }
  if (job.isOverseas) {
    const minor = isMinor(candidate.dateOfBirth, await hasGuardianConsentRecord(candidate.userId, tx), now);
    const minorBlocker = minorOverseasBlocker(job, minor, origin.kind);
    if (minorBlocker) throw new ActionError(minorBlocker.message, { code: minorBlocker.code });
  }

  // Serialise concurrent attempts for the same job + candidate.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`application:${job.id}:${candidate.id}`}, 0))`);
  const [existing] = await tx
    .select({ id: applications.id, code: applications.code, status: applications.status, currentStageId: applications.currentStageId, workflowId: applications.workflowId })
    .from(applications)
    .where(and(eq(applications.jobId, job.id), eq(applications.candidateId, candidate.id)))
    .limit(1)
    .for("update");
  const decision = existingApplicationDecision(existing ?? null, origin.kind);
  if (decision === "duplicate") {
    throw new ActionError(origin.kind === "candidate" ? "You have already applied for this job." : "This candidate already has an application for this job.", {
      code: "duplicate_application",
    });
  }

  const questions = await loadScreeningQuestions(job.id, tx);
  const screening = validateScreeningAnswers(questions, input.answers ?? {}, { requireMandatory: origin.kind === "candidate" });
  if (Object.keys(screening.errors).length) {
    throw new ActionError("Please answer the screening questions.", {
      code: "screening_incomplete",
      fieldErrors: Object.fromEntries(Object.entries(screening.errors).map(([questionId, message]) => [`answers.${questionId}`, [message]])),
    });
  }

  let resumeFileId = candidate.resumeFileId;
  if (input.resumeFileId) {
    const owners = origin.kind === "candidate" ? [candidate.userId] : [candidate.userId, originUserId(origin)];
    const file = await requireUploadedFile(input.resumeFileId, { purposes: ["resume"] }, tx);
    if (!file.ownerUserId || !owners.includes(file.ownerUserId)) throw new ActionError("This file cannot be used here. Please upload it again.");
    resumeFileId = file.id;
  }

  const salary: ExpectedSalaryInput | null =
    input.expectedSalary ??
    (candidate.expectedSalaryMinor !== null && candidate.expectedSalaryCurrency && candidate.expectedSalaryPeriod
      ? { amountMinor: candidate.expectedSalaryMinor, currency: candidate.expectedSalaryCurrency, period: candidate.expectedSalaryPeriod }
      : null);
  if (input.expectedSalary) await assertCurrency(input.expectedSalary.currency, tx);
  if (input.assignedToUserId) await assertStaffUser(input.assignedToUserId, tx);

  const { workflowId, stages } = await resolveWorkflowForJob({ workflowId: job.workflowId, organizationId: job.organizationId }, tx);
  const firstStage = initialStage(stages);
  if (!firstStage) throw new ActionError("Applications are not available right now. Please try again later.", { code: "workflow_missing" });

  const applicationId = existing?.id ?? randomUUID();
  const code = existing?.code ?? (await nextCode("APP", { tx }));
  const snapshot = await buildProfileSnapshot(candidate.id, tx, now);
  const shareNow = shareWithEmployerOnCreate(job);

  const consentRecordId = await insertConsentRecord(
    {
      userId: candidate.userId,
      purpose: "share_profile_with_employers",
      granted: true,
      source: origin.kind === "candidate" ? "application" : origin.kind === "partner" ? "partner_submission" : "staff_assignment",
      contextType: "application",
      contextId: applicationId,
      capturedByUserId: origin.kind === "candidate" ? null : origin.kind === "partner" ? origin.partnerUserId : origin.actor.ctx.user.id,
      evidence: {
        jobId: job.id,
        jobCode: job.code,
        ...(origin.kind === "staff" ? { method: origin.consentMethod, note: origin.consentNote } : {}),
        ...(origin.kind === "partner" ? { partnerSubmissionId: origin.partnerSubmissionId, partnerConsentRecordId: origin.partnerConsentRecordId } : {}),
      },
    },
    tx,
  );

  const source: ApplicationSource = origin.kind === "candidate" ? "direct" : origin.kind === "partner" ? "partner" : origin.source;
  const values = {
    workflowId,
    currentStageId: firstStage.id,
    status: "active" as const,
    coverLetter: input.coverLetter ?? null,
    resumeFileId,
    profileSnapshot: snapshot as unknown as Record<string, unknown>,
    expectedSalaryMinor: salary?.amountMinor ?? null,
    expectedSalaryCurrency: salary?.currency ?? null,
    expectedSalaryPeriod: salary?.period ?? null,
    consentToShareAt: now,
    consentRecordId,
    sharedWithEmployerAt: shareNow ? now : null,
    sharedWithEmployerByUserId: null,
    knockoutFlags: screening.knockoutFlags,
    lastStageChangedAt: now,
  };

  if (decision === "reopen" && existing) {
    await tx
      .update(applications)
      .set({
        ...values,
        withdrawnAt: null,
        withdrawalReason: null,
        rejectedAt: null,
        rejectionReasonCode: null,
        rejectionReason: null,
        hiredAt: null,
        isShortlisted: false,
        rating: null,
      })
      .where(eq(applications.id, existing.id));
    await tx.delete(applicationAnswers).where(eq(applicationAnswers.applicationId, existing.id));
  } else {
    await tx.insert(applications).values({
      id: applicationId,
      code,
      jobId: job.id,
      candidateId: candidate.id,
      source,
      sourceDetails: origin.kind === "staff" ? origin.sourceDetails : {},
      partnerOrganizationId: origin.kind === "partner" ? origin.partnerOrganizationId : null,
      submittedByUserId: origin.kind === "partner" ? origin.partnerUserId : originUserId(origin),
      assignedToUserId: input.assignedToUserId ?? null,
      ...values,
      createdAt: now,
    });
    await tx
      .update(jobs)
      .set({ applicationCount: sql`${jobs.applicationCount} + 1` })
      .where(eq(jobs.id, job.id));
  }

  if (screening.answers.length) {
    await tx.insert(applicationAnswers).values(
      screening.answers.map((a) => ({
        applicationId,
        questionId: a.questionId,
        questionSnapshot: a.questionSnapshot,
        answer: a.answer,
        isFlagged: a.isFlagged,
      })),
    );
  }

  const historyNote =
    decision === "reopen"
      ? "Re-applied after withdrawing"
      : origin.kind === "partner"
        ? `Accepted from partner submission ${origin.partnerSubmissionCode}`
        : origin.kind === "staff"
          ? (input.internalNote ?? "Assigned by Venkat Sai")
          : null;
  const [history] = await tx
    .insert(applicationStageHistory)
    .values({
      applicationId,
      fromStageId: decision === "reopen" ? (existing?.currentStageId ?? null) : null,
      toStageId: firstStage.id,
      changedByUserId: originUserId(origin),
      changedByType: origin.kind === "candidate" ? "candidate" : "staff",
      note: historyNote,
      createdAt: now,
    })
    .returning({ id: applicationStageHistory.id });

  if (shareNow && job.organizationId) {
    await shareApplicationFiles(
      { applicationId, organizationId: job.organizationId, candidateId: candidate.id, resumeFileId, grantedByUserId: originUserId(origin) },
      tx,
    );
  }

  const employerName = publicEmployerName(job, job.organizationName);
  await notify(
    {
      event: "application.submitted",
      recipients: [{ userId: candidate.userId }],
      data: {
        applicationCode: code,
        jobTitle: job.title,
        employerName,
        submittedBy: origin.kind === "candidate" ? "self" : origin.kind === "partner" ? "partner" : "venkat_sai",
      },
      link: recruitmentLinks.candidateApplication(applicationId),
      dedupeKey: `application-submitted:${history!.id}`,
    },
    { tx },
  );
  const received = { applicationCode: code, jobTitle: job.title, jobCode: job.code, source };
  if (shareNow && job.organizationId) {
    await notifyOrganization(
      {
        event: "application.received",
        organizationId: job.organizationId,
        permission: "employer.pipeline.view",
        data: received,
        link: recruitmentLinks.employerApplication(job.id, applicationId),
        dedupeKey: `application-received-org:${history!.id}`,
      },
      { tx },
    );
  }
  if (job.managedByVenkatSai || !job.organizationId) {
    await notifyStaff(
      {
        event: "application.received",
        permission: "recruitment.manage",
        data: received,
        link: recruitmentLinks.staffApplication(applicationId),
        dedupeKey: `application-received-staff:${history!.id}`,
      },
      { tx },
    );
  }

  await audit({
    action: decision === "reopen" ? "application.reopened" : "application.created",
    entityType: "application",
    entityId: applicationId,
    organizationId: job.organizationId,
    actorUserId: originUserId(origin),
    actorType: origin.kind === "candidate" ? "user" : "staff",
    metadata: {
      code,
      jobId: job.id,
      candidateId: candidate.id,
      source,
      partnerOrganizationId: origin.kind === "partner" ? origin.partnerOrganizationId : null,
      knockoutFlags: screening.knockoutFlags.length,
      sharedWithEmployer: shareNow,
    },
    tx,
  });

  return { id: applicationId, code, reopened: decision === "reopen", knockoutFlagCount: screening.knockoutFlags.length };
}

/**
 * Create an application.
 *  - Candidate (People Portal): applies for themselves; must agree to share the profile.
 *  - Staff (recruitment.manage): puts a candidate forward, confirming how the candidate agreed.
 * Partner submissions become applications through acceptPartnerSubmission().
 */
export async function createApplication(actor: CandidateActor, input: CandidateApplyInput): Promise<CreatedApplication>;
export async function createApplication(actor: StaffActor, input: StaffAssignInput): Promise<CreatedApplication>;
export async function createApplication(actor: CandidateActor | StaffActor, input: CandidateApplyInput | StaffAssignInput): Promise<CreatedApplication> {
  try {
    if (actor.kind === "candidate") {
      const data = candidateApplySchema.parse(input);
      const created = await db.transaction((tx) =>
        createApplicationInTx(tx, { kind: "candidate", actor }, { ...data, candidateId: actor.candidateId, assignedToUserId: null, internalNote: null }),
      );
      // Conversion recorded once, after the commit (trackServer never throws and carries no personal data).
      await trackServer("application_submitted", { jobId: data.jobId });
      return created;
    }
    assertStaff(actor.ctx, "recruitment.manage");
    const data = staffAssignSchema.parse(input);
    return await db.transaction((tx) =>
      createApplicationInTx(
        tx,
        { kind: "staff", actor, source: data.source, sourceDetails: data.sourceDetails, consentMethod: data.consentMethod, consentNote: data.consentNote },
        data,
      ),
    );
  } catch (error) {
    if (isUniqueViolation(error, "applications_job_candidate_uq")) {
      throw new ActionError(actor.kind === "candidate" ? "You have already applied for this job." : "This candidate already has an application for this job.", {
        code: "duplicate_application",
      });
    }
    rethrowConstraint(error, APPLICATION_CONSTRAINTS);
  }
}

// ---------------------------------------------------------------------------
// Pipeline moves
// ---------------------------------------------------------------------------

async function transitionInTx(
  tx: DbOrTx,
  applicationId: string,
  resolveTarget: (stages: Awaited<ReturnType<typeof loadWorkflowStages>>) => Awaited<ReturnType<typeof loadWorkflowStages>>[number] | undefined,
  actor: RecruitmentActor,
  opts: TransitionOptionsInput & { withdrawalReason?: string | null },
): Promise<StageMoveResult> {
  const scope = await loadApplicationScope(applicationId, tx, { lock: true });
  if (!scope) throw notFoundError("Application");
  // Candidates may only withdraw (enforced by canTransition); everyone else needs manage access.
  assertApplicationAccess(actor, scope, actor.kind === "candidate" ? "view" : "manage");

  const stages = await loadWorkflowStages(scope.workflowId, tx);
  const from = stages.find((s) => s.id === scope.currentStageId);
  const to = resolveTarget(stages);
  if (!from) throw new Error(`Application ${scope.id} has no current stage in its workflow`);
  if (!to) throw new ActionError("That stage is not part of this application's workflow.", { code: "unknown_stage" });

  const check = canTransition(actorType(actor), from, to);
  if (!check.allowed) throw new ActionError(check.message, { code: check.reason });

  const options = transitionOptionsSchema.parse(opts);
  if (to.category === "rejected" && actor.kind !== "system" && !options.rejectionReasonCode) {
    throw new ActionError("Choose a reason for not progressing the application.", { fieldErrors: { rejectionReasonCode: ["Choose a reason"] } });
  }
  return applyStageMove(tx, scope, from, to, actor, { ...options, withdrawalReason: opts.withdrawalReason ?? null });
}

/**
 * Move an application to another stage of its workflow (by stage key).
 * Permission + ownership are checked for the actor; `canTransition` decides which moves the actor
 * type may make. Rejections need a structured reason. The candidate is notified with the stage's
 * candidate label (and `candidateVisibleNote`), never the internal note.
 */
export async function transitionApplication(
  applicationId: string,
  toStageKey: string,
  actor: RecruitmentActor,
  opts: TransitionOptionsInput = {},
): Promise<StageMoveResult> {
  return db.transaction((tx) => transitionInTx(tx, applicationId, (stages) => findStageByKey(stages, toStageKey), actor, opts));
}

/** Move several applications to the same stage; each move is independent (one failure does not undo the others). */
export async function bulkTransitionApplications(actor: RecruitmentActor, input: { applicationIds: string[]; toStageKey: string } & TransitionOptionsInput): Promise<BulkResult[]> {
  const data = bulkTransitionSchema.parse(input);
  const results: BulkResult[] = [];
  for (const id of [...new Set(data.applicationIds)]) {
    try {
      await transitionApplication(id, data.toStageKey, actor, data);
      results.push({ id, ok: true });
    } catch (error) {
      if (error instanceof ActionError) results.push({ id, ok: false, error: error.message });
      else throw error;
    }
  }
  return results;
}

/** The candidate withdraws their own application (any stage before joining). */
export async function withdrawApplication(actor: CandidateActor, applicationId: string, input: { reason?: string | null } = {}): Promise<StageMoveResult> {
  const reason = input.reason?.trim().slice(0, 1000) || null;
  const result = await db.transaction(async (tx) => {
    const moved = await transitionInTx(tx, applicationId, (stages) => firstStageInCategory(stages, "withdrawn"), actor, { withdrawalReason: reason });
    const scope = await loadApplicationScope(applicationId, tx);
    await notify(
      {
        event: "application.withdrawn",
        recipients: [{ userId: actor.userId }],
        data: { applicationCode: scope?.code, jobTitle: scope?.job.title },
        link: recruitmentLinks.candidateApplication(applicationId),
        dedupeKey: `application-withdrawn:${moved.historyId}`,
      },
      { tx },
    );
    return moved;
  });
  return result;
}

// ---------------------------------------------------------------------------
// Sharing, ownership, review flags
// ---------------------------------------------------------------------------

/**
 * Staff release applications of Venkat Sai-managed jobs to the employer after internal screening:
 * the employer sees them from now on, receives access to the resume and shareable documents, and is
 * notified. Applications on jobs without an organisation cannot be shared.
 */
export async function shareApplicationsWithEmployer(ctx: StaffActor["ctx"], applicationIds: string[]): Promise<BulkResult[]> {
  assertStaff(ctx, "recruitment.manage");
  const results: BulkResult[] = [];
  for (const id of [...new Set(applicationIds)].slice(0, 200)) {
    try {
      await db.transaction(async (tx) => {
        const scope = await requireApplication({ kind: "staff", ctx }, id, "manage", tx, { lock: true });
        if (!scope.job.organizationId) throw new ActionError("This job has no employer organisation to share with.", { code: "no_employer" });
        if (scope.sharedWithEmployerAt) return;
        if (!scope.consentToShareAt) throw new ActionError("The candidate has not agreed to share this application.", { code: "no_consent" });
        if (scope.status === "withdrawn") throw new ActionError("The candidate withdrew this application.", { code: "withdrawn" });
        const now = new Date();
        await tx.update(applications).set({ sharedWithEmployerAt: now, sharedWithEmployerByUserId: ctx.user.id }).where(eq(applications.id, scope.id));
        await shareApplicationFiles(
          { applicationId: scope.id, organizationId: scope.job.organizationId, candidateId: scope.candidateId, resumeFileId: scope.resumeFileId, grantedByUserId: ctx.user.id },
          tx,
        );
        await notifyOrganization(
          {
            event: "application.received",
            organizationId: scope.job.organizationId,
            permission: "employer.pipeline.view",
            data: { applicationCode: scope.code, jobTitle: scope.job.title, jobCode: scope.job.code, source: scope.source, sharedByVenkatSai: true },
            link: recruitmentLinks.employerApplication(scope.jobId, scope.id),
            dedupeKey: `application-shared:${scope.id}`,
          },
          { tx },
        );
        await audit({
          action: "application.shared_with_employer",
          entityType: "application",
          entityId: scope.id,
          organizationId: scope.job.organizationId,
          actorUserId: ctx.user.id,
          actorType: "staff",
          metadata: { code: scope.code },
          tx,
        });
      });
      results.push({ id, ok: true });
    } catch (error) {
      if (error instanceof ActionError) results.push({ id, ok: false, error: error.message });
      else throw error;
    }
  }
  return results;
}

/** Staff set (or clear) the Venkat Sai recruiter who owns an application. */
export async function assignApplicationOwner(ctx: StaffActor["ctx"], input: { applicationId: string; assignedToUserId: string | null }): Promise<void> {
  assertStaff(ctx, "recruitment.manage");
  const data = assignApplicationOwnerSchema.parse(input);
  await db.transaction(async (tx) => {
    const scope = await requireApplication({ kind: "staff", ctx }, data.applicationId, "manage", tx, { lock: true });
    if (data.assignedToUserId) await assertStaffUser(data.assignedToUserId, tx);
    await tx.update(applications).set({ assignedToUserId: data.assignedToUserId }).where(eq(applications.id, scope.id));
    await audit({
      action: "application.owner_assigned",
      entityType: "application",
      entityId: scope.id,
      organizationId: scope.job.organizationId,
      actorUserId: ctx.user.id,
      actorType: "staff",
      metadata: { assignedToUserId: data.assignedToUserId },
      tx,
    });
  });
}

/** Internal review flags (rating 1–5, shortlist flag) — staff or the employer; never shown to the candidate. */
export async function updateApplicationReview(
  actor: StaffActor | EmployerActor,
  input: { applicationId: string; rating?: number | null; isShortlisted?: boolean },
): Promise<void> {
  const data = applicationReviewSchema.parse(input);
  await db.transaction(async (tx) => {
    const scope: ApplicationScope = await requireApplication(actor, data.applicationId, "manage", tx, { lock: true });
    const set: Partial<typeof applications.$inferInsert> = {};
    if (data.rating !== undefined) set.rating = data.rating;
    if (data.isShortlisted !== undefined) set.isShortlisted = data.isShortlisted;
    if (!Object.keys(set).length) return;
    await tx.update(applications).set(set).where(eq(applications.id, scope.id));
    await audit({
      action: "application.review_updated",
      entityType: "application",
      entityId: scope.id,
      organizationId: scope.job.organizationId,
      actorUserId: actorUserId(actor),
      actorType: auditActorType(actor),
      metadata: set,
      tx,
    });
  });
}
