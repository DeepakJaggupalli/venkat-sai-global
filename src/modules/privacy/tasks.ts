import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { dataRequests } from "@/db/schema";
import { softDeleteFile, storeFile } from "@/modules/files";
import { notify, notifyStaff } from "@/modules/notifications";
import type { TaskHandlers } from "@/server/tasks/types";

import { DATA_REQUEST_TYPE_LABELS, EXPORT_LINK_DAYS, RETENTION_EXCEPTIONS } from "./constants";
import { eraseAccount } from "./erasure";
import { buildPersonalDataBundle } from "./export";
import { expiredExportFiles, openRequestsNearDeadline } from "./queries";
import { finishDataRequest, staffDataRequestHref } from "./service";
import { loadStaffContextForUser } from "./staff-context";

/**
 * Background task handlers owned by the privacy module.
 * Task type names must be prefixed with "privacy." (see src/server/tasks/schedule.ts for recurring ones).
 *
 *  - privacy.export   { requestId, staffUserId }  JSON bundle → private data_export file owned by the person,
 *                                                  request completed, person notified (download for EXPORT_LINK_DAYS)
 *  - privacy.erase    { requestId, staffUserId }  anonymise + delete (erasure.ts), request completed
 *  - privacy.sla_watch (daily)                     reminders for requests near / past their deadline; expired exports removed
 *
 * Export and erasure act as the staff member who queued them (their permissions are re-checked here).
 */

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

async function loadJob(payload: Record<string, unknown>) {
  const requestId = str(payload.requestId);
  const staffUserId = str(payload.staffUserId);
  if (!requestId || !staffUserId) throw new Error("privacy task payload needs requestId and staffUserId");
  const [row] = await db.select().from(dataRequests).where(eq(dataRequests.id, requestId)).limit(1);
  if (!row) return null;
  const ctx = await loadStaffContextForUser(staffUserId);
  if (!ctx || !ctx.permissions.has("privacy.requests")) throw new Error("The staff member who started this task can no longer process data requests");
  return { row, ctx };
}

export const tasks: TaskHandlers = {
  "privacy.export": async (payload, taskCtx) => {
    const job = await loadJob(payload);
    if (!job) return;
    const { row, ctx } = job;
    // Idempotent: a finished request is never exported twice.
    if (row.status !== "in_progress" || !row.userId) {
      taskCtx.log("Export skipped", { requestId: row.id, status: row.status });
      return;
    }
    const bundle = await buildPersonalDataBundle(ctx, row.userId, { code: row.code, type: row.type });
    const data = new TextEncoder().encode(JSON.stringify(bundle, null, 2));
    const file = await storeFile({
      data,
      originalName: `venkat-sai-global-${row.code.toLowerCase()}.json`,
      declaredMimeType: "application/json",
      purpose: "data_export",
      ownerUserId: row.userId,
      visibility: "private",
      metadata: { dataRequestId: row.id },
    });
    await finishDataRequest(row, {
      status: "completed",
      resolution: `Your data export is ready. Download it from your account's privacy page within ${EXPORT_LINK_DAYS} days; after that the file is deleted and you can ask for a new one.`,
      retentionExceptions: null,
      actorUserId: ctx.user.id,
      exportFileId: file.id,
    });
    taskCtx.log("Data export generated", { requestId: row.id, bytes: data.byteLength });
  },

  "privacy.erase": async (payload, taskCtx) => {
    const job = await loadJob(payload);
    if (!job) return;
    const { row, ctx } = job;
    if (row.status !== "in_progress" || !row.userId || row.type !== "deletion") {
      taskCtx.log("Erasure skipped", { requestId: row.id, status: row.status });
      return;
    }
    // Contact details disappear with the erasure: the confirmation goes to the address captured on the request, by email only.
    const email = row.requesterEmail;
    const summary = await eraseAccount(ctx, { userId: row.userId, requestId: row.id, requestCode: row.code });
    const retained = row.retentionExceptions?.trim() || RETENTION_EXCEPTIONS.map((r) => `- ${r.label}: ${r.reason}`).join("\n");
    const resolution =
      "Your account has been closed and your personal data deleted or anonymised. " +
      "Some records are kept because the law requires it; they now refer to an anonymised account.";
    await finishDataRequest(row, { status: "completed", resolution, retentionExceptions: retained, actorUserId: ctx.user.id });
    if (email) {
      await notify({
        event: "privacy.request_completed",
        recipients: [{ email }],
        data: { code: row.code, type: row.type, typeLabel: DATA_REQUEST_TYPE_LABELS.deletion, resolution },
        channels: ["email"],
        dedupeKey: `dsr-erased:${row.code}`,
      });
    }
    taskCtx.log("Account erased", { requestId: row.id, files: summary.filesDeleted, candidateRows: summary.candidateRowsDeleted });
  },

  "privacy.sla_watch": async (_payload, taskCtx) => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const due = await openRequestsNearDeadline(now);
    for (const req of due) {
      const overdue = req.dueAt.getTime() < now.getTime();
      const common = {
        event: "work.reminder" as const,
        data: { kindLabel: "Data request", title: DATA_REQUEST_TYPE_LABELS[req.type], code: req.code, dueAt: req.dueAt.toISOString(), overdue },
        link: staffDataRequestHref(req.id),
        dedupeKey: `privacy.sla:${req.id}:${overdue ? "overdue" : "soon"}:${day}`,
      };
      if (req.handledByUserId) await notify({ ...common, recipients: [{ userId: req.handledByUserId }] });
      else await notifyStaff({ ...common, permission: "privacy.requests" });
    }
    const expired = await expiredExportFiles(now);
    for (const item of expired) await softDeleteFile(item.fileId, { actorUserId: null, reason: "Data export download window ended" });
    taskCtx.log("Privacy SLA watch", { reminders: due.length, exportsExpired: expired.length });
  },
};
