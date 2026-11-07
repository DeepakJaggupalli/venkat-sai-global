"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction, createFormAction, ok, type ActionResult, type ActionState } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { decideApproval, getOpenApprovalForEntity } from "@/modules/approvals/service";
import { logDataAccess } from "@/modules/audit";
import { revealCandidateContactAction, verifyEducationAction, verifyExperienceAction } from "@/modules/candidates/actions";
import { staffActor, submitCredentialForVerification, submitDocumentForVerification } from "@/modules/candidates/service";
import type { CandidateIdentityView } from "@/modules/candidates/types";
import { getCandidateView } from "@/modules/candidates/viewer";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { enrolCandidateByStaffAction } from "@/modules/training/staff-actions";

import { formText } from "../pipeline/_shared/form-data";

/**
 * Command Centre candidate actions. Sensitive reads (contact, identity, documents) need the specific
 * permission and a recorded reason, and are written to the data-access log. Verification decisions
 * go through the approval centre so the candidate's record, notifications and audit stay consistent.
 */

const uuid = z.uuid("Invalid identifier");
const reason = z.string({ error: "Give a reason" }).trim().min(3, "Give a reason (at least 3 characters)").max(300, "Keep the reason under 300 characters");

/** Reveal contact details (candidates.view_contact; rate-limited and logged by the candidates module). */
export async function revealContactAction(input: { candidateId: string; reason: string }): Promise<ActionResult<{ email: string | null; phone: string | null }>> {
  await requireStaff("candidates.view_contact");
  const parsed = z.object({ candidateId: uuid, reason }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Give a reason." };
  return revealCandidateContactAction({ candidateId: parsed.data.candidateId, as: "staff", reason: parsed.data.reason });
}

/** Reveal identity details (legal name, DOB, nationality, passport last 4). Needs candidates.view_documents; logged. */
export const revealIdentityAction = createAction(z.object({ candidateId: uuid, reason }), async ({ candidateId, reason: why }): Promise<ActionResult<CandidateIdentityView>> => {
  const staff = await requireStaff("candidates.view_documents");
  const limit = await rateLimit(`candidate-identity-reveal:${staff.user.id}`, 100, 3600);
  if (!limit.allowed) throw new ActionError("You have revealed many records in a short time. Please try again later.", { code: "rate_limited" });
  const view = await getCandidateView(candidateId, { kind: "staff", ctx: staff }, { revealIdentity: true, reason: why });
  if (!view?.identity) throw new ActionError("Identity details are not available for this profile.");
  return ok(view.identity);
});

/**
 * Open a candidate document: checks the file belongs to this candidate's record, records the reason in
 * the data-access log, then returns the authorised file URL (the file route checks access again).
 */
export const openDocumentAction = createAction(z.object({ candidateId: uuid, fileId: uuid, reason }), async ({ candidateId, fileId, reason: why }): Promise<ActionResult<{ url: string }>> => {
  const staff = await requireStaff("candidates.view_documents");
  const view = await getCandidateView(candidateId, { kind: "staff", ctx: staff });
  if (!view) throw new ActionError("Profile not found.", { code: "not_found" });
  const files = [
    ...view.documents.map((d) => d.file),
    ...view.credentials.map((c) => c.file),
    ...view.education.map((e) => e.document),
    ...view.experience.map((e) => e.evidence),
    view.resume,
  ].filter((f): f is NonNullable<typeof f> => !!f);
  const file = files.find((f) => f.id === fileId);
  if (!file) throw new ActionError("This file is not part of the candidate's record.", { code: "not_found" });
  await logDataAccess({ actorUserId: staff.user.id, subjectType: "candidate", subjectId: candidateId, dataCategory: "document", accessType: "view", reason: why, metadata: { fileId } });
  return ok({ url: file.url });
});

const decisionSchema = z.object({
  candidateId: uuid,
  itemId: uuid,
  kind: z.enum(["document", "credential"]),
  decision: z.enum(["approved", "rejected", "changes_requested"], { error: "Choose a decision" }),
  reason: z.string().trim().max(2000).optional(),
});

/**
 * Verify / reject a document or credential. Uses the open approval request, or submits one on the
 * candidate's behalf first (candidates.manage) so the decision flows through the approval centre.
 */
export const decideItemFormAction = createFormAction(decisionSchema, async ({ candidateId, itemId, kind, decision, reason: why }) => {
  const staff = await requireStaff("candidates.verify");
  const type = kind === "document" ? "candidate_document" : "candidate_credential";
  let open = await getOpenApprovalForEntity(type, itemId);
  if (!open) {
    if (!staffCan(staff, "candidates.manage")) throw new ActionError("This item has not been submitted for verification. Ask a colleague with candidate management access, or the candidate, to submit it.");
    const actor = staffActor(staff, candidateId);
    if (kind === "document") await submitDocumentForVerification(actor, itemId);
    else await submitCredentialForVerification(actor, itemId);
    open = await getOpenApprovalForEntity(type, itemId);
  }
  if (!open) throw new ActionError("No verification request could be found for this item.");
  await decideApproval({ requestId: open.id, decision, reason: why ?? null, ctx: staff });
  revalidatePath(`/admin/candidates/${candidateId}`);
  return ok(undefined, decision === "approved" ? "Marked as verified." : decision === "rejected" ? "Marked as rejected. The candidate sees the reason." : "Changes requested from the candidate.");
});

/** Education / experience verification with a reason (rejections need one; the candidate sees it). */
export async function verifyEntryFormAction(_prev: ActionState<undefined>, fd: FormData): Promise<ActionResult<undefined>> {
  await requireStaff("candidates.verify");
  const input = {
    id: formText(fd, "id") ?? "",
    status: (formText(fd, "status") ?? "verified") as "verified" | "rejected" | "unverified",
    note: formText(fd, "note") ?? formText(fd, "reason"),
  };
  return formText(fd, "entry") === "education" ? verifyEducationAction(input) : verifyExperienceAction(input);
}

export async function enrolInBatchFormAction(_prev: ActionState<undefined>, fd: FormData): Promise<ActionResult<undefined>> {
  await requireStaff("training.manage");
  const batchId = formText(fd, "batchId");
  if (!batchId) return { ok: false, error: "Choose a batch.", fieldErrors: { batchId: ["Choose a batch"] } };
  const result = await enrolCandidateByStaffAction({ batchId, candidateId: formText(fd, "candidateId") ?? "" });
  if (result.ok) revalidatePath(`/admin/candidates/${formText(fd, "candidateId")}`);
  return result as ActionResult<undefined>;
}
