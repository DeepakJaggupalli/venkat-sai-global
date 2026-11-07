import "server-only";

import { eq, sql } from "drizzle-orm";

import { jobs } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import type { ApprovalHandlers } from "@/modules/approvals/types";
import { audit } from "@/modules/audit";

import { applyPublication, notifyJobOwner } from "./publication";

/**
 * Approval decision handlers owned by the jobs module.
 * Approval types handled here: job_publication.
 *
 *   approved          → published (or scheduled: publishedAt = the requested go-live time), listing
 *                       end from recruitment.job_default_duration_days unless set, verified-employer
 *                       snapshot, info source "employer_supplied" (Venkat Sai jobs: "verified"),
 *                       job-post credit consumed; organisation notified (job.approved)
 *   changes_requested → changes_requested + reviewer's reason (job.changes_requested)
 *   rejected          → rejected + reason (job.rejected)
 * Runs inside the decision transaction; throwing aborts the decision (job deleted / withdrawn, or
 * the organisation is no longer verified). Every outcome notifies the job owner, so the generic
 * approval.decided is not sent as well (notifiesSubmitter).
 */
export const approvalHandlers: ApprovalHandlers = {
  job_publication: {
    async onDecision({ request, decision, reason, actorUserId, tx }) {
      await tx.execute(sql`select id from jobs where id = ${request.entityId} for update`);
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, request.entityId)).limit(1);
      if (!job || job.deletedAt) throw new ActionError("This job was deleted. Cancel the request instead.");
      if (job.status !== "pending_approval") throw new ActionError("This job is no longer waiting for review.");

      if (decision === "approved") {
        await applyPublication(job, { tx, actorUserId, reason: "approval" });
        return;
      }
      const status = decision === "rejected" ? "rejected" : "changes_requested";
      await tx.update(jobs).set({ status, moderationNote: reason }).where(eq(jobs.id, job.id));
      await notifyJobOwner(job, decision === "rejected" ? "job.rejected" : "job.changes_requested", { reason }, { tx });
      await audit({
        action: `job.${status}`,
        entityType: "job",
        entityId: job.id,
        organizationId: job.organizationId,
        metadata: { approvalRequestId: request.id, reason },
        actorUserId,
        actorType: "staff",
        tx,
      });
    },
    adminHref: (request) => `/admin/jobs/${request.entityId}`,
    notifiesSubmitter: true,
  },
};
