"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction, createFormAction, ok } from "@/lib/actions";
import { toMinorUnits } from "@/lib/format";
import { f } from "@/lib/validation";
import { audit } from "@/modules/audit";
import { requireStaff } from "@/modules/identity/authz";
import { resumeDetailsActionSchema, resumeNotesActionSchema, resumePriceSchema, resumeStatusActionSchema } from "@/modules/resume-service/schemas";
import {
  generateResumeDocuments,
  getResumeServicePrice,
  issueResumeDownloadLink,
  markResumeRequestPaid,
  RESUME_ADMIN_PATH,
  setResumeRequestNotes,
  setResumeRequestStatus,
  updateResumeRequestDetails,
} from "@/modules/resume-service/service";
import { setSetting } from "@/modules/settings";

function refresh(id?: string) {
  revalidatePath(RESUME_ADMIN_PATH);
  if (id) revalidatePath(`${RESUME_ADMIN_PATH}/${id}`);
}

/** Paid (offline, with an optional reference), waived, cancelled, reopened or delivered (candidates.manage). */
export const setResumeStatusAction = createFormAction(resumeStatusActionSchema, async (input) => {
  const ctx = await requireStaff("candidates.manage");
  if (input.status === "paid" || input.status === "waived") {
    await markResumeRequestPaid(ctx, { id: input.id, method: input.status === "waived" ? "waived" : "offline", reference: input.paymentReference });
    refresh(input.id);
    return ok(undefined, input.status === "waived" ? "Fee waived. The resume has been generated." : "Payment recorded. The resume has been generated.");
  }
  await setResumeRequestStatus(ctx, { id: input.id, status: input.status });
  refresh(input.id);
  return ok(undefined, "Status updated.");
});

export const regenerateResumeAction = createAction(z.object({ id: f.uuid() }), async ({ id }) => {
  const ctx = await requireStaff("candidates.manage");
  await generateResumeDocuments(ctx, id);
  refresh(id);
  return ok(undefined, "The resume has been generated again.");
});

export const setResumeNotesAction = createFormAction(resumeNotesActionSchema, async (input) => {
  const ctx = await requireStaff("candidates.manage");
  await setResumeRequestNotes(ctx, input);
  refresh(input.id);
  return ok(undefined, "Notes saved.");
});

export const updateResumeDetailsAction = createAction(resumeDetailsActionSchema, async (input) => {
  const ctx = await requireStaff("candidates.manage");
  await updateResumeRequestDetails(ctx, input);
  refresh(input.id);
  return ok(undefined, "Details saved. Generate the resume again to update the documents.");
});

export const issueResumeLinkAction = createAction(z.object({ id: f.uuid() }), async ({ id }) => {
  const ctx = await requireStaff("candidates.manage");
  const link = await issueResumeDownloadLink(ctx, id);
  return ok({ url: link.url, expiresAt: link.expiresAt.toISOString() }, "Download link created.");
});

/** The service price (settings.manage). Amount in major units here, stored in minor units with its currency. */
export const saveResumePriceAction = createFormAction(resumePriceSchema, async (input) => {
  const ctx = await requireStaff("settings.manage");
  const amountMinor = toMinorUnits(input.amount, input.currency);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new ActionError("Enter a valid amount.", { fieldErrors: { amount: ["Enter a valid amount"] } });
  const before = await getResumeServicePrice();
  const next = { amountMinor, currency: input.currency };
  await setSetting("resume_service.price", next, ctx.user.id);
  await audit({ action: "settings.updated", entityType: "platform_setting", entityId: "resume_service.price", actorUserId: ctx.user.id, metadata: { group: "Resume service", label: "Resume service price", from: before, to: next } });
  refresh();
  return ok(undefined, amountMinor === 0 ? "Saved. The page shows “Price on request”." : "Price saved.");
});
