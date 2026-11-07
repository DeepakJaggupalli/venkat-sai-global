import "server-only";

import { and, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { applications, candidatePrivacySettings, candidateProfiles, jobs, profileUnlocks, users, type CandidateVisibility } from "@/db/schema";

import { canSeeFullName, maskPersonName, privacyOrDefault, type CandidatePrivacy, type OrgCandidateRelation } from "./visibility";

/**
 * Candidate cards as an organisation (or staff) may see them: career facts only, names masked
 * unless the candidate allows it or has a relationship with the organisation, photo and current
 * employer only when the candidate shows them. Never contains contact details, date of birth,
 * gender, nationality or identity numbers.
 */
export type CandidateCard = {
  candidateId: string;
  displayName: string;
  nameMasked: boolean;
  photoFileId: string | null;
  headline: string | null;
  currentJobTitle: string | null;
  currentEmployerName: string | null;
  city: string | null;
  stateRegion: string | null;
  countryCode: string | null;
  totalExperienceMonths: number | null;
  experienceLevel: string | null;
  skills: string[];
  verificationLevel: string;
  availability: string | null;
  openToOverseas: boolean;
  passportStatus: string | null;
  isOpenToWork: boolean;
  lastActiveAt: Date | null;
  relation: OrgCandidateRelation;
};

export type CardViewer = { kind: "staff" } | { kind: "organization"; organizationId: string };

type CardRow = {
  candidateId: string;
  displayName: string;
  photoFileId: string | null;
  headline: string | null;
  currentJobTitle: string | null;
  currentEmployerName: string | null;
  city: string | null;
  stateRegion: string | null;
  countryCode: string | null;
  totalExperienceMonths: number | null;
  experienceLevel: string | null;
  skills: string[];
  verificationLevel: string;
  availability: string | null;
  openToOverseas: boolean;
  passportStatus: string | null;
  isOpenToWork: boolean;
  lastActiveAt: Date | null;
  privacy: CandidatePrivacy;
};

export function toCandidateCard(row: CardRow, viewer: CardViewer, relation: OrgCandidateRelation): CandidateCard {
  const staff = viewer.kind === "staff";
  const fullName = staff || canSeeFullName(row.privacy, relation);
  // Photos follow the candidate's setting strictly (reduces bias; the candidates module grants photo access on the same rule).
  const showPhoto = staff || row.privacy.showPhoto;
  const showEmployer = staff || row.privacy.showCurrentEmployer;
  return {
    candidateId: row.candidateId,
    displayName: fullName ? row.displayName : maskPersonName(row.displayName),
    nameMasked: !fullName,
    photoFileId: showPhoto ? row.photoFileId : null,
    headline: row.headline,
    currentJobTitle: row.currentJobTitle,
    currentEmployerName: showEmployer ? row.currentEmployerName : null,
    city: row.city,
    stateRegion: row.stateRegion,
    countryCode: row.countryCode,
    totalExperienceMonths: row.totalExperienceMonths,
    experienceLevel: row.experienceLevel,
    skills: row.skills,
    verificationLevel: row.verificationLevel,
    availability: row.availability,
    openToOverseas: row.openToOverseas,
    passportStatus: row.passportStatus,
    isOpenToWork: row.isOpenToWork,
    lastActiveAt: row.lastActiveAt,
    relation,
  };
}

/** Candidates (of `candidateIds`) with a shared application to one of the organisation's jobs, and with an active unlock. */
export async function loadOrgRelations(organizationId: string, candidateIds: readonly string[], tx: DbOrTx = db, now: Date = new Date()): Promise<Map<string, OrgCandidateRelation>> {
  const map = new Map<string, OrgCandidateRelation>();
  for (const id of candidateIds) map.set(id, { hasSharedApplication: false, hasActiveUnlock: false });
  if (!candidateIds.length) return map;
  // Sequential: `tx` may be a transaction (one connection).
  const shared = await tx
    .selectDistinct({ candidateId: applications.candidateId })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(
      and(
        inArray(applications.candidateId, [...candidateIds]),
        eq(jobs.organizationId, organizationId),
        isNotNull(applications.sharedWithEmployerAt),
        isNotNull(applications.consentToShareAt),
      ),
    );
  const unlocked = await tx
    .select({ candidateId: profileUnlocks.candidateId })
    .from(profileUnlocks)
    .where(
      and(
        eq(profileUnlocks.organizationId, organizationId),
        inArray(profileUnlocks.candidateId, [...candidateIds]),
        isNull(profileUnlocks.revokedAt),
        or(isNull(profileUnlocks.expiresAt), gt(profileUnlocks.expiresAt, now)),
      ),
    );
  for (const r of shared) map.get(r.candidateId)!.hasSharedApplication = true;
  for (const r of unlocked) map.get(r.candidateId)!.hasActiveUnlock = true;
  return map;
}

/** Raw rows for cards (includes privacy settings and deletion state for the caller's visibility checks). */
export async function loadCardRows(candidateIds: readonly string[], tx: DbOrTx = db): Promise<(CardRow & { visibility: CandidateVisibility; deletedAt: Date | null; userId: string })[]> {
  if (!candidateIds.length) return [];
  const rows = await tx
    .select({
      candidateId: candidateProfiles.id,
      userId: candidateProfiles.userId,
      displayName: users.displayName,
      photoFileId: candidateProfiles.photoFileId,
      headline: candidateProfiles.headline,
      currentJobTitle: candidateProfiles.currentJobTitle,
      currentEmployerName: candidateProfiles.currentEmployerName,
      city: candidateProfiles.city,
      stateRegion: candidateProfiles.stateRegion,
      countryCode: candidateProfiles.currentCountryCode,
      totalExperienceMonths: candidateProfiles.totalExperienceMonths,
      experienceLevel: candidateProfiles.experienceLevel,
      skills: candidateProfiles.skillNamesCache,
      verificationLevel: candidateProfiles.verificationLevel,
      availability: candidateProfiles.availability,
      openToOverseas: candidateProfiles.openToOverseas,
      passportStatus: candidateProfiles.passportStatus,
      isOpenToWork: candidateProfiles.isOpenToWork,
      lastActiveAt: candidateProfiles.lastActiveAt,
      visibility: candidateProfiles.visibility,
      deletedAt: candidateProfiles.deletedAt,
      privacy: {
        showFullNameToEmployers: candidatePrivacySettings.showFullNameToEmployers,
        showContactToUnlockedOnly: candidatePrivacySettings.showContactToUnlockedOnly,
        showPhoto: candidatePrivacySettings.showPhoto,
        showCurrentEmployer: candidatePrivacySettings.showCurrentEmployer,
        allowDirectContact: candidatePrivacySettings.allowDirectContact,
        blockedOrganizationIds: candidatePrivacySettings.blockedOrganizationIds,
        allowPartnerSubmissions: candidatePrivacySettings.allowPartnerSubmissions,
      },
    })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .leftJoin(candidatePrivacySettings, eq(candidatePrivacySettings.candidateId, candidateProfiles.id))
    .where(inArray(candidateProfiles.id, [...candidateIds]));
  return rows.map((r) => ({ ...r, privacy: privacyOrDefault(r.privacy) }));
}

/** Cards for candidates, in the order given (missing / deleted candidates are skipped). */
export async function loadCandidateCards(viewer: CardViewer, candidateIds: readonly string[], tx: DbOrTx = db): Promise<CandidateCard[]> {
  const rows = await loadCardRows(candidateIds, tx);
  const relations =
    viewer.kind === "organization" ? await loadOrgRelations(viewer.organizationId, candidateIds, tx) : new Map<string, OrgCandidateRelation>();
  const byId = new Map(rows.map((r) => [r.candidateId, r]));
  return candidateIds.flatMap((id) => {
    const row = byId.get(id);
    if (!row || row.deletedAt) return [];
    return [toCandidateCard(row, viewer, relations.get(id) ?? { hasSharedApplication: false, hasActiveUnlock: false })];
  });
}
