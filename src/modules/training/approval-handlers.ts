import { eq } from "drizzle-orm";

import { courses } from "@/db/schema";
import { audit } from "@/modules/audit";
import type { ApprovalHandlers } from "@/modules/approvals/types";
import { invalidStateError, notFoundError } from "@/modules/organizations/errors";

/**
 * Approval decision handlers owned by the training module.
 * Approval types handled here: course_publication.
 *
 * approved → course published (publishedAt kept from the first publication); rejected → rejected;
 * changes_requested → changes_requested. The approvals service notifies the submitter
 * (approval.decided). Self-contained (no import of ./courses, which imports the approvals service).
 */
export const approvalHandlers: ApprovalHandlers = {
  course_publication: {
    async onDecision({ request, decision, reason, actorUserId, tx }) {
      if (request.entityType !== "course") throw invalidStateError("This approval is not linked to a course.");
      const [course] = await tx.select().from(courses).where(eq(courses.id, request.entityId)).limit(1).for("update");
      if (!course || course.deletedAt) throw notFoundError("The course no longer exists.");
      if (course.status !== "pending_approval") throw invalidStateError("This course is no longer waiting for approval. Refresh the request.");
      const now = new Date();
      if (decision === "approved") {
        await tx.update(courses).set({ status: "published", publishedAt: course.publishedAt ?? now }).where(eq(courses.id, course.id));
      } else {
        await tx.update(courses).set({ status: decision, isFeatured: false }).where(eq(courses.id, course.id));
      }
      await audit({
        action: decision === "approved" ? "course.published" : decision === "rejected" ? "course.publication_rejected" : "course.publication_changes_requested",
        entityType: "course",
        entityId: course.id,
        organizationId: course.organizationId,
        actorUserId,
        actorType: "staff",
        metadata: { approvalRequestId: request.id, reason },
        tx,
      });
    },
    adminHref(request) {
      return request.entityType === "course" ? `/admin/training/courses/${request.entityId}` : null;
    },
  },
};
