import type { DbOrTx } from "@/db";
import type { approvalRequests, ApprovalType } from "@/db/schema";

export type ApprovalRequestRow = typeof approvalRequests.$inferSelect;

export type ApprovalDecision = "approved" | "rejected" | "changes_requested";

/**
 * Applies an approval decision to the underlying entity. Runs INSIDE the decision transaction:
 * throw to abort the decision. Must not send notifications directly (use notify() with { tx }).
 */
export type ApprovalHandler = {
  onDecision(args: {
    request: ApprovalRequestRow;
    decision: ApprovalDecision;
    reason: string | null;
    actorUserId: string;
    tx: DbOrTx;
  }): Promise<void>;
  /** Admin UI link to the underlying record, shown in the approval detail view. */
  adminHref?(request: ApprovalRequestRow): string | null;
};

export type ApprovalHandlers = Partial<Record<ApprovalType, ApprovalHandler>>;
