/**
 * Candidate privacy rules for organisations (pure, client-safe).
 *
 * Employers and partners see a candidate only within what the candidate allowed:
 *  - discovery (search, talent lists, unlocks) follows candidate_profiles.visibility and the
 *    candidate's blocked organisations;
 *  - names are masked unless the candidate shows full names to employers, or shared the profile
 *    with this organisation (an application) or the organisation unlocked the profile;
 *  - contact details are never part of a card — they are revealed one at a time and logged.
 */
import type { OrgStatus } from "@/db/schema/_constants";
import type { CandidateVisibility } from "@/db/schema/candidates";

/** Privacy settings with the protective defaults used when a candidate has no settings row yet. */
export type CandidatePrivacy = {
  showFullNameToEmployers: boolean;
  showContactToUnlockedOnly: boolean;
  showPhoto: boolean;
  showCurrentEmployer: boolean;
  allowDirectContact: boolean;
  blockedOrganizationIds: readonly string[];
  allowPartnerSubmissions: boolean;
};

export const DEFAULT_CANDIDATE_PRIVACY: Readonly<CandidatePrivacy> = {
  showFullNameToEmployers: false,
  showContactToUnlockedOnly: true,
  showPhoto: false,
  showCurrentEmployer: false,
  allowDirectContact: false,
  blockedOrganizationIds: [],
  allowPartnerSubmissions: false,
};

/** Merge a (possibly missing) privacy row over the defaults. */
export function privacyOrDefault(row: Partial<{ [K in keyof CandidatePrivacy]: CandidatePrivacy[K] | null }> | null | undefined): CandidatePrivacy {
  if (!row) return { ...DEFAULT_CANDIDATE_PRIVACY };
  return {
    showFullNameToEmployers: row.showFullNameToEmployers ?? DEFAULT_CANDIDATE_PRIVACY.showFullNameToEmployers,
    showContactToUnlockedOnly: row.showContactToUnlockedOnly ?? DEFAULT_CANDIDATE_PRIVACY.showContactToUnlockedOnly,
    showPhoto: row.showPhoto ?? DEFAULT_CANDIDATE_PRIVACY.showPhoto,
    showCurrentEmployer: row.showCurrentEmployer ?? DEFAULT_CANDIDATE_PRIVACY.showCurrentEmployer,
    allowDirectContact: row.allowDirectContact ?? DEFAULT_CANDIDATE_PRIVACY.allowDirectContact,
    blockedOrganizationIds: row.blockedOrganizationIds ?? [],
    allowPartnerSubmissions: row.allowPartnerSubmissions ?? DEFAULT_CANDIDATE_PRIVACY.allowPartnerSubmissions,
  };
}

export function isBlockedBy(privacy: Pick<CandidatePrivacy, "blockedOrganizationIds">, organizationId: string | null | undefined): boolean {
  return Boolean(organizationId && privacy.blockedOrganizationIds.includes(organizationId));
}

/** May an organisation discover this candidate in search / lists (no application relationship)? */
export function isDiscoverableByOrg(
  candidate: { visibility: CandidateVisibility; deletedAt: Date | null },
  privacy: Pick<CandidatePrivacy, "blockedOrganizationIds">,
  org: { id: string; status: OrgStatus },
): boolean {
  if (candidate.deletedAt) return false;
  if (isBlockedBy(privacy, org.id)) return false;
  if (candidate.visibility === "public_to_employers") return true;
  if (candidate.visibility === "verified_employers") return org.status === "verified";
  return false;
}

/** "Ravi Kumar Reddy" → "R. K. R." (never reveals the name). */
export function maskPersonName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Candidate";
  return parts
    .slice(0, 3)
    .map((p) => `${p[0]!.toUpperCase()}.`)
    .join(" ");
}

/** Relationship of an organisation to a candidate that widens what it may see. */
export type OrgCandidateRelation = {
  /** The candidate applied to (or was submitted with consent to) one of the organisation's jobs and it was shared. */
  hasSharedApplication: boolean;
  /** The organisation holds an unexpired, unrevoked profile unlock. */
  hasActiveUnlock: boolean;
};

/** Should the organisation see the full name? */
export function canSeeFullName(privacy: Pick<CandidatePrivacy, "showFullNameToEmployers">, relation: OrgCandidateRelation): boolean {
  return privacy.showFullNameToEmployers || relation.hasSharedApplication || relation.hasActiveUnlock;
}

/** May the organisation reveal contact details (each reveal is still logged)? */
export function canRevealContact(privacy: Pick<CandidatePrivacy, "showContactToUnlockedOnly">, relation: OrgCandidateRelation): boolean {
  // Contact details always need a relationship; `showContactToUnlockedOnly = false` does not make
  // them public — it only matters for future direct-contact features.
  void privacy;
  return relation.hasSharedApplication || relation.hasActiveUnlock;
}

/** Unlock validity in days (profile_unlocks.expiresAt). */
export const UNLOCK_VALIDITY_DAYS = 90;
