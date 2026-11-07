/**
 * Organisation enumerations and labels for forms and UI (client-safe).
 *
 * The database schema files are the source of truth; these arrays mirror them so client components can
 * import them without pulling Drizzle table definitions into the browser bundle. The type-level parity
 * checks at the bottom fail compilation if a mirror drifts from the schema.
 */
import type { OrgType } from "@/db/schema/_constants";
import type {
  CompanySizeBand,
  EmployerContractFeeModel,
  EmployerContractStatus,
  EmployerContractType,
  OrgSocialLinkKey,
} from "@/db/schema/employers";
import type { MemberStatus, OrgDocumentType } from "@/db/schema/organizations";
import type {
  PartnerAgreementStatus,
  PartnerBusinessType,
  PartnerFeeModel,
  PartnerLicenceType,
  PartnerLicenceVerificationMethod,
  PartnerLicenceVerificationStatus,
  PartnerService,
  PartnerTerritoryScope,
} from "@/db/schema/partners";
import type { InstitutionKind } from "@/db/schema/training";

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  employer: "Employer",
  recruitment_partner: "Recruitment partner",
  institution: "Institution / training provider",
};

export const ORG_DOCUMENT_TYPES = [
  "registration_certificate",
  "tax_registration",
  "recruiting_agent_licence",
  "authorisation_letter",
  "accreditation",
  "affiliation",
  "address_proof",
  "agreement",
  "other",
] as const;

export const ORG_DOCUMENT_TYPE_LABELS: Record<OrgDocumentType, string> = {
  registration_certificate: "Registration certificate / trade licence",
  tax_registration: "Tax registration (GST, VAT, TRN)",
  recruiting_agent_licence: "Recruiting agent licence",
  authorisation_letter: "Authorisation letter",
  accreditation: "Accreditation certificate",
  affiliation: "Affiliation certificate",
  address_proof: "Address proof",
  agreement: "Signed agreement",
  other: "Other document",
};

export const MEMBER_STATUSES = ["invited", "active", "disabled"] as const;

export const COMPANY_SIZE_BANDS = ["1_10", "11_50", "51_200", "201_500", "501_1000", "1001_5000", "5001_10000", "10001_plus"] as const;
export const COMPANY_SIZE_LABELS: Record<CompanySizeBand, string> = {
  "1_10": "1–10 employees",
  "11_50": "11–50 employees",
  "51_200": "51–200 employees",
  "201_500": "201–500 employees",
  "501_1000": "501–1,000 employees",
  "1001_5000": "1,001–5,000 employees",
  "5001_10000": "5,001–10,000 employees",
  "10001_plus": "More than 10,000 employees",
};

export const ORG_SOCIAL_LINK_KEYS = ["linkedin", "facebook", "instagram", "x", "youtube", "whatsapp"] as const;

export const EMPLOYER_CONTRACT_TYPES = [
  "subscription",
  "managed_recruitment",
  "rpo",
  "bulk_supply",
  "enterprise",
  "testing_services",
  "training_services",
] as const;
export const EMPLOYER_CONTRACT_TYPE_LABELS: Record<EmployerContractType, string> = {
  subscription: "Subscription",
  managed_recruitment: "Managed recruitment",
  rpo: "Recruitment process outsourcing",
  bulk_supply: "Bulk manpower supply",
  enterprise: "Enterprise agreement",
  testing_services: "Testing services",
  training_services: "Training services",
};
export const EMPLOYER_CONTRACT_STATUSES = ["draft", "active", "expired", "terminated"] as const;
export const EMPLOYER_CONTRACT_FEE_MODELS = [
  "flat_fee",
  "per_hire",
  "salary_percentage",
  "monthly_retainer",
  "per_worker_month",
  "per_assessment",
  "per_trainee",
  "custom",
] as const;

export const PARTNER_BUSINESS_TYPES = ["agency", "staffing", "sourcing_partner", "travel_partner", "other"] as const;
export const PARTNER_BUSINESS_TYPE_LABELS: Record<PartnerBusinessType, string> = {
  agency: "Recruitment agency",
  staffing: "Staffing company",
  sourcing_partner: "Sourcing partner",
  travel_partner: "Travel partner",
  other: "Other",
};

export const PARTNER_SERVICES = [
  "candidate_sourcing",
  "screening",
  "trade_test_coordination",
  "documentation_support",
  "visa_processing",
  "emigration_clearance",
  "medical_coordination",
  "travel_booking",
  "pre_departure_orientation",
  "local_mobilisation",
  "other",
] as const;
export const PARTNER_SERVICE_LABELS: Record<PartnerService, string> = {
  candidate_sourcing: "Candidate sourcing",
  screening: "Screening",
  trade_test_coordination: "Trade test coordination",
  documentation_support: "Documentation support",
  visa_processing: "Visa processing",
  emigration_clearance: "Emigration clearance",
  medical_coordination: "Medical coordination",
  travel_booking: "Travel booking",
  pre_departure_orientation: "Pre-departure orientation",
  local_mobilisation: "Local mobilisation",
  other: "Other",
};

export const PARTNER_LICENCE_TYPES = [
  "india_recruiting_agent",
  "foreign_recruitment_licence",
  "staffing_licence",
  "travel_agency_licence",
  "trade_licence",
  "other",
] as const;
export const PARTNER_LICENCE_TYPE_LABELS: Record<PartnerLicenceType, string> = {
  india_recruiting_agent: "Recruiting Agent registration (India, Emigration Act 1983)",
  foreign_recruitment_licence: "Recruitment / employment agency licence (outside India)",
  staffing_licence: "Staffing licence",
  travel_agency_licence: "Travel agency licence",
  trade_licence: "Trade licence",
  other: "Other licence",
};
export const PARTNER_LICENCE_VERIFICATION_STATUSES = ["pending", "verified", "rejected", "expired"] as const;
export const PARTNER_LICENCE_VERIFICATION_METHODS = ["document_review", "registry_lookup", "issuer_confirmation", "other"] as const;
export const PARTNER_LICENCE_VERIFICATION_METHOD_LABELS: Record<PartnerLicenceVerificationMethod, string> = {
  document_review: "Document review",
  registry_lookup: "Checked in the issuer's public registry",
  issuer_confirmation: "Confirmed with the issuing authority",
  other: "Other",
};
export const PARTNER_AGREEMENT_STATUSES = ["pending", "active", "superseded", "expired", "terminated"] as const;
export const PARTNER_FEE_MODELS = ["flat_per_placement", "salary_percentage", "flat_per_selection", "none", "custom"] as const;
export const PARTNER_TERRITORY_SCOPES = ["sourcing", "placement", "both"] as const;
export const PARTNER_TERRITORY_SCOPE_LABELS: Record<PartnerTerritoryScope, string> = {
  sourcing: "Candidate sourcing",
  placement: "Placement support",
  both: "Sourcing and placement",
};

export const INSTITUTION_KINDS = [
  "college",
  "university",
  "polytechnic",
  "iti",
  "training_centre",
  "skill_assessment_provider",
  "technical_institute",
  "corporate_academy",
  "internship_provider",
  "other",
] as const;
export const INSTITUTION_KIND_LABELS: Record<InstitutionKind, string> = {
  college: "College",
  university: "University",
  polytechnic: "Polytechnic",
  iti: "Industrial Training Institute (ITI)",
  training_centre: "Training centre",
  skill_assessment_provider: "Skill assessment provider",
  technical_institute: "Technical institute",
  corporate_academy: "Corporate academy",
  internship_provider: "Internship provider",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Compile-time parity with the database enumerations (type-only imports are erased from bundles).
// ---------------------------------------------------------------------------

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type _OrganizationConstantsParity = [
  Assert<Same<(typeof ORG_DOCUMENT_TYPES)[number], OrgDocumentType>>,
  Assert<Same<(typeof MEMBER_STATUSES)[number], MemberStatus>>,
  Assert<Same<(typeof COMPANY_SIZE_BANDS)[number], CompanySizeBand>>,
  Assert<Same<(typeof ORG_SOCIAL_LINK_KEYS)[number], OrgSocialLinkKey>>,
  Assert<Same<(typeof EMPLOYER_CONTRACT_TYPES)[number], EmployerContractType>>,
  Assert<Same<(typeof EMPLOYER_CONTRACT_STATUSES)[number], EmployerContractStatus>>,
  Assert<Same<(typeof EMPLOYER_CONTRACT_FEE_MODELS)[number], EmployerContractFeeModel>>,
  Assert<Same<(typeof PARTNER_BUSINESS_TYPES)[number], PartnerBusinessType>>,
  Assert<Same<(typeof PARTNER_SERVICES)[number], PartnerService>>,
  Assert<Same<(typeof PARTNER_LICENCE_TYPES)[number], PartnerLicenceType>>,
  Assert<Same<(typeof PARTNER_LICENCE_VERIFICATION_STATUSES)[number], PartnerLicenceVerificationStatus>>,
  Assert<Same<(typeof PARTNER_LICENCE_VERIFICATION_METHODS)[number], PartnerLicenceVerificationMethod>>,
  Assert<Same<(typeof PARTNER_AGREEMENT_STATUSES)[number], PartnerAgreementStatus>>,
  Assert<Same<(typeof PARTNER_FEE_MODELS)[number], PartnerFeeModel>>,
  Assert<Same<(typeof PARTNER_TERRITORY_SCOPES)[number], PartnerTerritoryScope>>,
  Assert<Same<(typeof INSTITUTION_KINDS)[number], InstitutionKind>>,
];
