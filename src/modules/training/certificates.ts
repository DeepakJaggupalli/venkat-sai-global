import "server-only";

import { randomInt } from "node:crypto";

import { and, count, desc, eq, isNotNull, lte, type SQL } from "drizzle-orm";

import { BRAND } from "@/config/site";
import { db, type DbOrTx } from "@/db";
import {
  assessmentCentres,
  batches,
  candidateCredentials,
  candidateProfiles,
  certificates,
  courses,
  enrolments,
  institutionProfiles,
  organizations,
  skillAssessments,
} from "@/db/schema";
import type { CandidateCredentialIssuerType } from "@/db/schema/candidates";
import type { CertificateIssuerType, CertificateSnapshot } from "@/db/schema/training";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit } from "@/modules/audit";
import { grantFileAccess, requireUploadedFile } from "@/modules/files";
import { staffCan } from "@/modules/identity/authz";
import { notify } from "@/modules/notifications";
import { forbiddenError, invalidStateError, notFoundError, validationError, withConstraintMessages } from "@/modules/organizations/errors";
import { isAuthorisedIssuerNow } from "@/modules/organizations/institution";
import { endOfValidityDay, hasValidVerification } from "@/modules/organizations/rules";

import { isInstitutionActor, trainingActorUserId, type TrainingActor } from "./access";
import { candidateIdentities, type CandidateActor } from "./candidate";
import { CERTIFICATE_ISSUER_TYPE_LABELS, SKILL_ASSESSMENT_TYPE_LABELS } from "./constants";
import {
  credentialTypeForCertificate,
  evaluateCertificateIssue,
  formatVerificationCode,
  normalizeVerificationCode,
  toIsoDate,
  VERIFICATION_CODE_ALPHABET,
  VERIFICATION_CODE_LENGTH,
  type CertificateIssuerActor,
  type CertificateSource,
} from "./rules";
import type { IssueCertificateInput } from "./schemas";

export type CertificateRow = typeof certificates.$inferSelect;

export type PublicCertificateVerification =
  | { found: false }
  | {
      found: true;
      status: "valid" | "revoked" | "expired";
      code: string;
      holderName: string;
      title: string;
      issuerName: string;
      issuerType: CertificateIssuerType;
      /** Plain-language wording: Venkat Sai results are never described as accredited. */
      issuerTypeLabel: string;
      accreditationBody: string | null;
      issuedOn: string;
      /** Printed expiry date (valid through that day), if any. */
      expiresOn: string | null;
      details: Pick<CertificateSnapshot, "courseTitle" | "trade" | "process" | "position">;
    };

export type CandidateCertificateItem = CertificateRow & { verificationCodeDisplay: string; issuerTypeLabel: string };

const CERTIFICATE_CONSTRAINTS = {
  certificates_active_assessment_uq: "An active certificate already exists for this assessment. Revoke or reissue it instead.",
  certificates_active_enrolment_uq: "An active certificate of this type already exists for this enrolment. Revoke or reissue it instead.",
  certificates_issuer_chk: "The issuer details do not match the certificate type.",
};

/** 12 characters from the Crockford alphabet (60 random bits), unguessable and distinct from the sequential code. */
export function generateVerificationCode(): string {
  let out = "";
  for (let i = 0; i < VERIFICATION_CODE_LENGTH; i++) out += VERIFICATION_CODE_ALPHABET[randomInt(0, VERIFICATION_CODE_ALPHABET.length)];
  return out;
}

/**
 * Issuer type recorded on the candidate's credential: venkat_sai and accredited_external map 1:1, institution
 * completion certificates become `institution` credentials (never presented as accredited).
 */
export function credentialIssuerTypeFor(issuerType: CertificateIssuerType): CandidateCredentialIssuerType | null {
  if (issuerType === "venkat_sai" || issuerType === "accredited_external") return issuerType;
  if (issuerType === "institution_completion") return "institution";
  return null;
}

/** Printed expiry dates are stored at 00:00 UTC and valid through that day. */
export function certificateLapsesAt(expiresAt: Date): Date {
  return endOfValidityDay(toIsoDate(expiresAt));
}

function certificateState(cert: Pick<CertificateRow, "status" | "expiresAt">, now: Date): "valid" | "revoked" | "expired" {
  if (cert.status === "revoked") return "revoked";
  if (cert.status === "expired" || (cert.expiresAt && certificateLapsesAt(cert.expiresAt).getTime() <= now.getTime())) return "expired";
  return "valid";
}

type ResolvedSource = {
  source: CertificateSource;
  candidateId: string;
  courseId: string | null;
  batchId: string | null;
  enrolmentId: string | null;
  skillAssessmentId: string | null;
  defaultTitle: string;
  accreditationBody: string | null;
  certificationType: (typeof courses.$inferSelect)["certificationType"] | null;
  snapshot: CertificateSnapshot;
};

async function resolveSource(tx: DbOrTx, input: Pick<IssueCertificateInput, "enrolmentId" | "skillAssessmentId">): Promise<ResolvedSource> {
  if (input.skillAssessmentId) {
    const [row] = await tx
      .select({ a: skillAssessments, centreName: assessmentCentres.name })
      .from(skillAssessments)
      .leftJoin(assessmentCentres, eq(assessmentCentres.id, skillAssessments.assessmentCentreId))
      .where(eq(skillAssessments.id, input.skillAssessmentId))
      .limit(1)
      .for("update", { of: skillAssessments });
    if (!row) throw notFoundError("Assessment not found.");
    const a = row.a;
    const details = [a.process, a.position].filter(Boolean).join(" ");
    return {
      source: { kind: "skill_assessment", status: a.status, result: a.result },
      candidateId: a.candidateId,
      courseId: null,
      batchId: null,
      enrolmentId: a.enrolmentId,
      skillAssessmentId: a.id,
      defaultTitle: `${a.trade} — ${SKILL_ASSESSMENT_TYPE_LABELS[a.assessmentType]}${details ? ` (${details})` : ""}`,
      accreditationBody: null,
      certificationType: null,
      snapshot: {
        trade: a.trade,
        process: a.process ?? undefined,
        position: a.position ?? undefined,
        standardReference: a.standardReference ?? undefined,
        assessedOn: a.completedAt ? toIsoDate(a.completedAt) : undefined,
        assessmentCentreName: row.centreName ?? undefined,
        result: a.result,
      },
    };
  }
  const [row] = await tx
    .select({ enrolment: enrolments, batch: batches, course: courses })
    .from(enrolments)
    .innerJoin(batches, eq(batches.id, enrolments.batchId))
    .innerJoin(courses, eq(courses.id, batches.courseId))
    .where(eq(enrolments.id, input.enrolmentId!))
    .limit(1)
    .for("update", { of: enrolments });
  if (!row) throw notFoundError("Enrolment not found.");
  const { enrolment, batch, course } = row;
  return {
    source: {
      kind: "enrolment",
      courseOrganizationId: course.organizationId,
      batchOrganizationId: batch.organizationId,
      enrolmentStatus: enrolment.status,
      resultStatus: enrolment.resultStatus,
      certificationType: course.certificationType,
    },
    candidateId: enrolment.candidateId,
    courseId: course.id,
    batchId: batch.id,
    enrolmentId: enrolment.id,
    skillAssessmentId: null,
    defaultTitle: course.title,
    accreditationBody: course.accreditationBody,
    certificationType: course.certificationType,
    snapshot: {
      courseTitle: course.title,
      courseCode: course.code,
      batchCode: batch.code,
      durationHours: course.durationHours ?? undefined,
      result: enrolment.resultStatus,
      grade: enrolment.finalScore !== null ? String(enrolment.finalScore) : undefined,
    },
  };
}

async function issuerActorFor(tx: DbOrTx, actor: TrainingActor, now: Date): Promise<{ descriptor: CertificateIssuerActor; organizationId: string | null; issuerName: string }> {
  if (!isInstitutionActor(actor)) return { descriptor: { kind: "staff", permissions: actor.permissions }, organizationId: null, issuerName: BRAND.legalEntity };
  if (actor.orgType !== "institution") throw forbiddenError();
  const [org] = await tx.select().from(organizations).where(eq(organizations.id, actor.organization.id)).limit(1);
  if (!org || org.deletedAt) throw notFoundError("Organisation not found.");
  const [profile] = await tx.select().from(institutionProfiles).where(eq(institutionProfiles.organizationId, org.id)).limit(1);
  return {
    descriptor: {
      kind: "institution",
      organizationId: org.id,
      permissions: actor.permissions,
      organizationVerified: hasValidVerification(org, now),
      authorisedIssuer: isAuthorisedIssuerNow(profile ?? null, now),
    },
    organizationId: org.id,
    issuerName: org.legalName ?? org.name,
  };
}

async function uniqueVerificationCode(tx: DbOrTx): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateVerificationCode();
    const [taken] = await tx.select({ id: certificates.id }).from(certificates).where(eq(certificates.verificationCode, code)).limit(1);
    if (!taken) return code;
  }
  throw new Error("Could not generate a unique certificate verification code");
}

/**
 * Issue a certificate inside an existing transaction (see issueCertificate for the rules).
 * Adds a verified candidate_credentials row with the matching issuer type and notifies the candidate.
 */
export async function issueCertificateInTx(
  tx: DbOrTx,
  actor: TrainingActor,
  input: IssueCertificateInput & { replacesCertificateId?: string | null },
  now: Date = new Date(),
): Promise<CertificateRow> {
  const userId = trainingActorUserId(actor);
  const resolved = await resolveSource(tx, input);
  const issuer = await issuerActorFor(tx, actor, now);
  const check = evaluateCertificateIssue(input.issuerType, issuer.descriptor, resolved.source);
  if (!check.ok) throw new ActionError(check.message, { code: `certificate_${check.reason}` });

  if (input.expiresOn && input.expiresOn <= toIsoDate(now)) throw validationError("The expiry date must be in the future.", { expiresOn: ["Choose a future date"] });
  const [candidate] = await tx.select({ id: candidateProfiles.id, deletedAt: candidateProfiles.deletedAt }).from(candidateProfiles).where(eq(candidateProfiles.id, resolved.candidateId)).limit(1);
  if (!candidate || candidate.deletedAt) throw notFoundError("The candidate profile no longer exists.");
  const identity = (await candidateIdentities([resolved.candidateId], tx)).get(resolved.candidateId);
  if (!identity) throw notFoundError("The candidate profile no longer exists.");

  const fileId = input.fileId
    ? (await requireUploadedFile(input.fileId, { purposes: ["certificate"], ownerUserId: userId, ...(issuer.organizationId ? { organizationId: issuer.organizationId } : {}) }, tx)).id
    : null;
  const accreditationBody = input.issuerType === "accredited_external" ? resolved.accreditationBody : null;
  const code = await nextCode("CRT", { tx });
  const verificationCode = await uniqueVerificationCode(tx);
  const title = input.title?.trim() || resolved.defaultTitle;

  const [cert] = await tx
    .insert(certificates)
    .values({
      code,
      candidateId: resolved.candidateId,
      holderName: identity.legalName?.trim() || identity.displayName,
      issuerType: input.issuerType,
      issuerOrganizationId: input.issuerType === "venkat_sai" ? null : issuer.organizationId,
      issuerName: issuer.issuerName,
      accreditationBody,
      externalCertificateNumber: input.externalCertificateNumber ?? null,
      courseId: resolved.courseId,
      batchId: resolved.batchId,
      enrolmentId: resolved.skillAssessmentId ? null : resolved.enrolmentId,
      skillAssessmentId: resolved.skillAssessmentId,
      title,
      description: input.description ?? null,
      snapshot: resolved.snapshot,
      issuedAt: now,
      expiresAt: input.expiresOn ? new Date(`${input.expiresOn}T00:00:00.000Z`) : null,
      verificationCode,
      fileId,
      status: "active",
      replacesCertificateId: input.replacesCertificateId ?? null,
      issuedByUserId: userId,
    })
    .returning();

  const credentialIssuer = credentialIssuerTypeFor(input.issuerType);
  if (credentialIssuer) {
    await tx.insert(candidateCredentials).values({
      candidateId: resolved.candidateId,
      credentialType: credentialTypeForCertificate({ fromSkillAssessment: !!resolved.skillAssessmentId, certificationType: resolved.certificationType }),
      name: title,
      issuer: issuer.issuerName,
      issuerType: credentialIssuer,
      credentialNumber: code,
      issuedAt: toIsoDate(now),
      expiresAt: input.expiresOn ?? null,
      fileId,
      certificateId: cert!.id,
      verificationStatus: "verified",
      verifiedByUserId: userId,
      verifiedAt: now,
    });
  }
  if (fileId) {
    await grantFileAccess(
      { fileId, granteeUserId: identity.userId, reason: "Certificate issued to you", contextType: "certificate", contextId: cert!.id, grantedByUserId: userId },
      { tx },
    );
  }
  await notify(
    {
      event: "training.certificate_issued",
      recipients: [{ userId: identity.userId }],
      data: { title, issuerName: issuer.issuerName, certificateCode: code, verificationCode: formatVerificationCode(verificationCode) },
      link: "/talent/certificates",
    },
    { tx },
  );
  await audit({
    action: input.replacesCertificateId ? "certificate.reissued" : "certificate.issued",
    entityType: "certificate",
    entityId: cert!.id,
    organizationId: issuer.organizationId,
    actorUserId: userId,
    actorType: isInstitutionActor(actor) ? "user" : "staff",
    metadata: { code, issuerType: input.issuerType, candidateId: resolved.candidateId, enrolmentId: resolved.enrolmentId, skillAssessmentId: resolved.skillAssessmentId },
    tx,
  });
  return cert!;
}

/**
 * Issue a certificate. Rules (rules.evaluateCertificateIssue):
 *  - venkat_sai: staff with training.certificates, from a passed Venkat Sai skill assessment or a completed
 *    Venkat Sai course enrolment;
 *  - institution_completion: institution members with institution.certificates.issue (verified institution),
 *    for completed enrolments in their own courses;
 *  - accredited_external: only institutions authorised by Venkat Sai as certificate issuers.
 * Each certificate gets a sequential code (CRT) and a separate unguessable verification code.
 */
export async function issueCertificate(actor: TrainingActor, input: IssueCertificateInput, now: Date = new Date()): Promise<CertificateRow> {
  return withConstraintMessages(() => db.transaction((tx) => issueCertificateInTx(tx, actor, input, now)), CERTIFICATE_CONSTRAINTS);
}

async function loadCertificateForManager(tx: DbOrTx, actor: TrainingActor, certificateId: string): Promise<CertificateRow> {
  const [cert] = await tx.select().from(certificates).where(eq(certificates.id, certificateId)).limit(1).for("update");
  if (!cert) throw notFoundError("Certificate not found.");
  if (isInstitutionActor(actor)) {
    if (actor.orgType !== "institution" || cert.issuerOrganizationId !== actor.organization.id || !actor.permissions.has("institution.certificates.issue")) throw forbiddenError();
  } else if (!staffCan(actor, "training.certificates")) {
    throw forbiddenError();
  }
  return cert;
}

async function revokeInTx(tx: DbOrTx, actor: TrainingActor, cert: CertificateRow, reason: string, now: Date): Promise<void> {
  if (cert.status === "revoked") throw invalidStateError("This certificate is already revoked.");
  await tx.update(certificates).set({ status: "revoked", revokedAt: now, revokedReason: reason, revokedByUserId: trainingActorUserId(actor) }).where(eq(certificates.id, cert.id));
  await tx
    .update(candidateCredentials)
    .set({ verificationStatus: "rejected", rejectionReason: "The issuer revoked this certificate." })
    .where(eq(candidateCredentials.certificateId, cert.id));
  const identity = (await candidateIdentities([cert.candidateId], tx)).get(cert.candidateId);
  if (identity) {
    await notify(
      { event: "training.certificate_revoked", recipients: [{ userId: identity.userId }], data: { title: cert.title, certificateCode: cert.code, reason }, link: "/talent/certificates" },
      { tx },
    );
  }
  await audit({
    action: "certificate.revoked",
    entityType: "certificate",
    entityId: cert.id,
    organizationId: cert.issuerOrganizationId,
    actorUserId: trainingActorUserId(actor),
    metadata: { code: cert.code, reason },
    tx,
  });
}

/** Revoke a certificate (staff training.certificates: any; institutions: their own). The reason is shown to the holder. */
export async function revokeCertificate(actor: TrainingActor, certificateId: string, reason: string, now: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const cert = await loadCertificateForManager(tx, actor, certificateId);
    await revokeInTx(tx, actor, cert, reason, now);
  });
}

/** Correct a certificate: the old one is revoked and a new one issued from the same source (replacesCertificateId). */
export async function reissueCertificate(
  actor: TrainingActor,
  certificateId: string,
  input: { reason: string; title?: string; description?: string; expiresOn?: string; externalCertificateNumber?: string; fileId?: string },
  now: Date = new Date(),
): Promise<CertificateRow> {
  return withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const cert = await loadCertificateForManager(tx, actor, certificateId);
        await revokeInTx(tx, actor, cert, input.reason, now);
        return issueCertificateInTx(
          tx,
          actor,
          {
            issuerType: cert.issuerType,
            enrolmentId: cert.skillAssessmentId ? undefined : (cert.enrolmentId ?? undefined),
            skillAssessmentId: cert.skillAssessmentId ?? undefined,
            title: input.title ?? cert.title,
            description: input.description ?? cert.description ?? undefined,
            expiresOn: input.expiresOn,
            externalCertificateNumber: input.externalCertificateNumber ?? cert.externalCertificateNumber ?? undefined,
            fileId: input.fileId,
            replacesCertificateId: cert.id,
          },
          now,
        );
      }),
    CERTIFICATE_CONSTRAINTS,
  );
}

/** The holder may hide (or show again) the public verification of their certificate. */
export async function setCertificatePublicVerification(candidate: CandidateActor, certificateId: string, enabled: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    const [cert] = await tx.select().from(certificates).where(and(eq(certificates.id, certificateId), eq(certificates.candidateId, candidate.candidateId))).limit(1).for("update");
    if (!cert) throw notFoundError("Certificate not found.");
    await tx.update(certificates).set({ publicVerificationEnabled: enabled }).where(eq(certificates.id, cert.id));
    await audit({ action: "certificate.public_verification_changed", entityType: "certificate", entityId: cert.id, actorUserId: candidate.userId, metadata: { enabled }, tx });
  });
}

/**
 * Public verification by code (rate-limit the caller). Returns only what is printed on the certificate:
 * holder, title, issuer and wording, dates and status. Hidden certificates are reported as not found.
 */
export async function verifyCertificateByCode(rawCode: string, now: Date = new Date()): Promise<PublicCertificateVerification> {
  const code = normalizeVerificationCode(rawCode);
  if (!code) return { found: false };
  const [cert] = await db.select().from(certificates).where(eq(certificates.verificationCode, code)).limit(1);
  if (!cert || !cert.publicVerificationEnabled) return { found: false };
  return {
    found: true,
    status: certificateState(cert, now),
    code: cert.code,
    holderName: cert.holderName,
    title: cert.title,
    issuerName: cert.issuerName,
    issuerType: cert.issuerType,
    issuerTypeLabel: CERTIFICATE_ISSUER_TYPE_LABELS[cert.issuerType],
    accreditationBody: cert.issuerType === "accredited_external" ? cert.accreditationBody : null,
    issuedOn: toIsoDate(cert.issuedAt),
    expiresOn: cert.expiresAt ? toIsoDate(cert.expiresAt) : null,
    details: { courseTitle: cert.snapshot.courseTitle, trade: cert.snapshot.trade, process: cert.snapshot.process, position: cert.snapshot.position },
  };
}

/** A candidate's certificates, newest first (People Portal). */
export async function listCandidateCertificates(candidate: CandidateActor): Promise<CandidateCertificateItem[]> {
  const rows = await db.select().from(certificates).where(eq(certificates.candidateId, candidate.candidateId)).orderBy(desc(certificates.issuedAt));
  return rows.map((r) => ({ ...r, verificationCodeDisplay: formatVerificationCode(r.verificationCode), issuerTypeLabel: CERTIFICATE_ISSUER_TYPE_LABELS[r.issuerType] }));
}

/** Certificates issued by an institution (its members with certificates.issue or reports.view) or by anyone (staff training.view). */
export async function listCertificates(
  actor: TrainingActor,
  filters: { status?: CertificateRow["status"]; issuerType?: CertificateIssuerType; courseId?: string; batchId?: string },
  page: PageQuery,
): Promise<Paginated<CertificateRow & { candidateName: string }>> {
  const where: SQL[] = [];
  if (isInstitutionActor(actor)) {
    if (actor.orgType !== "institution" || !(actor.permissions.has("institution.certificates.issue") || actor.permissions.has("institution.reports.view"))) throw forbiddenError();
    where.push(eq(certificates.issuerOrganizationId, actor.organization.id));
  } else if (!staffCan(actor, ["training.view", "training.certificates"], "any")) {
    throw forbiddenError();
  }
  if (filters.status) where.push(eq(certificates.status, filters.status));
  if (filters.issuerType) where.push(eq(certificates.issuerType, filters.issuerType));
  if (filters.courseId) where.push(eq(certificates.courseId, filters.courseId));
  if (filters.batchId) where.push(eq(certificates.batchId, filters.batchId));
  const condition = where.length ? and(...where) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select({ cert: certificates, candidateName: certificates.holderName })
      .from(certificates)
      .where(condition)
      .orderBy(desc(certificates.issuedAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(certificates).where(condition),
  ]);
  return paginated(rows.map((r) => ({ ...r.cert, candidateName: r.candidateName })), total[0]?.value ?? 0, page);
}

/** Active certificates whose printed expiry date has passed become "expired" (daily task). */
export async function expireLapsedCertificates(now: Date = new Date()): Promise<number> {
  const rows = await db
    .update(certificates)
    .set({ status: "expired" })
    .where(and(eq(certificates.status, "active"), isNotNull(certificates.expiresAt), lte(certificates.expiresAt, new Date(now.getTime() - 86_400_000))))
    .returning({ id: certificates.id });
  return rows.length;
}
