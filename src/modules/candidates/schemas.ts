/**
 * Zod schemas for every candidate profile form and query (client-safe).
 *
 * Forms post FormData (createFormAction): blank inputs arrive as undefined, checkboxes via f.bool(),
 * repeated inputs as `name[]`, and list editors (skills, languages, locations) as `name:json`.
 * Section saves REPLACE the section: an optional field left empty clears the stored value — except
 * write-only identity numbers (passport / document numbers), which are kept unless a new value is
 * typed or the matching `clear…` checkbox is ticked.
 */
import { z } from "zod";

import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, SALARY_PERIODS, WORK_MODES } from "@/db/schema/_constants";
import { sp, spAll, type SearchParams } from "@/lib/http";
import { f } from "@/lib/validation";

import {
  CANDIDATE_AVAILABILITY_OPTIONS,
  CANDIDATE_DECLARABLE_ISSUERS,
  CANDIDATE_GENDER_OPTIONS,
  CANDIDATE_LIMITS,
  CANDIDATE_VERIFICATION_LEVEL_OPTIONS,
  CANDIDATE_VISIBILITY_OPTIONS,
  CREDENTIAL_TYPE_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  EMIGRATION_CHECK_OPTIONS,
  LANGUAGE_PROFICIENCY_OPTIONS,
  PASSPORT_STATUS_OPTIONS,
  SKILL_LEVEL_OPTIONS,
} from "./constants";

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

const toArray = (v: unknown): unknown[] => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]);

const dedupe = <T>(values: T[]): T[] => [...new Set(values)];

function enumArray<const T extends readonly [string, ...string[]]>(values: T, max: number) {
  return z.preprocess(toArray, z.array(z.enum(values, { error: "Choose a valid option" })).max(max, `Choose at most ${max}`)).transform(dedupe);
}

function uuidList(max: number) {
  return z.preprocess(toArray, z.array(z.uuid("Invalid identifier")).max(max, `Choose at most ${max}`)).transform(dedupe);
}

function isRealDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** `<input type="date">` (YYYY-MM-DD) or `<input type="month">` (YYYY-MM → first of the month). */
const partialDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}(-\d{2})?$/, "Enter a valid date")
  .transform((v) => (v.length === 7 ? `${v}-01` : v))
  .refine(isRealDate, "Enter a valid date");

const optionalDate = partialDate.optional();

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const optionalCountry = f.countryCode().optional();

/** Tri-state from a select: "yes" | "no" | "" → true | false | null. */
export const triState = z.preprocess((v) => (v === "yes" || v === true || v === "true" ? true : v === "no" || v === false || v === "false" ? false : null), z.boolean().nullable());

/** Identity numbers: letters and digits (spaces, hyphens and slashes are ignored), 4–40 characters. */
const identityNumber = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-/]/g, "").toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{4,40}$/, "Enter the number exactly as printed (letters and digits only)"))
  .optional();

export const idSchema = z.object({ id: z.uuid("Invalid identifier") });
export const reorderSchema = z.object({ ids: uuidList(100) });

// ---------------------------------------------------------------------------
// Profile sections
// ---------------------------------------------------------------------------

export const personalSchema = z
  .object({
    legalName: f.optionalText(150),
    dateOfBirth: optionalDate,
    gender: z.enum(CANDIDATE_GENDER_OPTIONS).optional(),
    genderSelfDescription: f.optionalText(60),
    nationalityCode: optionalCountry,
    currentCountryCode: optionalCountry,
    stateRegion: f.optionalText(120),
    city: f.optionalText(120),
    passportStatus: z.enum(PASSPORT_STATUS_OPTIONS).optional(),
    /** Write-only: left blank keeps the stored number. */
    passportNumber: identityNumber,
    clearPassportNumber: f.bool(),
    passportExpiry: optionalDate,
    emigrationCheckStatus: z.enum(EMIGRATION_CHECK_OPTIONS).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.dateOfBirth) {
      if (v.dateOfBirth > todayIso()) ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Date of birth cannot be in the future" });
      if (v.dateOfBirth < "1900-01-01") ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Enter a valid date of birth" });
    }
    if (v.gender !== "self_described" && v.genderSelfDescription) {
      ctx.addIssue({ code: "custom", path: ["genderSelfDescription"], message: "Only used when you describe your gender yourself" });
    }
    if (v.passportNumber && v.passportStatus !== "valid" && v.passportStatus !== "expired") {
      ctx.addIssue({ code: "custom", path: ["passportStatus"], message: "Set your passport status to valid or expired to save a passport number" });
    }
  });
export type PersonalInput = z.output<typeof personalSchema>;

export const professionalSchema = z.object({
  headline: f.optionalText(120),
  about: f.longText(3000),
  careerObjective: f.longText(1000),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
  experienceYears: f.optionalInt({ min: 0, max: 60 }),
  experienceExtraMonths: f.optionalInt({ min: 0, max: 11 }),
  currentJobTitle: f.optionalText(120),
  currentEmployerName: f.optionalText(150),
  industryId: f.optionalUuid(),
  noticePeriodDays: f.optionalInt({ min: 0, max: 365 }),
});
export type ProfessionalInput = z.output<typeof professionalSchema>;

export const preferencesSchema = z
  .object({
    preferredCategoryIds: uuidList(CANDIDATE_LIMITS.preferredCategories),
    preferredRoles: z
      .preprocess(toArray, z.array(z.string().trim().min(2, "Too short").max(80, "Too long")).max(CANDIDATE_LIMITS.preferredRoles, `Add at most ${CANDIDATE_LIMITS.preferredRoles} roles`))
      .transform((roles) => dedupe(roles.filter(Boolean))),
    desiredEmploymentTypes: enumArray(EMPLOYMENT_TYPES, EMPLOYMENT_TYPES.length),
    preferredWorkModes: enumArray(WORK_MODES, WORK_MODES.length),
    availability: z.enum(CANDIDATE_AVAILABILITY_OPTIONS).optional(),
    availableFrom: optionalDate,
    expectedSalaryAmount: f.optionalAmount(),
    expectedSalaryCurrency: f.currencyCode().optional(),
    expectedSalaryPeriod: z.enum(SALARY_PERIODS).optional(),
    willingToRelocate: f.bool(),
    openToOverseas: f.bool(),
  })
  .superRefine((v, ctx) => {
    if (v.expectedSalaryAmount !== undefined) {
      if (!v.expectedSalaryCurrency) ctx.addIssue({ code: "custom", path: ["expectedSalaryCurrency"], message: "Choose a currency" });
      if (!v.expectedSalaryPeriod) ctx.addIssue({ code: "custom", path: ["expectedSalaryPeriod"], message: "Choose a pay period" });
      if (v.expectedSalaryAmount > 1_000_000_000) ctx.addIssue({ code: "custom", path: ["expectedSalaryAmount"], message: "Enter a realistic amount" });
    }
  });
export type PreferencesInput = z.output<typeof preferencesSchema>;

export const fileRefSchema = z.object({ fileId: f.optionalUuid() });

// ---------------------------------------------------------------------------
// Career history
// ---------------------------------------------------------------------------

export const educationSchema = z
  .object({
    id: f.optionalUuid(),
    educationLevelId: f.optionalUuid(),
    qualificationTypeId: f.optionalUuid(),
    institutionName: f.text({ max: 200, label: "Institution" }),
    boardOrUniversity: f.optionalText(200),
    qualification: f.optionalText(200),
    specialisation: f.optionalText(200),
    countryCode: optionalCountry,
    startDate: optionalDate,
    endDate: optionalDate,
    isCurrent: f.bool(),
    gradeOrScore: f.optionalText(40),
    documentFileId: f.optionalUuid(),
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be after the start date" });
    if (v.startDate && v.startDate > todayIso()) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Start date cannot be in the future" });
  });
export type EducationInput = z.output<typeof educationSchema>;

export const experienceSchema = z
  .object({
    id: f.optionalUuid(),
    employerName: f.text({ max: 150, label: "Employer" }),
    jobTitle: f.text({ max: 120, label: "Job title" }),
    industryId: f.optionalUuid(),
    jobCategoryId: f.optionalUuid(),
    countryCode: optionalCountry,
    city: f.optionalText(120),
    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    startDate: optionalDate,
    endDate: optionalDate,
    isCurrent: f.bool(),
    responsibilities: f.longText(4000),
    projects: f.longText(4000),
    achievements: f.longText(2000),
    evidenceFileId: f.optionalUuid(),
    referenceName: f.optionalText(120),
    referenceContact: f.optionalText(150),
  })
  .superRefine((v, ctx) => {
    if (v.isCurrent && v.endDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Leave the end date empty for your current job" });
    if (v.startDate && v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be after the start date" });
    if (v.startDate && v.startDate > todayIso()) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Start date cannot be in the future" });
  });
export type ExperienceInput = z.output<typeof experienceSchema>;

// ---------------------------------------------------------------------------
// Skills, languages, locations
// ---------------------------------------------------------------------------

export const skillItemSchema = z.object({
  skillId: z.uuid("Choose a skill from the list"),
  level: z.enum(SKILL_LEVEL_OPTIONS).optional().nullable(),
  yearsExperience: f.optionalInt({ min: 0, max: 60 }).nullable(),
  isPrimary: f.bool(),
});
export type SkillItemInput = z.output<typeof skillItemSchema>;

export const skillsSchema = z
  .object({ skills: z.preprocess(toArray, z.array(skillItemSchema).max(CANDIDATE_LIMITS.skills, `Add at most ${CANDIDATE_LIMITS.skills} skills`)) })
  .superRefine((v, ctx) => {
    const ids = v.skills.map((s) => s.skillId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["skills"], message: "Each skill can be added once" });
    if (v.skills.filter((s) => s.isPrimary).length > CANDIDATE_LIMITS.primarySkills) {
      ctx.addIssue({ code: "custom", path: ["skills"], message: `Mark at most ${CANDIDATE_LIMITS.primarySkills} skills as primary` });
    }
  });
export type SkillsInput = z.output<typeof skillsSchema>;

export const languageItemSchema = z.object({
  languageCode: z.string().trim().toLowerCase().min(2).max(12),
  proficiency: z.enum(LANGUAGE_PROFICIENCY_OPTIONS, { error: "Choose your level" }),
  canRead: f.bool(),
  canWrite: f.bool(),
  canSpeak: f.bool(),
});
export const languagesSchema = z
  .object({ languages: z.preprocess(toArray, z.array(languageItemSchema).max(CANDIDATE_LIMITS.languages, `Add at most ${CANDIDATE_LIMITS.languages} languages`)) })
  .superRefine((v, ctx) => {
    const codes = v.languages.map((l) => l.languageCode);
    if (new Set(codes).size !== codes.length) ctx.addIssue({ code: "custom", path: ["languages"], message: "Each language can be added once" });
  });
export type LanguagesInput = z.output<typeof languagesSchema>;

export const preferredLocationItemSchema = z.object({
  countryCode: f.countryCode(),
  stateRegion: f.optionalText(120),
  city: f.optionalText(120),
});
export const preferredLocationsSchema = z
  .object({
    locations: z.preprocess(
      toArray,
      z.array(preferredLocationItemSchema).max(CANDIDATE_LIMITS.preferredLocations, `Add at most ${CANDIDATE_LIMITS.preferredLocations} locations`),
    ),
  })
  .superRefine((v, ctx) => {
    const keys = v.locations.map((l) => `${l.countryCode}|${(l.stateRegion ?? "").toLowerCase()}|${(l.city ?? "").toLowerCase()}`);
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["locations"], message: "Each location can be added once" });
  });
export type PreferredLocationsInput = z.output<typeof preferredLocationsSchema>;

// ---------------------------------------------------------------------------
// Credentials, documents, portfolio
// ---------------------------------------------------------------------------

export const credentialSchema = z
  .object({
    id: f.optionalUuid(),
    credentialType: z.enum(CREDENTIAL_TYPE_OPTIONS, { error: "Choose a type" }),
    name: f.text({ max: 200, label: "Name" }),
    issuer: f.optionalText(200),
    issuerType: z.enum(CANDIDATE_DECLARABLE_ISSUERS).default("self_declared"),
    credentialNumber: f.optionalText(80),
    issuedAt: optionalDate,
    expiresAt: optionalDate,
    fileId: f.optionalUuid(),
    /** Skills on the profile that this credential evidences (verified together with it). */
    linkedSkillIds: uuidList(20),
  })
  .superRefine((v, ctx) => {
    if (v.issuedAt && v.expiresAt && v.expiresAt < v.issuedAt) ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must be after the issue date" });
    if (v.issuedAt && v.issuedAt > todayIso()) ctx.addIssue({ code: "custom", path: ["issuedAt"], message: "Issue date cannot be in the future" });
  });
export type CredentialInput = z.output<typeof credentialSchema>;

export const documentSchema = z
  .object({
    id: f.optionalUuid(),
    documentType: z.enum(DOCUMENT_TYPE_OPTIONS, { error: "Choose a document type" }),
    title: f.optionalText(150),
    /** Required when adding a document; optional when editing (keeps the current file). */
    fileId: f.optionalUuid(),
    documentNumber: identityNumber,
    clearDocumentNumber: f.bool(),
    issuingCountryCode: optionalCountry,
    issuedAt: optionalDate,
    expiresAt: optionalDate,
    isShareableWithEmployers: f.bool(),
  })
  .superRefine((v, ctx) => {
    if (!v.id && !v.fileId) ctx.addIssue({ code: "custom", path: ["fileId"], message: "Upload the document" });
    if (v.issuedAt && v.expiresAt && v.expiresAt < v.issuedAt) ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must be after the issue date" });
    if (v.issuedAt && v.issuedAt > todayIso()) ctx.addIssue({ code: "custom", path: ["issuedAt"], message: "Issue date cannot be in the future" });
  });
export type DocumentInput = z.output<typeof documentSchema>;

export const documentSharingSchema = z.object({ id: z.uuid(), isShareableWithEmployers: f.bool() });

/** YouTube / Vimeo https links only (mirrors candidate_portfolio_items_video_url_chk). */
export const VIDEO_URL_PATTERN = /^https:\/\/((www|m)[.])?(youtube[.]com|youtube-nocookie[.]com|youtu[.]be|vimeo[.]com|player[.]vimeo[.]com)\//;

export const portfolioItemSchema = z.object({
  id: f.optionalUuid(),
  title: f.text({ max: 150, label: "Title" }),
  description: f.longText(2000),
  projectDate: optionalDate,
  location: f.optionalText(150),
  mediaFileIds: uuidList(CANDIDATE_LIMITS.portfolioMediaPerItem),
  videoUrl: z.string().trim().regex(VIDEO_URL_PATTERN, "Use a YouTube or Vimeo link starting with https://").optional(),
  tags: z
    .preprocess(toArray, z.array(z.string().trim().min(1).max(40, "Tags are at most 40 characters")).max(10, "Add at most 10 tags"))
    .transform((tags) => dedupe(tags.map((t) => t.toLowerCase()))),
  isPublic: f.bool(),
});
export type PortfolioItemInput = z.output<typeof portfolioItemSchema>;

// ---------------------------------------------------------------------------
// Privacy and visibility
// ---------------------------------------------------------------------------

export const privacySettingsSchema = z.object({
  showFullNameToEmployers: f.bool(),
  showContactToUnlockedOnly: f.bool(),
  showPhoto: f.bool(),
  showCurrentEmployer: f.bool(),
  allowDirectContact: f.bool(),
  allowPartnerSubmissions: f.bool(),
  blockedOrganizationIds: uuidList(CANDIDATE_LIMITS.blockedOrganizations),
});
export type PrivacySettingsInput = z.output<typeof privacySettingsSchema>;

export const visibilitySchema = z.object({
  visibility: z.enum(CANDIDATE_VISIBILITY_OPTIONS, { error: "Choose who can find your profile" }),
  isOpenToWork: f.bool(),
});
export type VisibilityInput = z.output<typeof visibilitySchema>;

/** Consents a candidate manages from the privacy page (each one recorded separately in the consent ledger). */
export const candidateConsentsSchema = z.object({
  shareAssessmentResults: f.bool(),
  contactReferences: f.bool(),
});
export type CandidateConsentsInput = z.output<typeof candidateConsentsSchema>;

// ---------------------------------------------------------------------------
// Staff actions
// ---------------------------------------------------------------------------

export const itemVerificationSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(["verified", "rejected", "unverified"]),
    note: f.optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.status === "rejected" && !v.note) ctx.addIssue({ code: "custom", path: ["note"], message: "Tell the candidate why it could not be verified" });
  });
export type ItemVerificationInput = z.output<typeof itemVerificationSchema>;

export const revealSchema = z.object({
  candidateId: z.uuid(),
  as: z.enum(["staff", "employer", "partner"]),
  reason: f.optionalText(300),
});

// ---------------------------------------------------------------------------
// Candidate search (employer + staff discovery)
// ---------------------------------------------------------------------------

export const CANDIDATE_SEARCH_SORTS = ["relevance", "recent", "experience", "completeness"] as const;
export type CandidateSearchSort = (typeof CANDIDATE_SEARCH_SORTS)[number];

export const candidateSearchFiltersSchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    skillIds: uuidList(20),
    skillMatch: z.enum(["all", "any"]).default("any"),
    verifiedSkillsOnly: f.bool(),
    experienceMinYears: f.optionalInt({ min: 0, max: 60 }),
    experienceMaxYears: f.optionalInt({ min: 0, max: 60 }),
    countryCode: optionalCountry,
    stateRegion: f.optionalText(120),
    city: f.optionalText(120),
    /** Candidates who list this country among their preferred work locations. */
    preferredCountryCode: optionalCountry,
    availability: enumArray(CANDIDATE_AVAILABILITY_OPTIONS, CANDIDATE_AVAILABILITY_OPTIONS.length),
    languageCodes: z
      .preprocess(toArray, z.array(z.string().trim().toLowerCase().min(2).max(12)).max(10))
      .transform(dedupe),
    minLanguageProficiency: z.enum(LANGUAGE_PROFICIENCY_OPTIONS).optional(),
    /** Minimum education level (by rank). */
    educationLevelId: f.optionalUuid(),
    verifiedCredentialsOnly: f.bool(),
    /** Passed (published) Venkat Sai assessment; employers only see candidates who consented to share results. */
    assessedOnly: f.bool(),
    employmentTypes: enumArray(EMPLOYMENT_TYPES, EMPLOYMENT_TYPES.length),
    workModes: enumArray(WORK_MODES, WORK_MODES.length),
    openToOverseas: f.bool(),
    passportValid: f.bool(),
    /** Budget: expected salary at most this (same currency and period only). */
    salaryMax: f.optionalAmount(),
    salaryCurrency: f.currencyCode().optional(),
    salaryPeriod: z.enum(SALARY_PERIODS).optional(),
    minVerificationLevel: z.enum(CANDIDATE_VERIFICATION_LEVEL_OPTIONS).optional(),
    activeWithinDays: f.optionalInt({ min: 1, max: 730 }),
    /** Searching for an overseas role: minors are excluded (DPDP children's-data rule). */
    forOverseasRole: f.bool(),
    /** Staff with candidates.manage only: include hidden profiles (record management, not sourcing). */
    includeHidden: f.bool(),
    sort: z.enum(CANDIDATE_SEARCH_SORTS).default("relevance"),
    page: f.optionalInt({ min: 1, max: 10_000 }).transform((v) => v ?? 1),
    pageSize: f.optionalInt({ min: 1, max: 50 }).transform((v) => v ?? 20),
  })
  .superRefine((v, ctx) => {
    if (v.experienceMinYears !== undefined && v.experienceMaxYears !== undefined && v.experienceMaxYears < v.experienceMinYears) {
      ctx.addIssue({ code: "custom", path: ["experienceMaxYears"], message: "Maximum must be at least the minimum" });
    }
    if (v.salaryMax !== undefined && (!v.salaryCurrency || !v.salaryPeriod)) {
      ctx.addIssue({ code: "custom", path: ["salaryCurrency"], message: "Choose a currency and pay period for the budget" });
    }
  });
export type CandidateSearchFilters = z.output<typeof candidateSearchFiltersSchema>;
/** Loose input shape (query-string values) — every key optional. */
export type CandidateSearchFiltersInput = Partial<z.input<typeof candidateSearchFiltersSchema>>;

const ARRAY_PARAMS = ["skillIds", "availability", "languageCodes", "employmentTypes", "workModes"] as const;

/**
 * URL search params → validated filters. Invalid values are dropped one key at a time (a bad
 * link never errors the page), so the result always parses.
 */
export function parseCandidateSearchParams(params: SearchParams | undefined): CandidateSearchFilters {
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(candidateSearchFiltersSchema.shape)) {
    raw[key] = (ARRAY_PARAMS as readonly string[]).includes(key) ? spAll(params, key) : sp(params, key);
  }
  // Drop offending keys (and the values that depend on them) until the rest parses.
  const dependents: Record<string, string[]> = { salaryCurrency: ["salaryMax"], salaryPeriod: ["salaryMax"], experienceMaxYears: [] };
  for (let attempt = 0; attempt < 5; attempt++) {
    const parsed = candidateSearchFiltersSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key !== "string") continue;
      delete raw[key];
      for (const dependent of dependents[key] ?? []) delete raw[dependent];
    }
  }
  return candidateSearchFiltersSchema.parse({});
}
