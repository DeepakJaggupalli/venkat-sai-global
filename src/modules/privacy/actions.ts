"use server";

import { revalidatePath } from "next/cache";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { getRequestMeta } from "@/lib/request";
import { requireStaff } from "@/modules/identity/authz";
import { requireUser } from "@/modules/identity/session";

import {
  dataRequestIdSchema,
  guestDataRequestSchema,
  guestVerifySchema,
  myDataRequestSchema,
  staffAssignSchema,
  staffCompleteSchema,
  staffEraseSchema,
  staffRejectSchema,
  staffVerifyIdentitySchema,
} from "./schemas";
import {
  assignDataRequest,
  cancelMyDataRequest,
  completeDataRequest,
  createDataRequest,
  createGuestDataRequest,
  queueAccountErasure,
  queueDataExport,
  rejectDataRequest,
  requestIdentityVerification,
  startDataRequest,
  verifyDataRequestIdentity,
  verifyGuestDataRequest,
} from "./service";

function revalidateRequesterPages() {
  revalidatePath("/account/privacy");
  revalidatePath("/talent/privacy");
}

function revalidateStaff(id?: string) {
  revalidatePath("/admin/privacy");
  if (id) revalidatePath(`/admin/privacy/${id}`);
}

// ---------------------------------------------------------------------------
// Requesters
// ---------------------------------------------------------------------------

export const createMyDataRequestAction = createFormAction(myDataRequestSchema, async (input) => {
  const user = await requireUser();
  const result = await createDataRequest(user, input, { source: "account_privacy" });
  revalidateRequesterPages();
  return ok({ code: result.code }, `Request ${result.code} received`);
});

export const cancelMyDataRequestAction = createAction(dataRequestIdSchema, async ({ id }) => {
  const user = await requireUser();
  await cancelMyDataRequest(user, id);
  revalidateRequesterPages();
  return ok(undefined, "Request cancelled");
});

export const createGuestDataRequestAction = createFormAction(guestDataRequestSchema, async (input) => {
  const meta = await getRequestMeta().catch(() => ({ ipHash: null }));
  const result = await createGuestDataRequest(input, { ipHash: meta.ipHash });
  return ok(result, "Check your email for a 6-digit code to confirm the request.");
});

export const verifyGuestDataRequestAction = createFormAction(guestVerifySchema, async (input) => {
  const result = await verifyGuestDataRequest(input);
  return ok(result, `Request ${result.code} confirmed`);
});

// ---------------------------------------------------------------------------
// Command Centre (privacy.requests)
// ---------------------------------------------------------------------------

export const assignDataRequestAction = createAction(staffAssignSchema, async ({ id, assigneeUserId }) => {
  const ctx = await requireStaff("privacy.requests");
  await assignDataRequest(ctx, id, assigneeUserId ?? null);
  revalidateStaff(id);
  return ok(undefined, assigneeUserId ? "Request assigned" : "Request unassigned");
});

export const requestIdentityVerificationAction = createAction(dataRequestIdSchema, async ({ id }) => {
  const ctx = await requireStaff("privacy.requests");
  await requestIdentityVerification(ctx, id);
  revalidateStaff(id);
  return ok(undefined, "Marked as waiting for identity verification");
});

export const verifyDataRequestIdentityAction = createFormAction(staffVerifyIdentitySchema, async ({ id, note }) => {
  const ctx = await requireStaff("privacy.requests");
  await verifyDataRequestIdentity(ctx, id, note);
  revalidateStaff(id);
  return ok(undefined, "Identity confirmed; the request is in progress");
});

export const startDataRequestAction = createAction(dataRequestIdSchema, async ({ id }) => {
  const ctx = await requireStaff("privacy.requests");
  await startDataRequest(ctx, id);
  revalidateStaff(id);
  return ok(undefined, "Request in progress");
});

export const queueDataExportAction = createAction(dataRequestIdSchema, async ({ id }) => {
  const ctx = await requireStaff("privacy.requests");
  await queueDataExport(ctx, id);
  revalidateStaff(id);
  return ok(undefined, "Export queued. The request completes automatically when the file is ready.");
});

export const queueAccountErasureAction = createFormAction(staffEraseSchema, async ({ id, retentionExceptions }) => {
  const ctx = await requireStaff("privacy.requests");
  await queueAccountErasure(ctx, id, retentionExceptions ?? null);
  revalidateStaff(id);
  return ok(undefined, "Erasure queued. The request completes automatically when it has run.");
});

export const completeDataRequestAction = createFormAction(staffCompleteSchema, async ({ id, resolution, retentionExceptions }) => {
  const ctx = await requireStaff("privacy.requests");
  await completeDataRequest(ctx, id, { resolution, retentionExceptions: retentionExceptions ?? null });
  revalidateStaff(id);
  return ok(undefined, "Request completed and the requester notified");
});

export const rejectDataRequestAction = createFormAction(staffRejectSchema, async ({ id, reason }) => {
  const ctx = await requireStaff("privacy.requests");
  await rejectDataRequest(ctx, id, reason);
  revalidateStaff(id);
  return ok(undefined, "Request declined and the requester notified");
});
