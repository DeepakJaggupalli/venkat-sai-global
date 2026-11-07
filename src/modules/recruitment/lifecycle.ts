import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { candidateDocuments, fileAccessGrants, files, interviewParticipants, interviews, mobilisationRecords, offers, placements } from "@/db/schema";
import { grantFileAccess, revokeFileAccess } from "@/modules/files";
import { notify } from "@/modules/notifications";

import { recruitmentLinks } from "./links";

/**
 * Side effects shared by several services when an application closes or is shared. Kept free of
 * imports from the other service files to avoid import cycles.
 */

export const APPLICATION_FILE_CONTEXT = "application";

/**
 * Give the job's organisation read access to the application's resume and the candidate's
 * documents marked shareable (idempotent per file + organisation + application).
 */
export async function shareApplicationFiles(
  input: { applicationId: string; organizationId: string; candidateId: string; resumeFileId: string | null; grantedByUserId: string | null },
  tx: DbOrTx = db,
): Promise<number> {
  const documentRows = await tx
    .select({ fileId: candidateDocuments.fileId })
    .from(candidateDocuments)
    .innerJoin(files, eq(files.id, candidateDocuments.fileId))
    .where(and(eq(candidateDocuments.candidateId, input.candidateId), eq(candidateDocuments.isShareableWithEmployers, true), isNull(candidateDocuments.deletedAt), isNull(files.deletedAt)));
  const fileIds = new Set(documentRows.map((r) => r.fileId));
  if (input.resumeFileId) {
    const [resume] = await tx.select({ id: files.id }).from(files).where(and(eq(files.id, input.resumeFileId), isNull(files.deletedAt))).limit(1);
    if (resume) fileIds.add(resume.id);
  }
  for (const fileId of fileIds) {
    await grantFileAccess(
      {
        fileId,
        granteeOrganizationId: input.organizationId,
        reason: "Shared with the employer for a job application",
        contextType: APPLICATION_FILE_CONTEXT,
        contextId: input.applicationId,
        grantedByUserId: input.grantedByUserId,
      },
      { tx },
    );
  }
  return fileIds.size;
}

/** Revoke every active file grant made for the application (withdrawal). */
export async function revokeApplicationFileGrants(applicationId: string, revokedByUserId: string | null, tx: DbOrTx = db): Promise<number> {
  const grants = await tx
    .select({ fileId: fileAccessGrants.fileId })
    .from(fileAccessGrants)
    .where(and(eq(fileAccessGrants.contextType, APPLICATION_FILE_CONTEXT), eq(fileAccessGrants.contextId, applicationId), isNull(fileAccessGrants.revokedAt)));
  let revoked = 0;
  for (const fileId of new Set(grants.map((g) => g.fileId))) {
    revoked += await revokeFileAccess({ fileId, contextType: APPLICATION_FILE_CONTEXT, contextId: applicationId }, { revokedByUserId, tx });
  }
  return revoked;
}

/**
 * Cancel scheduled interviews of an application that closed. The panel is told; the candidate is
 * told only when someone else closed the application.
 */
export async function cancelOpenInterviewsForApplication(
  input: { applicationId: string; candidateUserId: string; reason: string; notifyCandidate: boolean; jobTitle: string },
  tx: DbOrTx = db,
): Promise<number> {
  const open = await tx
    .update(interviews)
    .set({ status: "cancelled", cancelledAt: new Date(), cancellationReason: input.reason })
    .where(and(eq(interviews.applicationId, input.applicationId), inArray(interviews.status, ["scheduled", "rescheduled"])))
    .returning({ id: interviews.id, code: interviews.code, roundName: interviews.roundName, organizationId: interviews.organizationId });
  for (const interview of open) {
    const panel = await tx
      .select({ userId: interviewParticipants.userId })
      .from(interviewParticipants)
      .where(eq(interviewParticipants.interviewId, interview.id));
    const recipients = [
      ...(input.notifyCandidate ? [{ userId: input.candidateUserId }] : []),
      ...panel.flatMap((p) => (p.userId ? [{ userId: p.userId }] : [])),
    ];
    if (recipients.length) {
      await notify(
        {
          event: "interview.cancelled",
          recipients,
          data: { interviewCode: interview.code, roundName: interview.roundName, jobTitle: input.jobTitle, reason: "The application was closed." },
          link: recruitmentLinks.candidateInterviews(),
          organizationId: interview.organizationId,
          dedupeKey: `interview-cancelled:${interview.id}`,
        },
        { tx },
      );
    }
  }
  return open.length;
}

/** Withdraw draft / issued offers of an application that closed. */
export async function withdrawOpenOffersForApplication(applicationId: string, reason: string, tx: DbOrTx = db): Promise<number> {
  const rows = await tx
    .update(offers)
    .set({ status: "withdrawn", withdrawnAt: new Date(), withdrawalReason: reason })
    .where(and(eq(offers.applicationId, applicationId), inArray(offers.status, ["draft", "issued"])))
    .returning({ id: offers.id });
  return rows.length;
}

/** Cancel a placement that has not been joined yet (and its mobilisation) when the candidate withdraws. */
export async function cancelPendingPlacementForApplication(applicationId: string, reason: string, tx: DbOrTx = db): Promise<boolean> {
  const [placement] = await tx
    .update(placements)
    .set({ status: "cancelled", cancelledAt: new Date(), cancellationReason: reason })
    .where(and(eq(placements.applicationId, applicationId), inArray(placements.status, ["pending_joining", "mobilising"])))
    .returning({ id: placements.id });
  if (!placement) return false;
  await tx
    .update(mobilisationRecords)
    .set({ status: "cancelled", statusReason: reason })
    .where(and(eq(mobilisationRecords.placementId, placement.id), inArray(mobilisationRecords.status, ["not_started", "documents_pending", "medical", "visa_processing", "emigration_clearance", "travel_booked", "on_hold"])));
  return true;
}
