import "server-only";

import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, max, sql, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import {
  applications,
  candidateProfiles,
  interviewFeedback,
  interviewParticipants,
  interviews,
  jobs,
  organizationMembers,
  organizations,
  skillAssessments,
  users,
  type InterviewCandidateResponse,
  type InterviewMode,
  type InterviewOutcome,
  type InterviewParticipantRole,
  type InterviewRecommendation,
  type InterviewScorecardEntry,
  type InterviewStatus,
} from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit } from "@/modules/audit";
import type { OrgContext } from "@/modules/identity/authz";
import { notify, notifyOrganization, notifyStaff, type NotificationRecipient } from "@/modules/notifications";

import {
  assertApplicationAccess,
  assertOrg,
  assertOrgActive,
  assertStaff,
  assertUuid,
  isUuid,
  loadApplicationScope,
  publicEmployerName,
  type ApplicationScope,
} from "./access";
import { actorUserId, auditActorType } from "./actors";
import { forbiddenError, notFoundError } from "./errors";
import { recruitmentLinks } from "./links";
import {
  cancelInterviewSchema,
  completeInterviewSchema,
  interviewFeedbackSchema,
  interviewParticipantsSchema,
  interviewResponseSchema,
  rescheduleInterviewSchema,
  scheduleInterviewSchema,
  type RescheduleInterviewInput,
  type ScheduleInterviewInput,
} from "./schemas";
import { autoAdvance } from "./stage-move";
import { dueReminder, REMINDER_OFFSETS } from "./interview-rules";
import { formatInTimeZone, isValidTimeZone, zonedLocalToUtc } from "./timezone";
import type { CandidateActor, HiringActor, PartnerActor, RecruitmentActor, StaffActor } from "./types";
import { STAGE_KEYS } from "./workflow";

/**
 * Interviews and trade tests: schedule / reschedule / cancel / complete with a panel and an explicit
 * IANA time zone, candidate confirmation, structured feedback, reminders (24 h and 2 h before) and
 * scoped read models. Feedback is internal; participants' emails are visible to organisers only.
 */

const OPEN_STATUSES: InterviewStatus[] = ["scheduled", "rescheduled"];
/** Scheduling allows a little clock skew; anything earlier is in the past. */
const PAST_TOLERANCE_MS = 5 * 60 * 1000;

type InterviewRow = typeof interviews.$inferSelect;

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/** Staff need recruitment.manage; employers employer.interviews.manage on shared applications of their own jobs. */
function assertCanManageInterviews(actor: HiringActor, scope: ApplicationScope): void {
  if (actor.kind === "staff") {
    assertStaff(actor.ctx, "recruitment.manage");
    return;
  }
  assertOrg(actor.ctx, "employer.interviews.manage");
  assertOrgActive(actor.ctx);
  if (scope.job.organizationId !== actor.ctx.organization.id || !scope.sharedWithEmployerAt) throw notFoundError("Application");
}

async function loadInterviewForUpdate(interviewId: string, tx: DbOrTx): Promise<{ interview: InterviewRow; scope: ApplicationScope }> {
  assertUuid(interviewId, "Interview");
  const [interview] = await tx.select().from(interviews).where(eq(interviews.id, interviewId)).limit(1).for("update");
  if (!interview) throw notFoundError("Interview");
  const scope = await loadApplicationScope(interview.applicationId, tx);
  if (!scope) throw notFoundError("Interview");
  return { interview, scope };
}

function resolveSchedule(input: { startsAtLocal: string; timezone: string; durationMinutes: number }, now: Date): { start: Date; end: Date } {
  if (!isValidTimeZone(input.timezone)) throw new ActionError("Choose a valid time zone.", { fieldErrors: { timezone: ["Choose a valid time zone"] } });
  let start: Date;
  try {
    start = zonedLocalToUtc(input.startsAtLocal, input.timezone);
  } catch {
    throw new ActionError("Enter a valid date and time.", { fieldErrors: { startsAtLocal: ["Enter a valid date and time"] } });
  }
  if (start.getTime() < now.getTime() - PAST_TOLERANCE_MS) {
    throw new ActionError("Choose a time in the future.", { fieldErrors: { startsAtLocal: ["Choose a time in the future"] } });
  }
  return { start, end: new Date(start.getTime() + input.durationMinutes * 60_000) };
}

type ParticipantInput = { userId: string | null; name: string; email: string | null; role: InterviewParticipantRole };

/** Panel members with accounts must belong to the employer (or be staff / members of the job's employer for staff). */
async function validateParticipants(actor: HiringActor, scope: ApplicationScope, participants: ParticipantInput[], tx: DbOrTx): Promise<ParticipantInput[]> {
  const unique = new Map<string, ParticipantInput>();
  const external: ParticipantInput[] = [];
  for (const p of participants) {
    if (p.userId) unique.set(p.userId, p);
    else external.push(p);
  }
  const userIds = [...unique.keys()];
  if (userIds.length) {
    const allowedOrg = actor.kind === "employer" ? actor.ctx.organization.id : scope.job.organizationId;
    const rows = await tx
      .select({ id: users.id, isStaff: users.isStaff, memberOrg: organizationMembers.organizationId })
      .from(users)
      .leftJoin(
        organizationMembers,
        and(eq(organizationMembers.userId, users.id), eq(organizationMembers.status, "active"), allowedOrg ? eq(organizationMembers.organizationId, allowedOrg) : sql`false`),
      )
      .where(and(inArray(users.id, userIds), eq(users.status, "active")));
    const ok = new Set(rows.filter((r) => (actor.kind === "staff" && r.isStaff) || (allowedOrg && r.memberOrg === allowedOrg)).map((r) => r.id));
    const invalid = userIds.filter((id) => !ok.has(id));
    if (invalid.length) throw new ActionError("Some panel members cannot be added to this interview.", { fieldErrors: { participants: ["Choose members of your team"] } });
  }
  return [...unique.values(), ...external];
}

function candidateInterviewData(interview: Pick<InterviewRow, "code" | "roundName" | "mode" | "scheduledStart" | "timezone" | "location" | "meetingUrl" | "candidateInstructions">, scope: ApplicationScope) {
  return {
    interviewCode: interview.code,
    applicationCode: scope.code,
    jobTitle: scope.job.title,
    employerName: publicEmployerName(scope.job, scope.organizationName),
    roundName: interview.roundName,
    mode: interview.mode,
    startsAt: interview.scheduledStart.toISOString(),
    timezone: interview.timezone,
    startsAtLocal: formatInTimeZone(interview.scheduledStart, interview.timezone),
    location: interview.location,
    meetingUrl: interview.meetingUrl,
    instructions: interview.candidateInstructions,
  };
}

async function panelRecipients(interviewId: string, tx: DbOrTx): Promise<NotificationRecipient[]> {
  const rows = await tx.select({ userId: interviewParticipants.userId, email: interviewParticipants.email, name: interviewParticipants.name }).from(interviewParticipants).where(eq(interviewParticipants.interviewId, interviewId));
  return rows.flatMap((r): NotificationRecipient[] => (r.userId ? [{ userId: r.userId }] : r.email ? [{ email: r.email, name: r.name }] : []));
}

async function notifyInterviewEvent(
  event: "interview.scheduled" | "interview.rescheduled" | "interview.cancelled",
  interview: InterviewRow,
  scope: ApplicationScope,
  extra: Record<string, unknown>,
  dedupeSuffix: string,
  tx: DbOrTx,
): Promise<void> {
  const data = { ...candidateInterviewData(interview, scope), ...extra };
  await notify(
    {
      event,
      recipients: [{ userId: scope.candidateUserId }],
      data: { ...data, audience: "candidate" },
      link: recruitmentLinks.candidateInterviews(),
      dedupeKey: `${event}:${interview.id}:${dedupeSuffix}:candidate`,
    },
    { tx },
  );
  const panel = await panelRecipients(interview.id, tx);
  if (panel.length) {
    await notify(
      {
        event,
        recipients: panel,
        data: { ...data, audience: "panel", instructions: null },
        link: interview.organizationId ? recruitmentLinks.employerInterviews() : recruitmentLinks.staffInterviews(),
        organizationId: interview.organizationId,
        dedupeKey: `${event}:${interview.id}:${dedupeSuffix}:panel`,
      },
      { tx },
    );
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Schedule an interview or trade test for an active application (moves it to "Interview scheduled" when that is a step forward). */
export async function scheduleInterview(actor: HiringActor, input: ScheduleInterviewInput): Promise<{ id: string; code: string }> {
  const data = scheduleInterviewSchema.parse(input);
  const now = new Date();
  return db.transaction(async (tx) => {
    const scope = await loadApplicationScope(data.applicationId, tx, { lock: true });
    if (!scope) throw notFoundError("Application");
    assertCanManageInterviews(actor, scope);
    if (scope.status !== "active") throw new ActionError("Interviews can only be scheduled for open applications.", { code: "application_closed" });
    const { start, end } = resolveSchedule(data, now);
    const participants = await validateParticipants(actor, scope, data.participants, tx);

    let organizationId: string | null;
    if (actor.kind === "employer") organizationId = actor.ctx.organization.id;
    else {
      const conductedBy = data.conductedBy ?? (scope.job.organizationId && data.mode !== "trade_test" ? "employer" : "venkat_sai");
      organizationId = conductedBy === "employer" ? scope.job.organizationId : null;
    }

    let skillAssessmentId: string | null = null;
    if (data.skillAssessmentId) {
      if (actor.kind !== "staff") throw forbiddenError("Only Venkat Sai staff can link a trade test.");
      const [assessment] = await tx
        .select({ id: skillAssessments.id })
        .from(skillAssessments)
        .where(and(eq(skillAssessments.id, data.skillAssessmentId), eq(skillAssessments.candidateId, scope.candidateId)))
        .limit(1);
      if (!assessment) throw notFoundError("Assessment");
      skillAssessmentId = assessment.id;
    }

    const [round] = await tx.select({ value: max(interviews.roundNumber) }).from(interviews).where(eq(interviews.applicationId, scope.id));
    const code = await nextCode("INT", { tx });
    const [interview] = await tx
      .insert(interviews)
      .values({
        code,
        applicationId: scope.id,
        organizationId,
        roundNumber: data.roundNumber ?? (round?.value ?? 0) + 1,
        roundName: data.roundName,
        mode: data.mode,
        scheduledStart: start,
        scheduledEnd: end,
        timezone: data.timezone,
        location: data.location,
        meetingUrl: data.meetingUrl,
        candidateInstructions: data.candidateInstructions,
        status: "scheduled",
        organizedByUserId: actorUserId(actor),
        skillAssessmentId,
      })
      .returning();
    if (participants.length) {
      await tx.insert(interviewParticipants).values(participants.map((p) => ({ interviewId: interview!.id, userId: p.userId, name: p.name, email: p.email, role: p.role })));
    }

    await autoAdvance(tx, scope, actor, STAGE_KEYS.interviewScheduled, { fallbackCategory: "interview", notifyCandidate: false, internalNote: `Interview ${code} scheduled` });
    await notifyInterviewEvent("interview.scheduled", interview!, scope, {}, "1", tx);
    await audit({
      action: "interview.scheduled",
      entityType: "interview",
      entityId: interview!.id,
      organizationId: scope.job.organizationId,
      actorUserId: actorUserId(actor),
      actorType: auditActorType(actor),
      metadata: { code, applicationId: scope.id, mode: data.mode, scheduledStart: start.toISOString(), timezone: data.timezone, panel: participants.length },
      tx,
    });
    return { id: interview!.id, code };
  });
}

/** Move an open interview to a new time (the candidate is asked to confirm again; reminders restart). */
export async function rescheduleInterview(actor: HiringActor, input: RescheduleInterviewInput): Promise<void> {
  const data = rescheduleInterviewSchema.parse(input);
  const now = new Date();
  await db.transaction(async (tx) => {
    const { interview, scope } = await loadInterviewForUpdate(data.interviewId, tx);
    assertCanManageInterviews(actor, scope);
    if (!OPEN_STATUSES.includes(interview.status)) throw new ActionError("Only scheduled interviews can be rescheduled.", { code: "interview_closed" });
    const { start, end } = resolveSchedule(data, now);
    const [updated] = await tx
      .update(interviews)
      .set({
        scheduledStart: start,
        scheduledEnd: end,
        timezone: data.timezone,
        location: data.location ?? interview.location,
        meetingUrl: data.meetingUrl ?? interview.meetingUrl,
        candidateInstructions: data.candidateInstructions ?? interview.candidateInstructions,
        status: "rescheduled",
        candidateResponse: "pending",
        candidateRespondedAt: null,
        candidateResponseNote: null,
        reminderSentAt: null,
      })
      .where(eq(interviews.id, interview.id))
      .returning();
    await notifyInterviewEvent("interview.rescheduled", updated!, scope, { reason: data.reason, previousStartsAt: interview.scheduledStart.toISOString() }, start.toISOString(), tx);
    await audit({
      action: "interview.rescheduled",
      entityType: "interview",
      entityId: interview.id,
      organizationId: scope.job.organizationId,
      actorUserId: actorUserId(actor),
      actorType: auditActorType(actor),
      metadata: { code: interview.code, from: interview.scheduledStart.toISOString(), to: start.toISOString(), timezone: data.timezone, reason: data.reason },
      tx,
    });
  });
}

export async function cancelInterview(actor: HiringActor, input: { interviewId: string; reason: string }): Promise<void> {
  const data = cancelInterviewSchema.parse(input);
  await db.transaction(async (tx) => {
    const { interview, scope } = await loadInterviewForUpdate(data.interviewId, tx);
    assertCanManageInterviews(actor, scope);
    if (!OPEN_STATUSES.includes(interview.status)) throw new ActionError("This interview is not scheduled.", { code: "interview_closed" });
    const [updated] = await tx
      .update(interviews)
      .set({ status: "cancelled", cancelledAt: new Date(), cancellationReason: data.reason })
      .where(eq(interviews.id, interview.id))
      .returning();
    await notifyInterviewEvent("interview.cancelled", updated!, scope, { reason: data.reason }, "cancel", tx);
    await audit({
      action: "interview.cancelled",
      entityType: "interview",
      entityId: interview.id,
      organizationId: scope.job.organizationId,
      actorUserId: actorUserId(actor),
      actorType: auditActorType(actor),
      metadata: { code: interview.code, reason: data.reason },
      tx,
    });
  });
}

/** Record that the interview took place (or the candidate did not attend) and its outcome. */
export async function completeInterview(actor: HiringActor, input: { interviewId: string; status?: "completed" | "no_show"; outcome?: InterviewOutcome }): Promise<void> {
  const data = completeInterviewSchema.parse(input);
  await db.transaction(async (tx) => {
    const { interview, scope } = await loadInterviewForUpdate(data.interviewId, tx);
    assertCanManageInterviews(actor, scope);
    if (interview.status === "cancelled") throw new ActionError("This interview was cancelled.", { code: "interview_cancelled" });
    await tx.update(interviews).set({ status: data.status, outcome: data.outcome }).where(eq(interviews.id, interview.id));
    if (data.status === "completed" && scope.status === "active") {
      await autoAdvance(tx, scope, actor, STAGE_KEYS.interviewCompleted, { notifyCandidate: false, internalNote: `Interview ${interview.code} completed` });
    }
    await audit({
      action: "interview.completed",
      entityType: "interview",
      entityId: interview.id,
      organizationId: scope.job.organizationId,
      actorUserId: actorUserId(actor),
      actorType: auditActorType(actor),
      metadata: { code: interview.code, status: data.status, outcome: data.outcome },
      tx,
    });
  });
}

/** Replace the interview panel. */
export async function updateInterviewParticipants(actor: HiringActor, input: { interviewId: string; participants: ParticipantInput[] }): Promise<void> {
  const data = interviewParticipantsSchema.parse(input);
  await db.transaction(async (tx) => {
    const { interview, scope } = await loadInterviewForUpdate(data.interviewId, tx);
    assertCanManageInterviews(actor, scope);
    if (!OPEN_STATUSES.includes(interview.status)) throw new ActionError("This interview is not scheduled.", { code: "interview_closed" });
    const participants = await validateParticipants(actor, scope, data.participants, tx);
    await tx.delete(interviewParticipants).where(eq(interviewParticipants.interviewId, interview.id));
    if (participants.length) {
      await tx.insert(interviewParticipants).values(participants.map((p) => ({ interviewId: interview.id, userId: p.userId, name: p.name, email: p.email, role: p.role })));
    }
    await audit({
      action: "interview.panel_updated",
      entityType: "interview",
      entityId: interview.id,
      organizationId: scope.job.organizationId,
      actorUserId: actorUserId(actor),
      actorType: auditActorType(actor),
      metadata: { code: interview.code, panel: participants.length },
      tx,
    });
  });
}

/** Structured interviewer feedback (one per author per interview; a second submission updates it). Internal. */
export async function submitInterviewFeedback(
  actor: HiringActor,
  input: {
    interviewId: string;
    rating?: number | null;
    recommendation: InterviewRecommendation;
    scorecard?: InterviewScorecardEntry[];
    strengths?: string | null;
    concerns?: string | null;
    notes?: string | null;
  },
): Promise<void> {
  const data = interviewFeedbackSchema.parse(input);
  await db.transaction(async (tx) => {
    const { interview, scope } = await loadInterviewForUpdate(data.interviewId, tx);
    if (actor.kind === "staff") assertStaff(actor.ctx, "recruitment.manage");
    else {
      assertOrg(actor.ctx, ["employer.interviews.manage", "employer.pipeline.manage"], "any");
      if (scope.job.organizationId !== actor.ctx.organization.id || !scope.sharedWithEmployerAt) throw notFoundError("Interview");
    }
    if (interview.status === "cancelled") throw new ActionError("This interview was cancelled.", { code: "interview_cancelled" });
    if (interview.status !== "completed" && interview.status !== "no_show" && interview.scheduledStart.getTime() > Date.now()) {
      throw new ActionError("Feedback can be added once the interview has started.", { code: "interview_not_started" });
    }
    const values = {
      rating: data.rating,
      recommendation: data.recommendation,
      scorecard: data.scorecard.map((s) => ({ criterion: s.criterion, score: Math.min(s.score, s.maxScore), maxScore: s.maxScore, ...(s.comment ? { comment: s.comment } : {}) })),
      strengths: data.strengths,
      concerns: data.concerns,
      notes: data.notes,
    };
    await tx
      .insert(interviewFeedback)
      .values({ interviewId: interview.id, authorUserId: actor.ctx.user.id, authorOrganizationId: actor.kind === "employer" ? actor.ctx.organization.id : null, ...values })
      .onConflictDoUpdate({ target: [interviewFeedback.interviewId, interviewFeedback.authorUserId], set: { ...values, updatedAt: new Date() } });
    await audit({
      action: "interview.feedback_submitted",
      entityType: "interview",
      entityId: interview.id,
      organizationId: scope.job.organizationId,
      actorUserId: actor.ctx.user.id,
      actorType: auditActorType(actor),
      metadata: { code: interview.code, recommendation: data.recommendation },
      tx,
    });
  });
}

/** The candidate confirms, declines or asks to reschedule an upcoming interview. */
export async function respondToInterview(actor: CandidateActor, input: { interviewId: string; response: Exclude<InterviewCandidateResponse, "pending">; note?: string | null }): Promise<void> {
  const data = interviewResponseSchema.parse(input);
  await db.transaction(async (tx) => {
    const { interview, scope } = await loadInterviewForUpdate(data.interviewId, tx);
    if (scope.candidateId !== actor.candidateId) throw notFoundError("Interview");
    if (!OPEN_STATUSES.includes(interview.status)) throw new ActionError("This interview is no longer scheduled.", { code: "interview_closed" });
    if (interview.scheduledStart.getTime() <= Date.now()) throw new ActionError("This interview has already started.", { code: "interview_started" });
    await tx
      .update(interviews)
      .set({ candidateResponse: data.response, candidateRespondedAt: new Date(), candidateResponseNote: data.note })
      .where(eq(interviews.id, interview.id));

    const payload = {
      interviewCode: interview.code,
      applicationCode: scope.code,
      jobTitle: scope.job.title,
      response: data.response,
      note: data.note,
      startsAt: interview.scheduledStart.toISOString(),
      timezone: interview.timezone,
    };
    const panel = await panelRecipients(interview.id, tx);
    const organiser: NotificationRecipient[] = interview.organizedByUserId ? [{ userId: interview.organizedByUserId }] : [];
    const recipients = [...organiser, ...panel.filter((p) => !("userId" in p) || p.userId !== interview.organizedByUserId)];
    if (recipients.length) {
      await notify(
        {
          event: "interview.response_received",
          recipients,
          data: payload,
          link: interview.organizationId ? recruitmentLinks.employerInterviews() : recruitmentLinks.staffInterviews(),
          organizationId: interview.organizationId,
          dedupeKey: `interview-response:${interview.id}:${data.response}:${Date.now()}`,
        },
        { tx },
      );
    } else if (interview.organizationId) {
      await notifyOrganization({ event: "interview.response_received", organizationId: interview.organizationId, permission: "employer.interviews.manage", data: payload, link: recruitmentLinks.employerInterviews() }, { tx });
    } else {
      await notifyStaff({ event: "interview.response_received", permission: "recruitment.manage", data: payload, link: recruitmentLinks.staffInterviews() }, { tx });
    }
    await audit({
      action: "interview.candidate_responded",
      entityType: "interview",
      entityId: interview.id,
      organizationId: scope.job.organizationId,
      actorUserId: actor.userId,
      actorType: "user",
      metadata: { code: interview.code, response: data.response },
      tx,
    });
  });
}

// ---------------------------------------------------------------------------
// Reminders (task recruitment.interview_reminders)
// ---------------------------------------------------------------------------

/**
 * Send due reminders to the candidate (unless they declined) and the panel. Idempotent: each
 * reminder has a dedupe key that includes the scheduled time, so a rescheduled interview gets fresh
 * reminders and retries never send twice. Returns how many reminders were enqueued.
 */
export async function sendDueInterviewReminders(now: Date = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + REMINDER_OFFSETS[0].ms);
  const rows = await db
    .select({ interview: interviews })
    .from(interviews)
    .where(and(inArray(interviews.status, OPEN_STATUSES), gte(interviews.scheduledStart, now), lte(interviews.scheduledStart, horizon)))
    .orderBy(asc(interviews.scheduledStart))
    .limit(1000);
  let sent = 0;
  for (const { interview } of rows) {
    const reminder = dueReminder(interview.scheduledStart, now);
    if (!reminder) continue;
    const scope = await loadApplicationScope(interview.applicationId);
    if (!scope || scope.status !== "active") continue;
    await db.transaction(async (tx) => {
      const base = { ...candidateInterviewData(interview, scope), reminder: reminder.key };
      const dedupeBase = `interview-reminder:${interview.id}:${interview.scheduledStart.toISOString()}:${reminder.key}`;
      if (interview.candidateResponse !== "declined") {
        await notify(
          { event: "interview.reminder", recipients: [{ userId: scope.candidateUserId }], data: { ...base, audience: "candidate" }, link: recruitmentLinks.candidateInterviews(), dedupeKey: `${dedupeBase}:candidate` },
          { tx },
        );
      }
      const panel = await panelRecipients(interview.id, tx);
      if (panel.length) {
        await notify(
          {
            event: "interview.reminder",
            recipients: panel,
            data: { ...base, audience: "panel", instructions: null },
            link: interview.organizationId ? recruitmentLinks.employerInterviews() : recruitmentLinks.staffInterviews(),
            organizationId: interview.organizationId,
            dedupeKey: `${dedupeBase}:panel`,
          },
          { tx },
        );
      }
      await tx.update(interviews).set({ reminderSentAt: now }).where(eq(interviews.id, interview.id));
    });
    sent += 1;
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export type InterviewParticipantView = { id: string; userId: string | null; name: string; email: string | null; role: InterviewParticipantRole };

export type InterviewFeedbackView = {
  id: string;
  authorUserId: string | null;
  authorName: string | null;
  authorOrganizationId: string | null;
  rating: number | null;
  recommendation: InterviewRecommendation;
  scorecard: InterviewScorecardEntry[];
  strengths: string | null;
  concerns: string | null;
  notes: string | null;
  updatedAt: Date;
};

export type InterviewView = {
  id: string;
  code: string;
  applicationId: string;
  applicationCode: string;
  jobId: string;
  jobTitle: string;
  candidateId: string;
  candidateName: string;
  roundNumber: number;
  roundName: string;
  mode: InterviewMode;
  scheduledStart: Date;
  scheduledEnd: Date | null;
  timezone: string;
  location: string | null;
  meetingUrl: string | null;
  candidateInstructions: string | null;
  status: InterviewStatus;
  outcome: InterviewOutcome;
  conductedBy: "employer" | "venkat_sai";
  organizationId: string | null;
  candidateResponse: InterviewCandidateResponse;
  candidateRespondedAt: Date | null;
  candidateResponseNote: string | null;
  cancellationReason: string | null;
  skillAssessmentId: string | null;
  participants: InterviewParticipantView[];
  /** Staff: all feedback; employer: their organisation's; partner: none. */
  feedback: InterviewFeedbackView[];
};

export type CandidateInterviewView = {
  id: string;
  code: string;
  applicationId: string;
  jobTitle: string;
  employerName: string;
  roundName: string;
  mode: InterviewMode;
  scheduledStart: Date;
  scheduledEnd: Date | null;
  timezone: string;
  location: string | null;
  meetingUrl: string | null;
  candidateInstructions: string | null;
  status: InterviewStatus;
  candidateResponse: InterviewCandidateResponse;
  cancellationReason: string | null;
  /** Can still confirm / decline / ask to reschedule. */
  canRespond: boolean;
};

const interviewSelection = {
  interview: interviews,
  applicationCode: applications.code,
  jobId: jobs.id,
  jobTitle: jobs.title,
  candidateId: applications.candidateId,
  candidateName: users.displayName,
  jobOrganizationId: jobs.organizationId,
  isConfidential: jobs.isConfidential,
  confidentialEmployerName: jobs.confidentialEmployerName,
  organizationName: organizations.name,
};

function baseInterviewQuery(tx: DbOrTx) {
  return tx
    .select(interviewSelection)
    .from(interviews)
    .innerJoin(applications, eq(applications.id, interviews.applicationId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(candidateProfiles, eq(candidateProfiles.id, applications.candidateId))
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .leftJoin(organizations, eq(organizations.id, jobs.organizationId));
}

type InterviewQueryRow = {
  interview: InterviewRow;
  applicationCode: string;
  jobId: string;
  jobTitle: string;
  candidateId: string;
  candidateName: string;
  jobOrganizationId: string | null;
  isConfidential: boolean;
  confidentialEmployerName: string | null;
  organizationName: string | null;
};

type Viewer = { kind: "staff" } | { kind: "employer"; organizationId: string } | { kind: "partner" };

async function toInterviewViews(rows: InterviewQueryRow[], viewer: Viewer, tx: DbOrTx): Promise<InterviewView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.interview.id);
  // Sequential: `tx` may be a transaction (one connection).
  const participantRows = viewer.kind === "partner" ? [] : await tx.select().from(interviewParticipants).where(inArray(interviewParticipants.interviewId, ids));
  const feedbackRows =
    viewer.kind === "partner"
      ? []
      : await tx
          .select({ feedback: interviewFeedback, authorName: users.displayName })
          .from(interviewFeedback)
          .leftJoin(users, eq(users.id, interviewFeedback.authorUserId))
          .where(
            and(
              inArray(interviewFeedback.interviewId, ids),
              viewer.kind === "employer" ? eq(interviewFeedback.authorOrganizationId, viewer.organizationId) : undefined,
            ),
          )
          .orderBy(desc(interviewFeedback.updatedAt));
  return rows.map((r) => {
    const i = r.interview;
    return {
      id: i.id,
      code: i.code,
      applicationId: i.applicationId,
      applicationCode: r.applicationCode,
      jobId: r.jobId,
      jobTitle: r.jobTitle,
      candidateId: r.candidateId,
      candidateName: r.candidateName,
      roundNumber: i.roundNumber,
      roundName: i.roundName,
      mode: i.mode,
      scheduledStart: i.scheduledStart,
      scheduledEnd: i.scheduledEnd,
      timezone: i.timezone,
      location: i.location,
      meetingUrl: i.meetingUrl,
      candidateInstructions: i.candidateInstructions,
      status: i.status,
      outcome: i.outcome,
      conductedBy: i.organizationId ? "employer" : "venkat_sai",
      organizationId: i.organizationId,
      candidateResponse: i.candidateResponse,
      candidateRespondedAt: i.candidateRespondedAt,
      candidateResponseNote: i.candidateResponseNote,
      cancellationReason: i.cancellationReason,
      skillAssessmentId: viewer.kind === "staff" ? i.skillAssessmentId : null,
      participants: participantRows
        .filter((p) => p.interviewId === i.id)
        .map((p) => ({ id: p.id, userId: p.userId, name: p.name, email: p.email, role: p.role })),
      feedback: feedbackRows
        .filter((f) => f.feedback.interviewId === i.id)
        .map((f) => ({
          id: f.feedback.id,
          authorUserId: f.feedback.authorUserId,
          authorName: f.authorName,
          authorOrganizationId: f.feedback.authorOrganizationId,
          rating: f.feedback.rating,
          recommendation: f.feedback.recommendation,
          scorecard: f.feedback.scorecard,
          strengths: f.feedback.strengths,
          concerns: f.feedback.concerns,
          notes: f.feedback.notes,
          updatedAt: f.feedback.updatedAt,
        })),
    };
  });
}

function toCandidateInterviewView(r: InterviewQueryRow, now: Date): CandidateInterviewView {
  const i = r.interview;
  return {
    id: i.id,
    code: i.code,
    applicationId: i.applicationId,
    jobTitle: r.jobTitle,
    employerName: publicEmployerName({ isConfidential: r.isConfidential, confidentialEmployerName: r.confidentialEmployerName, organizationId: r.jobOrganizationId }, r.organizationName),
    roundName: i.roundName,
    mode: i.mode,
    scheduledStart: i.scheduledStart,
    scheduledEnd: i.scheduledEnd,
    timezone: i.timezone,
    location: i.location,
    meetingUrl: i.meetingUrl,
    candidateInstructions: i.candidateInstructions,
    status: i.status,
    candidateResponse: i.candidateResponse,
    cancellationReason: i.status === "cancelled" ? i.cancellationReason : null,
    canRespond: OPEN_STATUSES.includes(i.status) && i.scheduledStart.getTime() > now.getTime(),
  };
}

/** The candidate's interviews (all applications), newest first; `upcomingOnly` keeps open ones from now on. */
export async function listInterviewsForCandidate(actor: CandidateActor, opts: { upcomingOnly?: boolean; applicationId?: string } = {}, tx: DbOrTx = db): Promise<CandidateInterviewView[]> {
  const now = new Date();
  const where: SQL[] = [eq(applications.candidateId, actor.candidateId)];
  if (opts.applicationId) {
    if (!isUuid(opts.applicationId)) return [];
    where.push(eq(interviews.applicationId, opts.applicationId));
  }
  if (opts.upcomingOnly) where.push(inArray(interviews.status, OPEN_STATUSES), gte(interviews.scheduledStart, now));
  const rows = await baseInterviewQuery(tx)
    .where(and(...where))
    .orderBy(opts.upcomingOnly ? asc(interviews.scheduledStart) : desc(interviews.scheduledStart))
    .limit(200);
  return rows.map((r) => toCandidateInterviewView(r, now));
}

/** Interviews of one application as the actor may see them (candidates get the candidate-safe view through listInterviewsForCandidate). */
export async function listInterviewsForApplication(actor: RecruitmentActor, applicationId: string): Promise<InterviewView[]> {
  const scope = await loadApplicationScope(applicationId);
  if (!scope) throw notFoundError("Application");
  assertApplicationAccess(actor, scope, "view");
  if (actor.kind === "candidate") throw forbiddenError();
  const viewer: Viewer = actor.kind === "employer" ? { kind: "employer", organizationId: actor.ctx.organization.id } : actor.kind === "partner" ? { kind: "partner" } : { kind: "staff" };
  const rows = await baseInterviewQuery(db).where(eq(interviews.applicationId, scope.id)).orderBy(asc(interviews.roundNumber), asc(interviews.scheduledStart)).limit(100);
  return toInterviewViews(rows, viewer, db);
}

export type InterviewListFilters = { from?: Date; to?: Date; status?: InterviewStatus; jobId?: string };

function interviewFilterConditions(filters: InterviewListFilters): SQL[] {
  const where: SQL[] = [];
  if (filters.from) where.push(gte(interviews.scheduledStart, filters.from));
  if (filters.to) where.push(lte(interviews.scheduledStart, filters.to));
  if (filters.status) where.push(eq(interviews.status, filters.status));
  if (filters.jobId && isUuid(filters.jobId)) where.push(eq(applications.jobId, filters.jobId));
  return where;
}

/** Employer interview calendar: interviews on shared applications of the organisation's jobs. */
export async function listInterviewsForEmployer(ctx: OrgContext<"employer">, filters: InterviewListFilters, page: PageQuery): Promise<Paginated<InterviewView>> {
  assertOrg(ctx, ["employer.interviews.manage", "employer.pipeline.view"], "any");
  const where = and(eq(jobs.organizationId, ctx.organization.id), isNotNull(applications.sharedWithEmployerAt), ...interviewFilterConditions(filters));
  const [rows, total] = await Promise.all([
    baseInterviewQuery(db).where(where).orderBy(asc(interviews.scheduledStart)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(interviews).innerJoin(applications, eq(applications.id, interviews.applicationId)).innerJoin(jobs, eq(jobs.id, applications.jobId)).where(where),
  ]);
  return paginated(await toInterviewViews(rows, { kind: "employer", organizationId: ctx.organization.id }, db), total[0]?.value ?? 0, page);
}

/** Command Centre interview calendar (recruitment.view). */
export async function listInterviewsForStaff(ctx: StaffActor["ctx"], filters: InterviewListFilters & { organizationId?: string }, page: PageQuery): Promise<Paginated<InterviewView>> {
  assertStaff(ctx, ["recruitment.view", "recruitment.manage"], "any");
  const conditions = interviewFilterConditions(filters);
  if (filters.organizationId && isUuid(filters.organizationId)) conditions.push(eq(jobs.organizationId, filters.organizationId));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, total] = await Promise.all([
    baseInterviewQuery(db).where(where).orderBy(asc(interviews.scheduledStart)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(interviews).innerJoin(applications, eq(applications.id, interviews.applicationId)).innerJoin(jobs, eq(jobs.id, applications.jobId)).where(where),
  ]);
  return paginated(await toInterviewViews(rows, { kind: "staff" }, db), total[0]?.value ?? 0, page);
}

/** Partner view: interviews of applications credited to the partner (no panel, no feedback). */
export async function listInterviewsForPartner(ctx: PartnerActor["ctx"], filters: InterviewListFilters, page: PageQuery): Promise<Paginated<InterviewView>> {
  assertOrg(ctx, "partner.submissions.view");
  const where = and(eq(applications.partnerOrganizationId, ctx.organization.id), ...interviewFilterConditions(filters));
  const [rows, total] = await Promise.all([
    baseInterviewQuery(db).where(where).orderBy(asc(interviews.scheduledStart)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(interviews).innerJoin(applications, eq(applications.id, interviews.applicationId)).where(where),
  ]);
  const views = await toInterviewViews(rows, { kind: "partner" }, db);
  return paginated(
    views.map((v) => ({ ...v, meetingUrl: null, candidateResponseNote: null })),
    total[0]?.value ?? 0,
    page,
  );
}

/** One interview for staff / employer. */
export async function getInterview(actor: HiringActor, interviewId: string): Promise<InterviewView> {
  if (!isUuid(interviewId)) throw notFoundError("Interview");
  const [row] = await baseInterviewQuery(db).where(eq(interviews.id, interviewId)).limit(1);
  if (!row) throw notFoundError("Interview");
  if (actor.kind === "staff") {
    assertStaff(actor.ctx, ["recruitment.view", "recruitment.manage"], "any");
    return (await toInterviewViews([row], { kind: "staff" }, db))[0]!;
  }
  assertOrg(actor.ctx, ["employer.interviews.manage", "employer.pipeline.view"], "any");
  const scope = await loadApplicationScope(row.interview.applicationId);
  if (!scope || scope.job.organizationId !== actor.ctx.organization.id || !scope.sharedWithEmployerAt) throw notFoundError("Interview");
  return (await toInterviewViews([row], { kind: "employer", organizationId: actor.ctx.organization.id }, db))[0]!;
}
