/**
 * Cross-domain enumerations shared by the schema AND the application (client-safe:
 * this file must never import server-only code).
 *
 * Domain-specific enumerations live next to their tables in the domain schema file.
 */

export const ORG_TYPES = ["employer", "recruitment_partner", "institution"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

/** Verification lifecycle shared by organisations (spec 9.1). `draft` = onboarding not submitted yet. */
export const ORG_STATUSES = ["draft", "pending", "under_review", "verified", "rejected", "suspended", "expired"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const USER_STATUSES = ["pending_verification", "active", "suspended", "closed"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Role scopes: platform staff roles + role templates per organisation type. */
export const ROLE_SCOPES = ["platform", ...ORG_TYPES] as const;
export type RoleScope = (typeof ROLE_SCOPES)[number];

export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "internship",
  "apprenticeship",
  "freelance",
  "gig",
  "project_based",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const WORK_MODES = ["on_site", "remote", "hybrid"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const EXPERIENCE_LEVELS = ["fresher", "entry", "mid", "senior", "lead", "executive"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const SALARY_PERIODS = ["hour", "day", "week", "month", "year", "project"] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const SKILL_CATEGORIES = ["technical", "software", "industrial", "trade", "language", "soft"] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const QUALIFICATION_KINDS = ["degree", "diploma", "certificate", "licence", "trade_certificate", "other"] as const;
export type QualificationKind = (typeof QUALIFICATION_KINDS)[number];

/** Market regions used to group destination countries on the Global Reach pages. */
export const MARKET_REGIONS = [
  "india",
  "gcc",
  "middle_east",
  "europe",
  "asia_pacific",
  "africa",
  "north_america",
  "latin_america",
  "oceania",
] as const;
export type MarketRegion = (typeof MARKET_REGIONS)[number];

export const FILE_VISIBILITIES = ["private", "public"] as const;
export type FileVisibility = (typeof FILE_VISIBILITIES)[number];

export const FILE_SCAN_STATUSES = ["pending", "clean", "infected", "not_scanned", "error"] as const;
export type FileScanStatus = (typeof FILE_SCAN_STATUSES)[number];

/** Why a file exists — drives size/type limits and default access rules (src/modules/files). */
export const FILE_PURPOSES = [
  "avatar",
  "resume",
  "candidate_document",
  "candidate_credential",
  "portfolio_media",
  "application_attachment",
  "org_logo",
  "org_document",
  "partner_licence",
  "mobilisation_document",
  "certificate",
  /** Evidence from Venkat Sai / institution practical assessments (test-piece photos, inspection reports). */
  "assessment_evidence",
  /** Evidence of a placement outcome (offer / appointment letter). */
  "placement_evidence",
  "course_material",
  "cms_media",
  "ticket_attachment",
  "message_attachment",
  "invoice",
  "data_export",
  "other",
] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

/**
 * Consent purposes recorded in the append-only consent ledger (identity.consent_records).
 * The latest record per (subject, purpose) is the current state.
 */
export const CONSENT_PURPOSES = [
  "terms_of_service",
  "privacy_notice",
  "marketing_email",
  "marketing_sms",
  "whatsapp_updates",
  "analytics_cookies",
  "session_insights",
  "functional_cookies",
  "profile_discoverable",
  "share_profile_with_employers",
  "partner_submission",
  "overseas_processing",
  "testimonial_publication",
  "media_publication",
  /** Share Venkat Sai trade/skill assessment results with prospective employers. */
  "share_assessment_results",
  /** Contact the references a candidate listed. */
  "contact_references",
  /** Background / document verification with third parties. */
  "background_verification",
  /** Verifiable consent of a parent or lawful guardian for a user under 18 (DPDP Rules 2025, rule 10). */
  "guardian_consent",
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/** The portals of the product (also used for announcements targeting and notifications). */
export const PORTALS = ["public", "talent", "employer", "recruiter", "institution", "admin"] as const;
export type Portal = (typeof PORTALS)[number];
