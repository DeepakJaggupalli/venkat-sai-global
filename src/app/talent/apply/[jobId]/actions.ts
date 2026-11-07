"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createFormAction, ok } from "@/lib/actions";
import { toMinorUnits } from "@/lib/format";
import { requireCandidate } from "@/modules/candidates/guard";
import { candidateApplyFormSchema } from "@/modules/recruitment/schemas";
import { asCandidate, createApplication } from "@/modules/recruitment/service";

const checked = (message: string) => z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1", z.literal(true, { error: message }));

/**
 * The apply form adds two explicit confirmations to the recruitment module's schema: consent to share
 * the selected documents with this employer and Venkat Sai, and the accuracy declaration.
 */
const applyFormSchema = candidateApplyFormSchema.and(
  z.object({
    consentDocuments: checked("Please agree to share your resume and selected documents for this application."),
    declaration: checked("Please confirm that the information you are sharing is true."),
  }),
);

/**
 * Submit an application through the recruitment module. It enforces every rule: job open and on-platform,
 * one application per job (re-apply after withdrawing), required screening answers, minors refused for
 * overseas jobs (`minor_overseas`), knockout answers only flagged for review — never rejected here.
 * The candidate is never charged.
 */
export const submitApplicationAction = createFormAction(applyFormSchema, async (input) => {
  const session = await requireCandidate();
  const expectedSalary =
    input.expectedSalaryAmount !== undefined && input.expectedSalaryCurrency && input.expectedSalaryPeriod
      ? { amountMinor: toMinorUnits(input.expectedSalaryAmount, input.expectedSalaryCurrency), currency: input.expectedSalaryCurrency, period: input.expectedSalaryPeriod }
      : null;
  const created = await createApplication(asCandidate(session), {
    jobId: input.jobId,
    coverLetter: input.coverLetter,
    resumeFileId: input.resumeFileId,
    answers: input.answers,
    expectedSalary,
    consentToShare: true,
  });
  revalidatePath("/talent/applications", "layout");
  revalidatePath("/talent");
  // Only what the candidate may see: never the knockout flags.
  return ok({ id: created.id, code: created.code, reopened: created.reopened });
});
