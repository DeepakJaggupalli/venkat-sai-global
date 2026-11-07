import "server-only";

import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { fileAccessGrants } from "@/db/schema";
import { logger } from "@/lib/logger";
import { grantFileAccess, revokeFileAccess } from "@/modules/files";

/**
 * File grants that keep private candidate files readable by exactly the organisations the privacy
 * rules allow (policy.ts). Candidate files are private; employers and partners read them only
 * through explicit grants (files module rule 6):
 *  - context `candidate_profile` (contextId = candidate id): photo, resume, shareable documents
 *    and public portfolio media an organisation may see. The viewer re-syncs them on every profile
 *    view (grant what is allowed, revoke what no longer is); candidate changes revoke them eagerly.
 *  - context `candidate_upload`: a file staff uploaded on a candidate's behalf, granted to the candidate.
 */
export const PROFILE_GRANT_CONTEXT = "candidate_profile";
export const STAFF_UPLOAD_GRANT_CONTEXT = "candidate_upload";

const GRANT_TTL_MS = 30 * 24 * 60 * 60_000;
const EXTEND_WHEN_REMAINING_MS = 7 * 24 * 60 * 60_000;

/** Revoke every profile grant of these files (all organisations) — e.g. a document stopped being shareable. */
export async function revokeProfileGrantsForFiles(fileIds: (string | null | undefined)[], actorUserId: string | null, tx: DbOrTx = db): Promise<number> {
  let revoked = 0;
  for (const fileId of new Set(fileIds.filter((id): id is string => Boolean(id)))) {
    revoked += await revokeFileAccess({ fileId, contextType: PROFILE_GRANT_CONTEXT }, { revokedByUserId: actorUserId, tx });
  }
  return revoked;
}

/** Revoke every profile grant an organisation holds for a candidate (e.g. the candidate blocked it). */
export async function revokeOrganizationProfileGrants(
  candidateId: string,
  organizationIds: string[],
  actorUserId: string | null,
  tx: DbOrTx = db,
): Promise<number> {
  if (!organizationIds.length) return 0;
  const grants = await tx
    .select({ id: fileAccessGrants.id })
    .from(fileAccessGrants)
    .where(
      and(
        eq(fileAccessGrants.contextType, PROFILE_GRANT_CONTEXT),
        eq(fileAccessGrants.contextId, candidateId),
        inArray(fileAccessGrants.granteeOrganizationId, organizationIds),
        isNull(fileAccessGrants.revokedAt),
      ),
    );
  let revoked = 0;
  for (const grant of grants) revoked += await revokeFileAccess({ grantId: grant.id }, { revokedByUserId: actorUserId, tx });
  return revoked;
}

/**
 * Make an organisation's profile grants for a candidate match `fileIds` exactly: missing grants are
 * created (30 days, extended when viewed again), grants for files no longer allowed are revoked.
 * The caller has already decided, through policy.ts, that the organisation may see these files.
 */
export async function syncOrganizationProfileGrants(input: {
  candidateId: string;
  organizationId: string;
  fileIds: string[];
  grantedByUserId: string | null;
}): Promise<void> {
  const now = Date.now();
  const active = await db
    .select({ id: fileAccessGrants.id, fileId: fileAccessGrants.fileId, expiresAt: fileAccessGrants.expiresAt })
    .from(fileAccessGrants)
    .where(
      and(
        eq(fileAccessGrants.contextType, PROFILE_GRANT_CONTEXT),
        eq(fileAccessGrants.contextId, input.candidateId),
        eq(fileAccessGrants.granteeOrganizationId, input.organizationId),
        isNull(fileAccessGrants.revokedAt),
        or(isNull(fileAccessGrants.expiresAt), gt(fileAccessGrants.expiresAt, new Date(now))),
      ),
    );
  const wanted = new Set(input.fileIds);
  for (const grant of active) {
    if (!wanted.has(grant.fileId)) await revokeFileAccess({ grantId: grant.id }, { revokedByUserId: input.grantedByUserId });
  }
  for (const fileId of wanted) {
    const existing = active.find((g) => g.fileId === fileId);
    if (existing && (!existing.expiresAt || existing.expiresAt.getTime() - now > EXTEND_WHEN_REMAINING_MS)) continue;
    try {
      await grantFileAccess({
        fileId,
        granteeOrganizationId: input.organizationId,
        reason: "Candidate profile shared under the candidate's privacy settings",
        contextType: PROFILE_GRANT_CONTEXT,
        contextId: input.candidateId,
        expiresAt: new Date(now + GRANT_TTL_MS),
        grantedByUserId: input.grantedByUserId,
      });
    } catch (error) {
      // A deleted file simply stays unavailable; the profile view must still render.
      logger.warn("Could not grant candidate file access", { error, fileId });
    }
  }
}

/** Let the candidate read a file staff uploaded to their profile (staff own the upload). */
export async function grantStaffUploadToCandidate(
  input: { fileId: string; candidateId: string; candidateUserId: string; staffUserId: string },
  tx: DbOrTx,
): Promise<void> {
  await grantFileAccess(
    {
      fileId: input.fileId,
      granteeUserId: input.candidateUserId,
      reason: "Uploaded to your profile by Venkat Sai staff",
      contextType: STAFF_UPLOAD_GRANT_CONTEXT,
      contextId: input.candidateId,
      grantedByUserId: input.staffUserId,
    },
    { tx },
  );
}
