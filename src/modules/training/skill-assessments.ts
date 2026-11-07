import "server-only";

import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import {
  applications,
  assessmentCentres,
  candidateProfiles,
  candidateSkills,
  certificates,
  enrolments,
  requirementRequests,
  skillAssessments,
  skills,
  users,
} from "@/db/schema";
import { nextCode } from "@/lib/codes";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit } from "@/modules/audit";
import { recomputeVerificationLevel } from "@/modules/candidates/derived";
import { requireUploadedFile } from "@/modules/files";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { notify } from "@/modules/notifications";
import { forbiddenError, invalidStateError, notFoundError, validationError, withConstraintMessages } from "@/modules/organizations/errors";
import { omit } from "@/modules/organizations/objects";

import { assertStaffPermission } from "./access";
import { candidateIdentities, type CandidateActor } from "./candidate";
import { issueCertificateInTx, type CertificateRow } from "./certificates";
import { SKILL_ASSESSMENT_TYPE_LABELS } from "./constants";
import { toIsoDate } from "./rules";
import type { RecordSkillAssessmentResultInput, RescheduleSkillAssessmentInput, ScheduleSkillAssessmentInput } from "./schemas";

export type SkillAssessmentRow = typeof skillAssessments.$inferSelect;
export type AssessmentCentreRow = typeof assessmentCentres.$inferSelect;

/** Candidate-facing view: internal notes and evidence removed; results only once published. */
export type CandidateSkillAssessmentItem = Omit<SkillAssessmentRow, "internalNotes" | "evidenceFileIds" | "result" | "score" | "maxScore" | "remarks"> & {
  result: SkillAssessmentRow["result"] | null;
  score: number | null;
  maxScore: number | null;
  remarks: string | null;
  centre: Pick<AssessmentCentreRow, "name" | "city" | "addressLine1" | "addressLine2" | "timezone" | "candidateInstructions"> | null;
};

export type SkillAssessmentListItem = SkillAssessmentRow & { candidateName: string; centreName: string | null };

const ASSESS = "recruitment.assessments" as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadCentre(tx: DbOrTx, centreId: string | undefined): Promise<AssessmentCentreRow | null> {
  if (!centreId) return null;
  const [centre] = await tx.select().from(assessmentCentres).where(eq(assessmentCentres.id, centreId)).limit(1);
  if (!centre) throw validationError("Choose a valid assessment centre.", { assessmentCentreId: ["Choose a valid centre"] });
  if (!centre.isActive) throw validationError("This assessment centre is not active.", { assessmentCentreId: ["Choose an active centre"] });
  return centre;
}

async function notifyScheduled(tx: DbOrTx, assessment: SkillAssessmentRow, centre: AssessmentCentreRow | null, rescheduled: boolean): Promise<void> {
  const who = (await candidateIdentities([assessment.candidateId], tx)).get(assessment.candidateId);
  if (!who) return;
  await notify(
    {
      event: "assessment.scheduled",
      recipients: [{ userId: who.userId }],
      data: {
        code: assessment.code,
        trade: assessment.trade,
        assessmentType: SKILL_ASSESSMENT_TYPE_LABELS[assessment.assessmentType],
        scheduledAt: assessment.scheduledAt.toISOString(),
        timezone: centre?.timezone ?? null,
        centreName: centre?.name ?? null,
        address: centre ? [centre.addressLine1, centre.addressLine2, centre.city].filter(Boolean).join(", ") : null,
        location: assessment.location,
        instructions: centre?.candidateInstructions ?? null,
        rescheduled,
      },
      link: "/talent/assessments",
    },
    { tx },
  );
}

/** Mark the assessed skill as verified on the candidate profile (the derived columns are refreshed by the caller). */
async function applyPassToProfile(tx: DbOrTx, assessment: SkillAssessmentRow, now: Date): Promise<void> {
  if (!assessment.skillId) return;
  await tx
    .insert(candidateSkills)
    .values({ candidateId: assessment.candidateId, skillId: assessment.skillId, source: "assessment", verified: true, skillAssessmentId: assessment.id, verifiedAt: now })
    .onConflictDoUpdate({
      target: [candidateSkills.candidateId, candidateSkills.skillId],
      set: { source: "assessment", verified: true, skillAssessmentId: assessment.id, verifiedAt: now },
    });
}

/** Undo the skill verification of an assessment whose pass was corrected. */
async function revertPassOnProfile(tx: DbOrTx, assessmentId: string): Promise<void> {
  await tx.update(candidateSkills).set({ verified: false, skillAssessmentId: null, verifiedAt: null }).where(eq(candidateSkills.skillAssessmentId, assessmentId));
}


// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

/**
 * Staff (recruitment.assessments) schedule a Venkat Sai trade / welding / practical test at an assessment
 * centre (or another venue), optionally for an application, requirement or training enrolment, or as a
 * retest of an earlier attempt. The candidate is notified (assessment.scheduled).
 */
export async function scheduleSkillAssessment(staff: StaffContext, input: ScheduleSkillAssessmentInput): Promise<SkillAssessmentRow> {
  assertStaffPermission(staff, ASSESS);
  return db.transaction(async (tx) => {
    const [candidate] = await tx.select({ id: candidateProfiles.id }).from(candidateProfiles).where(and(eq(candidateProfiles.id, input.candidateId), isNull(candidateProfiles.deletedAt))).limit(1);
    if (!candidate) throw notFoundError("Candidate not found.");
    const centre = await loadCentre(tx, input.assessmentCentreId);
    if (input.applicationId) {
      const [app] = await tx.select({ candidateId: applications.candidateId }).from(applications).where(eq(applications.id, input.applicationId)).limit(1);
      if (!app || app.candidateId !== input.candidateId) throw validationError("Choose an application of this candidate.", { applicationId: ["Not this candidate's application"] });
    }
    if (input.requirementId) {
      const [req] = await tx.select({ id: requirementRequests.id }).from(requirementRequests).where(eq(requirementRequests.id, input.requirementId)).limit(1);
      if (!req) throw validationError("Choose a valid requirement.", { requirementId: ["Choose a valid requirement"] });
    }
    if (input.enrolmentId) {
      const [enrolment] = await tx.select({ candidateId: enrolments.candidateId }).from(enrolments).where(eq(enrolments.id, input.enrolmentId)).limit(1);
      if (!enrolment || enrolment.candidateId !== input.candidateId) throw validationError("Choose an enrolment of this candidate.", { enrolmentId: ["Not this candidate's enrolment"] });
    }
    if (input.skillId) {
      const [skill] = await tx.select({ id: skills.id }).from(skills).where(eq(skills.id, input.skillId)).limit(1);
      if (!skill) throw validationError("Choose a skill from the list.", { skillId: ["Choose a skill from the list"] });
    }
    let assessorName = input.assessorName ?? null;
    if (input.assessorUserId) {
      const [assessor] = await tx
        .select({ name: users.displayName })
        .from(users)
        .where(and(eq(users.id, input.assessorUserId), eq(users.isStaff, true), eq(users.status, "active")))
        .limit(1);
      if (!assessor) throw validationError("Choose an active Venkat Sai assessor.", { assessorUserId: ["Choose an active team member"] });
      assessorName = assessorName ?? assessor.name;
    }
    let attemptNumber = 1;
    if (input.retestOfAssessmentId) {
      const [previous] = await tx.select().from(skillAssessments).where(eq(skillAssessments.id, input.retestOfAssessmentId)).limit(1);
      if (!previous || previous.candidateId !== input.candidateId) throw validationError("Choose an earlier attempt of this candidate.", { retestOfAssessmentId: ["Not this candidate's assessment"] });
      if (previous.status !== "completed" || (previous.result !== "retest" && previous.result !== "fail")) throw invalidStateError("A retest follows a completed attempt with a fail or retest result.");
      if (previous.retestAvailableFrom && toIsoDate(input.scheduledAt) < previous.retestAvailableFrom) {
        throw validationError(`The retest can be taken from ${previous.retestAvailableFrom}.`, { scheduledAt: [`On or after ${previous.retestAvailableFrom}`] });
      }
      attemptNumber = previous.attemptNumber + 1;
    }
    const code = await nextCode("ASM", { tx });
    const [assessment] = await tx
      .insert(skillAssessments)
      .values({
        code,
        candidateId: input.candidateId,
        assessmentCentreId: centre?.id ?? null,
        applicationId: input.applicationId ?? null,
        requirementId: input.requirementId ?? null,
        enrolmentId: input.enrolmentId ?? null,
        trade: input.trade,
        skillId: input.skillId ?? null,
        assessmentType: input.assessmentType,
        process: input.process ?? null,
        position: input.position ?? null,
        standardReference: input.standardReference ?? null,
        materialDetails: input.materialDetails ?? null,
        evaluationMethods: input.evaluationMethods,
        location: input.location ?? null,
        scheduledAt: input.scheduledAt,
        scheduledByUserId: staff.user.id,
        assessorUserId: input.assessorUserId ?? null,
        assessorName,
        maxScore: input.maxScore ?? null,
        attemptNumber,
        retestOfAssessmentId: input.retestOfAssessmentId ?? null,
        status: "scheduled",
        result: "pending",
      })
      .returning();
    await notifyScheduled(tx, assessment!, centre, false);
    await audit({
      action: "skill_assessment.scheduled",
      entityType: "skill_assessment",
      entityId: assessment!.id,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { code, candidateId: input.candidateId, trade: input.trade, scheduledAt: input.scheduledAt.toISOString(), attemptNumber },
      tx,
    });
    return assessment!;
  });
}

async function loadAssessmentForUpdate(tx: DbOrTx, assessmentId: string): Promise<SkillAssessmentRow> {
  const [row] = await tx.select().from(skillAssessments).where(eq(skillAssessments.id, assessmentId)).limit(1).for("update");
  if (!row) throw notFoundError("Assessment not found.");
  return row;
}

export async function rescheduleSkillAssessment(staff: StaffContext, input: RescheduleSkillAssessmentInput): Promise<SkillAssessmentRow> {
  assertStaffPermission(staff, ASSESS);
  return db.transaction(async (tx) => {
    const assessment = await loadAssessmentForUpdate(tx, input.assessmentId);
    if (assessment.status !== "scheduled") throw invalidStateError("Only a scheduled assessment can be rescheduled.");
    const centre = await loadCentre(tx, input.assessmentCentreId);
    const [updated] = await tx
      .update(skillAssessments)
      .set({ scheduledAt: input.scheduledAt, assessmentCentreId: centre?.id ?? null, location: input.location ?? null })
      .where(eq(skillAssessments.id, assessment.id))
      .returning();
    await notifyScheduled(tx, updated!, centre, true);
    await audit({
      action: "skill_assessment.rescheduled",
      entityType: "skill_assessment",
      entityId: assessment.id,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { from: assessment.scheduledAt.toISOString(), to: input.scheduledAt.toISOString() },
      tx,
    });
    return updated!;
  });
}

/** Cancel a scheduled assessment; the reason is shown to the candidate (assessment.cancelled). */
export async function cancelSkillAssessment(staff: StaffContext, input: { assessmentId: string; reason: string }): Promise<void> {
  assertStaffPermission(staff, ASSESS);
  await db.transaction(async (tx) => {
    const assessment = await loadAssessmentForUpdate(tx, input.assessmentId);
    if (assessment.status !== "scheduled") throw invalidStateError("Only a scheduled assessment can be cancelled.");
    await tx.update(skillAssessments).set({ status: "cancelled", cancelledAt: new Date(), cancellationReason: input.reason }).where(eq(skillAssessments.id, assessment.id));
    const who = (await candidateIdentities([assessment.candidateId], tx)).get(assessment.candidateId);
    if (who) {
      await notify(
        { event: "assessment.cancelled", recipients: [{ userId: who.userId }], data: { code: assessment.code, trade: assessment.trade, scheduledAt: assessment.scheduledAt.toISOString(), reason: input.reason }, link: "/talent/assessments" },
        { tx },
      );
    }
    await audit({ action: "skill_assessment.cancelled", entityType: "skill_assessment", entityId: assessment.id, actorUserId: staff.user.id, actorType: "staff", metadata: { reason: input.reason }, tx });
  });
}

export async function markSkillAssessmentNoShow(staff: StaffContext, assessmentId: string): Promise<void> {
  assertStaffPermission(staff, ASSESS);
  await db.transaction(async (tx) => {
    const assessment = await loadAssessmentForUpdate(tx, assessmentId);
    if (assessment.status !== "scheduled") throw invalidStateError("Only a scheduled assessment can be marked as a no-show.");
    await tx.update(skillAssessments).set({ status: "no_show" }).where(eq(skillAssessments.id, assessment.id));
    await audit({ action: "skill_assessment.no_show", entityType: "skill_assessment", entityId: assessment.id, actorUserId: staff.user.id, actorType: "staff", tx });
  });
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

async function notifyResult(tx: DbOrTx, assessment: SkillAssessmentRow): Promise<void> {
  const who = (await candidateIdentities([assessment.candidateId], tx)).get(assessment.candidateId);
  if (!who) return;
  await notify(
    { event: "assessment.result", recipients: [{ userId: who.userId }], data: { code: assessment.code, trade: assessment.trade, result: assessment.result }, link: "/talent/assessments" },
    { tx },
  );
}

/**
 * Record (or correct) the result of an assessment (recruitment.assessments). On a pass the assessed skill
 * is marked verified on the candidate profile (source "assessment", unless `verifySkill` is false) and the
 * candidates module recomputes the verification level (skills_assessed once a pass is published or a skill
 * is assessment-verified; a corrected pass lowers it again); optionally a venkat_sai certificate is issued in
 * the same transaction (needs training.certificates). A corrected pass → fail is refused while an active
 * certificate exists, and removes the skill verification. `publish` makes the result visible and
 * notifies the candidate (assessment.result).
 */
export async function recordSkillAssessmentResult(
  staff: StaffContext,
  input: RecordSkillAssessmentResultInput,
  now: Date = new Date(),
): Promise<{ assessment: SkillAssessmentRow; certificate: CertificateRow | null }> {
  assertStaffPermission(staff, ASSESS);
  if (input.issueCertificate && !staffCan(staff, "training.certificates")) throw forbiddenError("Issuing Venkat Sai certificates needs the training.certificates permission.");
  return withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const assessment = await loadAssessmentForUpdate(tx, input.assessmentId);
        if (assessment.status !== "scheduled" && assessment.status !== "completed") throw invalidStateError("Results can be recorded only for scheduled or completed assessments.");
        const correction = assessment.status === "completed";
        if (correction && assessment.result === "pass" && input.result !== "pass") {
          const [active] = await tx
            .select({ id: certificates.id })
            .from(certificates)
            .where(and(eq(certificates.skillAssessmentId, assessment.id), eq(certificates.status, "active")))
            .limit(1);
          if (active) throw invalidStateError("Revoke the certificate issued for this assessment before changing a pass result.");
          await revertPassOnProfile(tx, assessment.id);
        }
        const maxScore = input.maxScore ?? assessment.maxScore;
        if (input.score !== undefined && maxScore === null) throw validationError("Enter the maximum score as well.", { maxScore: ["Required with a score"] });
        if (input.score !== undefined && maxScore !== null && input.score > maxScore) throw validationError("The score cannot exceed the maximum.", { score: [`Maximum ${maxScore}`] });
        for (const fileId of input.evidenceFileIds) {
          await requireUploadedFile(fileId, { purposes: ["candidate_document", "certificate"], ownerUserId: staff.user.id }, tx);
        }
        const publish = input.publish || (correction && assessment.resultPublishedAt !== null);
        const [updated] = await tx
          .update(skillAssessments)
          .set({
            status: "completed",
            completedAt: assessment.completedAt ?? now,
            result: input.result,
            score: input.score ?? null,
            maxScore,
            remarks: input.remarks ?? null,
            internalNotes: input.internalNotes ?? assessment.internalNotes,
            evidenceFileIds: input.evidenceFileIds,
            retestAvailableFrom: input.result === "pass" ? null : (input.retestAvailableFrom ?? null),
            resultPublishedAt: publish ? (assessment.resultPublishedAt ?? now) : null,
          })
          .where(eq(skillAssessments.id, assessment.id))
          .returning();
        if (input.result === "pass" && input.verifySkill) await applyPassToProfile(tx, updated!, now);
        // The candidates module recomputes skill caches and the verification level from the new state.
        await recomputeVerificationLevel(assessment.candidateId, tx);

        let certificate: CertificateRow | null = null;
        if (input.issueCertificate && input.result === "pass") {
          certificate = await issueCertificateInTx(
            tx,
            staff,
            { issuerType: "venkat_sai", skillAssessmentId: assessment.id, title: input.certificateTitle, expiresOn: input.certificateExpiresOn, description: undefined },
            now,
          );
        }
        if (publish && (!correction || assessment.result !== input.result || !assessment.resultPublishedAt)) await notifyResult(tx, updated!);
        await audit({
          action: correction ? "skill_assessment.result_corrected" : "skill_assessment.result_recorded",
          entityType: "skill_assessment",
          entityId: assessment.id,
          actorUserId: staff.user.id,
          actorType: "staff",
          metadata: { result: input.result, previousResult: assessment.result, score: input.score ?? null, published: publish, certificateId: certificate?.id ?? null },
          tx,
        });
        return { assessment: updated!, certificate };
      }),
    { certificates_active_assessment_uq: "An active certificate already exists for this assessment." },
  );
}

export async function publishSkillAssessmentResult(staff: StaffContext, assessmentId: string): Promise<void> {
  assertStaffPermission(staff, ASSESS);
  await db.transaction(async (tx) => {
    const assessment = await loadAssessmentForUpdate(tx, assessmentId);
    if (assessment.status !== "completed") throw invalidStateError("Record the result before publishing it.");
    if (assessment.resultPublishedAt) return;
    const [updated] = await tx.update(skillAssessments).set({ resultPublishedAt: new Date() }).where(eq(skillAssessments.id, assessment.id)).returning();
    // A published pass makes the profile skills_assessed.
    await recomputeVerificationLevel(assessment.candidateId, tx);
    await notifyResult(tx, updated!);
    await audit({ action: "skill_assessment.result_published", entityType: "skill_assessment", entityId: assessment.id, actorUserId: staff.user.id, actorType: "staff", tx });
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Staff list (recruitment.assessments or recruitment.view). */
export async function listSkillAssessments(
  staff: StaffContext,
  filters: { status?: SkillAssessmentRow["status"]; centreId?: string; candidateId?: string; from?: Date; to?: Date; q?: string },
  page: PageQuery,
): Promise<Paginated<SkillAssessmentListItem>> {
  if (!staffCan(staff, [ASSESS, "recruitment.view"], "any")) throw forbiddenError();
  const where: SQL[] = [];
  if (filters.status) where.push(eq(skillAssessments.status, filters.status));
  if (filters.centreId) where.push(eq(skillAssessments.assessmentCentreId, filters.centreId));
  if (filters.candidateId) where.push(eq(skillAssessments.candidateId, filters.candidateId));
  if (filters.from) where.push(gte(skillAssessments.scheduledAt, filters.from));
  if (filters.to) where.push(lte(skillAssessments.scheduledAt, filters.to));
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim().replace(/[%_\\]/g, "")}%`;
    where.push(or(ilike(skillAssessments.code, q), ilike(skillAssessments.trade, q))!);
  }
  const condition = where.length ? and(...where) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select({ a: skillAssessments, candidateName: users.displayName, centreName: assessmentCentres.name })
      .from(skillAssessments)
      .innerJoin(candidateProfiles, eq(candidateProfiles.id, skillAssessments.candidateId))
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .leftJoin(assessmentCentres, eq(assessmentCentres.id, skillAssessments.assessmentCentreId))
      .where(condition)
      .orderBy(desc(skillAssessments.scheduledAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(skillAssessments).where(condition),
  ]);
  return paginated(rows.map((r) => ({ ...r.a, candidateName: r.candidateName, centreName: r.centreName })), total[0]?.value ?? 0, page);
}

export async function getSkillAssessment(staff: StaffContext, assessmentId: string): Promise<SkillAssessmentListItem | null> {
  if (!staffCan(staff, [ASSESS, "recruitment.view"], "any")) throw forbiddenError();
  const [row] = await db
    .select({ a: skillAssessments, candidateName: users.displayName, centreName: assessmentCentres.name })
    .from(skillAssessments)
    .innerJoin(candidateProfiles, eq(candidateProfiles.id, skillAssessments.candidateId))
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .leftJoin(assessmentCentres, eq(assessmentCentres.id, skillAssessments.assessmentCentreId))
    .where(eq(skillAssessments.id, assessmentId))
    .limit(1);
  return row ? { ...row.a, candidateName: row.candidateName, centreName: row.centreName } : null;
}

/** The candidate's own assessments (People Portal): no internal notes or evidence; results once published. */
export async function listCandidateSkillAssessments(candidate: CandidateActor): Promise<CandidateSkillAssessmentItem[]> {
  const rows = await db
    .select({ a: skillAssessments, centre: assessmentCentres })
    .from(skillAssessments)
    .leftJoin(assessmentCentres, eq(assessmentCentres.id, skillAssessments.assessmentCentreId))
    .where(eq(skillAssessments.candidateId, candidate.candidateId))
    .orderBy(desc(skillAssessments.scheduledAt));
  return rows.map(({ a, centre }) => {
    const published = a.resultPublishedAt !== null;
    return {
      ...omit(a, ["internalNotes", "evidenceFileIds", "result", "score", "maxScore", "remarks"]),
      result: published ? a.result : null,
      score: published ? a.score : null,
      maxScore: published ? a.maxScore : null,
      remarks: published ? a.remarks : null,
      centre: centre
        ? { name: centre.name, city: centre.city, addressLine1: centre.addressLine1, addressLine2: centre.addressLine2, timezone: centre.timezone, candidateInstructions: centre.candidateInstructions }
        : null,
    };
  });
}

/** Scheduled assessments starting within the window (reminder task). */
export async function listUpcomingSkillAssessments(from: Date, to: Date): Promise<SkillAssessmentRow[]> {
  return db
    .select()
    .from(skillAssessments)
    .where(and(eq(skillAssessments.status, "scheduled"), gte(skillAssessments.scheduledAt, from), lte(skillAssessments.scheduledAt, to)))
    .orderBy(asc(skillAssessments.scheduledAt));
}

/** Assessments linked to applications (for the recruitment module's pipeline view). */
export async function listAssessmentsForApplications(applicationIds: readonly string[]): Promise<SkillAssessmentRow[]> {
  if (!applicationIds.length) return [];
  return db.select().from(skillAssessments).where(inArray(skillAssessments.applicationId, [...applicationIds])).orderBy(desc(skillAssessments.scheduledAt));
}
