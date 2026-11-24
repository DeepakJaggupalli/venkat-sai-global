"use server";

import { revalidatePath } from "next/cache";

import { createAction, ok } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";
import { workerReviewAskSchema, workerReviewModerateSchema, type WorkerReviewDecision } from "@/modules/worker-reviews/schemas";
import { moderateWorkerReview, recordReviewRequest, WORKER_REVIEWS_ADMIN_PATH } from "@/modules/worker-reviews/service";

const DONE: Record<WorkerReviewDecision, string> = {
  approve: "Approved. The review is on the website.",
  reject: "Rejected. The review is not shown.",
  hide: "Hidden from the website.",
  unhide: "The review is on the website again.",
};

/** Approve, reject, hide or show again (candidates.manage, re-checked and audited by the service). */
export const moderateWorkerReviewAction = createAction(workerReviewModerateSchema, async (input) => {
  const ctx = await requireStaff("candidates.manage");
  const { status } = await moderateWorkerReview(ctx, input);
  revalidatePath(WORKER_REVIEWS_ADMIN_PATH);
  revalidatePath("/success-stories");
  revalidatePath("/");
  return ok({ status }, DONE[input.decision]);
});

/** Record that the review link was sent (WhatsApp button or "Copy link"), so the list shows who asked and when. */
export const recordReviewRequestAction = createAction(workerReviewAskSchema, async (input) => {
  const ctx = await requireStaff("candidates.manage");
  await recordReviewRequest(ctx, input);
  revalidatePath(WORKER_REVIEWS_ADMIN_PATH);
  return ok(undefined, input.channel === "whatsapp" ? "Marked as asked on WhatsApp." : "Link copied. Paste it in WhatsApp or SMS.");
});
