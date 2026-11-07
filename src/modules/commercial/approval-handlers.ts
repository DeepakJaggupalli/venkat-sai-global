import "server-only";

import type { ApprovalHandlers } from "@/modules/approvals/types";

import { ADMIN_COMMERCIAL_PATHS } from "./constants";
import { applyRefundDecisionTx } from "./refunds";
import { applySettlementDecisionTx } from "./settlements";
import { applySubscriptionExceptionTx } from "./subscriptions";

/**
 * Approval decision handlers owned by the commercial module (they run inside the decision transaction; throwing
 * aborts the decision):
 *  - refund: approved → refund approved (gateway refunds are sent by task commercial.process_refund; offline ones
 *    are completed by finance); rejected → rejected; changes requested → stays requested for resubmission.
 *  - subscription_exception: approved → the exception in the payload ({ kind, days }) is applied; otherwise nothing.
 *  - partner_settlement: approved → approved (ready to pay); rejected → cancelled (placements freed); changes
 *    requested → draft.
 */
export const approvalHandlers: ApprovalHandlers = {
  refund: {
    async onDecision({ request, decision, reason, actorUserId, tx }) {
      await applyRefundDecisionTx(tx, request.entityId, decision, reason, actorUserId);
    },
    adminHref: (request) => ADMIN_COMMERCIAL_PATHS.refund(request.entityId),
  },
  subscription_exception: {
    async onDecision({ request, decision, actorUserId, tx }) {
      if (decision !== "approved") return;
      const payload = request.payload as { kind?: unknown; days?: unknown };
      const kind = typeof payload.kind === "string" ? payload.kind : "";
      const days = typeof payload.days === "number" ? payload.days : Number(payload.days);
      if (!Number.isFinite(days)) throw new Error("Subscription exception payload has no number of days");
      await applySubscriptionExceptionTx(tx, request.entityId, { kind, days }, actorUserId);
    },
    adminHref: (request) => ADMIN_COMMERCIAL_PATHS.subscription(request.entityId),
  },
  partner_settlement: {
    async onDecision({ request, decision, reason, actorUserId, tx }) {
      await applySettlementDecisionTx(tx, request.entityId, decision, reason, actorUserId);
    },
    adminHref: (request) => ADMIN_COMMERCIAL_PATHS.settlement(request.entityId),
  },
};
