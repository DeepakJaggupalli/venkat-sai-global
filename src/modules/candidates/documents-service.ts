import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { candidateCredentials, candidateDocuments, candidateSkills, users } from "@/db/schema";
import type { FilePurpose } from "@/db/schema/_constants";
import type { CandidateDocumentType } from "@/db/schema/candidates";
import { ActionError } from "@/lib/actions";
import { encryptField } from "@/lib/crypto";
import { humanize } from "@/lib/format";
import { cancelApprovalsForEntity, submitForApproval } from "@/modules/approvals/service";
import { audit } from "@/modules/audit";

import { auditContext, lockCandidateTarget, type CandidateTarget } from "./actor";
import { CANDIDATE_LIMITS, PLATFORM_ISSUED_CREDENTIAL_ISSUERS } from "./constants";
import { refreshCandidateDerived } from "./derived";
import { revokeProfileGrantsForFiles } from "./file-grants";
import { last4, normaliseIdentityNumber } from "./profile-rules";
import { assertCountries, assertSkills } from "./refs";
import type { CredentialInput, DocumentInput } from "./schemas";
import type { CandidateActor, CandidateCredentialRow, CandidateDocumentRow } from "./types";
import { acceptCandidateUpload } from "./uploads";

/**
 * Documents and credentials, and their submission for staff verification through the approval
 * centre (approval types candidate_document / candidate_credential; decisions are applied in
 * approval-handlers.ts). Changing a verified or pending item's facts resets it to "unverified" and
 * cancels the open review. Platform-issued credentials (issuerType venkat_sai / institution) are
 * created by the training module and are read-only here.
 */

const isPlatformIssued = (credential: Pick<CandidateCredentialRow, "issuerType">): boolean => PLATFORM_ISSUED_CREDENTIAL_ISSUERS.includes(credential.issuerType);

const DOCUMENT_PURPOSES: Partial<Record<CandidateDocumentType, readonly FilePurpose[]>> = {
  resume: ["resume", "candidate_document"],
  photo: ["candidate_document", "avatar"],
};
const DEFAULT_DOCUMENT_PURPOSES: readonly FilePurpose[] = ["candidate_document"];
const CREDENTIAL_PURPOSES: readonly FilePurpose[] = ["candidate_credential", "candidate_document"];

async function loadDocument(target: CandidateTarget, id: string, tx: DbOrTx): Promise<CandidateDocumentRow> {
  const [row] = await tx
    .select()
    .from(candidateDocuments)
    .where(and(eq(candidateDocuments.id, id), eq(candidateDocuments.candidateId, target.candidateId), isNull(candidateDocuments.deletedAt)))
    .limit(1);
  if (!row) throw new ActionError("This document could not be found on your profile.", { code: "not_found" });
  return row;
}

async function loadCredential(target: CandidateTarget, id: string, tx: DbOrTx): Promise<CandidateCredentialRow> {
  const [row] = await tx
    .select()
    .from(candidateCredentials)
    .where(and(eq(candidateCredentials.id, id), eq(candidateCredentials.candidateId, target.candidateId), isNull(candidateCredentials.deletedAt)))
    .limit(1);
  if (!row) throw new ActionError("This credential could not be found on your profile.", { code: "not_found" });
  return row;
}

async function candidateDisplayName(userId: string, tx: DbOrTx): Promise<string> {
  const [row] = await tx.select({ name: users.displayName }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.name ?? "Candidate";
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** Add (no id) or update (id) a document. A new file or number on a reviewed document resets its verification. */
export async function saveCandidateDocument(actor: CandidateActor, input: DocumentInput): Promise<CandidateDocumentRow> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    await assertCountries([input.issuingCountryCode], "issuingCountryCode", tx);
    const existing = input.id ? await loadDocument(target, input.id, tx) : null;
    const fileId = input.fileId ?? existing?.fileId;
    if (!fileId) throw new ActionError("Upload the document.", { fieldErrors: { fileId: ["Upload the document"] } });
    if (fileId !== existing?.fileId) {
      await acceptCandidateUpload(target, fileId, DOCUMENT_PURPOSES[input.documentType] ?? DEFAULT_DOCUMENT_PURPOSES, tx);
    }

    const number: Partial<typeof candidateDocuments.$inferInsert> = {};
    if (input.documentNumber) {
      const normalised = normaliseIdentityNumber(input.documentNumber);
      number.documentNumberEncrypted = encryptField(normalised);
      number.documentNumberLast4 = last4(normalised);
    } else if (input.clearDocumentNumber) {
      number.documentNumberEncrypted = null;
      number.documentNumberLast4 = null;
    }
    const values = {
      documentType: input.documentType,
      title: input.title ?? null,
      fileId,
      issuingCountryCode: input.issuingCountryCode ?? null,
      issuedAt: input.issuedAt ?? null,
      expiresAt: input.expiresAt ?? null,
      isShareableWithEmployers: input.isShareableWithEmployers,
      ...number,
    };

    let row: CandidateDocumentRow;
    let verificationReset = false;
    if (existing) {
      const factsChanged =
        existing.documentType !== values.documentType ||
        existing.fileId !== values.fileId ||
        existing.issuingCountryCode !== values.issuingCountryCode ||
        existing.issuedAt !== values.issuedAt ||
        existing.expiresAt !== values.expiresAt ||
        "documentNumberEncrypted" in number;
      verificationReset = factsChanged && existing.verificationStatus !== "unverified";
      [row] = (await tx
        .update(candidateDocuments)
        .set({
          ...values,
          ...(existing.fileId !== fileId ? { uploadedByUserId: target.actorUserId, expiryReminderSentAt: null } : {}),
          ...(existing.expiresAt !== values.expiresAt ? { expiryReminderSentAt: null } : {}),
          ...(verificationReset ? { verificationStatus: "unverified" as const, verifiedByUserId: null, verifiedAt: null, rejectionReason: null } : {}),
        })
        .where(eq(candidateDocuments.id, existing.id))
        .returning()) as [CandidateDocumentRow];
      if (verificationReset) await cancelApprovalsForEntity("candidate_document", existing.id, target.actorUserId, "The document was changed", tx);
      const revoke = [existing.fileId !== fileId ? existing.fileId : null, existing.isShareableWithEmployers && !values.isShareableWithEmployers ? fileId : null];
      await revokeProfileGrantsForFiles(revoke, target.actorUserId, tx);
    } else {
      const [count] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(candidateDocuments)
        .where(and(eq(candidateDocuments.candidateId, target.candidateId), isNull(candidateDocuments.deletedAt)));
      if (Number(count?.value ?? 0) >= CANDIDATE_LIMITS.documents) throw new ActionError(`You can keep up to ${CANDIDATE_LIMITS.documents} documents.`);
      [row] = (await tx
        .insert(candidateDocuments)
        .values({ ...values, candidateId: target.candidateId, uploadedByUserId: target.actorUserId })
        .returning()) as [CandidateDocumentRow];
    }
    await audit({
      action: existing ? "candidate.document_updated" : "candidate.document_added",
      entityType: "candidate_document",
      entityId: row.id,
      metadata: { candidateId: target.candidateId, documentType: row.documentType, verificationReset, shareable: row.isShareableWithEmployers, onBehalf: target.onBehalf },
      ...auditContext(target),
      tx,
    });
    await refreshCandidateDerived(target.candidateId, tx);
    return row;
  });
}

/** Choose whether employers entitled to the profile (application or unlock) may open this document. */
export async function setDocumentSharing(actor: CandidateActor, documentId: string, isShareableWithEmployers: boolean): Promise<CandidateDocumentRow> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const existing = await loadDocument(target, documentId, tx);
    if (existing.isShareableWithEmployers === isShareableWithEmployers) return existing;
    const [row] = await tx.update(candidateDocuments).set({ isShareableWithEmployers }).where(eq(candidateDocuments.id, existing.id)).returning();
    if (!isShareableWithEmployers) await revokeProfileGrantsForFiles([existing.fileId], target.actorUserId, tx);
    await audit({
      action: "candidate.document_sharing_changed",
      entityType: "candidate_document",
      entityId: existing.id,
      metadata: { candidateId: target.candidateId, shareable: isShareableWithEmployers, onBehalf: target.onBehalf },
      ...auditContext(target),
      tx,
    });
    return row!;
  });
}

/** Soft-delete a document: stops sharing, cancels an open review. The file itself is kept for records that reference it. */
export async function deleteCandidateDocument(actor: CandidateActor, documentId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const existing = await loadDocument(target, documentId, tx);
    await tx.update(candidateDocuments).set({ deletedAt: new Date() }).where(eq(candidateDocuments.id, existing.id));
    await cancelApprovalsForEntity("candidate_document", existing.id, target.actorUserId, "The document was deleted", tx);
    await revokeProfileGrantsForFiles([existing.fileId], target.actorUserId, tx);
    await audit({
      action: "candidate.document_deleted",
      entityType: "candidate_document",
      entityId: existing.id,
      metadata: { candidateId: target.candidateId, documentType: existing.documentType, wasVerified: existing.verificationStatus === "verified", onBehalf: target.onBehalf },
      ...auditContext(target),
      tx,
    });
    await refreshCandidateDerived(target.candidateId, tx);
  });
}

/** Send a document to Venkat Sai staff for verification (approval centre, type candidate_document). */
export async function submitDocumentForVerification(actor: CandidateActor, documentId: string): Promise<{ approvalId: string; code: string }> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const doc = await loadDocument(target, documentId, tx);
    if (doc.verificationStatus === "verified") throw new ActionError("This document is already verified.", { code: "already_verified" });
    await tx.update(candidateDocuments).set({ verificationStatus: "pending", rejectionReason: null }).where(eq(candidateDocuments.id, doc.id));
    const name = await candidateDisplayName(target.userId, tx);
    const typeLabel = humanize(doc.documentType);
    const approval = await submitForApproval(
      {
        type: "candidate_document",
        entityType: "candidate_document",
        entityId: doc.id,
        title: `${typeLabel} — ${name}`,
        summary: doc.title ?? typeLabel,
        payload: {
          candidateId: target.candidateId,
          documentType: doc.documentType,
          title: doc.title,
          issuingCountryCode: doc.issuingCountryCode,
          issuedAt: doc.issuedAt,
          expiresAt: doc.expiresAt,
          numberLast4: doc.documentNumberLast4,
          fileId: doc.fileId,
          submittedOnBehalf: target.onBehalf,
        },
        submittedByUserId: target.actorUserId,
        organizationId: null,
      },
      tx,
    );
    await audit({
      action: "candidate.document_submitted",
      entityType: "candidate_document",
      entityId: doc.id,
      metadata: { candidateId: target.candidateId, approvalId: approval.id, resubmitted: approval.resubmitted, onBehalf: target.onBehalf },
      ...auditContext(target),
      tx,
    });
    await refreshCandidateDerived(target.candidateId, tx);
    return { approvalId: approval.id, code: approval.code };
  });
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/** Add (no id) or update (id) a certificate, licence or qualification declared by the candidate. */
export async function saveCandidateCredential(actor: CandidateActor, input: CredentialInput): Promise<CandidateCredentialRow> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const existing = input.id ? await loadCredential(target, input.id, tx) : null;
    if (existing && isPlatformIssued(existing)) {
      throw new ActionError("Certificates issued on Venkat Sai Global cannot be edited.", { code: "credential_locked" });
    }
    if (input.fileId && input.fileId !== existing?.fileId) await acceptCandidateUpload(target, input.fileId, CREDENTIAL_PURPOSES, tx);
    await assertSkills(input.linkedSkillIds, "linkedSkillIds", tx);

    const values = {
      credentialType: input.credentialType,
      name: input.name,
      issuer: input.issuer ?? null,
      issuerType: input.issuerType,
      credentialNumber: input.credentialNumber ?? null,
      issuedAt: input.issuedAt ?? null,
      expiresAt: input.expiresAt ?? null,
      fileId: input.fileId ?? null,
    };
    let row: CandidateCredentialRow;
    let verificationReset = false;
    if (existing) {
      const factsChanged = (Object.keys(values) as (keyof typeof values)[]).some((key) => (existing[key] ?? null) !== (values[key] ?? null));
      verificationReset = factsChanged && existing.verificationStatus !== "unverified";
      [row] = (await tx
        .update(candidateCredentials)
        .set({ ...values, ...(verificationReset ? { verificationStatus: "unverified" as const, verifiedByUserId: null, verifiedAt: null, rejectionReason: null } : {}) })
        .where(eq(candidateCredentials.id, existing.id))
        .returning()) as [CandidateCredentialRow];
      if (verificationReset) await cancelApprovalsForEntity("candidate_credential", existing.id, target.actorUserId, "The credential was changed", tx);
    } else {
      const [count] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(candidateCredentials)
        .where(and(eq(candidateCredentials.candidateId, target.candidateId), isNull(candidateCredentials.deletedAt)));
      if (Number(count?.value ?? 0) >= CANDIDATE_LIMITS.credentials) throw new ActionError(`You can add up to ${CANDIDATE_LIMITS.credentials} credentials.`);
      [row] = (await tx.insert(candidateCredentials).values({ ...values, candidateId: target.candidateId }).returning()) as [CandidateCredentialRow];
    }
    await linkCredentialSkills(target, row, input.linkedSkillIds, tx);
    if (target.onBehalf || verificationReset) {
      await audit({
        action: existing ? "candidate.credential_updated" : "candidate.credential_added",
        entityType: "candidate_credential",
        entityId: row.id,
        metadata: { candidateId: target.candidateId, verificationReset, onBehalf: target.onBehalf },
        ...auditContext(target),
        tx,
      });
    }
    await refreshCandidateDerived(target.candidateId, tx);
    return row;
  });
}

/**
 * Point the given profile skills at this credential (adding skills that are not on the profile yet)
 * and release skills no longer linked. Linked skills become verified only when the credential is.
 */
async function linkCredentialSkills(target: CandidateTarget, credential: CandidateCredentialRow, skillIds: string[], tx: DbOrTx): Promise<void> {
  const verified = credential.verificationStatus === "verified";
  const current = await tx.select().from(candidateSkills).where(eq(candidateSkills.candidateId, target.candidateId));
  for (const row of current) {
    if (row.credentialId === credential.id && !skillIds.includes(row.skillId) && row.source === "credential") {
      await tx.update(candidateSkills).set({ credentialId: null, source: "self", verified: false, verifiedAt: null }).where(eq(candidateSkills.id, row.id));
    }
  }
  const linkable = skillIds.filter((id) => {
    const row = current.find((r) => r.skillId === id);
    return !row || row.source !== "assessment";
  });
  if (!linkable.length) return;
  const onProfile = new Set(current.map((r) => r.skillId));
  const toAdd = linkable.filter((id) => !onProfile.has(id));
  if (current.length + toAdd.length > CANDIDATE_LIMITS.skills) throw new ActionError(`You can add up to ${CANDIDATE_LIMITS.skills} skills.`);
  const existingIds = linkable.filter((id) => onProfile.has(id));
  if (existingIds.length) {
    await tx
      .update(candidateSkills)
      .set({ credentialId: credential.id, source: "credential", verified, verifiedAt: verified ? new Date() : null })
      .where(and(eq(candidateSkills.candidateId, target.candidateId), inArray(candidateSkills.skillId, existingIds)));
  }
  if (toAdd.length) {
    await tx.insert(candidateSkills).values(
      toAdd.map((skillId) => ({ candidateId: target.candidateId, skillId, source: "credential" as const, credentialId: credential.id, verified, verifiedAt: verified ? new Date() : null })),
    );
  }
}

/** Soft-delete a declared credential; skills it evidenced go back to self-declared. */
export async function deleteCandidateCredential(actor: CandidateActor, credentialId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const existing = await loadCredential(target, credentialId, tx);
    if (isPlatformIssued(existing)) {
      throw new ActionError("Certificates issued on Venkat Sai Global cannot be removed here.", { code: "credential_locked" });
    }
    await tx.update(candidateCredentials).set({ deletedAt: new Date() }).where(eq(candidateCredentials.id, existing.id));
    await tx
      .update(candidateSkills)
      .set({ credentialId: null, source: "self", verified: false, verifiedAt: null })
      .where(and(eq(candidateSkills.credentialId, existing.id), eq(candidateSkills.source, "credential")));
    await cancelApprovalsForEntity("candidate_credential", existing.id, target.actorUserId, "The credential was deleted", tx);
    await audit({
      action: "candidate.credential_deleted",
      entityType: "candidate_credential",
      entityId: existing.id,
      metadata: { candidateId: target.candidateId, wasVerified: existing.verificationStatus === "verified", onBehalf: target.onBehalf },
      ...auditContext(target),
      tx,
    });
    await refreshCandidateDerived(target.candidateId, tx);
  });
}

/** Send a declared credential to Venkat Sai staff for verification (approval type candidate_credential). */
export async function submitCredentialForVerification(actor: CandidateActor, credentialId: string): Promise<{ approvalId: string; code: string }> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const credential = await loadCredential(target, credentialId, tx);
    if (isPlatformIssued(credential)) throw new ActionError("Certificates issued on Venkat Sai Global are verified already.", { code: "already_verified" });
    if (credential.verificationStatus === "verified") throw new ActionError("This credential is already verified.", { code: "already_verified" });
    if (!credential.fileId) {
      throw new ActionError("Upload a copy of the credential before asking for verification.", { fieldErrors: { fileId: ["Upload a copy first"] } });
    }
    await tx.update(candidateCredentials).set({ verificationStatus: "pending", rejectionReason: null }).where(eq(candidateCredentials.id, credential.id));
    const name = await candidateDisplayName(target.userId, tx);
    const linkedSkills = await tx.select({ skillId: candidateSkills.skillId }).from(candidateSkills).where(eq(candidateSkills.credentialId, credential.id));
    const approval = await submitForApproval(
      {
        type: "candidate_credential",
        entityType: "candidate_credential",
        entityId: credential.id,
        title: `${credential.name} — ${name}`,
        summary: [humanize(credential.credentialType), credential.issuer].filter(Boolean).join(" · "),
        payload: {
          candidateId: target.candidateId,
          credentialType: credential.credentialType,
          name: credential.name,
          issuer: credential.issuer,
          issuerType: credential.issuerType,
          credentialNumber: credential.credentialNumber,
          issuedAt: credential.issuedAt,
          expiresAt: credential.expiresAt,
          fileId: credential.fileId,
          linkedSkillIds: linkedSkills.map((s) => s.skillId),
          submittedOnBehalf: target.onBehalf,
        },
        submittedByUserId: target.actorUserId,
        organizationId: null,
      },
      tx,
    );
    await audit({
      action: "candidate.credential_submitted",
      entityType: "candidate_credential",
      entityId: credential.id,
      metadata: { candidateId: target.candidateId, approvalId: approval.id, resubmitted: approval.resubmitted, onBehalf: target.onBehalf },
      ...auditContext(target),
      tx,
    });
    return { approvalId: approval.id, code: approval.code };
  });
}
