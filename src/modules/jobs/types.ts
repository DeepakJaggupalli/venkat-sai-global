/**
 * Jobs module types (client-safe: type-only imports from server modules are erased).
 */
import type { EmploymentType, ExperienceLevel, SalaryPeriod, WorkMode } from "@/db/schema/_constants";
import type { jobAlerts, jobLocations, jobPromotions, jobs, jobScreeningQuestions, jobSkills } from "@/db/schema";
import type {
  JobAlertCriteria,
  JobApplyMode,
  JobInfoSource,
  JobPostingStatus,
  JobVisaSponsorship,
  ScreeningKnockoutRule,
  ScreeningQuestionOption,
  ScreeningQuestionType,
} from "@/db/schema/jobs";
import type { Paginated } from "@/lib/http";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";

import type { JobDisplayStatus } from "./constants";
import type { RecommendationReason } from "./recommendation-scoring";

export type JobRow = typeof jobs.$inferSelect;
export type JobSkillRow = typeof jobSkills.$inferSelect;
export type JobLocationRow = typeof jobLocations.$inferSelect;
export type JobScreeningQuestionRow = typeof jobScreeningQuestions.$inferSelect;
export type JobAlertRow = typeof jobAlerts.$inferSelect;
export type JobPromotionRow = typeof jobPromotions.$inferSelect;

/** Who changes a job: an employer member (employer.jobs.manage) or Venkat Sai staff (jobs.manage / jobs.approve / jobs.feature). */
export type JobActor = { kind: "employer"; ctx: OrgContext<"employer"> } | { kind: "staff"; ctx: StaffContext };

/**
 * Who is searching: anonymous visitors (public), signed-in candidates (talent: adds saved/applied
 * flags), an employer (its own jobs, any status) or staff (every job).
 */
export type JobSearchAudience =
  | { kind: "public" }
  | { kind: "talent"; userId: string; candidateId?: string | null }
  | { kind: "employer"; ctx: OrgContext<"employer"> }
  | { kind: "admin"; ctx: StaffContext };

export type NamedRef = { id: string; name: string };

/** How the employer appears on a job. Confidential jobs never expose the organisation (name, logo, slug, id). */
export type JobEmployerDisplay = {
  confidential: boolean;
  name: string;
  organizationId: string | null;
  slug: string | null;
  logoUrl: string | null;
  logoThumbnailUrl: string | null;
  /** Snapshot taken at publication: the organisation was verified by Venkat Sai. */
  verified: boolean;
  managedByVenkatSai: boolean;
  /** The organisation has a public employer page (link to it). */
  hasPublicPage: boolean;
};

export type JobSalary = { minMinor: number | null; maxMinor: number | null; currency: string; period: SalaryPeriod };

export type JobCard = {
  id: string;
  code: string;
  slug: string;
  title: string;
  summary: string | null;
  employer: JobEmployerDisplay;
  category: NamedRef | null;
  location: { countryCode: string | null; countryName: string | null; stateRegion: string | null; city: string | null; extraLocations: number };
  isOverseas: boolean;
  employmentType: EmploymentType;
  workMode: WorkMode;
  experienceLevel: ExperienceLevel | null;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  /** Null when the salary is hidden from this audience or not stated. */
  salary: JobSalary | null;
  benefits: string[];
  accommodationProvided: boolean | null;
  foodProvided: boolean | null;
  transportProvided: boolean | null;
  visaSponsorship: JobVisaSponsorship;
  openings: number;
  skills: string[];
  publishedAt: Date | null;
  applicationDeadline: Date | null;
  expiresAt: Date | null;
  /** Earliest of the deadline and the listing end. */
  closesAt: Date | null;
  /** Featured right now (labelled "Featured" wherever shown). */
  isFeatured: boolean;
  infoSource: JobInfoSource;
  verifiedEmployer: boolean;
  applyMode: JobApplyMode;
  status: JobPostingStatus;
  displayStatus: JobDisplayStatus;
  /** Employer and admin audiences only. */
  viewCount: number | null;
  applicationCount: number | null;
  /** Employer and admin audiences only: the real organisation behind a confidential job. */
  organizationName: string | null;
  /** Talent audience only. */
  isSaved: boolean | null;
  hasApplied: boolean | null;
};

export type JobFacetBucket = { value: string; label: string; count: number };

export type JobSearchFacets = {
  categories: JobFacetBucket[];
  countries: JobFacetBucket[];
  employmentTypes: JobFacetBucket[];
  workModes: JobFacetBucket[];
  /** Jobs matching the other filters that are overseas / from verified employers. */
  overseas: number;
  verified: number;
};

export type JobSearchResult = Paginated<JobCard> & { facets: JobSearchFacets | null };

export type JobLocationView = { countryCode: string; countryName: string | null; stateRegion: string | null; city: string | null; openings: number | null };

/** A screening question as shown to applicants (knockout rules are never exposed). */
export type PublicScreeningQuestion = {
  id: string;
  question: string;
  helpText: string | null;
  type: ScreeningQuestionType;
  options: ScreeningQuestionOption[];
  isRequired: boolean;
};

export type RecruitingAgentDisplay = { name: string; certificateNumber: string; validUntil: string | null };

/** Everything the public / People Portal job page shows. */
export type PublicJobDetail = JobCard & {
  descriptionHtml: string | null;
  responsibilities: string | null;
  qualificationsText: string | null;
  industry: NamedRef | null;
  minEducationLevel: NamedRef | null;
  sponsorshipDetails: string | null;
  contractDurationMonths: number | null;
  workingHours: string | null;
  recruitmentProcess: string | null;
  startDate: string | null;
  externalApplyUrl: string | null;
  screeningRequired: boolean;
  screeningQuestions: PublicScreeningQuestion[];
  locations: JobLocationView[];
  skillDetails: { id: string; name: string; isRequired: boolean; minYears: number | null }[];
  /** Overseas jobs advertised by or for a recruiting agent: verified, unexpired certificate only. */
  recruitingAgent: RecruitingAgentDisplay | null;
  employerProfile: { about: string | null; website: string | null; country: string | null; industry: string | null } | null;
};

export type JobScreeningQuestionView = PublicScreeningQuestion & { knockout: ScreeningKnockoutRule | null; sortOrder: number };

/** A job as its employer (or staff) sees it in the editor and the management pages. */
export type ManagedJobDetail = {
  job: JobRow;
  displayStatus: JobDisplayStatus;
  organization: { id: string; name: string; status: string } | null;
  category: NamedRef | null;
  industry: NamedRef | null;
  skills: { id: string; name: string; isRequired: boolean; minYears: number | null; sortOrder: number }[];
  locations: (JobLocationView & { id: string; sortOrder: number })[];
  screeningQuestions: JobScreeningQuestionView[];
  /** Latest publication review (status + reviewer's reason) — never internal approval notes. */
  latestReview: { code: string; status: string; reason: string | null; decidedAt: Date | null; createdAt: Date } | null;
  activePromotions: { id: string; type: string; startsAt: Date; endsAt: Date | null; sourceType: string }[];
};

export type RecommendedJob = { job: JobCard; score: number; reasons: RecommendationReason[] };

export type JobAlertView = {
  id: string;
  name: string;
  criteria: JobAlertCriteria;
  frequency: JobAlertRow["frequency"];
  channels: JobAlertRow["channels"];
  isActive: boolean;
  lastSentAt: Date | null;
  createdAt: Date;
};
