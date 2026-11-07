import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { candidatePrivacySettings, candidateProfiles } from "@/db/schema";
import type { CandidateVisibility } from "@/db/schema/candidates";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";
import { getConsentState, recordConsent } from "@/modules/identity/consent";
import { revokeUnlocksForCandidate } from "@/modules/recruitment/unlocks";
import { getSetting } from "@/modules/settings";

import { auditContext, lockCandidateTarget, type CandidateTarget } from "./actor";
import { refreshCandidateDerived } from "./derived";
import { revokeOrganizationProfileGrants, revokeProfileGrantsForFiles } from "./file-grants";
import { DEFAULT_PRIVACY_FLAGS } from "./policy";
import { assertOrganizations } from "./refs";
import type { CandidateConsentsInput, PrivacySettingsInput, VisibilityInput } from "./schemas";
import type { CandidateActor, CandidatePrivacySettingsRow, CandidateProfileRow } from "./types";

/**
 * Candidate-controlled privacy: disclosure settings, blocked organisations, discoverability and the
 * consents a candidate manages from /talent/privacy. Every change is audited; optional purposes are
 * recorded in the consent ledger (one record per purpose, withdrawable in one step).
 */

const DISCOVERABLE: readonly CandidateVisibility[] = ["public_to_employers", "verified_employers"];

async function consentBase(target: CandidateTarget) {
  return {
    userId: target.userId,
    source: target.onBehalf ? "staff_on_behalf" : "talent_privacy_settings",
    policyVersion: await getSetting("privacy.policy_version"),
    contextType: "candidate_profile",
    contextId: target.candidateId,
    capturedByUserId: target.onBehalf ? target.actorUserId : null,
  };
}

/** Disclosure settings + blocked organisations. Blocking revokes the organisation's file access and contact unlock at once. */
export async function updatePrivacySettings(actor: CandidateActor, input: PrivacySettingsInput): Promise<CandidatePrivacySettingsRow> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    await assertOrganizations(input.blockedOrganizationIds, "blockedOrganizationIds", tx);
    const [current] = await tx.select().from(candidatePrivacySettings).where(eq(candidatePrivacySettings.candidateId, target.candidateId)).limit(1);
    const before = current ?? { ...DEFAULT_PRIVACY_FLAGS, blockedOrganizationIds: [] as string[] };

    const values = {
      showFullNameToEmployers: input.showFullNameToEmployers,
      showContactToUnlockedOnly: input.showContactToUnlockedOnly,
      showPhoto: input.showPhoto,
      showCurrentEmployer: input.showCurrentEmployer,
      allowDirectContact: input.allowDirectContact,
      allowPartnerSubmissions: input.allowPartnerSubmissions,
      blockedOrganizationIds: input.blockedOrganizationIds,
    };
    const [row] = await tx
      .insert(candidatePrivacySettings)
      .values({ candidateId: target.candidateId, ...values })
      .onConflictDoUpdate({ target: candidatePrivacySettings.candidateId, set: { ...values, updatedAt: new Date() } })
      .returning();

    const newlyBlocked = input.blockedOrganizationIds.filter((id) => !before.blockedOrganizationIds.includes(id));
    await revokeOrganizationProfileGrants(target.candidateId, newlyBlocked, target.actorUserId, tx);
    if (newlyBlocked.length) {
      await revokeUnlocksForCandidate(target.candidateId, { organizationIds: newlyBlocked, reason: "Candidate blocked the organisation", actorUserId: target.actorUserId, tx });
    }
    if (before.showPhoto && !input.showPhoto) await revokeProfileGrantsForFiles([target.candidate.photoFileId], target.actorUserId, tx);

    if (before.allowPartnerSubmissions !== input.allowPartnerSubmissions) {
      await recordConsent({ ...(await consentBase(target)), purpose: "partner_submission", granted: input.allowPartnerSubmissions }, tx);
    }
    const changed = (Object.keys(values) as (keyof typeof values)[]).filter((key) =>
      key === "blockedOrganizationIds" ? newlyBlocked.length > 0 || before.blockedOrganizationIds.length !== input.blockedOrganizationIds.length : before[key] !== values[key],
    );
    if (changed.length) {
      await audit({
        action: "candidate.privacy_updated",
        entityType: "candidate",
        entityId: target.candidateId,
        metadata: { changed, newlyBlockedOrganizationIds: newlyBlocked, blockedCount: input.blockedOrganizationIds.length, onBehalf: target.onBehalf },
        ...auditContext(target),
        tx,
      });
    }
    return row!;
  });
}

/** Who can discover the profile, and whether the candidate is open to work. Recorded as the profile_discoverable consent. */
export async function updateVisibility(actor: CandidateActor, input: VisibilityInput): Promise<CandidateProfileRow> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const before = target.candidate;
    await tx.update(candidateProfiles).set({ visibility: input.visibility, isOpenToWork: input.isOpenToWork }).where(eq(candidateProfiles.id, target.candidateId));
    const wasDiscoverable = DISCOVERABLE.includes(before.visibility);
    const isDiscoverable = DISCOVERABLE.includes(input.visibility);
    if (wasDiscoverable !== isDiscoverable) {
      await recordConsent({ ...(await consentBase(target)), purpose: "profile_discoverable", granted: isDiscoverable, evidence: { visibility: input.visibility } }, tx);
    }
    if (before.visibility !== input.visibility || before.isOpenToWork !== input.isOpenToWork) {
      await audit({
        action: "candidate.visibility_changed",
        entityType: "candidate",
        entityId: target.candidateId,
        metadata: { from: before.visibility, to: input.visibility, isOpenToWork: input.isOpenToWork, onBehalf: target.onBehalf },
        ...auditContext(target),
        tx,
      });
    }
    const { profile } = await refreshCandidateDerived(target.candidateId, tx);
    return profile;
  });
}

/**
 * Candidate-managed consents: sharing Venkat Sai assessment results with employers and letting
 * Venkat Sai contact the references they listed. Only the candidate can give these.
 */
export async function updateCandidateConsents(actor: CandidateActor, input: CandidateConsentsInput): Promise<void> {
  if (actor.kind !== "self") throw new ActionError("Only the candidate can give or withdraw these consents.", { code: "forbidden" });
  await db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const state = await getConsentState(target.userId, ["share_assessment_results", "contact_references"]);
    const base = await consentBase(target);
    const changes: string[] = [];
    if ((state.share_assessment_results?.granted ?? false) !== input.shareAssessmentResults) {
      await recordConsent({ ...base, purpose: "share_assessment_results", granted: input.shareAssessmentResults }, tx);
      changes.push("share_assessment_results");
    }
    if ((state.contact_references?.granted ?? false) !== input.contactReferences) {
      await recordConsent({ ...base, purpose: "contact_references", granted: input.contactReferences }, tx);
      changes.push("contact_references");
    }
    if (changes.length) {
      await audit({ action: "candidate.consents_updated", entityType: "candidate", entityId: target.candidateId, metadata: { changes, ...input }, ...auditContext(target), tx });
    }
  });
}
