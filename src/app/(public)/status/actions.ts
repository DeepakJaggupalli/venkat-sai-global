"use server";

import { createFormAction, ok } from "@/lib/actions";
import { getRequestMeta } from "@/lib/request";
import { cvStatusLookupSchema, type CvStatusView } from "@/modules/operations/cv-submission-schemas";
import { lookupCvStatus } from "@/modules/operations/cv-submissions";

/** Public CV status check (mobile number + reference). Rate limited and constant-time in the service. */
export const checkCvStatusAction = createFormAction<typeof cvStatusLookupSchema, CvStatusView>(cvStatusLookupSchema, async (input) => {
  const meta = await getRequestMeta();
  return ok(await lookupCvStatus(input, { ipHash: meta.ipHash }));
});
