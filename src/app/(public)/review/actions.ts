"use server";

import { createFormAction, ok } from "@/lib/actions";
import { getRequestMeta } from "@/lib/request";
import { workerReviewSubmitSchema, type WorkerReviewSubmitResult } from "@/modules/worker-reviews/schemas";
import { submitWorkerReview } from "@/modules/worker-reviews/service";

/**
 * The public review form (/review/<token>; the token travels in a hidden field). No account: the signed link is the
 * permission. Honeypot, rate limits, link checks and "one review per CV" are enforced by the worker-reviews service.
 */
export const submitWorkerReviewAction = createFormAction<typeof workerReviewSubmitSchema, WorkerReviewSubmitResult>(workerReviewSubmitSchema, async (input) => {
  const meta = await getRequestMeta();
  return ok(await submitWorkerReview(input, { ipHash: meta.ipHash }), "Thank you. We have received your review.");
});
