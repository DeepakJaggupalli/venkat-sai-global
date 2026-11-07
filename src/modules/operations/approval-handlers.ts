import "server-only";

import type { ApprovalHandlers } from "@/modules/approvals/types";

import { staffRequirementHref } from "./links";
import { applyRequirementDecision } from "./requirement-decisions";

/**
 * Approval decision handlers owned by the operations module (registered in src/modules/approvals/registry.ts).
 * Approval types handled here: requirement_request (submitted by employers and the public requirement form).
 * Every decision sends requirement.status_changed to the submitting side (the employer's requirement managers,
 * or the public form's contact), so the generic approval.decided is not sent as well.
 */
export const approvalHandlers: ApprovalHandlers = {
  requirement_request: {
    onDecision: (args) => applyRequirementDecision(args),
    adminHref: (request) => staffRequirementHref(request.entityId),
    notifiesSubmitter: true,
  },
};
