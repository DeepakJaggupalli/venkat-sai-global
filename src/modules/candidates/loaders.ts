import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import {
  candidateCredentials,
  candidateDocuments,
  candidateEducation,
  candidateExperience,
  candidateLanguages,
  candidatePortfolioItems,
  candidatePreferredLocations,
  candidatePrivacySettings,
  candidateProfiles,
  candidateSkills,
  countries,
  educationLevels,
  industries,
  jobCategories,
  languages,
  qualificationTypes,
  skillAssessments,
  skills,
  users,
} from "@/db/schema";
import { getFiles, toFileSummary, type FileRow } from "@/modules/files";
import type { FileSummary } from "@/modules/files/types";

import { runQueries } from "./db-utils";
import { DEFAULT_PRIVACY_FLAGS, type PrivacyFlags } from "./policy";
import type {
  CandidateAssessmentView,
  CandidateCredentialRow,
  CandidateDocumentRow,
  CandidateEducationRow,
  CandidateExperienceRow,
  CandidateLanguageView,
  CandidatePortfolioItemRow,
  CandidateProfileRow,
  CandidateSkillView,
  NamedRef,
} from "./types";

/**
 * One round of parallel queries that loads a whole candidate profile with the names of everything
 * it references and the file rows it links. Read-only; callers apply access rules (viewer.ts).
 */
export type CandidateBundle = {
  profile: CandidateProfileRow;
  user: {
    id: string;
    displayName: string;
    email: string | null;
    phone: string | null;
    emailVerifiedAt: Date | null;
    phoneVerifiedAt: Date | null;
    status: string;
    locale: string;
    createdAt: Date;
  };
  privacy: PrivacyFlags & { updatedAt: Date | null };
  industry: NamedRef | null;
  countryNames: Map<string, string>;
  education: (CandidateEducationRow & { levelName: string | null; qualificationTypeName: string | null })[];
  experience: (CandidateExperienceRow & { industryName: string | null; categoryName: string | null })[];
  skills: CandidateSkillView[];
  languages: CandidateLanguageView[];
  credentials: CandidateCredentialRow[];
  documents: CandidateDocumentRow[];
  portfolio: CandidatePortfolioItemRow[];
  preferredLocations: { id: string; countryCode: string; stateRegion: string | null; city: string | null; priority: number }[];
  preferredCategories: NamedRef[];
  assessments: CandidateAssessmentView[];
  files: Map<string, FileRow>;
};

export async function loadCandidateBundle(candidateId: string, tx: DbOrTx = db): Promise<CandidateBundle | null> {
  const [head] = await tx
    .select({ profile: candidateProfiles, user: users, privacy: candidatePrivacySettings, industryName: industries.name })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .leftJoin(candidatePrivacySettings, eq(candidatePrivacySettings.candidateId, candidateProfiles.id))
    .leftJoin(industries, eq(industries.id, candidateProfiles.industryId))
    .where(eq(candidateProfiles.id, candidateId))
    .limit(1);
  if (!head) return null;
  const profile = head.profile;

  const [education, experience, skillRows, languageRows, credentials, documents, portfolio, locations, categories, assessments] = await runQueries(
    tx,
    () =>
      tx
        .select({ row: candidateEducation, levelName: educationLevels.name, qualificationTypeName: qualificationTypes.name })
        .from(candidateEducation)
        .leftJoin(educationLevels, eq(educationLevels.id, candidateEducation.educationLevelId))
        .leftJoin(qualificationTypes, eq(qualificationTypes.id, candidateEducation.qualificationTypeId))
        .where(eq(candidateEducation.candidateId, candidateId))
        .orderBy(asc(candidateEducation.sortOrder), desc(candidateEducation.startDate)),
    () =>
      tx
        .select({ row: candidateExperience, industryName: industries.name, categoryName: jobCategories.name })
        .from(candidateExperience)
        .leftJoin(industries, eq(industries.id, candidateExperience.industryId))
        .leftJoin(jobCategories, eq(jobCategories.id, candidateExperience.jobCategoryId))
        .where(eq(candidateExperience.candidateId, candidateId))
        .orderBy(asc(candidateExperience.sortOrder), desc(candidateExperience.startDate)),
    () =>
      tx
        .select({
          skillId: candidateSkills.skillId,
          name: skills.name,
          level: candidateSkills.level,
          yearsExperience: candidateSkills.yearsExperience,
          isPrimary: candidateSkills.isPrimary,
          verified: candidateSkills.verified,
          source: candidateSkills.source,
        })
        .from(candidateSkills)
        .innerJoin(skills, eq(skills.id, candidateSkills.skillId))
        .where(eq(candidateSkills.candidateId, candidateId))
        .orderBy(desc(candidateSkills.isPrimary), desc(candidateSkills.verified), asc(skills.name)),
    () =>
      tx
        .select({
          code: candidateLanguages.languageCode,
          name: languages.name,
          proficiency: candidateLanguages.proficiency,
          canRead: candidateLanguages.canRead,
          canWrite: candidateLanguages.canWrite,
          canSpeak: candidateLanguages.canSpeak,
        })
        .from(candidateLanguages)
        .innerJoin(languages, eq(languages.code, candidateLanguages.languageCode))
        .where(eq(candidateLanguages.candidateId, candidateId))
        .orderBy(asc(languages.name)),
    () =>
      tx
        .select()
        .from(candidateCredentials)
        .where(and(eq(candidateCredentials.candidateId, candidateId), isNull(candidateCredentials.deletedAt)))
        .orderBy(desc(candidateCredentials.issuedAt), desc(candidateCredentials.createdAt)),
    () =>
      tx
        .select()
        .from(candidateDocuments)
        .where(and(eq(candidateDocuments.candidateId, candidateId), isNull(candidateDocuments.deletedAt)))
        .orderBy(asc(candidateDocuments.documentType), desc(candidateDocuments.createdAt)),
    () =>
      tx
        .select()
        .from(candidatePortfolioItems)
        .where(and(eq(candidatePortfolioItems.candidateId, candidateId), isNull(candidatePortfolioItems.deletedAt)))
        .orderBy(asc(candidatePortfolioItems.sortOrder)),
    () =>
      tx
        .select({
          id: candidatePreferredLocations.id,
          countryCode: candidatePreferredLocations.countryCode,
          stateRegion: candidatePreferredLocations.stateRegion,
          city: candidatePreferredLocations.city,
          priority: candidatePreferredLocations.priority,
        })
        .from(candidatePreferredLocations)
        .where(eq(candidatePreferredLocations.candidateId, candidateId))
        .orderBy(asc(candidatePreferredLocations.priority)),
    () =>
      profile.preferredCategoryIds.length
        ? tx.select({ id: jobCategories.id, name: jobCategories.name }).from(jobCategories).where(inArray(jobCategories.id, profile.preferredCategoryIds))
        : Promise.resolve([] as NamedRef[]),
    // Venkat Sai assessments: only completed, published results.
    () =>
      tx
        .select({ row: skillAssessments, skillName: skills.name })
        .from(skillAssessments)
        .leftJoin(skills, eq(skills.id, skillAssessments.skillId))
        .where(and(eq(skillAssessments.candidateId, candidateId), eq(skillAssessments.status, "completed"), isNotNull(skillAssessments.resultPublishedAt)))
        .orderBy(desc(skillAssessments.completedAt)),
  );

  const countryCodes = new Set<string>();
  for (const code of [profile.currentCountryCode, profile.nationalityCode, ...locations.map((l) => l.countryCode)]) if (code) countryCodes.add(code);
  const countryRows = countryCodes.size
    ? await tx.select({ code: countries.code, name: countries.name }).from(countries).where(inArray(countries.code, [...countryCodes]))
    : [];

  const fileIds = new Set<string>();
  const addFile = (id: string | null | undefined) => {
    if (id) fileIds.add(id);
  };
  addFile(profile.photoFileId);
  addFile(profile.resumeFileId);
  education.forEach((e) => addFile(e.row.documentFileId));
  experience.forEach((e) => addFile(e.row.evidenceFileId));
  credentials.forEach((c) => addFile(c.fileId));
  documents.forEach((d) => addFile(d.fileId));
  portfolio.forEach((p) => p.mediaFileIds.forEach(addFile));
  const fileRows = fileIds.size ? await getFiles([...fileIds], tx) : [];

  const privacy = head.privacy;
  return {
    profile,
    user: {
      id: head.user.id,
      displayName: head.user.displayName,
      email: head.user.email,
      phone: head.user.phone,
      emailVerifiedAt: head.user.emailVerifiedAt,
      phoneVerifiedAt: head.user.phoneVerifiedAt,
      status: head.user.status,
      locale: head.user.locale,
      createdAt: head.user.createdAt,
    },
    privacy: privacy
      ? {
          showFullNameToEmployers: privacy.showFullNameToEmployers,
          showContactToUnlockedOnly: privacy.showContactToUnlockedOnly,
          showPhoto: privacy.showPhoto,
          showCurrentEmployer: privacy.showCurrentEmployer,
          allowDirectContact: privacy.allowDirectContact,
          blockedOrganizationIds: privacy.blockedOrganizationIds,
          allowPartnerSubmissions: privacy.allowPartnerSubmissions,
          updatedAt: privacy.updatedAt,
        }
      : { ...DEFAULT_PRIVACY_FLAGS, updatedAt: null },
    industry: profile.industryId && head.industryName ? { id: profile.industryId, name: head.industryName } : null,
    countryNames: new Map(countryRows.map((c) => [c.code, c.name])),
    education: education.map((e) => ({ ...e.row, levelName: e.levelName, qualificationTypeName: e.qualificationTypeName })),
    experience: experience.map((e) => ({ ...e.row, industryName: e.industryName, categoryName: e.categoryName })),
    skills: skillRows,
    languages: languageRows,
    credentials,
    documents,
    portfolio,
    preferredLocations: locations,
    preferredCategories: categories,
    assessments: assessments.map(({ row, skillName }) => ({
      id: row.id,
      code: row.code,
      label: "Venkat Sai assessment" as const,
      trade: row.trade,
      skill: row.skillId && skillName ? { id: row.skillId, name: skillName } : null,
      assessmentType: row.assessmentType,
      process: row.process,
      position: row.position,
      standardReference: row.standardReference,
      result: row.result,
      score: row.score,
      maxScore: row.maxScore,
      completedAt: row.completedAt,
    })),
    files: new Map(fileRows.map((f) => [f.id, f])),
  };
}

/** File row → client summary, or null when the file is missing or deleted. */
export function summarizeFile(bundle: Pick<CandidateBundle, "files">, fileId: string | null | undefined): FileSummary | null {
  if (!fileId) return null;
  const file = bundle.files.get(fileId);
  return file ? toFileSummary(file) : null;
}
