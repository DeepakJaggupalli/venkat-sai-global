"use server";

import { revalidatePath } from "next/cache";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";
import { deleteCvSubmissionDocument, issueCvDocumentUploadLink, moveCvSubmissionDocument } from "@/modules/operations/cv-submission-documents";
import { cvDocumentDeleteSchema, cvDocumentMoveSchema, cvSubmissionRemarksSchema, cvSubmissionStatusSchema, cvUploadLinkSchema } from "@/modules/operations/cv-submission-schemas";
import { CV_SUBMISSIONS_ADMIN_PATH, setCvSubmissionRemarks, setCvSubmissionStatus } from "@/modules/operations/cv-submissions";

/** Change the status of a CV submission. candidates.manage, re-checked by the service. */
export const setCvSubmissionStatusAction = createFormAction(cvSubmissionStatusSchema, async (input) => {
  const ctx = await requireStaff("candidates.manage");
  await setCvSubmissionStatus(ctx, input);
  revalidatePath(CV_SUBMISSIONS_ADMIN_PATH);
  revalidatePath(`${CV_SUBMISSIONS_ADMIN_PATH}/${input.id}`);
  return ok(undefined, "Status updated.");
});

/** Staff-only remarks on a CV submission (audited). */
export const setCvSubmissionRemarksAction = createFormAction(cvSubmissionRemarksSchema, async (input) => {
  const ctx = await requireStaff("candidates.manage");
  await setCvSubmissionRemarks(ctx, input);
  revalidatePath(CV_SUBMISSIONS_ADMIN_PATH);
  revalidatePath(`${CV_SUBMISSIONS_ADMIN_PATH}/${input.id}`);
  return ok(undefined, "Remarks saved.");
});

/** Move a document up or down within its kind (candidates.manage). */
export const moveCvDocumentAction = createAction(cvDocumentMoveSchema, async (input) => {
  const ctx = await requireStaff("candidates.manage");
  const { submissionId } = await moveCvSubmissionDocument(ctx, input);
  revalidatePath(`${CV_SUBMISSIONS_ADMIN_PATH}/${submissionId}`);
  return ok(undefined, "Order updated.");
});

/** Remove a document from a CV submission (candidates.manage, audited). */
export const deleteCvDocumentAction = createAction(cvDocumentDeleteSchema, async (input) => {
  const ctx = await requireStaff("candidates.manage");
  const { submissionId } = await deleteCvSubmissionDocument(ctx, input);
  revalidatePath(`${CV_SUBMISSIONS_ADMIN_PATH}/${submissionId}`);
  return ok(undefined, "Document removed.");
});

/** A fresh 7-day upload link to send to the candidate (candidates.manage, audited without the token). */
export const issueCvUploadLinkAction = createAction(cvUploadLinkSchema, async (input) => {
  const ctx = await requireStaff("candidates.manage");
  const link = await issueCvDocumentUploadLink(ctx, input.id);
  return ok({ url: link.url, expiresAt: link.expiresAt.toISOString() }, "Upload link created.");
});
