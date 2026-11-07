"use server";

import type { ActionResult, ActionState } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";
import {
  addApplicationNoteAction,
  assignApplicationOwnerAction,
  assignCandidateToJobAction,
  bulkTransitionApplicationsAction,
  confirmJoinedAction,
  deleteApplicationNoteAction,
  shareApplicationsWithEmployerAction,
  transitionApplicationAction,
} from "@/modules/recruitment/actions";
import type { BulkResult } from "@/modules/recruitment/types";
import { getPipelineColumn } from "@/modules/recruitment/workflow";

import { formBool, formText } from "./_shared/form-data";

/**
 * Command Centre pipeline actions. Thin adapters over the recruitment module's actions (which
 * re-authorise and enforce the transition matrix): form posts → typed input, board columns → stages.
 */

type TransitionOpts = { rejectionReasonCode?: string | null; rejectionReason?: string; internalNote?: string; candidateVisibleNote?: string };

export async function bulkMoveAction(input: { applicationIds: string[]; toStageKey: string } & TransitionOpts): Promise<ActionResult<BulkResult[]>> {
  await requireStaff("recruitment.manage");
  return bulkTransitionApplicationsAction({
    portal: "admin",
    applicationIds: input.applicationIds,
    toStageKey: input.toStageKey,
    rejectionReasonCode: (input.rejectionReasonCode || null) as Parameters<typeof bulkTransitionApplicationsAction>[0]["rejectionReasonCode"],
    rejectionReason: input.rejectionReason,
    internalNote: input.internalNote,
    candidateVisibleNote: input.candidateVisibleNote,
  });
}

export async function bulkShareAction(input: { applicationIds: string[] }): Promise<ActionResult<BulkResult[]>> {
  await requireStaff("recruitment.manage");
  return shareApplicationsWithEmployerAction({ applicationIds: input.applicationIds });
}

/** Board drop: the column's default stage (rejections need a reason, so "closed" is handled in the table). */
export async function boardMoveAction(input: { applicationId: string; columnKey: string }): Promise<ActionResult<unknown>> {
  await requireStaff("recruitment.manage");
  const column = getPipelineColumn(input.columnKey);
  if (!column) return { ok: false, error: "Unknown column." };
  if (column.key === "closed") return { ok: false, error: "Close or reject from the application page so a reason is recorded." };
  return transitionApplicationAction({ portal: "admin", applicationId: input.applicationId, toStageKey: column.defaultStageKey });
}

export async function transitionFormAction(_prev: ActionState<unknown>, fd: FormData): Promise<ActionResult<unknown>> {
  await requireStaff("recruitment.manage");
  const toStageKey = formText(fd, "toStageKey");
  if (!toStageKey) return { ok: false, error: "Choose the stage.", fieldErrors: { toStageKey: ["Choose the stage"] } };
  return transitionApplicationAction({
    portal: "admin",
    applicationId: formText(fd, "applicationId") ?? "",
    toStageKey,
    rejectionReasonCode: (formText(fd, "rejectionReasonCode") ?? null) as Parameters<typeof transitionApplicationAction>[0]["rejectionReasonCode"],
    rejectionReason: formText(fd, "rejectionReason"),
    internalNote: formText(fd, "internalNote"),
    candidateVisibleNote: formText(fd, "candidateVisibleNote"),
  });
}

export async function addNoteFormAction(_prev: ActionState<unknown>, fd: FormData): Promise<ActionResult<unknown>> {
  await requireStaff("recruitment.manage");
  const body = formText(fd, "body");
  if (!body) return { ok: false, error: "Write the note.", fieldErrors: { body: ["Write the note"] } };
  return addApplicationNoteAction({
    portal: "admin",
    applicationId: formText(fd, "applicationId") ?? "",
    body,
    visibility: (formText(fd, "visibility") ?? "staff_only") as Parameters<typeof addApplicationNoteAction>[0]["visibility"],
  });
}

export async function deleteNoteAction(input: { noteId: string }): Promise<ActionResult<unknown>> {
  await requireStaff("recruitment.manage");
  return deleteApplicationNoteAction({ portal: "admin", noteId: input.noteId });
}

/** AssignSelect contract ({ id, assigneeUserId }) → application owner. */
export async function assignOwnerAction(input: { id: string; assigneeUserId: string | null }): Promise<ActionResult<unknown>> {
  await requireStaff("recruitment.manage");
  return assignApplicationOwnerAction({ applicationId: input.id, assignedToUserId: input.assigneeUserId });
}

export async function confirmJoinedFormAction(_prev: ActionState<unknown>, fd: FormData): Promise<ActionResult<unknown>> {
  await requireStaff(["recruitment.manage", "recruitment.mobilisation"], "any");
  return confirmJoinedAction({ portal: "admin", placementId: formText(fd, "placementId") ?? "", joinedOn: formText(fd, "joinedOn") ?? "" });
}

/**
 * Staff assign a candidate to a job ("staff_assigned" application). Staff must confirm the candidate
 * agreed to be put forward; the method is recorded with the consent.
 */
export async function assignToJobFormAction(_prev: ActionState<unknown>, fd: FormData): Promise<ActionResult<unknown>> {
  await requireStaff("recruitment.manage");
  if (!formBool(fd, "consentConfirmed")) {
    return { ok: false, error: "Confirm that the candidate agreed to be put forward for this job.", fieldErrors: { consentConfirmed: ["Confirm the candidate's agreement"] } };
  }
  const jobId = formText(fd, "jobId");
  if (!jobId) return { ok: false, error: "Choose the job.", fieldErrors: { jobId: ["Choose the job"] } };
  return assignCandidateToJobAction({
    jobId,
    candidateId: formText(fd, "candidateId") ?? "",
    source: "staff_assigned",
    consentConfirmed: true,
    consentMethod: (formText(fd, "consentMethod") ?? "verbal") as Parameters<typeof assignCandidateToJobAction>[0]["consentMethod"],
    consentNote: formText(fd, "consentNote"),
    internalNote: formText(fd, "internalNote"),
    assignedToUserId: formText(fd, "assignedToUserId") ?? null,
  });
}
