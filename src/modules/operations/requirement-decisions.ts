import "server-only";

import { eq, sql } from "drizzle-orm";

import type { DbOrTx } from "@/db";
import { requirementRequests } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import type { ApprovalDecision, ApprovalRequestRow } from "@/modules/approvals/types";
import { audit } from "@/modules/audit";

import { REQUIREMENT_AWAITING_DECISION } from "./constants";
import { notifyRequirementSubmitter, type RequirementRow } from "./requirement-notify";

/**
 * Applies an approval-centre decision on a workforce requirement (runs inside decideApproval's transaction):
 *  - approved           → status "approved" (approvedAt)
 *  - rejected           → status "cancelled" with the reason (closedAt)
 *  - changes_requested  → employer submissions go back to "draft" so the employer can edit and resubmit;
 *                         public submissions (no account to edit with) go "on_hold" while staff follow up
 * and notifies the employer (requirement.status_changed) with the reason.
 */
export async function applyRequirementDecision(args: {
  request: ApprovalRequestRow;
  decision: ApprovalDecision;
  reason: string | null;
  actorUserId: string;
  tx: DbOrTx;
}): Promise<void> {
  const { request, decision, reason, actorUserId, tx } = args;
  const locked = await tx.execute<{ id: string }>(sql`select id from requirement_requests where id = ${request.entityId} for update`);
  if (!locked.rows.length) throw new ActionError("The workforce requirement no longer exists.");
  const [requirement] = await tx.select().from(requirementRequests).where(eq(requirementRequests.id, request.entityId)).limit(1);
  if (!requirement) throw new ActionError("The workforce requirement no longer exists.");
  if (!REQUIREMENT_AWAITING_DECISION.includes(requirement.status)) {
    throw new ActionError(`This requirement is already ${requirement.status.replace(/_/g, " ")}; refresh the approval to see its current state.`);
  }

  const now = new Date();
  let patch: Partial<typeof requirementRequests.$inferInsert>;
  if (decision === "approved") {
    patch = { status: "approved", approvedAt: now, statusReason: null };
  } else if (decision === "rejected") {
    patch = { status: "cancelled", statusReason: reason, closedAt: now };
  } else {
    patch = requirement.organizationId ? { status: "draft", statusReason: reason } : { status: "on_hold", statusReason: reason };
  }
  const [updated] = await tx
    .update(requirementRequests)
    .set({ ...patch, approvalRequestId: request.id })
    .where(eq(requirementRequests.id, requirement.id))
    .returning();

  await audit({
    action: "requirement.approval_decided",
    entityType: "requirement_request",
    entityId: requirement.id,
    organizationId: requirement.organizationId,
    metadata: { decision, reason, approvalRequestId: request.id, from: requirement.status, to: updated!.status },
    actorUserId,
    actorType: "staff",
    tx,
  });

  const statusLabel = decision === "approved" ? "Approved" : decision === "rejected" ? "Not accepted" : "Changes requested";
  await notifyRequirementSubmitter(updated as RequirementRow, { event: "requirement.status_changed", data: { status: statusLabel, reason } }, tx);
}
