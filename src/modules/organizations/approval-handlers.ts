import type { ApprovalHandler, ApprovalHandlers } from "@/modules/approvals/types";

import { adminOrganizationPath } from "./paths";
import { applyVerificationDecision } from "./verification-decisions";

/**
 * Approval decision handlers owned by the organizations module.
 * Approval types handled here: employer_verification, partner_verification, institution_verification.
 *
 * Kept free of imports from ./service (which imports the approvals service) so the approvals
 * registry → handlers import chain has no cycle.
 */
const verificationHandler: ApprovalHandler = {
  async onDecision({ request, decision, reason, actorUserId, tx }) {
    await applyVerificationDecision({ request, decision, reason, actorUserId, tx });
  },
  adminHref(request) {
    return request.entityType === "organization" ? adminOrganizationPath(request.entityId) : null;
  },
  // Every outcome sends org.verification_* to the members with the profile permission, which the
  // submitter needed to submit.
  notifiesSubmitter: true,
};

export const approvalHandlers: ApprovalHandlers = {
  employer_verification: verificationHandler,
  partner_verification: verificationHandler,
  institution_verification: verificationHandler,
};
