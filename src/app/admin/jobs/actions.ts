"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction, createFormAction, ok, type ActionResult } from "@/lib/actions";
import { f } from "@/lib/validation";
import { decideApproval, getOpenApprovalForEntity } from "@/modules/approvals/service";
import { requireStaff, type StaffContext } from "@/modules/identity/authz";
import { MANUAL_CLOSE_REASONS, PROMOTION_TYPE_OPTIONS } from "@/modules/jobs/constants";
import { dateOnly } from "@/modules/jobs/schemas";
import { closeJob, extendJob, featureJob, pauseJob, publishJob, resumeJob } from "@/modules/jobs/service";
import { createStaffTask } from "@/modules/operations/service";

/**
 * Command Centre bulk job operations. Each job is processed independently through the module services
 * (which lock, re-check permissions and audit); failures are reported per job and never abort the batch.
 */

const MAX_BULK = 50;
const idsSchema = z.array(z.uuid()).min(1, "Select at least one job").max(MAX_BULK, `Select up to ${MAX_BULK} jobs at a time`);

async function runBulk(ids: string[], label: string, fn: (id: string) => Promise<unknown>): Promise<ActionResult<{ done: number; failed: number }>> {
  let done = 0;
  const failures: string[] = [];
  for (const id of ids) {
    try {
      await fn(id);
      done += 1;
    } catch (err) {
      failures.push(err instanceof ActionError ? err.message : "Unexpected error");
    }
  }
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/approvals");
  if (!done) return { ok: false, error: `No jobs were ${label}. ${failures[0] ?? ""}`.trim() };
  const tail = failures.length ? ` ${failures.length} skipped (first reason: ${failures[0]})` : "";
  return ok({ done, failed: failures.length }, `${done} ${done === 1 ? "job" : "jobs"} ${label}.${tail}`);
}

async function decideJob(ctx: StaffContext, jobId: string, decision: "approved" | "rejected" | "changes_requested", reason: string | null) {
  const request = await getOpenApprovalForEntity("job_publication", jobId);
  if (!request) throw new ActionError("This job is not waiting for approval.");
  await decideApproval({ requestId: request.id, decision, reason, ctx });
}

export const bulkApproveJobsAction = createAction(idsSchema, async (ids) => {
  const ctx = await requireStaff(["approvals.decide", "jobs.approve"]);
  return runBulk(ids, "approved", (id) => decideJob(ctx, id, "approved", null));
});

export const bulkPublishJobsAction = createAction(idsSchema, async (ids) => {
  const ctx = await requireStaff(["jobs.manage", "jobs.approve"]);
  return runBulk(ids, "published", (id) => publishJob({ kind: "staff", ctx }, id, {}));
});

export const bulkUnpublishJobsAction = createAction(idsSchema, async (ids) => {
  const ctx = await requireStaff("jobs.manage");
  return runBulk(ids, "paused", (id) => pauseJob({ kind: "staff", ctx }, id));
});

export const bulkResumeJobsAction = createAction(idsSchema, async (ids) => {
  const ctx = await requireStaff("jobs.manage");
  return runBulk(ids, "resumed", (id) => resumeJob({ kind: "staff", ctx }, id));
});

const detailSchema = z
  .object({
    ids: z.preprocess((v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v), idsSchema),
    operation: z.enum(["reject", "changes", "close", "extend", "feature"], { error: "Choose an action" }),
    reason: f.longText(2000),
    closeReason: z.enum(MANUAL_CLOSE_REASONS).optional(),
    date: dateOnly.optional(),
    promotionType: z.enum(PROMOTION_TYPE_OPTIONS).optional(),
  })
  .superRefine((v, c) => {
    if ((v.operation === "reject" || v.operation === "changes") && !v.reason) c.addIssue({ code: "custom", path: ["reason"], message: "Give a reason the employer will see" });
    if (v.operation === "close" && !v.closeReason) c.addIssue({ code: "custom", path: ["closeReason"], message: "Choose why the jobs are closing" });
    if ((v.operation === "extend" || v.operation === "feature") && !v.date) c.addIssue({ code: "custom", path: ["date"], message: "Choose a date" });
  });

/** Bulk operations that need details (a reason or a date). */
export const bulkJobDetailAction = createFormAction(detailSchema, async (input) => {
  switch (input.operation) {
    case "reject":
    case "changes": {
      const ctx = await requireStaff(["approvals.decide", "jobs.approve"]);
      const decision = input.operation === "reject" ? "rejected" : "changes_requested";
      return runBulk(input.ids, input.operation === "reject" ? "rejected" : "sent back for changes", (id) => decideJob(ctx, id, decision, input.reason ?? null));
    }
    case "close": {
      const ctx = await requireStaff("jobs.manage");
      return runBulk(input.ids, "closed", (id) => closeJob({ kind: "staff", ctx }, id, input.closeReason!));
    }
    case "extend": {
      const ctx = await requireStaff("jobs.manage");
      return runBulk(input.ids, "extended", (id) => extendJob({ kind: "staff", ctx }, id, { applicationDeadline: input.date, expiresAt: input.date }));
    }
    case "feature": {
      const ctx = await requireStaff("jobs.feature");
      return runBulk(input.ids, "featured", (id) => featureJob({ kind: "staff", ctx }, id, { type: input.promotionType ?? "featured", until: input.date! }));
    }
  }
});

/**
 * Assign a recruiter to a job. Jobs have no recruiter column, so the assignment is an internal task
 * linked to the job (visible in the recruiter's /admin/tasks with reminders).
 */
export const assignJobRecruiterAction = createFormAction(
  z.object({ jobId: f.uuid(), jobTitle: f.text({ max: 200 }), assignedToUserId: f.uuid(), note: f.longText(2000), dueAt: z.string().optional() }),
  async ({ jobId, jobTitle, assignedToUserId, note, dueAt }) => {
    const ctx = await requireStaff(["jobs.view", "recruitment.manage"]);
    const due = dueAt ? new Date(dueAt) : undefined;
    await createStaffTask(ctx, {
      title: `Recruit for ${jobTitle}`.slice(0, 200),
      description: note,
      priority: "normal",
      dueAt: due && !Number.isNaN(due.getTime()) ? due : undefined,
      assignedToUserId,
      relatedType: "job",
      relatedId: jobId,
    });
    revalidatePath(`/admin/jobs/${jobId}`);
    revalidatePath("/admin/tasks");
    return ok(undefined, "Recruiter assigned");
  },
);
