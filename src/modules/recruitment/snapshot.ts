import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import {
  candidateCredentials,
  candidateEducation,
  candidateExperience,
  candidateLanguages,
  candidatePortfolioItems,
  candidateProfiles,
  candidateSkills,
  educationLevels,
  languages,
  skills,
  users,
} from "@/db/schema";

/**
 * The profile frozen into applications.profileSnapshot when a candidate applies (what the employer
 * reviews, unaffected by later edits). Deliberately excludes identity numbers, date of birth, gender,
 * nationality, legal name, contact details and private reference contacts.
 */
export const PROFILE_SNAPSHOT_VERSION = 1;

export type ProfileSnapshot = {
  version: typeof PROFILE_SNAPSHOT_VERSION;
  capturedAt: string;
  displayName: string;
  headline: string | null;
  about: string | null;
  careerObjective: string | null;
  currentJobTitle: string | null;
  experienceLevel: string | null;
  totalExperienceMonths: number | null;
  location: { countryCode: string | null; stateRegion: string | null; city: string | null };
  availability: string | null;
  availableFrom: string | null;
  noticePeriodDays: number | null;
  willingToRelocate: boolean;
  openToOverseas: boolean;
  passportStatus: string | null;
  verificationLevel: string;
  skills: { name: string; level: string | null; yearsExperience: number | null; verified: boolean; isPrimary: boolean }[];
  languages: { code: string; name: string; proficiency: string; canRead: boolean; canWrite: boolean; canSpeak: boolean }[];
  education: {
    level: string | null;
    qualification: string | null;
    specialisation: string | null;
    institutionName: string;
    boardOrUniversity: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    verificationStatus: string;
  }[];
  experience: {
    employerName: string;
    jobTitle: string;
    countryCode: string | null;
    city: string | null;
    employmentType: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    responsibilities: string | null;
    verificationStatus: string;
  }[];
  credentials: { type: string; name: string; issuer: string | null; issuerType: string; issuedAt: string | null; expiresAt: string | null; verificationStatus: string }[];
  portfolio: { title: string; description: string | null; projectDate: string | null; location: string | null; videoUrl: string | null }[];
};

export async function buildProfileSnapshot(candidateId: string, tx: DbOrTx = db, now: Date = new Date()): Promise<ProfileSnapshot> {
  const [profile] = await tx
    .select({ profile: candidateProfiles, displayName: users.displayName })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(eq(candidateProfiles.id, candidateId))
    .limit(1);
  if (!profile) throw new Error(`buildProfileSnapshot: candidate ${candidateId} not found`);
  const p = profile.profile;

  // Sequential on purpose: inside a transaction all queries share one connection.
  const skillRows = await tx
    .select({ name: skills.name, level: candidateSkills.level, yearsExperience: candidateSkills.yearsExperience, verified: candidateSkills.verified, isPrimary: candidateSkills.isPrimary })
    .from(candidateSkills)
    .innerJoin(skills, eq(skills.id, candidateSkills.skillId))
    .where(eq(candidateSkills.candidateId, candidateId))
    .orderBy(desc(candidateSkills.isPrimary), asc(skills.name));
  const languageRows = await tx
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
    .orderBy(asc(languages.name));
  const educationRows = await tx
    .select({
      level: educationLevels.name,
      qualification: candidateEducation.qualification,
      specialisation: candidateEducation.specialisation,
      institutionName: candidateEducation.institutionName,
      boardOrUniversity: candidateEducation.boardOrUniversity,
      startDate: candidateEducation.startDate,
      endDate: candidateEducation.endDate,
      isCurrent: candidateEducation.isCurrent,
      verificationStatus: candidateEducation.verificationStatus,
    })
    .from(candidateEducation)
    .leftJoin(educationLevels, eq(educationLevels.id, candidateEducation.educationLevelId))
    .where(eq(candidateEducation.candidateId, candidateId))
    .orderBy(asc(candidateEducation.sortOrder));
  const experienceRows = await tx
    .select({
      employerName: candidateExperience.employerName,
      jobTitle: candidateExperience.jobTitle,
      countryCode: candidateExperience.countryCode,
      city: candidateExperience.city,
      employmentType: candidateExperience.employmentType,
      startDate: candidateExperience.startDate,
      endDate: candidateExperience.endDate,
      isCurrent: candidateExperience.isCurrent,
      responsibilities: candidateExperience.responsibilities,
      verificationStatus: candidateExperience.verificationStatus,
    })
    .from(candidateExperience)
    .where(eq(candidateExperience.candidateId, candidateId))
    .orderBy(asc(candidateExperience.sortOrder));
  const credentialRows = await tx
    .select({
      type: candidateCredentials.credentialType,
      name: candidateCredentials.name,
      issuer: candidateCredentials.issuer,
      issuerType: candidateCredentials.issuerType,
      issuedAt: candidateCredentials.issuedAt,
      expiresAt: candidateCredentials.expiresAt,
      verificationStatus: candidateCredentials.verificationStatus,
    })
    .from(candidateCredentials)
    .where(and(eq(candidateCredentials.candidateId, candidateId), isNull(candidateCredentials.deletedAt)));
  const portfolioRows = await tx
    .select({
      title: candidatePortfolioItems.title,
      description: candidatePortfolioItems.description,
      projectDate: candidatePortfolioItems.projectDate,
      location: candidatePortfolioItems.location,
      videoUrl: candidatePortfolioItems.videoUrl,
    })
    .from(candidatePortfolioItems)
    .where(and(eq(candidatePortfolioItems.candidateId, candidateId), eq(candidatePortfolioItems.isPublic, true), isNull(candidatePortfolioItems.deletedAt)))
    .orderBy(asc(candidatePortfolioItems.sortOrder));

  return {
    version: PROFILE_SNAPSHOT_VERSION,
    capturedAt: now.toISOString(),
    displayName: profile.displayName,
    headline: p.headline,
    about: p.about,
    careerObjective: p.careerObjective,
    currentJobTitle: p.currentJobTitle,
    experienceLevel: p.experienceLevel,
    totalExperienceMonths: p.totalExperienceMonths,
    location: { countryCode: p.currentCountryCode, stateRegion: p.stateRegion, city: p.city },
    availability: p.availability,
    availableFrom: p.availableFrom,
    noticePeriodDays: p.noticePeriodDays,
    willingToRelocate: p.willingToRelocate,
    openToOverseas: p.openToOverseas,
    passportStatus: p.passportStatus,
    verificationLevel: p.verificationLevel,
    skills: skillRows,
    languages: languageRows,
    education: educationRows,
    experience: experienceRows,
    credentials: credentialRows,
    portfolio: portfolioRows,
  };
}
