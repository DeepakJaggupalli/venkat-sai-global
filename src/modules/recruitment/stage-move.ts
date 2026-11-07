import "server-only";

import { eq } from "drizzle-orm";

import type { DbOrTx } from "@/db";
import {
  applicationStageHistory,
  applications,
  type ApplicationRejectionReason,
  type ApplicationStatus,
  type WorkflowStageCategory,
} from "@/db/schema";
import { audit } from "@/modules/audit";
import { revokeOrganizationProfileGrants } from "@/modules/candidates/file-grants";
import { recordConsent } from "@/modules/identity/consent";
import { notify } from "@/modules/notifications";

import { loadWorkflowStages, publicEmployerName, type ApplicationScope, type StageRow } from "./access";
import { actorOrganizationId, actorType, actorUserId, auditActorType } from "./actors";
import { cancelOpenInterviewsForApplication, cancelPendingPlacementForApplication, revokeApplicationFileGrants, withdrawOpenOffersForApplication } from "./lifecycle";
import { recruitmentLinks } from "./links";
import type { RecruitmentActor } from "./types";
import { isFinalStage, isForwardMove, resolveStage, statusForCategory } from "./workflow";

/**
 * The single place an application changes stage: derived status + timestamps, append-only history,
 * closing side effects, the candidate notification (candidate label only — internal notes never
 * leave the platform) and the audit entry. Callers authorize the move first (transitionApplication
 * checks canTransition; domain events such as an accepted offer call autoAdvance).
 */
export type StageMoveOptions = {
  internalNote?: string | null;
  candidateVisibleNote?: string | null;
  rejectionReasonCode?: ApplicationRejectionReason | null;
  rejectionReason?: string | null;
  withdrawalReason?: string | null;
  /** Override the stage's notifyCandidate flag (false when another notification already covers the step). */
  notifyCandidate?: boolean;
  now?: Date;
};

export type StageMoveResult = {
  applicationId: string;
  fromStageKey: string;
  toStageKey: string;
  status: ApplicationStatus;
  historyId: string;
};

export async function applyStageMove(
  tx: DbOrTx,
  scope: ApplicationScope,
  from: StageRow,
  to: StageRow,
  actor: RecruitmentActor,
  opts: StageMoveOptions = {},
): Promise<StageMoveResult> {
  const now = opts.now ?? new Date();
  const status = statusForCategory(to.category);
  const reopening = isFinalStage(from) && !isFinalStage(to);
  const userId = actorUserId(actor);

  const set: Partial<typeof applications.$inferInsert> = { currentStageId: to.id, status, lastStageChangedAt: now };
  if (reopening) {
    Object.assign(set, { rejectedAt: null, rejectionReasonCode: null, rejectionReason: null, hiredAt: null });
  }
  if (status === "hired") set.hiredAt = now;
  if (status === "rejected") {
    set.rejectedAt = now;
    set.rejectionReasonCode = opts.rejectionReasonCode ?? "other";
    set.rejectionReason = opts.rejectionReason ?? null;
  }
  if (status === "withdrawn") {
    set.withdrawnAt = now;
    set.withdrawalReason = opts.withdrawalReason ?? null;
  }
  await tx.update(applications).set(set).where(eq(applications.id, scope.id));

  const [history] = await tx
    .insert(applicationStageHistory)
    .values({
      applicationId: scope.id,
      fromStageId: from.id,
      toStageId: to.id,
      changedByUserId: userId,
      changedByType: actorType(actor),
      changedByOrganizationId: actorOrganizationId(actor),
      note: opts.internalNote ?? null,
      candidateVisibleNote: opts.candidateVisibleNote ?? null,
      createdAt: now,
    })
    .returning({ id: applicationStageHistory.id });

  if (status === "withdrawn" || status === "rejected" || status === "closed") {
    const reason =
      status === "withdrawn" ? "The candidate withdrew the application." : status === "rejected" ? "The application was not progressed." : "The application was closed.";
    await cancelOpenInterviewsForApplication(
      { applicationId: scope.id, candidateUserId: scope.candidateUserId, reason, notifyCandidate: actor.kind !== "candidate", jobTitle: scope.job.title },
      tx,
    );
    await withdrawOpenOffersForApplication(scope.id, reason, tx);
  }
  if (status === "withdrawn") {
    await cancelPendingPlacementForApplication(scope.id, "The candidate withdrew the application.", tx);
    await revokeApplicationFileGrants(scope.id, userId, tx);
    // Profile grants are re-created by the candidate viewer if another relationship still allows them.
    if (scope.job.organizationId) await revokeOrganizationProfileGrants(scope.candidateId, [scope.job.organizationId], userId, tx);
    if (scope.consentToShareAt) {
      await recordConsent(
        {
          userId: scope.candidateUserId,
          purpose: "share_profile_with_employers",
          granted: false,
          source: "application_withdrawal",
          contextType: "application",
          contextId: scope.id,
          capturedByUserId: actor.kind === "candidate" ? null : userId,
        },
        tx,
      );
    }
  }

  const shouldNotify = (opts.notifyCandidate ?? to.notifyCandidate) && actor.kind !== "candidate";
  if (shouldNotify) {
    await notify(
      {
        event: "application.status_changed",
        recipients: [{ userId: scope.candidateUserId }],
        data: {
          applicationCode: scope.code,
          jobTitle: scope.job.title,
          employerName: publicEmployerName(scope.job, scope.organizationName),
          status: to.candidateLabel,
          statusDescription: to.candidateDescription,
          statusTranslations: to.candidateTranslations,
          message: opts.candidateVisibleNote ?? null,
        },
        link: recruitmentLinks.candidateApplication(scope.id),
        dedupeKey: `application-stage:${history!.id}`,
      },
      { tx },
    );
  }

  await audit({
    action: reopening ? "application.reopened" : "application.stage_changed",
    entityType: "application",
    entityId: scope.id,
    organizationId: scope.job.organizationId,
    actorUserId: userId,
    actorType: auditActorType(actor),
    metadata: {
      code: scope.code,
      from: from.key,
      to: to.key,
      status,
      actor: actor.kind,
      ...(status === "rejected" ? { rejectionReasonCode: set.rejectionReasonCode } : {}),
    },
    tx,
  });

  // Keep the in-memory scope in sync for callers that continue working with it.
  scope.currentStageId = to.id;
  scope.status = status;
  scope.lastStageChangedAt = now;
  return { applicationId: scope.id, fromStageKey: from.key, toStageKey: to.key, status, historyId: history!.id };
}

/**
 * Move an application forward as the side effect of a domain event (interview scheduled, offer
 * issued / accepted, joining confirmed…). Does nothing when the workflow has no matching stage or
 * the application is already at or past it, so manual pipeline decisions are never undone.
 */
export async function autoAdvance(
  tx: DbOrTx,
  scope: ApplicationScope,
  actor: RecruitmentActor,
  preferredKey: string,
  opts: { fallbackCategory?: WorkflowStageCategory; internalNote?: string | null; notifyCandidate?: boolean; allowFromFinal?: boolean } = {},
): Promise<StageMoveResult | null> {
  const stages = await loadWorkflowStages(scope.workflowId, tx);
  const from = stages.find((s) => s.id === scope.currentStageId);
  const to = resolveStage(stages, preferredKey, opts.fallbackCategory);
  if (!from || !to || from.id === to.id) return null;
  if (!isForwardMove(from, to) && !(opts.allowFromFinal && isFinalStage(from) && from.category !== "withdrawn")) return null;
  return applyStageMove(tx, scope, from, to, actor, { internalNote: opts.internalNote ?? null, notifyCandidate: opts.notifyCandidate });
}
