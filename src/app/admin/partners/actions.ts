"use server";

import { toMinorUnits } from "@/lib/format";
import type { ActionResult, ActionState } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";
import {
  acceptPartnerSubmissionAction,
  createPartnerAssignmentAction,
  rejectPartnerSubmissionAction,
  reopenDuplicateSubmissionAction,
  resolveDuplicateFlagAction,
  updateAttributionAction,
  updatePartnerAssignmentAction,
} from "@/modules/recruitment/actions";

import { formNumber, formPatch, formText } from "../pipeline/_shared/form-data";

/**
 * Partner workflow form adapters for the Command Centre. The recruitment module's actions
 * re-authorise (partners.assign / recruitment.manage / candidates.manage / partners.manage) and
 * enforce the rules (verified partner, licence warnings, duplicates, attribution window).
 */

type CreateInput = Parameters<typeof createPartnerAssignmentAction>[0];

function commissionFrom(fd: FormData): CreateInput["commissionTerms"] {
  const model = formText(fd, "commissionModel") as NonNullable<NonNullable<CreateInput["commissionTerms"]>["model"]> | undefined;
  if (!model) return undefined;
  const currency = formText(fd, "commissionCurrency")?.toUpperCase();
  const amount = formNumber(fd, "commissionAmount");
  const percent = formNumber(fd, "commissionPercent");
  return {
    model,
    currency,
    amountMinor: amount !== undefined && currency ? toMinorUnits(amount, currency) : undefined,
    percentBasisPoints: percent !== undefined ? Math.round(percent * 100) : undefined,
    payableAfterDays: formNumber(fd, "payableAfterDays"),
    notes: formText(fd, "commissionNotes"),
  };
}

export async function createAssignmentFormAction(_prev: ActionState<unknown>, fd: FormData): Promise<ActionResult<unknown>> {
  await requireStaff("partners.assign");
  if (formNumber(fd, "commissionAmount") !== undefined && !formText(fd, "commissionCurrency")) {
    return { ok: false, error: "A fixed amount needs a currency.", fieldErrors: { commissionCurrency: ["Choose the currency"] } };
  }
  const result = await createPartnerAssignmentAction({
    partnerOrganizationId: formText(fd, "partnerOrganizationId") ?? "",
    requirementId: formText(fd, "requirementId") ?? null,
    jobId: formText(fd, "jobId") ?? null,
    positionsTarget: formNumber(fd, "positionsTarget") ?? null,
    submissionLimit: formNumber(fd, "submissionLimit") ?? null,
    commissionTerms: commissionFrom(fd),
    dueDate: formText(fd, "dueDate") ?? null,
    instructions: formText(fd, "instructions"),
    internalNotes: formText(fd, "internalNotes"),
  });
  if (result.ok && result.data) {
    const warnings: readonly string[] = result.data.warnings ?? [];
    const licenceWarning = warnings.includes("partner_without_verified_recruiting_agent_licence")
      ? " This partner has no verified recruiting-agent licence for an overseas target; the assignment was recorded for compliance review."
      : "";
    return { ok: true, data: { id: result.data.id }, message: `Assignment created.${licenceWarning}` };
  }
  return result;
}

export async function updateAssignmentFormAction(_prev: ActionState<undefined>, fd: FormData): Promise<ActionResult<undefined>> {
  await requireStaff("partners.assign");
  const input: Record<string, unknown> = { assignmentId: formText(fd, "assignmentId") };
  const status = formText(fd, "status");
  if (status) input.status = status;
  for (const key of ["reason", "dueDate", "instructions", "internalNotes"] as const) {
    const v = formPatch(fd, key);
    if (v !== undefined) input[key] = v;
  }
  for (const key of ["positionsTarget", "submissionLimit"] as const) {
    if (!fd.has(key)) continue;
    input[key] = formNumber(fd, key) ?? null;
  }
  return updatePartnerAssignmentAction(input as Parameters<typeof updatePartnerAssignmentAction>[0]);
}

/** Button form for status changes (pause / resume / complete / revoke with a reason). */
export async function setAssignmentStatusFormAction(_prev: ActionState<undefined>, fd: FormData): Promise<ActionResult<undefined>> {
  await requireStaff("partners.assign");
  return updatePartnerAssignmentAction({
    assignmentId: formText(fd, "assignmentId") ?? "",
    status: formText(fd, "status") as "active" | "paused" | "completed" | "revoked",
    reason: formText(fd, "reason"),
  });
}

export async function acceptSubmissionFormAction(_prev: ActionState<unknown>, fd: FormData): Promise<ActionResult<unknown>> {
  await requireStaff("recruitment.manage");
  const result = await acceptPartnerSubmissionAction({
    submissionId: formText(fd, "submissionId") ?? "",
    jobId: formText(fd, "jobId") ?? null,
    reviewNotes: formText(fd, "reviewNotes"),
    partnerFeedback: formText(fd, "partnerFeedback"),
  });
  if (result.ok && result.data && typeof result.data === "object" && "applicationId" in result.data) {
    return { ...result, data: { id: (result.data as { applicationId: string }).applicationId } };
  }
  return result;
}

export async function rejectSubmissionFormAction(_prev: ActionState<undefined>, fd: FormData): Promise<ActionResult<undefined>> {
  await requireStaff("recruitment.manage");
  return rejectPartnerSubmissionAction({
    submissionId: formText(fd, "submissionId") ?? "",
    rejectionReasonCode: (formText(fd, "rejectionReasonCode") ?? "") as Parameters<typeof rejectPartnerSubmissionAction>[0]["rejectionReasonCode"],
    partnerFeedback: formText(fd, "partnerFeedback") ?? formText(fd, "reason"),
    reviewNotes: formText(fd, "reviewNotes"),
  });
}

export async function reopenSubmissionFormAction(_prev: ActionState<undefined>, fd: FormData): Promise<ActionResult<undefined>> {
  await requireStaff(["recruitment.manage", "partners.manage"]);
  return reopenDuplicateSubmissionAction({ submissionId: formText(fd, "submissionId") ?? "", reviewNotes: formText(fd, "reviewNotes") ?? formText(fd, "reason") });
}

export async function resolveDuplicateFlagFormAction(_prev: ActionState<undefined>, fd: FormData): Promise<ActionResult<undefined>> {
  await requireStaff("candidates.manage");
  return resolveDuplicateFlagAction({
    flagId: formText(fd, "flagId") ?? "",
    status: (formText(fd, "status") ?? "") as "confirmed_duplicate" | "not_duplicate" | "merged",
    resolutionNotes: formText(fd, "resolutionNotes") ?? formText(fd, "reason"),
  });
}

export async function updateAttributionFormAction(_prev: ActionState<undefined>, fd: FormData): Promise<ActionResult<undefined>> {
  await requireStaff("partners.manage");
  return updateAttributionAction({
    attributionId: formText(fd, "attributionId") ?? "",
    status: (formText(fd, "status") ?? "") as "active" | "expired" | "disputed" | "revoked",
    resolutionNotes: formText(fd, "resolutionNotes") ?? formText(fd, "reason") ?? "",
  });
}
