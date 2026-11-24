"use server";

import { z } from "zod";

import { createAction, ok } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";
import { cvSubmissionFiltersSchema } from "@/modules/operations/cv-submission-schemas";
import { getCvRequirementTitle, listCvSubmissionPhones } from "@/modules/operations/cv-submissions";

/**
 * "Copy all phone numbers" on a poster's applicants page: every applicant matching the page's search and status
 * filter, not just the visible page. candidates.view + candidates.view_contact; the service logs the copy.
 */
export const copyApplicantPhonesAction = createAction(
  z.object({ posterId: z.uuid(), q: z.string().trim().max(100).optional(), status: z.string().max(40).optional() }),
  async (input) => {
    const ctx = await requireStaff(["content.view", "candidates.view", "candidates.view_contact"]);
    const filters = cvSubmissionFiltersSchema.parse({ requirement: input.posterId, q: input.q || undefined, status: input.status || undefined });
    const title = await getCvRequirementTitle(ctx, input.posterId);
    const { phones, people } = await listCvSubmissionPhones(ctx, filters, { reason: `Copied applicant phone numbers for ${title ?? "a requirement poster"}` });
    return ok({ phones, people });
  },
);
