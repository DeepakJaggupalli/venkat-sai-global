"use server";

import { revalidatePath } from "next/cache";

import { createFormAction, ok } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";
import { cvSubmissionRemarksSchema, cvSubmissionStatusSchema } from "@/modules/operations/cv-submission-schemas";
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
