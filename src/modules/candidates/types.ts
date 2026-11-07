/**
 * Candidates module types (client-safe: type-only imports from server modules are erased).
 */
import type { EmploymentType, ExperienceLevel, SalaryPeriod, WorkMode } from "@/db/schema/_constants";
import type {
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
} from "@/db/schema";
import type {
  CandidateAvailability,
  CandidateCredentialIssuerType,
  CandidateCredentialType,
  CandidateDocumentType,
  CandidateGender,
  CandidateLanguageProficiency,
  CandidateSkillLevel,
  CandidateSkillSource,
  CandidateSource,
  CandidateVerificationLevel,
  CandidateVerificationStatus,
  CandidateVisibility,
  EmigrationCheckStatus,
  PassportStatus,
} from "@/db/schema/candidates";
import type { FileSummary } from "@/modules/files/types";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import type { SessionUser } from "@/modules/identity/session";

import type { CompletenessResult } from "./completeness";
import type { CandidateAccess, PrivacyFlags, ViewerKind } from "./policy";

export type CandidateProfileRow = typeof candidateProfiles.$inferSelect;
export type CandidateEducationRow = typeof candidateEducation.$inferSelect;
export type CandidateExperienceRow = typeof candidateExperience.$inferSelect;
export type CandidateSkillRow = typeof candidateSkills.$inferSelect;
export type CandidateLanguageRow = typeof candidateLanguages.$inferSelect;
export type CandidateDocumentRow = typeof candidateDocuments.$inferSelect;
export type CandidateCredentialRow = typeof candidateCredentials.$inferSelect;
export type CandidatePortfolioItemRow = typeof candidatePortfolioItems.$inferSelect;
export type CandidatePrivacySettingsRow = typeof candidatePrivacySettings.$inferSelect;
export type CandidatePreferredLocationRow = typeof candidatePreferredLocations.$inferSelect;

/** What requireCandidate() returns: the signed-in user and their (lazily created) candidate profile. */
export type CandidateSession = { user: SessionUser; candidate: CandidateProfileRow };

/**
 * Who is changing a candidate profile. Candidates edit their own profile (the session proves
 * ownership); staff with candidates.manage edit on the candidate's behalf (audited).
 */
export type CandidateActor =
  | { kind: "self"; user: SessionUser; candidate: CandidateProfileRow }
  | { kind: "staff"; staff: StaffContext; candidateId: string };

/** Who is looking at a candidate profile (see policy.ts for the rules). */
export type CandidateViewer =
  | { kind: "self"; user: SessionUser; candidate: CandidateProfileRow }
  | { kind: "staff"; ctx: StaffContext }
  | { kind: "employer"; ctx: OrgContext<"employer"> }
  | { kind: "partner"; ctx: OrgContext<"recruitment_partner"> };

export type NamedRef = { id: string; name: string };

export type CandidateSkillView = {
  skillId: string;
  name: string;
  level: CandidateSkillLevel | null;
  yearsExperience: number | null;
  isPrimary: boolean;
  verified: boolean;
  source: CandidateSkillSource;
};

export type CandidateLanguageView = {
  code: string;
  name: string;
  proficiency: CandidateLanguageProficiency;
  canRead: boolean;
  canWrite: boolean;
  canSpeak: boolean;
};

export type CandidateEducationView = {
  id: string;
  educationLevel: NamedRef | null;
  qualificationType: NamedRef | null;
  institutionName: string;
  boardOrUniversity: string | null;
  qualification: string | null;
  specialisation: string | null;
  countryCode: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  gradeOrScore: string | null;
  verificationStatus: CandidateVerificationStatus;
  /** Supporting document (self and staff with candidates.view_documents only). */
  document: FileSummary | null;
};

export type CandidateExperienceView = {
  id: string;
  /** Null when hidden (current employer and the candidate chose not to show it). */
  employerName: string | null;
  jobTitle: string;
  industry: NamedRef | null;
  jobCategory: NamedRef | null;
  countryCode: string | null;
  city: string | null;
  employmentType: EmploymentType | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  responsibilities: string | null;
  projects: string | null;
  achievements: string | null;
  verificationStatus: CandidateVerificationStatus;
  /** Evidence file (self and staff with candidates.view_documents only). */
  evidence: FileSummary | null;
  /** Reference contact (self; staff with candidates.view_contact after a logged reveal). */
  reference: { name: string | null; contact: string | null } | null;
};

export type CandidateCredentialView = {
  id: string;
  credentialType: CandidateCredentialType;
  name: string;
  issuer: string | null;
  issuerType: CandidateCredentialIssuerType;
  /** Self and staff only. */
  credentialNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  verificationStatus: CandidateVerificationStatus;
  /** Self and staff only. */
  rejectionReason: string | null;
  /** Self and staff with candidates.view_documents only. */
  file: FileSummary | null;
  /** Platform certificate (issuerType venkat_sai). */
  certificateId: string | null;
};

/** A Venkat Sai trade / skill assessment result — always labelled as such, never as an accredited certification. */
export type CandidateAssessmentView = {
  id: string;
  code: string;
  label: "Venkat Sai assessment";
  trade: string;
  skill: NamedRef | null;
  assessmentType: string;
  process: string | null;
  position: string | null;
  standardReference: string | null;
  result: "pass" | "fail" | "retest" | "pending";
  score: number | null;
  maxScore: number | null;
  completedAt: Date | null;
};

export type CandidatePortfolioView = {
  id: string;
  title: string;
  description: string | null;
  projectDate: string | null;
  location: string | null;
  media: FileSummary[];
  videoUrl: string | null;
  tags: string[];
  isPublic: boolean;
  sortOrder: number;
};

export type CandidateDocumentView = {
  id: string;
  documentType: CandidateDocumentType;
  title: string | null;
  issuingCountryCode: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  verificationStatus: CandidateVerificationStatus;
  /** Self and staff only (shown to the candidate when rejected or sent back for changes). */
  rejectionReason: string | null;
  isShareableWithEmployers: boolean;
  /** Last four characters of the document number (self and staff with candidates.view_documents). */
  numberLast4: string | null;
  file: FileSummary | null;
  createdAt: Date;
};

export type CandidatePreferredLocationView = {
  id: string;
  countryCode: string;
  countryName: string | null;
  stateRegion: string | null;
  city: string | null;
  priority: number;
};

export type CandidateContactView =
  | { state: "full"; email: string | null; phone: string | null; emailVerified: boolean; phoneVerified: boolean }
  | { state: "masked"; email: string | null; phone: string | null; canReveal: true }
  | { state: "hidden"; reason: "unlock_or_application_required" | "permission_required" };

export type CandidateIdentityView = {
  legalName: string | null;
  dateOfBirth: string | null;
  /** Only for the candidate and staff with candidates.manage. */
  gender: CandidateGender | null;
  genderSelfDescription: string | null;
  nationalityCode: string | null;
  passportNumberLast4: string | null;
  passportExpiry: string | null;
  emigrationCheckStatus: EmigrationCheckStatus | null;
};

/** Privacy-aware projection of a candidate profile for one viewer (getCandidateView). */
export type CandidateView = {
  candidateId: string;
  viewer: ViewerKind;
  access: CandidateAccess;
  name: { display: string; full: string | null; masked: boolean };
  photo: FileSummary | null;
  headline: string | null;
  about: string | null;
  careerObjective: string | null;
  currentJobTitle: string | null;
  currentEmployerName: string | null;
  experienceLevel: ExperienceLevel | null;
  totalExperienceMonths: number | null;
  industry: NamedRef | null;
  location: { countryCode: string | null; countryName: string | null; stateRegion: string | null; city: string | null };
  availability: CandidateAvailability | null;
  availableFrom: string | null;
  noticePeriodDays: number | null;
  preferences: {
    categories: NamedRef[];
    roles: string[];
    employmentTypes: EmploymentType[];
    workModes: WorkMode[];
    willingToRelocate: boolean;
    openToOverseas: boolean;
    locations: CandidatePreferredLocationView[];
  };
  expectedSalary: { amountMinor: number; currency: string; period: SalaryPeriod } | null;
  passportStatus: PassportStatus | null;
  verificationLevel: CandidateVerificationLevel;
  isOpenToWork: boolean;
  /** Self and staff only. */
  visibility: CandidateVisibility | null;
  lastActiveAt: Date | null;
  skills: CandidateSkillView[];
  languages: CandidateLanguageView[];
  education: CandidateEducationView[];
  experience: CandidateExperienceView[];
  credentials: CandidateCredentialView[];
  assessments: CandidateAssessmentView[];
  portfolio: CandidatePortfolioView[];
  documents: CandidateDocumentView[];
  resume: FileSummary | null;
  contact: CandidateContactView;
  /** Null unless the viewer may see identity details and asked for them (logged for staff). */
  identity: CandidateIdentityView | null;
  /** Identity details exist and this viewer could reveal them. */
  identityAvailable: boolean;
  /** Staff-only operational data. */
  internal: {
    source: CandidateSource;
    sourcedByPartnerOrgId: string | null;
    createdByUserId: string | null;
    profileCompleteness: number;
    createdAt: Date;
    updatedAt: Date;
    referencesConsent: boolean;
    assessmentSharingConsent: boolean;
    isMinor: boolean;
  } | null;
};

/** One row of candidate search results — masked for employers (no contact, no photo, no identity data). */
export type CandidateCard = {
  candidateId: string;
  /** Initials unless the candidate shows their name to employers (staff always see the name). */
  displayName: string;
  nameMasked: boolean;
  headline: string | null;
  currentJobTitle: string | null;
  experienceLevel: ExperienceLevel | null;
  totalExperienceMonths: number | null;
  location: { countryCode: string | null; countryName: string | null; stateRegion: string | null; city: string | null };
  skills: string[];
  availability: CandidateAvailability | null;
  openToOverseas: boolean;
  passportStatus: PassportStatus | null;
  verificationLevel: CandidateVerificationLevel;
  verifiedCredentialCount: number;
  passedAssessmentCount: number;
  languages: string[];
  expectedSalary: { amountMinor: number; currency: string; period: SalaryPeriod } | null;
  lastActiveAt: Date | null;
  profileCompleteness: number;
  relationship: { applied: boolean; unlocked: boolean };
  /** Staff only. */
  visibility: CandidateVisibility | null;
  rank: number | null;
};

export type CandidateSearchResult = {
  items: CandidateCard[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/** Everything the profile editor needs for the candidate's own profile (self, or staff editing). */
export type CandidateProfileDetail = {
  profile: CandidateProfileRow;
  account: { userId: string; displayName: string; email: string | null; phone: string | null; emailVerified: boolean; phoneVerified: boolean; locale: string };
  privacy: PrivacyFlags & { updatedAt: Date | null };
  completeness: CompletenessResult;
  photo: FileSummary | null;
  resume: FileSummary | null;
  education: CandidateEducationView[];
  experience: CandidateExperienceView[];
  skills: CandidateSkillView[];
  languages: CandidateLanguageView[];
  credentials: CandidateCredentialView[];
  assessments: CandidateAssessmentView[];
  portfolio: CandidatePortfolioView[];
  documents: CandidateDocumentView[];
  preferredLocations: CandidatePreferredLocationView[];
  preferredCategories: NamedRef[];
  isMinor: boolean;
};

/** Portable export of everything the platform holds about a candidate (privacy access / export requests). */
export type CandidateDataExport = {
  formatVersion: 1;
  generatedAt: string;
  account: Record<string, unknown>;
  profile: Record<string, unknown>;
  privacySettings: Record<string, unknown> | null;
  preferredLocations: Record<string, unknown>[];
  education: Record<string, unknown>[];
  experience: Record<string, unknown>[];
  skills: Record<string, unknown>[];
  languages: Record<string, unknown>[];
  credentials: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  portfolio: Record<string, unknown>[];
  assessments: Record<string, unknown>[];
  savedJobs: Record<string, unknown>[];
  jobAlerts: Record<string, unknown>[];
  profileUnlocks: Record<string, unknown>[];
  consents: Record<string, unknown>[];
  /** Files referenced by the records above, for the privacy module to bundle. */
  files: { id: string; name: string; mimeType: string; purpose: string; sizeBytes: number }[];
};
