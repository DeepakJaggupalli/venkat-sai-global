import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import type { DbOrTx } from "@/db";
import { organizationDocuments, organizations, organizationVerifications, partnerLicences, partnerProfiles, partnerTerritories } from "@/db/schema";
import type { ApprovalType } from "@/db/schema";
import type { OrgType } from "@/db/schema/_constants";
import { audit } from "@/modules/audit";
import type { ApprovalDecision, ApprovalRequestRow } from "@/modules/approvals/types";
import { notifyOrganization } from "@/modules/notifications";

import { ORG_PERMISSION } from "./access";
import { invalidStateError, notFoundError } from "./errors";
import { ORG_PROFILE_PATH } from "./paths";
import { computeVerificationExpiry, evaluatePartnerLicenceRequirement, statusAfterVerificationDecision, toIsoDate } from "./rules";

/** Approval type used for each organisation type's verification. */
export const VERIFICATION_APPROVAL_TYPE = {
  employer: "employer_verification",
  recruitment_partner: "partner_verification",
  institution: "institution_verification",
} as const satisfies Record<OrgType, ApprovalType>;

export const VERIFICATION_APPROVAL_TYPES = Object.values(VERIFICATION_APPROVAL_TYPE);

/** Payload snapshot stored on the approval request (see service.submitVerification). */
export type VerificationApprovalPayload = {
  verificationId?: string;
  renewal?: boolean;
  [key: string]: unknown;
};

/**
 * Apply an approval-centre decision on an organisation verification. Runs inside the decision
 * transaction (throwing aborts the decision). Notifications are enqueued in the same transaction.
 *
 * approved → organisation verified, verifiedAt = now, verificationExpiresAt = earliest expiry of the
 *   submission's documents and (partners) verified licences; pending documents become accepted.
 *   Partners that perform regulated recruitment need a verified, active recruitment licence.
 * rejected / changes_requested → organisation status + reason (renewals of a still-valid verification
 *   keep the verified status until it lapses; see rules.statusAfterVerificationDecision).
 */
export async function applyVerificationDecision(args: {
  request: ApprovalRequestRow;
  decision: ApprovalDecision;
  reason: string | null;
  actorUserId: string;
  tx: DbOrTx;
  now?: Date;
}): Promise<void> {
  const { request, decision, reason, actorUserId, tx } = args;
  const now = args.now ?? new Date();
  if (request.entityType !== "organization") throw invalidStateError("This approval is not linked to an organisation.");

  const [org] = await tx.select().from(organizations).where(eq(organizations.id, request.entityId)).limit(1).for("update");
  if (!org || org.deletedAt) throw notFoundError("The organisation no longer exists.");
  if (VERIFICATION_APPROVAL_TYPE[org.type] !== request.type) throw invalidStateError("The approval type does not match the organisation type.");
  if (org.status === "suspended") throw invalidStateError("This organisation is suspended. Reactivate it before deciding its verification.");

  const payload = request.payload as VerificationApprovalPayload;
  const verification = await findVerification(tx, org.id, request.id, typeof payload.verificationId === "string" ? payload.verificationId : null);
  if (!verification) throw notFoundError("The verification submission for this request could not be found.");

  const documents = await tx
    .select({ id: organizationDocuments.id, reviewStatus: organizationDocuments.reviewStatus, expiresAt: organizationDocuments.expiresAt })
    .from(organizationDocuments)
    .where(and(eq(organizationDocuments.organizationId, org.id), eq(organizationDocuments.verificationId, verification.id)));

  let verificationExpiresAt: Date | null = null;
  if (decision === "approved") {
    const licences =
      org.type === "recruitment_partner"
        ? await tx.select().from(partnerLicences).where(and(eq(partnerLicences.organizationId, org.id), isNull(partnerLicences.deletedAt)))
        : [];
    if (org.type === "recruitment_partner") {
      const [profile] = await tx.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, org.id)).limit(1);
      const territories = await tx
        .select({ countryCode: partnerTerritories.countryCode, scope: partnerTerritories.scope })
        .from(partnerTerritories)
        .where(eq(partnerTerritories.organizationId, org.id));
      const licence = evaluatePartnerLicenceRequirement({
        homeCountryCode: org.countryCode,
        businessType: profile?.businessType ?? null,
        servicesProvided: profile?.servicesProvided ?? [],
        territories,
        licences,
        today: toIsoDate(now),
        stage: "approval",
      });
      if (licence.required && !licence.satisfied) throw invalidStateError(licence.message);
    }
    verificationExpiresAt = computeVerificationExpiry({ documents, licences });
    if (verificationExpiresAt && verificationExpiresAt.getTime() <= now.getTime()) {
      throw invalidStateError("A document or licence in this submission has already expired. Request changes instead.");
    }
    const pendingDocIds = documents.filter((d) => d.reviewStatus === "pending").map((d) => d.id);
    if (pendingDocIds.length) {
      await tx.update(organizationDocuments).set({ reviewStatus: "accepted" }).where(inArray(organizationDocuments.id, pendingDocIds));
    }
  }

  const outcome = statusAfterVerificationDecision(org, decision, reason, now);
  await tx
    .update(organizationVerifications)
    .set({ status: decision, reviewedByUserId: actorUserId, reviewedAt: now, decisionNotes: reason, validUntil: verificationExpiresAt })
    .where(eq(organizationVerifications.id, verification.id));

  const metadata = { ...(org.metadata ?? {}) };
  if (outcome.verified) delete metadata.verificationExpiryReminderSentAt;
  await tx
    .update(organizations)
    .set({
      status: outcome.status,
      statusReason: outcome.statusReason,
      ...(outcome.verified ? { verifiedAt: now, verificationExpiresAt } : {}),
      metadata,
    })
    .where(eq(organizations.id, org.id));

  const event =
    decision === "approved" ? "org.verification_approved" : decision === "rejected" ? "org.verification_rejected" : "org.verification_changes_requested";
  await notifyOrganization(
    {
      event,
      organizationId: org.id,
      permission: ORG_PERMISSION.profile[org.type],
      data: {
        organizationName: org.name,
        reason,
        verificationExpiresAt: verificationExpiresAt?.toISOString() ?? null,
        stillVerified: outcome.status === "verified" && !outcome.verified,
      },
      link: ORG_PROFILE_PATH[org.type],
    },
    { tx },
  );

  await audit({
    action: decision === "approved" ? "organization.verified" : decision === "rejected" ? "organization.verification_rejected" : "organization.verification_changes_requested",
    entityType: "organization",
    entityId: org.id,
    organizationId: org.id,
    actorUserId,
    actorType: "staff",
    metadata: {
      approvalRequestId: request.id,
      verificationId: verification.id,
      previousStatus: org.status,
      status: outcome.status,
      reason,
      verificationExpiresAt: verificationExpiresAt?.toISOString() ?? null,
    },
    tx,
  });
}

async function findVerification(tx: DbOrTx, organizationId: string, approvalRequestId: string, verificationId: string | null) {
  if (verificationId) {
    const [row] = await tx
      .select()
      .from(organizationVerifications)
      .where(and(eq(organizationVerifications.id, verificationId), eq(organizationVerifications.organizationId, organizationId)))
      .limit(1);
    if (row) return row;
  }
  const [latest] = await tx
    .select()
    .from(organizationVerifications)
    .where(
      and(
        eq(organizationVerifications.organizationId, organizationId),
        eq(organizationVerifications.approvalRequestId, approvalRequestId),
        inArray(organizationVerifications.status, ["submitted", "under_review"]),
      ),
    )
    .orderBy(desc(organizationVerifications.submittedAt))
    .limit(1);
  return latest ?? null;
}
