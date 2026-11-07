import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { dataRequests, users } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/modules/audit";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { issueOtp, verifyOtp } from "@/modules/identity/otp";
import type { SessionUser } from "@/modules/identity/session";
import { notify, notifyStaff } from "@/modules/notifications";
import { getSetting } from "@/modules/settings";
import { enqueueTask } from "@/server/tasks/queue";

import {
  CLOSE_ACCOUNT_MARKER,
  canTransitionDataRequest,
  computeDataRequestDueAt,
  DATA_REQUEST_TYPE_LABELS,
  OPEN_DATA_REQUEST_STATUSES,
  type DataRequestStatus,
  type DataRequestType,
} from "./constants";
import type { GuestDataRequestInput, MyDataRequestInput } from "./schemas";

/**
 * Data principal requests (DPDP Act 2023). Requesters act on their own requests only; staff need
 * `privacy.requests`. Every change is audited (never with request details in the metadata).
 */

export type DataRequestRow = typeof dataRequests.$inferSelect;

export const ACCOUNT_PRIVACY_PATH = "/account/privacy";
export const staffDataRequestHref = (id: string): string => `/admin/privacy/${id}`;

function assertStaff(ctx: StaffContext): void {
  if (!staffCan(ctx, "privacy.requests")) throw new ActionError("You do not have permission to process data requests.", { code: "forbidden" });
}

async function slaDueAt(now: Date): Promise<Date> {
  const days = Number(await getSetting("privacy.data_request_sla_days"));
  return computeDataRequestDueAt(now, days);
}

async function loadForStaff(ctx: StaffContext, id: string): Promise<DataRequestRow> {
  assertStaff(ctx);
  const [row] = await db.select().from(dataRequests).where(eq(dataRequests.id, id)).limit(1);
  if (!row) throw new ActionError("Data request not found.", { code: "not_found" });
  return row;
}

function assertTransition(row: DataRequestRow, to: DataRequestStatus): void {
  if (!canTransitionDataRequest(row.status, to)) {
    throw new ActionError(`This request is ${row.status.replace(/_/g, " ")} and cannot be moved to ${to.replace(/_/g, " ")}.`, { code: "invalid_transition" });
  }
}

// ---------------------------------------------------------------------------
// Requesters
// ---------------------------------------------------------------------------

/** Signed-in person. Identity is the authenticated account; a verified email or phone counts as verified. */
export async function createDataRequest(
  user: SessionUser,
  input: MyDataRequestInput,
  opts: { source?: string; /** Requester-facing page for the confirmation link (defaults to /account/privacy). */ link?: string } = {},
): Promise<{ id: string; code: string; dueAt: Date }> {
  const limit = await rateLimit(`privacy-request:${user.id}`, 5, 24 * 3600);
  if (!limit.allowed) throw new ActionError("You have made several requests today. Please wait before making another.", { code: "rate_limited" });

  const [open] = await db
    .select({ code: dataRequests.code })
    .from(dataRequests)
    .where(and(eq(dataRequests.userId, user.id), eq(dataRequests.type, input.type), inArray(dataRequests.status, [...OPEN_DATA_REQUEST_STATUSES])))
    .limit(1);
  if (open) throw new ActionError(`You already have an open request of this type (${open.code}).`, { code: "request_open" });

  const now = new Date();
  const dueAt = await slaDueAt(now);
  const verified = Boolean(user.emailVerifiedAt || user.phoneVerifiedAt);
  const details = [input.type === "deletion" ? `${CLOSE_ACCOUNT_MARKER} The person asked to close their account.` : null, input.details ?? null].filter(Boolean).join("\n\n") || null;

  return db.transaction(async (tx) => {
    const code = await nextCode("DSR", { tx });
    const [row] = await tx
      .insert(dataRequests)
      .values({
        code,
        userId: user.id,
        requesterName: user.displayName,
        requesterEmail: user.email,
        requesterPhone: user.phone,
        type: input.type,
        status: verified ? "received" : "identity_verification",
        details,
        dueAt,
        identityVerifiedAt: verified ? now : null,
      })
      .returning({ id: dataRequests.id });
    await audit({ action: "privacy.request_created", entityType: "data_request", entityId: row!.id, metadata: { type: input.type, source: opts.source ?? "account_privacy", verified }, tx });
    await notify(
      {
        event: "privacy.request_received",
        recipients: [{ userId: user.id }],
        data: { code, type: input.type, typeLabel: DATA_REQUEST_TYPE_LABELS[input.type], dueAt: dueAt.toISOString().slice(0, 10) },
        link: `${opts.link ?? ACCOUNT_PRIVACY_PATH}#requests`,
        dedupeKey: `dsr-received:${code}`,
      },
      { tx },
    );
    await notifyStaffOfRequest(tx, row!.id, code, input.type, dueAt);
    return { id: row!.id, code, dueAt };
  });
}

async function notifyStaffOfRequest(tx: DbOrTx, id: string, code: string, type: DataRequestType, dueAt: Date) {
  await notifyStaff(
    {
      event: "work.assigned",
      permission: "privacy.requests",
      data: { kindLabel: "Data request", title: DATA_REQUEST_TYPE_LABELS[type], code, dueAt: dueAt.toISOString() },
      link: staffDataRequestHref(id),
      dedupeKey: `dsr-staff-new:${code}`,
    },
    { tx },
  );
}

/**
 * Guest request (no account, or cannot sign in). The request starts in `identity_verification` and a
 * 6-digit code is emailed; it reaches the staff queue only once the code is confirmed
 * (`verifyGuestDataRequest`). Honeypot and rate limits per IP hash and email.
 */
export async function createGuestDataRequest(input: GuestDataRequestInput, meta: { ipHash: string | null }): Promise<{ accepted: true; code: string | null }> {
  if (input.website) return { accepted: true, code: null };
  const checks = await Promise.all([
    rateLimit(`privacy-guest-ip:${meta.ipHash ?? "unknown"}`, 5, 3600),
    rateLimit(`privacy-guest-email:${input.email}`, 3, 24 * 3600),
  ]);
  if (checks.some((c) => !c.allowed)) throw new ActionError("Too many requests. Please try again later.", { code: "rate_limited" });

  const now = new Date();
  const dueAt = await slaDueAt(now);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  const { id, code } = await db.transaction(async (tx) => {
    const code = await nextCode("DSR", { tx });
    const [row] = await tx
      .insert(dataRequests)
      .values({
        code,
        // Linked to an account only after the email is verified, so nobody can attach requests to someone else's account.
        userId: null,
        requesterName: input.name,
        requesterEmail: input.email,
        requesterPhone: input.phone ?? null,
        type: input.type,
        status: "identity_verification",
        details: input.details,
        dueAt,
      })
      .returning({ id: dataRequests.id });
    await audit({ action: "privacy.request_created", entityType: "data_request", entityId: row!.id, actorType: "anonymous", metadata: { type: input.type, source: "guest", hasAccount: Boolean(existing) }, tx });
    return { id: row!.id, code };
  });
  await issueOtp({ purpose: "email_verification", channel: "email", target: input.email, metadata: { dataRequestId: id } });
  return { accepted: true, code };
}

export async function verifyGuestDataRequest(input: { code: string; email: string; otp: string }): Promise<{ code: string }> {
  const limit = await rateLimit(`privacy-guest-verify:${input.email}`, 10, 3600);
  if (!limit.allowed) throw new ActionError("Too many attempts. Please try again later.", { code: "rate_limited" });
  const [row] = await db
    .select()
    .from(dataRequests)
    .where(and(eq(dataRequests.code, input.code.trim().toUpperCase()), eq(dataRequests.requesterEmail, input.email)))
    .limit(1);
  if (!row || row.status !== "identity_verification") throw new ActionError("We could not find a request waiting for verification with these details.", { code: "not_found" });
  const result = await verifyOtp({ purpose: "email_verification", target: input.email, code: input.otp });
  if (!result.ok || result.metadata.dataRequestId !== row.id) {
    throw new ActionError("The code is not valid or has expired.", { fieldErrors: { otp: ["Check the code and try again"] } });
  }
  const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  await db.transaction(async (tx) => {
    await tx
      .update(dataRequests)
      .set({ status: "received", identityVerifiedAt: new Date(), userId: account?.id ?? null, updatedAt: new Date() })
      .where(eq(dataRequests.id, row.id));
    await audit({ action: "privacy.identity_verified", entityType: "data_request", entityId: row.id, actorType: "anonymous", metadata: { method: "email_code" }, tx });
    await notify(
      {
        event: "privacy.request_received",
        recipients: [{ email: input.email, name: row.requesterName ?? undefined }],
        data: { code: row.code, type: row.type, typeLabel: DATA_REQUEST_TYPE_LABELS[row.type], dueAt: row.dueAt?.toISOString().slice(0, 10) },
        dedupeKey: `dsr-received:${row.code}`,
      },
      { tx },
    );
    await notifyStaffOfRequest(tx, row.id, row.code, row.type, row.dueAt ?? new Date());
  });
  return { code: row.code };
}

/** The requester withdraws a request that staff have not started. */
export async function cancelMyDataRequest(user: SessionUser, id: string): Promise<void> {
  const [row] = await db.select().from(dataRequests).where(and(eq(dataRequests.id, id), eq(dataRequests.userId, user.id))).limit(1);
  if (!row) throw new ActionError("Request not found.", { code: "not_found" });
  if (row.status !== "received" && row.status !== "identity_verification") throw new ActionError("This request is already being processed and can no longer be cancelled. Contact support if you need help.");
  await db.transaction(async (tx) => {
    await tx.update(dataRequests).set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() }).where(eq(dataRequests.id, id));
    await audit({ action: "privacy.request_cancelled", entityType: "data_request", entityId: id, metadata: { by: "requester" }, tx });
  });
}

// ---------------------------------------------------------------------------
// Staff processing
// ---------------------------------------------------------------------------

export async function assignDataRequest(ctx: StaffContext, id: string, assigneeUserId: string | null): Promise<void> {
  const row = await loadForStaff(ctx, id);
  if (assigneeUserId) {
    const [assignee] = await db.select({ isStaff: users.isStaff, status: users.status }).from(users).where(eq(users.id, assigneeUserId)).limit(1);
    if (!assignee?.isStaff || assignee.status !== "active") throw new ActionError("Choose an active team member.");
  }
  await db.transaction(async (tx) => {
    await tx.update(dataRequests).set({ handledByUserId: assigneeUserId, updatedAt: new Date() }).where(eq(dataRequests.id, row.id));
    await audit({ action: "privacy.request_assigned", entityType: "data_request", entityId: row.id, metadata: { assigneeUserId }, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

/** Ask the requester to prove identity (e.g. the request came from an unverified contact). */
export async function requestIdentityVerification(ctx: StaffContext, id: string): Promise<void> {
  const row = await loadForStaff(ctx, id);
  assertTransition(row, "identity_verification");
  await db.transaction(async (tx) => {
    await tx.update(dataRequests).set({ status: "identity_verification", handledByUserId: row.handledByUserId ?? ctx.user.id, updatedAt: new Date() }).where(eq(dataRequests.id, id));
    await audit({ action: "privacy.identity_requested", entityType: "data_request", entityId: id, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

export async function verifyDataRequestIdentity(ctx: StaffContext, id: string, note: string): Promise<void> {
  const row = await loadForStaff(ctx, id);
  if (row.status !== "received" && row.status !== "identity_verification") throw new ActionError("Identity can only be confirmed before processing starts.");
  await db.transaction(async (tx) => {
    await tx
      .update(dataRequests)
      .set({ identityVerifiedAt: new Date(), status: "in_progress", handledByUserId: row.handledByUserId ?? ctx.user.id, updatedAt: new Date() })
      .where(eq(dataRequests.id, id));
    // The note describes the method (e.g. "matched OTP on registered phone"); it stays in the audit trail only.
    await audit({ action: "privacy.identity_verified", entityType: "data_request", entityId: id, metadata: { method: "staff", note: note.slice(0, 500) }, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

export async function startDataRequest(ctx: StaffContext, id: string): Promise<void> {
  const row = await loadForStaff(ctx, id);
  if (!row.identityVerifiedAt) throw new ActionError("Confirm the requester's identity before processing the request.", { code: "identity_unverified" });
  assertTransition(row, "in_progress");
  await db.transaction(async (tx) => {
    await tx.update(dataRequests).set({ status: "in_progress", handledByUserId: row.handledByUserId ?? ctx.user.id, updatedAt: new Date() }).where(eq(dataRequests.id, id));
    await audit({ action: "privacy.request_started", entityType: "data_request", entityId: id, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

function assertProcessable(row: DataRequestRow): void {
  if (row.status !== "in_progress") throw new ActionError("Start processing the request first.", { code: "invalid_transition" });
  if (!row.identityVerifiedAt) throw new ActionError("Confirm the requester's identity first.", { code: "identity_unverified" });
}

/** Queue the JSON export (access / export requests). The task completes the request and notifies the person. */
export async function queueDataExport(ctx: StaffContext, id: string): Promise<void> {
  const row = await loadForStaff(ctx, id);
  assertProcessable(row);
  if (row.type !== "export" && row.type !== "access") throw new ActionError("Exports are generated for access and export requests only.");
  if (!row.userId) throw new ActionError("This request is not linked to an account, so there is no account data to export. Reply to the requester instead.");
  await enqueueTask("privacy.export", { requestId: id, staffUserId: ctx.user.id }, { dedupeKey: `privacy.export:${id}:${Date.now()}` });
  await audit({ action: "privacy.export_queued", entityType: "data_request", entityId: id, actorUserId: ctx.user.id, actorType: "staff" });
}

/** Queue the erasure (deletion requests). Staff confirm with the word ERASE; the task records the result. */
export async function queueAccountErasure(ctx: StaffContext, id: string, retentionExceptions: string | null): Promise<void> {
  const row = await loadForStaff(ctx, id);
  assertProcessable(row);
  if (row.type !== "deletion") throw new ActionError("Erasure applies to deletion requests only.");
  if (!row.userId) throw new ActionError("This request is not linked to an account. Delete any records about the person manually and complete the request.");
  if (row.userId === ctx.user.id) throw new ActionError("You cannot process the erasure of your own account.");
  const [subject] = await db.select({ isStaff: users.isStaff }).from(users).where(eq(users.id, row.userId)).limit(1);
  if (subject?.isStaff) throw new ActionError("Staff accounts are closed through team offboarding, not through a data request.");
  await db.transaction(async (tx) => {
    if (retentionExceptions) await tx.update(dataRequests).set({ retentionExceptions, updatedAt: new Date() }).where(eq(dataRequests.id, id));
    await enqueueTask("privacy.erase", { requestId: id, staffUserId: ctx.user.id }, { dedupeKey: `privacy.erase:${id}`, tx });
    await audit({ action: "privacy.erasure_queued", entityType: "data_request", entityId: id, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

/** Complete manually (correction, access summary, objection, nomination, or after manual handling). */
export async function completeDataRequest(ctx: StaffContext, id: string, input: { resolution: string; retentionExceptions?: string | null }): Promise<void> {
  const row = await loadForStaff(ctx, id);
  assertProcessable(row);
  if (row.type === "deletion" && row.userId) throw new ActionError("Use “Erase account” to complete a deletion request for an account.");
  await finishDataRequest(row, { status: "completed", resolution: input.resolution, retentionExceptions: input.retentionExceptions ?? null, actorUserId: ctx.user.id });
}

export async function rejectDataRequest(ctx: StaffContext, id: string, reason: string): Promise<void> {
  const row = await loadForStaff(ctx, id);
  assertTransition(row, "rejected");
  await finishDataRequest(row, { status: "rejected", resolution: reason, retentionExceptions: null, actorUserId: ctx.user.id });
}

/** Close the request, audit and notify the requester (account or email). Used by staff actions and tasks. */
export async function finishDataRequest(
  row: DataRequestRow,
  input: { status: "completed" | "rejected"; resolution: string; retentionExceptions: string | null; actorUserId: string | null; exportFileId?: string | null; tx?: DbOrTx },
): Promise<void> {
  const run = async (tx: DbOrTx) => {
    const now = new Date();
    await tx
      .update(dataRequests)
      .set({
        status: input.status,
        resolution: input.resolution,
        retentionExceptions: input.retentionExceptions ?? row.retentionExceptions,
        completedAt: now,
        handledByUserId: row.handledByUserId ?? input.actorUserId,
        ...(input.exportFileId !== undefined ? { exportFileId: input.exportFileId } : {}),
        updatedAt: now,
      })
      .where(eq(dataRequests.id, row.id));
    await audit({
      action: input.status === "completed" ? "privacy.request_completed" : "privacy.request_rejected",
      entityType: "data_request",
      entityId: row.id,
      metadata: { type: row.type, hasExport: Boolean(input.exportFileId) },
      actorUserId: input.actorUserId,
      actorType: input.actorUserId ? "staff" : "system",
      tx,
    });
    const recipient = row.userId ? { userId: row.userId } : row.requesterEmail ? { email: row.requesterEmail, name: row.requesterName ?? undefined } : null;
    // An erased account has no contact left; its requester was told when the erasure was queued.
    if (recipient && !(row.type === "deletion" && input.status === "completed" && row.userId)) {
      await notify(
        {
          event: "privacy.request_completed",
          recipients: [recipient],
          data: { code: row.code, type: row.type, typeLabel: DATA_REQUEST_TYPE_LABELS[row.type], resolution: input.resolution, status: input.status },
          link: row.userId ? `${ACCOUNT_PRIVACY_PATH}#requests` : null,
          dedupeKey: `dsr-finished:${row.code}`,
        },
        { tx },
      );
    }
  };
  if (input.tx) await run(input.tx);
  else await db.transaction(run);
}
