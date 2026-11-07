"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { assignApproval, commentOnApproval, decideApproval, escalateApproval } from "@/modules/approvals/service";
import { requireStaff, staffCan } from "@/modules/identity/authz";

/** Approval-centre Server Actions. Each re-authorises; the service re-checks the per-type permission. */

function refresh(id: string) {
  revalidatePath("/admin/approvals");
  revalidatePath(`/admin/approvals/${id}`);
  revalidatePath("/admin");
}

const decideSchema = z.object({
  requestId: f.uuid(),
  decision: z.enum(["approved", "rejected", "changes_requested"], { error: "Choose a decision" }),
  reason: f.longText(2000),
});

export const decideApprovalAction = createFormAction(decideSchema, async ({ requestId, decision, reason }) => {
  const ctx = await requireStaff("approvals.decide");
  await decideApproval({ requestId, decision, reason: reason ?? null, ctx });
  refresh(requestId);
  const label = decision === "approved" ? "Approved" : decision === "rejected" ? "Rejected" : "Changes requested";
  return ok(undefined, label);
});

export const assignApprovalAction = createAction(z.object({ id: f.uuid(), assigneeUserId: f.uuid().nullable() }), async ({ id, assigneeUserId }) => {
  const ctx = await requireStaff("approvals.view");
  // Taking a request yourself needs approvals.view; handing it to (or taking it from) someone else is a reassignment.
  if (assigneeUserId !== ctx.user.id && !staffCan(ctx, "approvals.escalate")) {
    throw new ActionError("You can assign requests to yourself. Reassigning needs the escalate permission.");
  }
  await assignApproval(id, assigneeUserId, ctx);
  refresh(id);
  return ok(undefined, assigneeUserId ? "Assigned" : "Unassigned");
});

export const escalateApprovalAction = createFormAction(
  z.object({ requestId: f.uuid(), note: f.text({ label: "Reason", max: 2000 }), escalateToUserId: f.optionalUuid() }),
  async ({ requestId, note, escalateToUserId }) => {
    const ctx = await requireStaff("approvals.escalate");
    await escalateApproval(requestId, note, ctx, escalateToUserId ?? null);
    refresh(requestId);
    return ok(undefined, "Escalated");
  },
);

export const commentApprovalAction = createFormAction(z.object({ requestId: f.uuid(), note: f.text({ label: "Comment", max: 4000 }) }), async ({ requestId, note }) => {
  const ctx = await requireStaff("approvals.view");
  if (!note.trim()) throw new ActionError("Write a comment first.", { fieldErrors: { note: ["Write a comment first"] } });
  await commentOnApproval(requestId, note, ctx);
  refresh(requestId);
  return ok(undefined, "Comment added");
});
