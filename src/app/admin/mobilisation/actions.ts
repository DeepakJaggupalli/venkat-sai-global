"use server";

import type { ActionResult, ActionState } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";
import { addChecklistItemAction, reviewChecklistItemAction, startMobilisationAction, submitChecklistItemAction, updateMobilisationAction } from "@/modules/recruitment/actions";

import { localToIsoInstant, staffTimeZone } from "../pipeline/_shared/server";
import { formBool, formPatch, formText } from "../pipeline/_shared/form-data";

/**
 * Form adapters for mobilisation (Command Centre). The recruitment module's actions take typed objects;
 * these turn a form post into that shape (blank = clear for fields present in the form) and delegate.
 * Both layers authorise: here (recruitment.mobilisation) and again inside the module action.
 */

const TEXT_KEYS = [
  "status",
  "statusReason",
  "visaType",
  "visaStatus",
  "visaNumber",
  "visaIssuedOn",
  "visaExpiresOn",
  "medicalStatus",
  "medicalCompletedOn",
  "medicalValidUntil",
  "emigrationClearanceStatus",
  "emigrationClearanceReference",
  "emigrationClearedOn",
  "pdosCompletedOn",
  "travelDate",
  "flightDetails",
  "accommodationDetails",
  "candidateInstructions",
  "coordinatorUserId",
  "notes",
] as const;

/** Enum fields where "blank" means "keep" (they cannot be cleared). */
const KEEP_WHEN_BLANK = new Set(["status", "visaStatus", "medicalStatus", "emigrationClearanceStatus", "visaNumber"]);

export async function updateMobilisationFormAction(_prev: ActionState<undefined>, fd: FormData): Promise<ActionResult<undefined>> {
  const staff = await requireStaff("recruitment.mobilisation");
  const patch: Record<string, unknown> = { mobilisationId: formText(fd, "mobilisationId") };
  for (const key of TEXT_KEYS) {
    const value = formPatch(fd, key);
    if (value === undefined) continue;
    if (value === null && KEEP_WHEN_BLANK.has(key)) continue;
    patch[key] = value;
  }
  // Unticked checkboxes post nothing, so the PDOT section marks its presence explicitly.
  if (fd.has("pdosSection")) patch.pdosCompleted = formBool(fd, "pdosCompleted");
  const tz = formText(fd, "timezone") || formText(fd, "browserTimeZone");
  for (const key of ["departedAt", "arrivedAt"] as const) {
    const raw = formPatch(fd, key);
    if (raw === undefined) continue;
    patch[key] = raw === null ? null : (localToIsoInstant(raw, tz ?? undefined, staffTimeZone(staff)) ?? raw);
  }
  return updateMobilisationAction(patch as Parameters<typeof updateMobilisationAction>[0]);
}

export async function addChecklistItemFormAction(_prev: ActionState<unknown>, fd: FormData): Promise<ActionResult<unknown>> {
  await requireStaff("recruitment.mobilisation");
  return addChecklistItemAction({
    mobilisationId: formText(fd, "mobilisationId") ?? "",
    item: formText(fd, "item") ?? "",
    description: formText(fd, "description"),
    category: (formText(fd, "category") ?? "document") as Parameters<typeof addChecklistItemAction>[0]["category"],
    responsibleParty: (formText(fd, "responsibleParty") ?? "venkat_sai") as Parameters<typeof addChecklistItemAction>[0]["responsibleParty"],
    isRequired: formBool(fd, "isRequired"),
    isCandidateVisible: formBool(fd, "isCandidateVisible"),
    dueDate: formText(fd, "dueDate"),
  });
}

export async function reviewChecklistItemFormAction(_prev: ActionState<undefined>, fd: FormData): Promise<ActionResult<undefined>> {
  await requireStaff("recruitment.mobilisation");
  return reviewChecklistItemAction({
    itemId: formText(fd, "itemId") ?? "",
    decision: (formText(fd, "decision") ?? "") as "verified" | "rejected" | "not_applicable" | "pending",
    rejectionReason: formText(fd, "rejectionReason") ?? formText(fd, "reason"),
    notes: formText(fd, "notes"),
  });
}

export async function submitChecklistItemFormAction(_prev: ActionState<undefined>, fd: FormData): Promise<ActionResult<undefined>> {
  await requireStaff("recruitment.mobilisation");
  return submitChecklistItemAction({ portal: "admin", itemId: formText(fd, "itemId") ?? "", fileId: formText(fd, "fileId") ?? null, note: formText(fd, "note") });
}

export async function startMobilisationFormAction(_prev: ActionState<unknown>, fd: FormData): Promise<ActionResult<unknown>> {
  await requireStaff("recruitment.mobilisation");
  const result = await startMobilisationAction({ placementId: formText(fd, "placementId") ?? "", destinationCountryCode: formText(fd, "destinationCountryCode") ?? "" });
  if (result.ok && result.data && typeof result.data === "object" && "mobilisationId" in result.data) {
    return { ...result, data: { id: (result.data as { mobilisationId: string }).mobilisationId } };
  }
  return result;
}

/** Board move: changes the status only; the module validates the value and enforces the gates. */
export async function moveMobilisationAction(input: { mobilisationId: string; status: string }): Promise<ActionResult<undefined>> {
  await requireStaff("recruitment.mobilisation");
  return updateMobilisationAction({ mobilisationId: input.mobilisationId, status: input.status } as Parameters<typeof updateMobilisationAction>[0]);
}
