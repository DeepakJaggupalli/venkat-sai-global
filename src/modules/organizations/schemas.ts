/**
 * Zod schemas for organisation forms and actions (client-safe: no server imports).
 * Field names match the service inputs; actions add `orgType` (portal) or `organizationId` (staff).
 */
import { z } from "zod";

import { ORG_TYPES } from "@/db/schema/_constants";
import { f } from "@/lib/validation";

import {
  COMPANY_SIZE_BANDS,
  EMPLOYER_CONTRACT_FEE_MODELS,
  EMPLOYER_CONTRACT_TYPES,
  INSTITUTION_KINDS,
  ORG_DOCUMENT_TYPES,
  PARTNER_BUSINESS_TYPES,
  PARTNER_FEE_MODELS,
  PARTNER_LICENCE_TYPES,
  PARTNER_LICENCE_VERIFICATION_METHODS,
  PARTNER_SERVICES,
  PARTNER_TERRITORY_SCOPES,
} from "./constants";

// ---------------------------------------------------------------------------
// Shared field helpers
// ---------------------------------------------------------------------------

type OptionalUndefined<T> = T extends object
  ? { [K in keyof T as undefined extends T[K] ? K : never]?: T[K] } & { [K in keyof T as undefined extends T[K] ? never : K]: T[K] }
  : T;

/**
 * Service input type of a form schema: the parsed output with keys whose value may be undefined made
 * optional (transforming fields such as f.optionalPhone() otherwise keep a required key). Parsed form
 * data is assignable to it, and other modules / tests can omit optional fields.
 */
export type FormOutput<S extends z.ZodType> = OptionalUndefined<z.output<S>>;

const toArray = (v: unknown) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]);

/** http(s) URL only (no javascript:, data:, ftp:). */
export const optionalWebUrl = () =>
  z
    .string()
    .trim()
    .max(500, "Too long")
    .pipe(z.url("Enter a valid URL (including https://)"))
    .refine((v) => /^https?:\/\//i.test(v), "Use a link starting with https://")
    .optional();

/** Calendar date kept as YYYY-MM-DD (for `date` columns). */
export const isoDate = (label = "Date") =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), "Enter a valid date");

export const optionalIsoDate = () => isoDate().optional();

/** Repeated text inputs → trimmed, de-duplicated, non-empty strings. */
export const textList = (opts: { maxItems: number; maxLength: number; label?: string }) =>
  z.preprocess(
    (v) => [...new Set(toArray(v).map((x) => String(x).trim()).filter(Boolean))],
    z
      .array(z.string().max(opts.maxLength, `${opts.label ?? "Each item"} is too long`))
      .max(opts.maxItems, `Add at most ${opts.maxItems} items`),
  );

export const uuidList = (maxItems: number) =>
  z.preprocess((v) => [...new Set(toArray(v).map((x) => String(x).trim()).filter(Boolean))], z.array(z.uuid("Invalid identifier")).max(maxItems, `Choose at most ${maxItems}`));

export const countryCodeList = (maxItems: number) =>
  z.preprocess(
    (v) => [...new Set(toArray(v).map((x) => String(x).trim().toUpperCase()).filter(Boolean))],
    z.array(z.string().regex(/^[A-Z]{2}$/, "Choose a valid country")).max(maxItems, `Choose at most ${maxItems} countries`),
  );

const enumList = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => [...new Set(toArray(v).map((x) => String(x)))], z.array(z.enum(values, { error: "Choose a valid option" })));

export const orgTypeField = f.enumOf(ORG_TYPES, "Choose an organisation type");

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const optionalTimeZone = () =>
  z.string().trim().max(64).refine(isValidTimeZone, "Choose a valid time zone").optional();

// ---------------------------------------------------------------------------
// Organisation
// ---------------------------------------------------------------------------

export const organizationDetailsSchema = z.object({
  name: f.text({ max: 200, label: "Organisation name" }),
  legalName: f.optionalText(200),
  description: f.longText(2000),
  websiteUrl: optionalWebUrl(),
  email: f.optionalEmail(),
  phone: f.optionalPhone(),
  industryId: f.optionalUuid(),
  countryCode: f.countryCode(),
  stateRegion: f.optionalText(120),
  city: f.optionalText(120),
  addressLine1: f.optionalText(200),
  addressLine2: f.optionalText(200),
  postalCode: f.optionalText(20),
  registrationNumber: f.optionalText(100),
  taxId: f.optionalText(50),
});
export type OrganizationDetailsInput = FormOutput<typeof organizationDetailsSchema>;

/** Onboarding: create an organisation of `type` owned by the signed-in user. */
export const createOrganizationSchema = organizationDetailsSchema.extend({ type: orgTypeField });
export type CreateOrganizationInput = FormOutput<typeof createOrganizationSchema>;

/** Portal form (member): the portal type identifies the active organisation. */
export const updateOrganizationSchema = organizationDetailsSchema.extend({ orgType: orgTypeField });
/** Command Centre form (staff). */
export const staffUpdateOrganizationSchema = organizationDetailsSchema.extend({ organizationId: f.uuid() });

export const setOrganizationLogoSchema = z.object({ orgType: orgTypeField, fileId: f.uuid().nullable() });
export const setOrganizationPublicSchema = z.object({ orgType: orgTypeField, isPublic: z.boolean() });

export const organizationDocumentSchema = z
  .object({
    documentType: f.enumOf(ORG_DOCUMENT_TYPES, "Choose the document type"),
    fileId: f.uuid(),
    title: f.optionalText(200),
    documentNumber: f.optionalText(100),
    issuedBy: f.optionalText(200),
    issuedOn: optionalIsoDate(),
    /** Printed expiry date; the document is valid through that day. */
    expiresOn: optionalIsoDate(),
  })
  .refine((v) => !v.issuedOn || !v.expiresOn || v.expiresOn >= v.issuedOn, { path: ["expiresOn"], message: "The expiry date must be after the issue date" });
export type OrganizationDocumentInput = FormOutput<typeof organizationDocumentSchema>;
export const addOrganizationDocumentSchema = organizationDocumentSchema.and(z.object({ orgType: orgTypeField }));

export const reviewOrganizationDocumentSchema = z
  .object({
    documentId: f.uuid(),
    reviewStatus: z.enum(["accepted", "rejected"]),
    reviewNotes: f.optionalText(1000),
  })
  .refine((v) => v.reviewStatus === "accepted" || !!v.reviewNotes, { path: ["reviewNotes"], message: "Explain what is wrong with the document" });
export type ReviewOrganizationDocumentInput = FormOutput<typeof reviewOrganizationDocumentSchema>;

export const suspendOrganizationSchema = z.object({ organizationId: f.uuid(), reason: f.text({ max: 1000, label: "Reason" }) });
export const reactivateOrganizationSchema = z.object({ organizationId: f.uuid(), note: f.optionalText(1000) });
export const expireVerificationSchema = z.object({ organizationId: f.uuid(), reason: f.text({ max: 1000, label: "Reason" }) });

// ---------------------------------------------------------------------------
// Members, invitations, roles
// ---------------------------------------------------------------------------

export const inviteMemberSchema = z.object({ email: f.email(), roleId: f.uuid() });
export type InviteMemberInput = FormOutput<typeof inviteMemberSchema>;

export const acceptInvitationSchema = z.object({ token: z.string().trim().min(20, "Invalid invitation link").max(200, "Invalid invitation link") });

export const changeMemberRoleSchema = z.object({ memberId: f.uuid(), roleId: f.uuid() });
export const setMemberStatusSchema = z.object({ memberId: f.uuid(), status: z.enum(["active", "disabled"]) });
export const memberDetailsSchema = z.object({
  memberId: f.uuid(),
  jobTitle: f.optionalText(120),
  department: f.optionalText(120),
  branchId: f.optionalUuid(),
});
export type MemberDetailsInput = FormOutput<typeof memberDetailsSchema>;
export const transferOwnershipSchema = z.object({ memberId: f.uuid() });

export const orgRoleSchema = z.object({
  name: f.text({ max: 80, label: "Role name" }),
  description: f.optionalText(300),
  permissions: z.preprocess((v) => [...new Set(toArray(v).map(String))], z.array(z.string().max(80)).min(1, "Choose at least one permission").max(100)),
});
export type OrgRoleInput = FormOutput<typeof orgRoleSchema>;

// ---------------------------------------------------------------------------
// Recruitment partners
// ---------------------------------------------------------------------------

export const partnerProfileSchema = z.object({
  businessType: f.enumOf(PARTNER_BUSINESS_TYPES).optional(),
  servicesProvided: enumList(PARTNER_SERVICES),
  yearsInOperation: f.optionalInt({ min: 0, max: 200 }),
  specialisations: textList({ maxItems: 20, maxLength: 80, label: "Specialisation" }),
  industryIds: uuidList(20),
  placementsClaimed: f.optionalInt({ min: 0, max: 10_000_000 }),
});
export type PartnerProfileInput = FormOutput<typeof partnerProfileSchema>;

export const partnerLicenceSchema = z
  .object({
    licenceType: f.enumOf(PARTNER_LICENCE_TYPES, "Choose the licence type"),
    licenceNumber: f.text({ max: 100, label: "Licence number" }),
    issuingAuthority: f.optionalText(200),
    issuingCountryCode: f.countryCode(),
    issuingRegion: f.optionalText(120),
    validFrom: optionalIsoDate(),
    validUntil: optionalIsoDate(),
    fileId: f.optionalUuid(),
    holderName: f.optionalText(200),
    registeredAddress: f.optionalText(500),
    authorisedActivities: textList({ maxItems: 20, maxLength: 200 }),
    branchOffices: textList({ maxItems: 20, maxLength: 200 }),
  })
  .superRefine((v, ctx) => {
    if (v.validFrom && v.validUntil && v.validUntil < v.validFrom) ctx.addIssue({ code: "custom", path: ["validUntil"], message: "The licence must end after it starts" });
    if (v.licenceType === "india_recruiting_agent" && v.issuingCountryCode !== "IN") {
      ctx.addIssue({ code: "custom", path: ["issuingCountryCode"], message: "Recruiting Agent registrations are issued in India" });
    }
    if (v.licenceType === "foreign_recruitment_licence" && v.issuingCountryCode === "IN") {
      ctx.addIssue({ code: "custom", path: ["issuingCountryCode"], message: "Choose the country outside India that issued the licence" });
    }
  });
export type PartnerLicenceInput = FormOutput<typeof partnerLicenceSchema>;

export const verifyLicenceSchema = z.object({
  licenceId: f.uuid(),
  method: f.enumOf(PARTNER_LICENCE_VERIFICATION_METHODS, "Choose how the licence was verified"),
  notes: f.optionalText(2000),
});
export const rejectLicenceSchema = z.object({ licenceId: f.uuid(), reason: f.text({ max: 1000, label: "Reason" }), notes: f.optionalText(2000) });
export const expireLicenceSchema = z.object({ licenceId: f.uuid(), notes: f.optionalText(2000) });

export const partnerCommercialTermsSchema = z
  .object({
    feeModel: f.enumOf(PARTNER_FEE_MODELS).optional(),
    currency: f.currencyCode().optional(),
    /** Decimal amount in `currency` (converted to minor units by the service). */
    amount: f.optionalAmount(),
    rateBasisPoints: f.optionalInt({ min: 0, max: 10_000 }),
    payableAfterJoiningDays: f.optionalInt({ min: 0, max: 730 }),
    replacementWindowDays: f.optionalInt({ min: 0, max: 730 }),
    paymentTermsDays: f.optionalInt({ min: 0, max: 365 }),
    notes: f.optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.amount !== undefined && !v.currency) ctx.addIssue({ code: "custom", path: ["currency"], message: "Choose the currency of the fee" });
    if ((v.feeModel === "flat_per_placement" || v.feeModel === "flat_per_selection") && v.amount === undefined) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter the fee amount" });
    }
    if (v.feeModel === "salary_percentage" && v.rateBasisPoints === undefined) {
      ctx.addIssue({ code: "custom", path: ["rateBasisPoints"], message: "Enter the percentage (in basis points)" });
    }
  });
export type PartnerCommercialTermsInput = FormOutput<typeof partnerCommercialTermsSchema>;

export const partnerAgreementSchema = z
  .object({
    version: f.text({ max: 40, label: "Version" }),
    title: f.text({ max: 200, label: "Title" }),
    termsHtml: f.text({ max: 200_000, label: "Agreement text" }),
    commercialTerms: partnerCommercialTermsSchema.optional(),
    effectiveFrom: optionalIsoDate(),
    effectiveUntil: optionalIsoDate(),
    documentFileId: f.optionalUuid(),
  })
  .refine((v) => !v.effectiveFrom || !v.effectiveUntil || v.effectiveUntil >= v.effectiveFrom, {
    path: ["effectiveUntil"],
    message: "The end date must be after the start date",
  });
export type PartnerAgreementInput = FormOutput<typeof partnerAgreementSchema>;

export const acceptPartnerAgreementSchema = z.object({
  agreementId: f.uuid(),
  acceptedByName: f.text({ max: 120, label: "Your full name" }),
  confirm: f.bool().refine((v) => v, "Confirm that you have read and accept the agreement"),
});
export const terminatePartnerAgreementSchema = z.object({ agreementId: f.uuid(), reason: f.text({ max: 1000, label: "Reason" }) });

export const partnerTerritorySchema = z.object({
  countryCode: f.countryCode(),
  stateRegion: f.optionalText(120),
  scope: f.enumOf(PARTNER_TERRITORY_SCOPES),
});
export type PartnerTerritoryInput = FormOutput<typeof partnerTerritorySchema>;
export const territoryAuthorisationSchema = z.object({ territoryId: f.uuid(), isAuthorised: f.bool(), notes: f.optionalText(1000) });
export const partnerStatusNotesSchema = z.object({ organizationId: f.uuid(), statusNotes: f.longText(5000) });

// ---------------------------------------------------------------------------
// Employers
// ---------------------------------------------------------------------------

export const socialLinksSchema = z
  .object({
    linkedin: optionalWebUrl(),
    facebook: optionalWebUrl(),
    instagram: optionalWebUrl(),
    x: optionalWebUrl(),
    youtube: optionalWebUrl(),
    whatsapp: optionalWebUrl(),
  })
  .partial();

export const companyProfileSchema = z.object({
  companySize: f.enumOf(COMPANY_SIZE_BANDS).optional(),
  foundedYear: f.optionalInt({ min: 1800, max: 2100 }),
  headquartersCountryCode: f.countryCode().optional(),
  hiringRegions: countryCodeList(100),
  typicalRoles: textList({ maxItems: 30, maxLength: 100, label: "Role" }),
  typicalJobCategoryIds: uuidList(30),
  employerBrandingTagline: f.optionalText(160),
  aboutHtml: f.longText(20_000),
  coverFileId: f.optionalUuid(),
  socialLinks: socialLinksSchema.optional(),
  benefitsOffered: textList({ maxItems: 30, maxLength: 120, label: "Benefit" }),
  cultureMediaFileIds: uuidList(12),
  publicContactEmail: f.optionalEmail(),
  publicContactPhone: f.optionalPhone(),
  isHiringOverseas: f.bool(),
  defaultCurrency: f.currencyCode().optional(),
});
export type CompanyProfileInput = FormOutput<typeof companyProfileSchema>;

export const companyBranchSchema = z.object({
  name: f.text({ max: 120, label: "Branch name" }),
  countryCode: f.countryCode(),
  stateRegion: f.optionalText(120),
  city: f.optionalText(120),
  addressLine1: f.optionalText(200),
  addressLine2: f.optionalText(200),
  postalCode: f.optionalText(20),
  timezone: optionalTimeZone(),
  isHeadquarters: f.bool(),
  contactName: f.optionalText(120),
  contactEmail: f.optionalEmail(),
  contactPhone: f.optionalPhone(),
});
export type CompanyBranchInput = FormOutput<typeof companyBranchSchema>;

export const contractFeeSchema = z
  .object({
    label: f.text({ max: 120, label: "Fee label" }),
    model: f.enumOf(EMPLOYER_CONTRACT_FEE_MODELS),
    /** Decimal amount in the contract currency. */
    amount: f.optionalAmount(),
    rateBasisPoints: f.optionalInt({ min: 0, max: 10_000 }),
    notes: f.optionalText(500),
  })
  .refine((v) => v.amount !== undefined || v.rateBasisPoints !== undefined || v.model === "custom", {
    path: ["amount"],
    message: "Enter an amount or a percentage",
  });

export const contractTermsSchema = z.object({
  currency: f.currencyCode().optional(),
  fees: z.array(contractFeeSchema).max(20).default([]),
  paymentTermsDays: f.optionalInt({ min: 0, max: 365 }),
  sla: z
    .object({
      firstShortlistDays: f.optionalInt({ min: 0, max: 365 }),
      replacementGuaranteeDays: f.optionalInt({ min: 0, max: 730 }),
      notes: f.optionalText(1000),
    })
    .optional(),
  notes: f.optionalText(2000),
});
export type ContractTermsInput = FormOutput<typeof contractTermsSchema>;

export const employerContractSchema = z
  .object({
    contractType: f.enumOf(EMPLOYER_CONTRACT_TYPES, "Choose the contract type"),
    title: f.text({ max: 200, label: "Title" }),
    reference: f.optionalText(120),
    startsOn: optionalIsoDate(),
    endsOn: optionalIsoDate(),
    autoRenew: f.bool(),
    terms: contractTermsSchema.optional(),
    documentFileId: f.optionalUuid(),
    signedOn: optionalIsoDate(),
    signedByName: f.optionalText(120),
    accountManagerUserId: f.optionalUuid(),
  })
  .superRefine((v, ctx) => {
    if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) ctx.addIssue({ code: "custom", path: ["endsOn"], message: "The end date must be after the start date" });
    const hasAmounts = v.terms?.fees.some((fee) => fee.amount !== undefined);
    if (hasAmounts && !v.terms?.currency) ctx.addIssue({ code: "custom", path: ["terms", "currency"], message: "Choose the contract currency" });
  });
export type EmployerContractInput = FormOutput<typeof employerContractSchema>;
export const terminateContractSchema = z.object({ contractId: f.uuid(), reason: f.text({ max: 1000, label: "Reason" }) });

// ---------------------------------------------------------------------------
// Institutions
// ---------------------------------------------------------------------------

export const institutionProfileSchema = z.object({
  institutionKind: f.enumOf(INSTITUTION_KINDS).optional(),
  accreditationBodies: textList({ maxItems: 20, maxLength: 200, label: "Accreditation body" }),
  affiliation: f.optionalText(300),
  establishedYear: f.optionalInt({ min: 1800, max: 2100 }),
  studentCapacity: f.optionalInt({ min: 0, max: 1_000_000 }),
  campusAddress: f.optionalText(500),
  aboutHtml: f.longText(20_000),
  coverFileId: f.optionalUuid(),
  placementOfficerName: f.optionalText(120),
  placementOfficerEmail: f.optionalEmail(),
  placementOfficerPhone: f.optionalPhone(),
});
export type InstitutionProfileInput = FormOutput<typeof institutionProfileSchema>;

export const issuerAuthorisationSchema = z
  .object({
    organizationId: f.uuid(),
    authorised: f.bool(),
    scope: f.optionalText(1000),
    authorisedUntil: optionalIsoDate(),
    note: f.optionalText(1000),
  })
  .refine((v) => !v.authorised || !!v.scope, { path: ["scope"], message: "Describe what the institution is authorised to certify" });
export type IssuerAuthorisationInput = FormOutput<typeof issuerAuthorisationSchema>;
