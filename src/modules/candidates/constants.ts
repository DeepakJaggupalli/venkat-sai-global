/**
 * Candidate enumerations and limits (client-safe — no server or schema-table imports).
 *
 * The arrays mirror the enumerations declared next to the tables in src/db/schema/candidates.ts.
 * Forms and client components import them from here so the Drizzle table definitions never end up
 * in a client bundle; the `_…Parity` types below fail the type check if the two lists drift apart.
 */
import type {
  CandidateAvailability,
  CandidateCredentialIssuerType,
  CandidateCredentialType,
  CandidateDocumentType,
  CandidateGender,
  CandidateLanguageProficiency,
  CandidateSkillLevel,
  CandidateSkillSource,
  CandidateVerificationLevel,
  CandidateVerificationStatus,
  CandidateVisibility,
  EmigrationCheckStatus,
  PassportStatus,
} from "@/db/schema/candidates";

export const CANDIDATE_AVAILABILITY_OPTIONS = ["immediate", "within_15_days", "within_30_days", "within_60_days", "not_looking"] as const;
export const CANDIDATE_VISIBILITY_OPTIONS = ["public_to_employers", "verified_employers", "venkat_sai_only", "hidden"] as const;
export const CANDIDATE_VERIFICATION_LEVEL_OPTIONS = ["none", "basic", "documents_verified", "skills_assessed"] as const;
export const PASSPORT_STATUS_OPTIONS = ["none", "applied", "valid", "expired"] as const;
export const EMIGRATION_CHECK_OPTIONS = ["ecr", "ecnr", "not_applicable"] as const;
export const CANDIDATE_GENDER_OPTIONS = ["female", "male", "non_binary", "self_described", "prefer_not_to_say"] as const;
export const VERIFICATION_STATUS_OPTIONS = ["unverified", "pending", "verified", "rejected"] as const;
export const SKILL_LEVEL_OPTIONS = ["beginner", "intermediate", "advanced", "expert"] as const;
export const SKILL_SOURCE_OPTIONS = ["self", "assessment", "credential"] as const;
export const LANGUAGE_PROFICIENCY_OPTIONS = ["basic", "conversational", "fluent", "native"] as const;
export const DOCUMENT_TYPE_OPTIONS = [
  "resume",
  "passport",
  "id_proof",
  "address_proof",
  "education_certificate",
  "experience_letter",
  "medical",
  "police_clearance",
  "visa",
  "photo",
  "other",
] as const;
export const CREDENTIAL_TYPE_OPTIONS = ["certificate", "licence", "qualification", "training_completion", "skill_test"] as const;
export const CREDENTIAL_ISSUER_OPTIONS = ["venkat_sai", "accredited_external", "self_declared", "institution"] as const;
/** Issuer types a candidate may declare. `venkat_sai` and `institution` credentials are created only by the training module. */
export const CANDIDATE_DECLARABLE_ISSUERS = ["accredited_external", "self_declared"] as const;
/** Credentials mirroring a certificate issued on the platform: read-only for the candidate. */
export const PLATFORM_ISSUED_CREDENTIAL_ISSUERS: readonly CandidateCredentialIssuerType[] = ["venkat_sai", "institution"];

type Assert<T extends true> = T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export type _AvailabilityParity = Assert<Same<CandidateAvailability, (typeof CANDIDATE_AVAILABILITY_OPTIONS)[number]>>;
export type _VisibilityParity = Assert<Same<CandidateVisibility, (typeof CANDIDATE_VISIBILITY_OPTIONS)[number]>>;
export type _VerificationLevelParity = Assert<Same<CandidateVerificationLevel, (typeof CANDIDATE_VERIFICATION_LEVEL_OPTIONS)[number]>>;
export type _PassportParity = Assert<Same<PassportStatus, (typeof PASSPORT_STATUS_OPTIONS)[number]>>;
export type _EmigrationParity = Assert<Same<EmigrationCheckStatus, (typeof EMIGRATION_CHECK_OPTIONS)[number]>>;
export type _GenderParity = Assert<Same<CandidateGender, (typeof CANDIDATE_GENDER_OPTIONS)[number]>>;
export type _VerificationStatusParity = Assert<Same<CandidateVerificationStatus, (typeof VERIFICATION_STATUS_OPTIONS)[number]>>;
export type _SkillLevelParity = Assert<Same<CandidateSkillLevel, (typeof SKILL_LEVEL_OPTIONS)[number]>>;
export type _SkillSourceParity = Assert<Same<CandidateSkillSource, (typeof SKILL_SOURCE_OPTIONS)[number]>>;
export type _LanguageParity = Assert<Same<CandidateLanguageProficiency, (typeof LANGUAGE_PROFICIENCY_OPTIONS)[number]>>;
export type _DocumentTypeParity = Assert<Same<CandidateDocumentType, (typeof DOCUMENT_TYPE_OPTIONS)[number]>>;
export type _CredentialTypeParity = Assert<Same<CandidateCredentialType, (typeof CREDENTIAL_TYPE_OPTIONS)[number]>>;
export type _CredentialIssuerParity = Assert<Same<CandidateCredentialIssuerType, (typeof CREDENTIAL_ISSUER_OPTIONS)[number]>>;

/** Profile sections (anchors on /talent/profile and keys for next-best-action hints). */
export const PROFILE_SECTIONS = [
  "personal",
  "professional",
  "preferences",
  "experience",
  "education",
  "skills",
  "languages",
  "credentials",
  "portfolio",
  "documents",
  "locations",
  "resume",
  "photo",
  "privacy",
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

/** Upper bounds that keep profiles readable and protect the database from abuse. */
export const CANDIDATE_LIMITS = {
  skills: 50,
  primarySkills: 5,
  languages: 15,
  education: 20,
  experience: 30,
  credentials: 50,
  documents: 60,
  portfolioItems: 24,
  portfolioMediaPerItem: 10,
  preferredLocations: 10,
  preferredRoles: 10,
  preferredCategories: 10,
  blockedOrganizations: 100,
} as const;

/** Document types that prove identity (drive the `documents_verified` verification level). */
export const IDENTITY_DOCUMENT_TYPES = ["passport", "id_proof"] as const satisfies readonly CandidateDocumentType[];

/** Approval types owned by the candidates module. */
export const CANDIDATE_APPROVAL_TYPES = ["candidate_document", "candidate_credential"] as const;

/** Where the People Portal profile editor lives (anchors are the section keys). */
export const PROFILE_PATH = "/talent/profile";
