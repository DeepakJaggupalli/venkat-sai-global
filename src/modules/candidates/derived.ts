import "server-only";

import { eq, inArray, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { candidateProfiles, candidateSkills, jobCategories, skills, users } from "@/db/schema";

import { computeProfileCompleteness, type CompletenessResult } from "./completeness";
import { IDENTITY_DOCUMENT_TYPES } from "./constants";
import { runQueries } from "./db-utils";
import { buildSearchText, computeVerificationLevel } from "./profile-rules";
import type { CandidateProfileRow } from "./types";

/**
 * Maintenance of the denormalised profile columns. Called after EVERY profile change (inside the
 * same transaction) so search and the dashboard never show stale data:
 *   skillNamesCache · skillsText (names + synonyms, feeds the search vector) · preferredRolesText
 *   (roles + preferred category names) · profileCompleteness · verificationLevel
 */

type Counts = {
  experience: number;
  education: number;
  languages: number;
  skills: number;
  unverifiedDocuments: number;
  rejectedDocuments: number;
  identityVerified: boolean;
  passedAssessment: boolean;
};

async function loadCounts(candidateId: string, tx: DbOrTx): Promise<Counts> {
  const identityTypes = sql.join(
    IDENTITY_DOCUMENT_TYPES.map((t) => sql`${t}`),
    sql`, `,
  );
  const result = await tx.execute<Record<string, unknown>>(sql`
    select
      (select count(*)::int from candidate_experience where candidate_id = ${candidateId}) as experience,
      (select count(*)::int from candidate_education where candidate_id = ${candidateId}) as education,
      (select count(*)::int from candidate_languages where candidate_id = ${candidateId}) as languages,
      (select count(*)::int from candidate_skills where candidate_id = ${candidateId}) as skills,
      (select count(*)::int from candidate_documents
        where candidate_id = ${candidateId} and deleted_at is null and verification_status = 'unverified'
          and document_type not in ('resume', 'photo')) as unverified_documents,
      (select count(*)::int from candidate_documents
        where candidate_id = ${candidateId} and deleted_at is null and verification_status = 'rejected') as rejected_documents,
      exists (select 1 from candidate_documents
        where candidate_id = ${candidateId} and deleted_at is null and verification_status = 'verified'
          and document_type in (${identityTypes})) as identity_verified,
      (exists (select 1 from skill_assessments
          where candidate_id = ${candidateId} and status = 'completed' and result = 'pass' and result_published_at is not null)
        or exists (select 1 from candidate_skills where candidate_id = ${candidateId} and verified and source = 'assessment')) as passed_assessment
  `);
  const row = result.rows[0] ?? {};
  return {
    experience: Number(row.experience ?? 0),
    education: Number(row.education ?? 0),
    languages: Number(row.languages ?? 0),
    skills: Number(row.skills ?? 0),
    unverifiedDocuments: Number(row.unverified_documents ?? 0),
    rejectedDocuments: Number(row.rejected_documents ?? 0),
    identityVerified: row.identity_verified === true,
    passedAssessment: row.passed_assessment === true,
  };
}

function scoreProfile(profile: CandidateProfileRow, contactVerified: boolean, counts: Counts): CompletenessResult {
  return computeProfileCompleteness({
    headline: profile.headline,
    about: profile.about,
    careerObjective: profile.careerObjective,
    currentCountryCode: profile.currentCountryCode,
    city: profile.city,
    contactVerified,
    preferredCategoryCount: profile.preferredCategoryIds.length,
    preferredRoleCount: profile.preferredRoles.length,
    desiredEmploymentTypeCount: profile.desiredEmploymentTypes.length,
    preferredWorkModeCount: profile.preferredWorkModes.length,
    availability: profile.availability,
    hasExpectedSalary: profile.expectedSalaryMinor !== null,
    experienceCount: counts.experience,
    isFresher: profile.experienceLevel === "fresher",
    educationCount: counts.education,
    skillCount: counts.skills,
    languageCount: counts.languages,
    hasResume: profile.resumeFileId !== null,
    hasPhoto: profile.photoFileId !== null,
    openToOverseas: profile.openToOverseas,
    passportStatus: profile.passportStatus,
    unverifiedDocumentCount: counts.unverifiedDocuments,
    rejectedDocumentCount: counts.rejectedDocuments,
    visibility: profile.visibility,
  });
}

async function loadProfileWithContact(candidateId: string, tx: DbOrTx) {
  const [row] = await tx
    .select({ profile: candidateProfiles, emailVerifiedAt: users.emailVerifiedAt, phoneVerifiedAt: users.phoneVerifiedAt })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(eq(candidateProfiles.id, candidateId))
    .limit(1);
  return row ? { profile: row.profile, contactVerified: Boolean(row.emailVerifiedAt || row.phoneVerifiedAt) } : null;
}

export type DerivedRefreshResult = {
  completeness: CompletenessResult;
  profile: CandidateProfileRow;
};

type SkillRow = { name: string; synonyms: string[]; isPrimary: boolean; verified: boolean };
export type SkillCaches = { skillNamesCache: string[]; skillsText: string | null };

function loadSkillRows(candidateId: string, tx: DbOrTx): Promise<SkillRow[]> {
  return tx
    .select({ name: skills.name, synonyms: skills.synonyms, isPrimary: candidateSkills.isPrimary, verified: candidateSkills.verified })
    .from(candidateSkills)
    .innerJoin(skills, eq(skills.id, candidateSkills.skillId))
    .where(eq(candidateSkills.candidateId, candidateId));
}

/** Names primary first, then verified, then A–Z; the search text adds every skill's synonyms. */
function skillCachesFrom(rows: readonly SkillRow[]): SkillCaches {
  const ordered = [...rows].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || Number(b.verified) - Number(a.verified) || a.name.localeCompare(b.name));
  return { skillNamesCache: ordered.map((s) => s.name), skillsText: buildSearchText(ordered.flatMap((s) => [s.name, ...s.synonyms])) };
}

/**
 * Recompute only the skill caches (skillNamesCache, skillsText) — for modules that change a profile's skills
 * themselves, e.g. training verifying an assessed skill. refreshCandidateDerived recomputes them as well.
 */
export async function refreshSkillCaches(candidateId: string, tx: DbOrTx = db): Promise<SkillCaches> {
  const caches = skillCachesFrom(await loadSkillRows(candidateId, tx));
  await tx.update(candidateProfiles).set(caches).where(eq(candidateProfiles.id, candidateId));
  return caches;
}

/** Recompute every derived column of a candidate profile and persist it. Throws if the profile does not exist. */
export async function refreshCandidateDerived(candidateId: string, tx: DbOrTx = db): Promise<DerivedRefreshResult> {
  const loaded = await loadProfileWithContact(candidateId, tx);
  if (!loaded) throw new Error(`refreshCandidateDerived: candidate ${candidateId} not found`);
  const { profile, contactVerified } = loaded;

  const [skillRows, counts, categoryRows] = await runQueries(
    tx,
    () => loadSkillRows(candidateId, tx),
    () => loadCounts(candidateId, tx),
    () =>
      profile.preferredCategoryIds.length
        ? tx.select({ name: jobCategories.name }).from(jobCategories).where(inArray(jobCategories.id, profile.preferredCategoryIds))
        : Promise.resolve([] as { name: string }[]),
  );

  const { skillNamesCache, skillsText } = skillCachesFrom(skillRows);
  const preferredRolesText = buildSearchText([...profile.preferredRoles, ...categoryRows.map((c) => c.name)]);

  const completeness = scoreProfile(profile, contactVerified, counts);
  const verificationLevel = computeVerificationLevel({
    contactVerified,
    identityDocumentVerified: counts.identityVerified,
    passedAssessment: counts.passedAssessment,
  });

  const [updated] = await tx
    .update(candidateProfiles)
    .set({ skillNamesCache, skillsText, preferredRolesText, profileCompleteness: completeness.score, verificationLevel })
    .where(eq(candidateProfiles.id, candidateId))
    .returning();
  return { completeness, profile: updated ?? profile };
}

/**
 * Re-evaluate the verification level only (e.g. the training module published an assessment
 * result, or the identity module verified a contact). Cheaper wrappers call refreshCandidateDerived.
 */
export async function recomputeVerificationLevel(candidateId: string, tx: DbOrTx = db): Promise<CandidateProfileRow["verificationLevel"]> {
  const { profile } = await refreshCandidateDerived(candidateId, tx);
  return profile.verificationLevel;
}

/** Compute (without saving) the completeness of a profile — for read paths that must not write. */
export async function computeCandidateCompleteness(candidateId: string, tx: DbOrTx = db): Promise<CompletenessResult | null> {
  const loaded = await loadProfileWithContact(candidateId, tx);
  if (!loaded) return null;
  return scoreProfile(loaded.profile, loaded.contactVerified, await loadCounts(candidateId, tx));
}
