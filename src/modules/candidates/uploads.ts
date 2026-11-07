import "server-only";

import type { DbOrTx } from "@/db";
import type { FilePurpose } from "@/db/schema/_constants";
import { requireUploadedFile, type FileRow } from "@/modules/files";

import type { CandidateTarget } from "./actor";
import { grantStaffUploadToCandidate } from "./file-grants";

/**
 * Validate a file id received from a profile form before linking it: it must exist, have one of
 * `purposes`, belong to the candidate (or, for staff acting on the candidate's behalf, to that staff
 * member) and not be quarantined. Staff uploads are granted to the candidate so they can open them.
 */
export async function acceptCandidateUpload(target: CandidateTarget, fileId: string, purposes: readonly FilePurpose[], tx: DbOrTx): Promise<FileRow> {
  try {
    return await requireUploadedFile(fileId, { purposes, ownerUserId: target.userId }, tx);
  } catch (error) {
    if (!target.onBehalf) throw error;
  }
  const file = await requireUploadedFile(fileId, { purposes, ownerUserId: target.actorUserId }, tx);
  await grantStaffUploadToCandidate({ fileId: file.id, candidateId: target.candidateId, candidateUserId: target.userId, staffUserId: target.actorUserId }, tx);
  return file;
}
