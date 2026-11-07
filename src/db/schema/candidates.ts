/**
 * Candidate (People Portal) domain: the candidate profile and everything a candidate owns —
 * education, experience, skills, languages, documents, credentials, portfolio, privacy settings
 * and preferred work locations.
 * Layer 8 — may import: taxonomy, core, identity, organizations, system (+ employers, partners).
 * Never import from a later layer (see docs/DATA_MODEL.md → Layering).
 *
 * Privacy rules baked into this schema (docs/CONVENTIONS.md §0.3 and §11):
 *  - Contact details stay on `users`. Organisations see them only through consent + entitlement
 *    (an application, or a profile unlock) and every reveal is logged with logDataAccess().
 *  - Identity numbers are stored encrypted (`*Encrypted`, AES-256-GCM via encryptField()) next to a
 *    non-sensitive `*Last4` used for display. They are never indexed or searchable; the only lookup
 *    is the keyed passport hash, used for duplicate detection.
 *  - Gender and date of birth are optional and self-declared. They are never indexed, never part of
 *    a search vector and must never be used to filter, match or rank candidates.
 *  - Employer / partner / public queries must honour candidate_profiles.visibility and
 *    candidate_privacy_settings (including blocked organisations).
 *  - Profiles referenced by applications or partner submissions cannot be hard-deleted (restrict
 *    FKs in recruitment.ts); erasure requests anonymise instead (src/modules/privacy).
 */
import { type SQL, sql } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, integer, pgTable, smallint, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, SALARY_PERIODS, WORK_MODES } from "./_constants";
import { countryCode, createdAtOnly, currencyCode, moneyMinor, pk, timestamps, tstz, tsvector } from "./_shared";
import { files, organizations, users } from "./core";
import { countries, currencies, educationLevels, industries, jobCategories, languages, qualificationTypes, skills } from "./taxonomy";

// Empty-array defaults are applied by Drizzle at insert time (`$defaultFn(() => [])`), not by the database:
// drizzle-kit 0.31 cannot round-trip an empty-array column default, so `drizzle-kit push` would re-issue
// ALTER COLUMN ... SET DEFAULT on every run (docs/SCHEMA_NOTES.md). Raw SQL inserts must supply these columns.

// Foreign keys declared with foreignKey({ name }) instead of .references() have an explicit name
// because the generated one would exceed PostgreSQL's 63-byte identifier limit (silently truncated,
// which makes later drizzle-kit pushes drop and re-create the constraint).

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const CANDIDATE_AVAILABILITIES = ["immediate", "within_15_days", "within_30_days", "within_60_days", "not_looking"] as const;
export type CandidateAvailability = (typeof CANDIDATE_AVAILABILITIES)[number];

/**
 * Who may discover the profile in candidate search. Contact details are governed separately
 * (candidate_privacy_settings + application consent / profile unlock), whatever the visibility.
 */
export const CANDIDATE_VISIBILITIES = ["public_to_employers", "verified_employers", "venkat_sai_only", "hidden"] as const;
export type CandidateVisibility = (typeof CANDIDATE_VISIBILITIES)[number];

/** Highest verification Venkat Sai has completed for the profile. Set by staff/services only, never by the candidate. */
export const CANDIDATE_VERIFICATION_LEVELS = ["none", "basic", "documents_verified", "skills_assessed"] as const;
export type CandidateVerificationLevel = (typeof CANDIDATE_VERIFICATION_LEVELS)[number];

/** How the profile came to exist. */
export const CANDIDATE_SOURCES = ["self", "partner", "staff", "import"] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

export const PASSPORT_STATUSES = ["none", "applied", "valid", "expired"] as const;
export type PassportStatus = (typeof PASSPORT_STATUSES)[number];

/**
 * Emigration category printed in Indian passports. ECR ("Emigration Check Required") holders need
 * emigration clearance through eMigrate before taking up employment in ECR-notified countries;
 * ECNR holders do not. `not_applicable` = the candidate does not hold an Indian passport.
 */
export const EMIGRATION_CHECK_STATUSES = ["ecr", "ecnr", "not_applicable"] as const;
export type EmigrationCheckStatus = (typeof EMIGRATION_CHECK_STATUSES)[number];

/** Optional and self-declared. Never used for search, filtering, matching or ranking. */
export const CANDIDATE_GENDERS = ["female", "male", "non_binary", "self_described", "prefer_not_to_say"] as const;
export type CandidateGender = (typeof CANDIDATE_GENDERS)[number];

/** Review state of one item a candidate submitted (education, experience, document, credential). */
export const CANDIDATE_VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected"] as const;
export type CandidateVerificationStatus = (typeof CANDIDATE_VERIFICATION_STATUSES)[number];

export const CANDIDATE_SKILL_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
export type CandidateSkillLevel = (typeof CANDIDATE_SKILL_LEVELS)[number];

/** Where a skill claim comes from. Only `assessment` and `credential` claims can be verified (CHECK). */
export const CANDIDATE_SKILL_SOURCES = ["self", "assessment", "credential"] as const;
export type CandidateSkillSource = (typeof CANDIDATE_SKILL_SOURCES)[number];

export const CANDIDATE_LANGUAGE_PROFICIENCIES = ["basic", "conversational", "fluent", "native"] as const;
export type CandidateLanguageProficiency = (typeof CANDIDATE_LANGUAGE_PROFICIENCIES)[number];

export const CANDIDATE_DOCUMENT_TYPES = [
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
export type CandidateDocumentType = (typeof CANDIDATE_DOCUMENT_TYPES)[number];

export const CANDIDATE_CREDENTIAL_TYPES = ["certificate", "licence", "qualification", "training_completion", "skill_test"] as const;
export type CandidateCredentialType = (typeof CANDIDATE_CREDENTIAL_TYPES)[number];

/**
 * Who issued a credential. A `venkat_sai` credential always points at a certificate issued on this
 * platform (training.certificates) — enforced by CHECK so a Venkat Sai result can never be
 * self-declared — and must never be presented as an external accredited qualification.
 */
export const CANDIDATE_CREDENTIAL_ISSUER_TYPES = ["venkat_sai", "accredited_external", "self_declared"] as const;
export type CandidateCredentialIssuerType = (typeof CANDIDATE_CREDENTIAL_ISSUER_TYPES)[number];

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * One profile per person using the People Portal (1:1 users). Career data, preferences,
 * overseas readiness (passport, emigration category) and discovery settings.
 *
 * Privacy: the passport number is encrypted (+ last 4 for display, + keyed hash used only for
 * duplicate detection). Date of birth, gender, legal name and nationality are excluded from the
 * search vector; nationality is used only for legal eligibility (visa / emigration rules).
 * `skillNamesCache`, `skillsText` and `preferredRolesText` are denormalised by the candidates
 * service whenever skills or preferred roles change: generated columns must be IMMUTABLE, so
 * array_to_string() cannot be used inside the vector expression.
 */
export const candidateProfiles = pgTable(
  "candidate_profiles",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    headline: text(),
    /** Plain text (rendered escaped), not HTML. */
    about: text(),
    careerObjective: text(),
    experienceLevel: text({ enum: EXPERIENCE_LEVELS }),
    totalExperienceMonths: integer(),
    currentJobTitle: text(),
    /** Shown to employers only when candidate_privacy_settings.showCurrentEmployer is true. */
    currentEmployerName: text(),
    industryId: uuid().references(() => industries.id, { onDelete: "set null" }),
    /** job_categories.id values (no FK on array elements; validated by the service). */
    preferredCategoryIds: uuid().array().notNull().$defaultFn(() => []),
    preferredRoles: text().array().notNull().$defaultFn(() => []),
    desiredEmploymentTypes: text({ enum: EMPLOYMENT_TYPES }).array().notNull().$defaultFn(() => []),
    preferredWorkModes: text({ enum: WORK_MODES }).array().notNull().$defaultFn(() => []),
    availability: text({ enum: CANDIDATE_AVAILABILITIES }),
    availableFrom: date({ mode: "string" }),
    noticePeriodDays: smallint(),
    expectedSalaryMinor: moneyMinor(),
    expectedSalaryCurrency: currencyCode().references(() => currencies.code),
    expectedSalaryPeriod: text({ enum: SALARY_PERIODS }),
    currentCountryCode: countryCode().references(() => countries.code),
    stateRegion: text(),
    city: text(),
    nationalityCode: countryCode().references(() => countries.code),
    /** Name exactly as on passport / ID, for offers, visas and travel. Never searchable. */
    legalName: text(),
    /** Sensitive. Optional; never indexed or used for ranking. */
    dateOfBirth: date({ mode: "string" }),
    /** Optional, self-declared; never indexed or used for ranking. */
    gender: text({ enum: CANDIDATE_GENDERS }),
    /** Free text when gender = self_described. */
    genderSelfDescription: text(),
    willingToRelocate: boolean().notNull().default(false),
    openToOverseas: boolean().notNull().default(false),
    passportStatus: text({ enum: PASSPORT_STATUSES }),
    /** encryptField(passportNumber). Reveal only with candidates.view_documents (logged). */
    passportNumberEncrypted: text(),
    passportNumberLast4: text(),
    /** hmacToken(normalisedPassportNumber, "passport"): blind index for duplicate detection only. */
    passportNumberHash: text(),
    passportExpiry: date({ mode: "string" }),
    emigrationCheckStatus: text({ enum: EMIGRATION_CHECK_STATUSES }),
    photoFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    resumeFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    resumeUpdatedAt: tstz(),
    /** 0–100, computed by the candidates service. */
    profileCompleteness: smallint().notNull().default(0),
    /** Privacy by default: discoverable by Venkat Sai staff only until the candidate opts in. */
    visibility: text({ enum: CANDIDATE_VISIBILITIES }).notNull().default("venkat_sai_only"),
    isOpenToWork: boolean().notNull().default(true),
    verificationLevel: text({ enum: CANDIDATE_VERIFICATION_LEVELS }).notNull().default("none"),
    source: text({ enum: CANDIDATE_SOURCES }).notNull().default("self"),
    /**
     * Partner that created / first sourced the profile (informational). Binding attribution for
     * commissions lives in recruitment.candidate_attributions. FK: candidate_profiles_sourced_by_partner_fk.
     */
    sourcedByPartnerOrgId: uuid(),
    /** Staff or partner user who created the profile on the candidate's behalf. */
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    lastActiveAt: tstz(),
    /** Display chips on search cards (maintained by the service from candidate_skills). */
    skillNamesCache: text().array().notNull().$defaultFn(() => []),
    /** Space-separated skill names feeding the search vector (maintained by the service). */
    skillsText: text(),
    /** Space-separated preferred roles feeding the search vector (maintained by the service). */
    preferredRolesText: text(),
    searchVector: tsvector().generatedAlwaysAs(
      (): SQL => sql`setweight(to_tsvector('simple'::regconfig, coalesce(${candidateProfiles.headline}, '') || ' ' || coalesce(${candidateProfiles.currentJobTitle}, '')), 'A')
        || setweight(to_tsvector('simple'::regconfig, coalesce(${candidateProfiles.preferredRolesText}, '') || ' ' || coalesce(${candidateProfiles.skillsText}, '')), 'B')
        || setweight(to_tsvector('simple'::regconfig, coalesce(${candidateProfiles.city}, '') || ' ' || coalesce(${candidateProfiles.stateRegion}, '')), 'C')`,
    ),
    deletedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("candidate_profiles_user_uq").on(t.userId),
    index("candidate_profiles_industry_idx").on(t.industryId),
    index("candidate_profiles_salary_currency_idx").on(t.expectedSalaryCurrency),
    index("candidate_profiles_country_idx").on(t.currentCountryCode),
    index("candidate_profiles_nationality_idx").on(t.nationalityCode),
    index("candidate_profiles_photo_file_idx").on(t.photoFileId),
    index("candidate_profiles_resume_file_idx").on(t.resumeFileId),
    index("candidate_profiles_partner_idx").on(t.sourcedByPartnerOrgId),
    foreignKey({ columns: [t.sourcedByPartnerOrgId], foreignColumns: [organizations.id], name: "candidate_profiles_sourced_by_partner_fk" }).onDelete("set null"),
    index("candidate_profiles_created_by_idx").on(t.createdByUserId),
    index("candidate_profiles_passport_hash_idx").on(t.passportNumberHash).where(sql`${t.passportNumberHash} is not null`),
    index("candidate_profiles_search_idx").using("gin", t.searchVector),
    index("candidate_profiles_categories_idx").using("gin", t.preferredCategoryIds),
    // Employer / staff discovery lists: open-to-work, not deleted, most recently active first.
    index("candidate_profiles_discovery_idx")
      .on(t.visibility, t.lastActiveAt.desc())
      .where(sql`${t.deletedAt} is null and ${t.isOpenToWork}`),
    // Overseas sourcing: open to overseas work, filtered by passport readiness and current country.
    index("candidate_profiles_overseas_idx")
      .on(t.passportStatus, t.currentCountryCode)
      .where(sql`${t.openToOverseas} and ${t.deletedAt} is null`),
    check("candidate_profiles_experience_chk", sql`${t.totalExperienceMonths} >= 0`),
    check("candidate_profiles_notice_period_chk", sql`${t.noticePeriodDays} >= 0`),
    check("candidate_profiles_completeness_chk", sql`${t.profileCompleteness} between 0 and 100`),
    check(
      "candidate_profiles_expected_salary_chk",
      sql`${t.expectedSalaryMinor} is null or (${t.expectedSalaryMinor} >= 0 and ${t.expectedSalaryCurrency} is not null and ${t.expectedSalaryPeriod} is not null)`,
    ),
    check("candidate_profiles_passport_last4_chk", sql`char_length(${t.passportNumberLast4}) <= 4`),
  ],
);

// ---------------------------------------------------------------------------
// Career history
// ---------------------------------------------------------------------------

/**
 * Education history. `endDate` may hold the expected completion date while `isCurrent` is true.
 * Supporting documents are private files; staff verification is recorded per row.
 */
export const candidateEducation = pgTable(
  "candidate_education",
  {
    id: pk(),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    educationLevelId: uuid().references(() => educationLevels.id, { onDelete: "set null" }),
    /** FK: candidate_education_qualification_type_fk. */
    qualificationTypeId: uuid(),
    institutionName: text().notNull(),
    /** Examining board / affiliating university (e.g. State Board, NCVT/SCVT for ITI trades). */
    boardOrUniversity: text(),
    qualification: text(),
    specialisation: text(),
    countryCode: countryCode().references(() => countries.code),
    startDate: date({ mode: "string" }),
    endDate: date({ mode: "string" }),
    isCurrent: boolean().notNull().default(false),
    /** Optional, candidate-provided. */
    gradeOrScore: text(),
    documentFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    verificationStatus: text({ enum: CANDIDATE_VERIFICATION_STATUSES }).notNull().default("unverified"),
    verifiedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    verifiedAt: tstz(),
    /** Staff note on the verification decision (shown to the candidate when rejected). */
    verificationNote: text(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("candidate_education_candidate_idx").on(t.candidateId, t.sortOrder),
    index("candidate_education_level_idx").on(t.educationLevelId),
    index("candidate_education_qualification_type_idx").on(t.qualificationTypeId),
    foreignKey({ columns: [t.qualificationTypeId], foreignColumns: [qualificationTypes.id], name: "candidate_education_qualification_type_fk" }).onDelete(
      "set null",
    ),
    index("candidate_education_country_idx").on(t.countryCode),
    index("candidate_education_document_file_idx").on(t.documentFileId),
    index("candidate_education_verified_by_idx").on(t.verifiedByUserId),
    check("candidate_education_dates_chk", sql`${t.endDate} >= ${t.startDate}`),
  ],
);

/**
 * Work history. Reference contact details are private: visible to the candidate and to staff with
 * candidates.view_contact (logged), never to employers or partners.
 */
export const candidateExperience = pgTable(
  "candidate_experience",
  {
    id: pk(),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    employerName: text().notNull(),
    jobTitle: text().notNull(),
    industryId: uuid().references(() => industries.id, { onDelete: "set null" }),
    /** Trade / role category, used for matching against job categories. */
    jobCategoryId: uuid().references(() => jobCategories.id, { onDelete: "set null" }),
    countryCode: countryCode().references(() => countries.code),
    city: text(),
    employmentType: text({ enum: EMPLOYMENT_TYPES }),
    startDate: date({ mode: "string" }),
    endDate: date({ mode: "string" }),
    isCurrent: boolean().notNull().default(false),
    responsibilities: text(),
    projects: text(),
    achievements: text(),
    evidenceFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    /** Private (see table comment). */
    referenceName: text(),
    /** Private (see table comment). */
    referenceContact: text(),
    verificationStatus: text({ enum: CANDIDATE_VERIFICATION_STATUSES }).notNull().default("unverified"),
    verifiedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    verifiedAt: tstz(),
    verificationNote: text(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("candidate_experience_candidate_idx").on(t.candidateId, t.sortOrder),
    index("candidate_experience_industry_idx").on(t.industryId),
    index("candidate_experience_category_idx").on(t.jobCategoryId),
    index("candidate_experience_country_idx").on(t.countryCode),
    index("candidate_experience_evidence_file_idx").on(t.evidenceFileId),
    index("candidate_experience_verified_by_idx").on(t.verifiedByUserId),
    check("candidate_experience_dates_chk", sql`${t.endDate} >= ${t.startDate}`),
    check("candidate_experience_current_chk", sql`not ${t.isCurrent} or ${t.endDate} is null`),
  ],
);

// ---------------------------------------------------------------------------
// Credentials, skills and languages
// ---------------------------------------------------------------------------

/**
 * Certificates, licences and qualifications the candidate holds. Venkat Sai-issued credentials link
 * to training.certificates and can only be created by the training module (CHECK below); external
 * and self-declared credentials stay "unverified" until staff verify the evidence.
 */
export const candidateCredentials = pgTable(
  "candidate_credentials",
  {
    id: pk(),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    credentialType: text({ enum: CANDIDATE_CREDENTIAL_TYPES }).notNull(),
    name: text().notNull(),
    /** Issuing body as written on the credential. */
    issuer: text(),
    issuerType: text({ enum: CANDIDATE_CREDENTIAL_ISSUER_TYPES }).notNull().default("self_declared"),
    credentialNumber: text(),
    issuedAt: date({ mode: "string" }),
    expiresAt: date({ mode: "string" }),
    fileId: uuid().references(() => files.id, { onDelete: "set null" }),
    /** Soft reference → training.certificates.id (layer 11, later). Required when issuerType = venkat_sai. */
    certificateId: uuid(),
    verificationStatus: text({ enum: CANDIDATE_VERIFICATION_STATUSES }).notNull().default("unverified"),
    verifiedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    verifiedAt: tstz(),
    rejectionReason: text(),
    deletedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("candidate_credentials_candidate_idx").on(t.candidateId),
    index("candidate_credentials_file_idx").on(t.fileId),
    index("candidate_credentials_verified_by_idx").on(t.verifiedByUserId),
    uniqueIndex("candidate_credentials_certificate_uq").on(t.certificateId),
    index("candidate_credentials_review_idx")
      .on(t.createdAt)
      .where(sql`${t.verificationStatus} = 'pending' and ${t.deletedAt} is null`),
    check("candidate_credentials_issuer_chk", sql`${t.issuerType} <> 'venkat_sai' or ${t.certificateId} is not null`),
    check("candidate_credentials_dates_chk", sql`${t.expiresAt} >= ${t.issuedAt}`),
  ],
);

/**
 * Skills from the curated taxonomy. `verified` can only be true for skills backed by a Venkat Sai
 * assessment or a credential (CHECK), never for self-declared claims.
 */
export const candidateSkills = pgTable(
  "candidate_skills",
  {
    id: pk(),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    skillId: uuid()
      .notNull()
      .references(() => skills.id),
    level: text({ enum: CANDIDATE_SKILL_LEVELS }),
    yearsExperience: smallint(),
    isPrimary: boolean().notNull().default(false),
    source: text({ enum: CANDIDATE_SKILL_SOURCES }).notNull().default("self"),
    verified: boolean().notNull().default(false),
    /** Credential that evidences the skill (source = credential). */
    credentialId: uuid().references(() => candidateCredentials.id, { onDelete: "set null" }),
    /** Soft reference → training.skill_assessments.id (layer 11, later) when source = assessment. */
    skillAssessmentId: uuid(),
    verifiedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    unique("candidate_skills_candidate_skill_uq").on(t.candidateId, t.skillId),
    index("candidate_skills_skill_idx").on(t.skillId, t.verified),
    index("candidate_skills_credential_idx").on(t.credentialId),
    // Soft reference lookup: re-check `verified` when an assessment result is revised.
    index("candidate_skills_skill_assessment_idx").on(t.skillAssessmentId),
    check("candidate_skills_years_chk", sql`${t.yearsExperience} between 0 and 60`),
    check("candidate_skills_verified_chk", sql`not ${t.verified} or ${t.source} <> 'self'`),
  ],
);

/** Languages the candidate can work in (important for overseas placements). */
export const candidateLanguages = pgTable(
  "candidate_languages",
  {
    id: pk(),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    languageCode: text()
      .notNull()
      .references(() => languages.code),
    proficiency: text({ enum: CANDIDATE_LANGUAGE_PROFICIENCIES }).notNull(),
    canRead: boolean().notNull().default(false),
    canWrite: boolean().notNull().default(false),
    canSpeak: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("candidate_languages_candidate_language_uq").on(t.candidateId, t.languageCode),
    index("candidate_languages_language_idx").on(t.languageCode, t.proficiency),
  ],
);

// ---------------------------------------------------------------------------
// Documents and portfolio
// ---------------------------------------------------------------------------

/**
 * Identity, education, experience, medical and travel documents (private files).
 * Privacy: document numbers are encrypted (+ last 4); medical documents are health data — store the
 * file only, never diagnoses in columns. Employers can open a document only when the candidate marked
 * it shareable AND an application or unlock entitles them; staff access needs
 * candidates.view_documents and is logged.
 */
export const candidateDocuments = pgTable(
  "candidate_documents",
  {
    id: pk(),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    documentType: text({ enum: CANDIDATE_DOCUMENT_TYPES }).notNull(),
    title: text(),
    fileId: uuid()
      .notNull()
      .references(() => files.id),
    /** encryptField(documentNumber), optional. */
    documentNumberEncrypted: text(),
    documentNumberLast4: text(),
    issuingCountryCode: countryCode().references(() => countries.code),
    issuedAt: date({ mode: "string" }),
    expiresAt: date({ mode: "string" }),
    verificationStatus: text({ enum: CANDIDATE_VERIFICATION_STATUSES }).notNull().default("unverified"),
    verifiedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    verifiedAt: tstz(),
    rejectionReason: text(),
    /** Candidate-controlled. Private by default. */
    isShareableWithEmployers: boolean().notNull().default(false),
    /** Candidate, partner or staff user who uploaded it (uploads on behalf are audited). */
    uploadedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Set by the expiry-reminder task so a candidate is reminded once per document. */
    expiryReminderSentAt: tstz(),
    deletedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("candidate_documents_candidate_idx").on(t.candidateId, t.documentType),
    index("candidate_documents_file_idx").on(t.fileId),
    index("candidate_documents_issuing_country_idx").on(t.issuingCountryCode),
    index("candidate_documents_verified_by_idx").on(t.verifiedByUserId),
    index("candidate_documents_uploaded_by_idx").on(t.uploadedByUserId),
    index("candidate_documents_review_idx")
      .on(t.createdAt)
      .where(sql`${t.verificationStatus} = 'pending' and ${t.deletedAt} is null`),
    index("candidate_documents_expiry_idx")
      .on(t.expiresAt)
      .where(sql`${t.expiresAt} is not null and ${t.deletedAt} is null`),
    check("candidate_documents_last4_chk", sql`char_length(${t.documentNumberLast4}) <= 4`),
    check("candidate_documents_dates_chk", sql`${t.expiresAt} >= ${t.issuedAt}`),
  ],
);

/**
 * Work samples (weld photos, project videos). Media files are private files owned by the candidate;
 * videos are YouTube/Vimeo links only (CHECK) so no arbitrary iframe source can be stored.
 * `isPublic` items are shown wherever the profile itself is visible — never more widely than
 * candidate_profiles.visibility allows.
 */
export const candidatePortfolioItems = pgTable(
  "candidate_portfolio_items",
  {
    id: pk(),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    title: text().notNull(),
    description: text(),
    projectDate: date({ mode: "string" }),
    location: text(),
    /** files.id values (purpose = portfolio_media). No FK on array elements; validated by the service. */
    mediaFileIds: uuid().array().notNull().$defaultFn(() => []),
    videoUrl: text(),
    tags: text().array().notNull().$defaultFn(() => []),
    sortOrder: integer().notNull().default(0),
    isPublic: boolean().notNull().default(true),
    deletedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("candidate_portfolio_items_candidate_idx").on(t.candidateId, t.sortOrder),
    check(
      "candidate_portfolio_items_video_url_chk",
      sql`${t.videoUrl} ~ '^https://((www|m)[.])?(youtube[.]com|youtube-nocookie[.]com|youtu[.]be|vimeo[.]com|player[.]vimeo[.]com)/'`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Privacy settings and preferences
// ---------------------------------------------------------------------------

/**
 * Candidate-controlled disclosure settings (1:1 profile). Defaults are privacy-protective; the
 * candidates service creates the row with the profile. Every employer, partner and public query
 * must apply these settings, including `blockedOrganizationIds` (e.g. the current employer).
 */
export const candidatePrivacySettings = pgTable(
  "candidate_privacy_settings",
  {
    /** PK and FK (candidate_privacy_settings_candidate_fk, cascade). */
    candidateId: uuid().primaryKey(),
    /** false = employers see initials until the candidate applies or the profile is unlocked. */
    showFullNameToEmployers: boolean().notNull().default(false),
    /** Contact details only after an unlock or an application to that organisation. */
    showContactToUnlockedOnly: boolean().notNull().default(true),
    showPhoto: boolean().notNull().default(false),
    showCurrentEmployer: boolean().notNull().default(false),
    /** Employers may message the candidate before an application. */
    allowDirectContact: boolean().notNull().default(false),
    /** organizations.id values that must never see the profile (no FK on array elements). */
    blockedOrganizationIds: uuid().array().notNull().$defaultFn(() => []),
    /**
     * Recruitment partners may submit this candidate to requirements. The service sets it to true for
     * partner-sourced profiles once the candidate's consent is recorded.
     */
    allowPartnerSubmissions: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.candidateId], foreignColumns: [candidateProfiles.id], name: "candidate_privacy_settings_candidate_fk" }).onDelete("cascade"),
  ],
);

/** Where the candidate wants to work, in priority order (key input for overseas matching). */
export const candidatePreferredLocations = pgTable(
  "candidate_preferred_locations",
  {
    id: pk(),
    /** FK: candidate_preferred_locations_candidate_fk (cascade). */
    candidateId: uuid().notNull(),
    countryCode: countryCode()
      .notNull()
      .references(() => countries.code),
    stateRegion: text(),
    city: text(),
    /** 1 = most preferred. */
    priority: smallint().notNull().default(1),
    ...createdAtOnly,
  },
  (t) => [
    // One row per place; a missing region / city counts as one value (NULLS NOT DISTINCT semantics). An
    // expression index instead of `unique().nullsNotDistinct()`, which drizzle-kit 0.31 re-creates on every
    // push; plain columns are written as SQL as well (see docs/SCHEMA_NOTES.md). The leading candidate_id is
    // a plain key column, so this index also serves the FK.
    uniqueIndex("candidate_preferred_locations_place_uq").on(
      sql`${t.candidateId}`,
      sql`${t.countryCode}`,
      sql`coalesce(${t.stateRegion}, '')`,
      sql`coalesce(${t.city}, '')`,
    ),
    foreignKey({ columns: [t.candidateId], foreignColumns: [candidateProfiles.id], name: "candidate_preferred_locations_candidate_fk" }).onDelete(
      "cascade",
    ),
    index("candidate_preferred_locations_country_idx").on(t.countryCode),
    check("candidate_preferred_locations_priority_chk", sql`${t.priority} >= 1`),
  ],
);
