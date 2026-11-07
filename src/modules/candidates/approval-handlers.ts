import "server-only";

import { and, eq } from "drizzle-orm";

import type { DbOrTx } from "@/db";
import { candidateCredentials, candidateDocuments, candidateProfiles, candidateSkills } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { humanize } from "@/lib/format";
import type { ApprovalDecision, ApprovalHandlers, ApprovalRequestRow } from "@/modules/approvals/types";
import { notify } from "@/modules/notifications";

import { PROFILE_PATH } from "./constants";
import { refreshCandidateDerived } from "./derived";

/**
 * Approval decision handlers owned by the candidates module.
 * Approval types handled here: candidate_document, candidate_credential.
 *
 * Decisions (run inside the approval decision transaction — throwing aborts the decision):
 *   approved          → verified, verifiedBy / verifiedAt set, reason cleared
 *   rejected          → rejected, reason shown to the candidate (the request is closed)
 *   changes_requested → unverified, reason shown; the candidate fixes it and submits again
 *                       (submitForApproval re-opens the same request)
 * Then the verification level is recomputed. Credentials also (un)verify the skills linked to them.
 *
 * Notifications: decideApproval() already sends `approval.decided` to the submitter. When the
 * candidate submitted the item themselves that IS their notification; when staff or a partner
 * submitted it on their behalf, the candidate gets `candidate.verification_updated` from here.
 */

type Decided = { status: "verified" | "rejected" | "unverified"; verifiedAt: Date | null; reason: string | null };

export function decisionOutcome(decision: ApprovalDecision, reason: string | null): Decided {
  if (decision === "approved") return { status: "verified", verifiedAt: new Date(), reason: null };
  if (decision === "rejected") return { status: "rejected", verifiedAt: null, reason };
  return { status: "unverified", verifiedAt: null, reason };
}

async function candidateOwner(candidateId: string, tx: DbOrTx): Promise<string | null> {
  const [row] = await tx.select({ userId: candidateProfiles.userId }).from(candidateProfiles).where(eq(candidateProfiles.id, candidateId)).limit(1);
  return row?.userId ?? null;
}

async function notifyCandidateIfNeeded(args: {
  request: ApprovalRequestRow;
  candidateId: string;
  itemType: "document" | "credential";
  itemLabel: string;
  decision: ApprovalDecision;
  reason: string | null;
  tx: DbOrTx;
}): Promise<void> {
  const userId = await candidateOwner(args.candidateId, args.tx);
  if (!userId || userId === args.request.submittedByUserId) return;
  await notify(
    {
      event: "candidate.verification_updated",
      recipients: [{ userId }],
      data: {
        itemType: args.itemType,
        itemLabel: args.itemLabel,
        decision: args.decision === "approved" ? "verified" : args.decision,
        reason: args.decision === "approved" ? null : args.reason,
      },
      link: `${PROFILE_PATH}#${args.itemType === "document" ? "documents" : "credentials"}`,
    },
    { tx: args.tx },
  );
}

const candidateAdminHref = (request: ApprovalRequestRow): string | null => {
  const candidateId = typeof request.payload.candidateId === "string" ? request.payload.candidateId : null;
  return candidateId ? `/admin/candidates/${candidateId}` : null;
};

export const approvalHandlers: ApprovalHandlers = {
  candidate_document: {
    async onDecision({ request, decision, reason, actorUserId, tx }) {
      const [doc] = await tx.select().from(candidateDocuments).where(eq(candidateDocuments.id, request.entityId)).limit(1);
      if (!doc || doc.deletedAt) throw new ActionError("The candidate deleted this document. Cancel the request instead.");
      const result = decisionOutcome(decision, reason);
      await tx
        .update(candidateDocuments)
        .set({ verificationStatus: result.status, verifiedByUserId: actorUserId, verifiedAt: result.verifiedAt, rejectionReason: result.reason })
        .where(eq(candidateDocuments.id, doc.id));
      await refreshCandidateDerived(doc.candidateId, tx);
      await notifyCandidateIfNeeded({ request, candidateId: doc.candidateId, itemType: "document", itemLabel: doc.title ?? humanize(doc.documentType), decision, reason, tx });
    },
    adminHref: candidateAdminHref,
  },

  candidate_credential: {
    async onDecision({ request, decision, reason, actorUserId, tx }) {
      const [credential] = await tx.select().from(candidateCredentials).where(eq(candidateCredentials.id, request.entityId)).limit(1);
      if (!credential || credential.deletedAt) throw new ActionError("The candidate deleted this credential. Cancel the request instead.");
      const result = decisionOutcome(decision, reason);
      await tx
        .update(candidateCredentials)
        .set({ verificationStatus: result.status, verifiedByUserId: actorUserId, verifiedAt: result.verifiedAt, rejectionReason: result.reason })
        .where(eq(candidateCredentials.id, credential.id));
      // Skills evidenced by this credential are verified exactly when the credential is.
      await tx
        .update(candidateSkills)
        .set({ verified: result.status === "verified", verifiedAt: result.verifiedAt })
        .where(and(eq(candidateSkills.credentialId, credential.id), eq(candidateSkills.source, "credential")));
      await refreshCandidateDerived(credential.candidateId, tx);
      await notifyCandidateIfNeeded({ request, candidateId: credential.candidateId, itemType: "credential", itemLabel: credential.name, decision, reason, tx });
    },
    adminHref: candidateAdminHref,
  },
};
