/**
 * Pure organisation business rules (no I/O; client-safe; unit-tested in rules.test.ts).
 *
 * - Verification readiness: minimum profile fields and documents per organisation type.
 * - Recruitment-licence rule for partners that perform regulated (overseas) recruitment.
 * - Organisation status transitions around verification, suspension and reactivation.
 * - Verification expiry (earliest relevant document / licence expiry) and reminder thresholds.
 * - Invitation acceptance checks and role-granting (privilege escalation) checks.
 */
import type { OrgStatus, OrgType } from "@/db/schema/_constants";
import type { OrgDocumentType } from "@/db/schema/organizations";
import type { PartnerLicenceType, PartnerLicenceVerificationStatus, PartnerTerritoryScope } from "@/db/schema/partners";

import { ORG_DOCUMENT_TYPE_LABELS } from "./constants";

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Verification readiness
// ---------------------------------------------------------------------------

export type DocumentRequirement = { id: string; label: string; anyOf: readonly OrgDocumentType[] };

/**
 * Minimum documents per organisation type. Each requirement is met by at least one current document
 * (not rejected, not expired) of any of the listed types. Staff may still ask for more during review.
 */
export const VERIFICATION_DOCUMENT_REQUIREMENTS: Record<OrgType, readonly DocumentRequirement[]> = {
  employer: [{ id: "registration", label: "Company registration certificate or trade licence", anyOf: ["registration_certificate"] }],
  recruitment_partner: [{ id: "registration", label: "Business registration certificate or trade licence", anyOf: ["registration_certificate"] }],
  institution: [
    { id: "registration", label: "Registration or establishment certificate", anyOf: ["registration_certificate"] },
    { id: "recognition", label: "Accreditation or affiliation certificate", anyOf: ["accreditation", "affiliation"] },
  ],
};

/** Documents that help reviewers but are not required to submit. */
export const RECOMMENDED_DOCUMENTS: Record<OrgType, readonly OrgDocumentType[]> = {
  employer: ["tax_registration", "authorisation_letter", "address_proof"],
  recruitment_partner: ["recruiting_agent_licence", "tax_registration", "authorisation_letter", "address_proof"],
  institution: ["tax_registration", "authorisation_letter", "address_proof"],
};

export type ReadinessIssue = { code: string; message: string };

export type ReadinessDocument = {
  documentType: OrgDocumentType;
  reviewStatus: "pending" | "accepted" | "rejected";
  expiresAt: Date | null;
};

export type ReadinessLicence = {
  id: string;
  licenceType: PartnerLicenceType;
  issuingCountryCode: string;
  verificationStatus: PartnerLicenceVerificationStatus;
  /** YYYY-MM-DD */
  validFrom: string | null;
  /** YYYY-MM-DD */
  validUntil: string | null;
  deletedAt: Date | null;
};

export type ReadinessTerritory = { countryCode: string; scope: PartnerTerritoryScope };

export type VerificationReadinessInput = {
  type: OrgType;
  organization: {
    name: string;
    countryCode: string | null;
    city: string | null;
    email: string | null;
    phone: string | null;
  };
  documents: readonly ReadinessDocument[];
  partner?: {
    businessType: string | null;
    servicesProvided: readonly string[];
    territories: readonly ReadinessTerritory[];
    licences: readonly ReadinessLicence[];
  } | null;
  institution?: { institutionKind: string | null } | null;
  now: Date;
};

export type VerificationReadiness = {
  ready: boolean;
  issues: ReadinessIssue[];
  documentRequirements: { id: string; label: string; met: boolean }[];
  licence: LicenceRequirementResult | null;
};

/**
 * organization_documents.expiresAt holds the printed expiry date (stored at 00:00 UTC); the document is
 * valid through that day, so it lapses at the next UTC midnight.
 */
export function documentLapsesAt(expiresAt: Date): Date {
  return endOfValidityDay(toIsoDate(expiresAt));
}

/** A document counts while it is not rejected and not expired. */
export function isCurrentDocument(doc: Pick<ReadinessDocument, "reviewStatus" | "expiresAt">, now: Date): boolean {
  return doc.reviewStatus !== "rejected" && (doc.expiresAt === null || documentLapsesAt(doc.expiresAt).getTime() > now.getTime());
}

export function evaluateVerificationReadiness(input: VerificationReadinessInput): VerificationReadiness {
  const issues: ReadinessIssue[] = [];
  const org = input.organization;
  if (!org.name.trim()) issues.push({ code: "name", message: "Add the organisation name." });
  if (!org.countryCode) issues.push({ code: "country", message: "Add the country where the organisation is registered." });
  if (!org.city?.trim()) issues.push({ code: "city", message: "Add the city of the registered office." });
  if (!org.email && !org.phone) issues.push({ code: "contact", message: "Add an organisation email address or phone number." });

  if (input.type === "recruitment_partner" && !input.partner?.businessType) {
    issues.push({ code: "business_type", message: "Choose your business type in the agency profile." });
  }
  if (input.type === "institution" && !input.institution?.institutionKind) {
    issues.push({ code: "institution_kind", message: "Choose the kind of institution in the institution profile." });
  }

  const current = input.documents.filter((d) => isCurrentDocument(d, input.now));
  const documentRequirements = VERIFICATION_DOCUMENT_REQUIREMENTS[input.type].map((req) => {
    const met = current.some((d) => req.anyOf.includes(d.documentType));
    if (!met) {
      const types = req.anyOf.map((t) => ORG_DOCUMENT_TYPE_LABELS[t].toLowerCase()).join(" or ");
      issues.push({ code: `document_${req.id}`, message: `Upload a current ${types}.` });
    }
    return { id: req.id, label: req.label, met };
  });

  let licence: LicenceRequirementResult | null = null;
  if (input.type === "recruitment_partner" && input.partner) {
    licence = evaluatePartnerLicenceRequirement({
      homeCountryCode: org.countryCode,
      businessType: input.partner.businessType,
      servicesProvided: input.partner.servicesProvided,
      territories: input.partner.territories,
      licences: input.partner.licences,
      today: toIsoDate(input.now),
      stage: "submission",
    });
    if (licence.required && !licence.satisfied) issues.push({ code: "licence", message: licence.message });
  }

  return { ready: issues.length === 0, issues, documentRequirements, licence };
}

// ---------------------------------------------------------------------------
// Recruitment licence rule (recruitment partners)
// ---------------------------------------------------------------------------

/** Declared activities that mean the partner recruits / sources workers itself. */
export const RECRUITING_SERVICES = ["candidate_sourcing"] as const;
/** Business types that recruit workers by definition. */
export const RECRUITING_BUSINESS_TYPES = ["agency", "staffing"] as const;
/** Declared services that only make sense for employment outside the worker's home country. */
export const OVERSEAS_SERVICES = ["emigration_clearance", "visa_processing", "pre_departure_orientation"] as const;
/** Licence types that authorise recruitment for overseas employment. */
export const RECRUITMENT_LICENCE_TYPES = ["india_recruiting_agent", "foreign_recruitment_licence"] as const satisfies readonly PartnerLicenceType[];

export type LicenceRequirementInput = {
  homeCountryCode: string | null;
  businessType: string | null;
  servicesProvided: readonly string[];
  territories: readonly ReadinessTerritory[];
  licences: readonly ReadinessLicence[];
  /** YYYY-MM-DD */
  today: string;
  /** Submission accepts licences still pending staff verification; approval needs a verified one. */
  stage: "submission" | "approval";
};

export type LicenceRequirementResult = {
  required: boolean;
  satisfied: boolean;
  /** The required licence type when it must be an Indian Recruiting Agent registration. */
  requiredLicenceType: (typeof RECRUITMENT_LICENCE_TYPES)[number] | null;
  qualifyingLicenceIds: string[];
  message: string;
};

/**
 * A partner performs **regulated recruitment** when it recruits workers (business type agency or
 * staffing, or the declared service "candidate_sourcing") **for employment outside their home country**
 * (a declared overseas service — emigration clearance, visa processing, pre-departure orientation — or a
 * placement territory in a country other than the partner's own). Recruiting for overseas employment is
 * licensed: in India by Recruiting Agent registration under the Emigration Act 1983 (eMigrate), elsewhere
 * by a recruitment / employment-agency licence of the sourcing country.
 */
export function performsRegulatedRecruitment(input: Pick<LicenceRequirementInput, "homeCountryCode" | "businessType" | "servicesProvided" | "territories">): boolean {
  const recruits =
    (input.businessType !== null && (RECRUITING_BUSINESS_TYPES as readonly string[]).includes(input.businessType)) ||
    input.servicesProvided.some((s) => (RECRUITING_SERVICES as readonly string[]).includes(s));
  if (!recruits) return false;
  const overseasService = input.servicesProvided.some((s) => (OVERSEAS_SERVICES as readonly string[]).includes(s));
  const overseasPlacement = input.territories.some(
    (t) => (t.scope === "placement" || t.scope === "both") && input.homeCountryCode !== null && t.countryCode !== input.homeCountryCode,
  );
  return overseasService || overseasPlacement;
}

/** Whether the licence must be an Indian Recruiting Agent registration (partner based in or sourcing from India). */
export function requiresIndianRecruitingAgent(input: Pick<LicenceRequirementInput, "homeCountryCode" | "territories">): boolean {
  return input.homeCountryCode === "IN" || input.territories.some((t) => t.countryCode === "IN" && (t.scope === "sourcing" || t.scope === "both"));
}

/** A licence record is active when it is live, not rejected / expired and inside its validity window. */
export function isActiveLicence(licence: ReadinessLicence, today: string, acceptPending: boolean): boolean {
  if (licence.deletedAt) return false;
  const statusOk = licence.verificationStatus === "verified" || (acceptPending && licence.verificationStatus === "pending");
  if (!statusOk) return false;
  if (licence.validFrom && licence.validFrom > today) return false;
  if (licence.validUntil && licence.validUntil < today) return false;
  return true;
}

export function evaluatePartnerLicenceRequirement(input: LicenceRequirementInput): LicenceRequirementResult {
  if (!performsRegulatedRecruitment(input)) {
    return { required: false, satisfied: true, requiredLicenceType: null, qualifyingLicenceIds: [], message: "No recruitment licence is required for the declared activities." };
  }
  const indiaOnly = requiresIndianRecruitingAgent(input);
  const acceptedTypes: readonly string[] = indiaOnly ? ["india_recruiting_agent"] : RECRUITMENT_LICENCE_TYPES;
  const qualifying = input.licences.filter((l) => acceptedTypes.includes(l.licenceType) && isActiveLicence(l, input.today, input.stage === "submission"));
  const satisfied = qualifying.length > 0;
  const what = indiaOnly
    ? "a Recruiting Agent registration under the Emigration Act 1983 (eMigrate)"
    : "a recruitment or employment-agency licence issued in the country you recruit from";
  const message = satisfied
    ? "A recruitment licence is on record."
    : input.stage === "submission"
      ? `You declared recruitment for overseas employment, which requires ${what}. Add the licence with a scan before submitting.`
      : `Verify ${what} for this partner before approving.`;
  return {
    required: true,
    satisfied,
    requiredLicenceType: indiaOnly ? "india_recruiting_agent" : null,
    qualifyingLicenceIds: qualifying.map((l) => l.id),
    message,
  };
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

/** Statuses from which members may (re)submit verification. "verified" = renewal while still verified. */
export function verificationSubmissionCheck(status: OrgStatus): { allowed: true; renewal: boolean } | { allowed: false; message: string } {
  switch (status) {
    case "draft":
    case "rejected":
    case "expired":
      return { allowed: true, renewal: false };
    case "verified":
      return { allowed: true, renewal: true };
    case "pending":
    case "under_review":
      return { allowed: false, message: "Your verification is already being reviewed." };
    case "suspended":
      return { allowed: false, message: "This organisation is suspended. Contact Venkat Sai support." };
  }
}

/** True while an organisation holds a verification that has not lapsed. */
export function hasValidVerification(org: { status: OrgStatus; verificationExpiresAt: Date | null }, now: Date): boolean {
  return org.status === "verified" && (org.verificationExpiresAt === null || org.verificationExpiresAt.getTime() > now.getTime());
}

export type VerificationDecisionOutcome = { status: OrgStatus; statusReason: string | null; verified: boolean };

/**
 * Organisation status after a verification decision.
 * - approved → verified.
 * - rejected → rejected, except a renewal of a still-valid verification, which stays verified until it lapses.
 * - changes_requested → draft (edit and resubmit), except a renewal, which stays verified.
 */
export function statusAfterVerificationDecision(
  org: { status: OrgStatus; verificationExpiresAt: Date | null },
  decision: "approved" | "rejected" | "changes_requested",
  reason: string | null,
  now: Date,
): VerificationDecisionOutcome {
  if (decision === "approved") return { status: "verified", statusReason: null, verified: true };
  const renewal = hasValidVerification(org, now);
  if (renewal) return { status: "verified", statusReason: reason, verified: false };
  return { status: decision === "rejected" ? "rejected" : "draft", statusReason: reason, verified: false };
}

/** Status restored when a suspension is lifted. */
export function statusAfterReactivation(org: { verifiedAt: Date | null; verificationExpiresAt: Date | null }, now: Date): OrgStatus {
  if (!org.verifiedAt) return "draft";
  if (org.verificationExpiresAt && org.verificationExpiresAt.getTime() <= now.getTime()) return "expired";
  return "verified";
}

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

/** YYYY-MM-DD (UTC) for a Date. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A date-only validity end ("valid until 2027-03-31") lasts through that day: expires at the next UTC midnight. */
export function endOfValidityDay(isoDate: string): Date {
  return new Date(new Date(`${isoDate}T00:00:00.000Z`).getTime() + DAY_MS);
}

/**
 * Verification expiry = the earliest expiry among the documents of the submission (not rejected) and,
 * for partners, the verified licences on record. Null when nothing relied upon expires.
 */
export function computeVerificationExpiry(input: {
  documents: readonly Pick<ReadinessDocument, "reviewStatus" | "expiresAt">[];
  licences: readonly Pick<ReadinessLicence, "verificationStatus" | "validUntil" | "deletedAt">[];
}): Date | null {
  const candidates: number[] = [];
  for (const doc of input.documents) {
    if (doc.reviewStatus !== "rejected" && doc.expiresAt) candidates.push(documentLapsesAt(doc.expiresAt).getTime());
  }
  for (const licence of input.licences) {
    if (!licence.deletedAt && licence.verificationStatus === "verified" && licence.validUntil) candidates.push(endOfValidityDay(licence.validUntil).getTime());
  }
  return candidates.length ? new Date(Math.min(...candidates)) : null;
}

export const EXPIRY_REMINDER_DAYS = [30, 7] as const;

/** Whole days until `expiresAt` (rounded up; 0 or less = due / lapsed). */
export function daysUntil(expiresAt: Date, now: Date): number {
  return Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Which reminder (30 or 7 days before) is due now, given when the last reminder for this expiry was sent.
 * Returns the most urgent applicable threshold that has not been sent yet, or null. A single
 * "last sent" timestamp is enough because reminders are monotonic in time.
 */
export function dueReminderThreshold(expiresAt: Date, lastSentAt: Date | null, now: Date, thresholds: readonly number[] = EXPIRY_REMINDER_DAYS): number | null {
  const left = daysUntil(expiresAt, now);
  if (left <= 0) return null;
  const applicable = [...thresholds].sort((a, b) => a - b).filter((t) => left <= t);
  const threshold = applicable[0];
  if (threshold === undefined) return null;
  const windowStart = expiresAt.getTime() - threshold * DAY_MS;
  if (lastSentAt && lastSentAt.getTime() >= windowStart) return null;
  return threshold;
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

/** Default invitation validity; the live value is the `orgs.invitation_ttl_days` setting (see invitationTtlDays). */
export const INVITATION_TTL_DAYS = 7;
const MAX_INVITATION_TTL_DAYS = 90;

/** The configured validity in whole days (1–90); anything unusable falls back to INVITATION_TTL_DAYS. */
export function invitationTtlDays(setting: unknown): number {
  const days = typeof setting === "number" ? setting : typeof setting === "string" && setting.trim() ? Number(setting) : Number.NaN;
  if (!Number.isFinite(days) || days < 1) return INVITATION_TTL_DAYS;
  return Math.min(MAX_INVITATION_TTL_DAYS, Math.floor(days));
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export function invitationStatus(inv: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now: Date): InvitationStatus {
  if (inv.acceptedAt) return "accepted";
  if (inv.revokedAt) return "revoked";
  if (inv.expiresAt.getTime() <= now.getTime()) return "expired";
  return "pending";
}

export type InvitationRejection = "accepted" | "revoked" | "expired" | "user_inactive" | "email_missing" | "email_mismatch" | "email_unverified";

export const INVITATION_REJECTION_MESSAGES: Record<InvitationRejection, string> = {
  accepted: "This invitation has already been used.",
  revoked: "This invitation was cancelled. Ask the organisation to send a new one.",
  expired: "This invitation has expired. Ask the organisation to send a new one.",
  user_inactive: "Your account is not active. Contact Venkat Sai support.",
  email_missing: "Add and verify the email address this invitation was sent to, then try again.",
  email_mismatch: "This invitation was sent to a different email address. Sign in with that address to accept it.",
  email_unverified: "Verify your email address before accepting this invitation.",
};

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Can this signed-in user accept this invitation? (Email match is case-insensitive and must be verified.) */
export function evaluateInvitationAcceptance(
  inv: { email: string; acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  user: { email: string | null; emailVerifiedAt: Date | null; status: string },
  now: Date,
): { ok: true } | { ok: false; reason: InvitationRejection } {
  const status = invitationStatus(inv, now);
  if (status !== "pending") return { ok: false, reason: status };
  if (user.status !== "active") return { ok: false, reason: "user_inactive" };
  if (!user.email) return { ok: false, reason: "email_missing" };
  if (normalizeInvitationEmail(user.email) !== normalizeInvitationEmail(inv.email)) return { ok: false, reason: "email_mismatch" };
  if (!user.emailVerifiedAt) return { ok: false, reason: "email_unverified" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/** Permission keys not in the scope catalogue (custom roles may only use catalogue keys of their scope). */
export function unknownPermissions(catalogue: readonly string[], permissions: readonly string[]): string[] {
  const allowed = new Set(catalogue);
  return [...new Set(permissions)].filter((p) => !allowed.has(p));
}

/**
 * Privilege-escalation guard for assigning roles and defining custom roles. Staff may grant anything;
 * only owners may grant the owner role; other members may only grant roles whose permissions they hold.
 */
export function canGrantRole(
  actor: { isStaff: boolean; isOwner: boolean; permissions: ReadonlySet<string> },
  role: { key: string; permissions: readonly string[] },
): boolean {
  if (actor.isStaff) return true;
  if (role.key === "owner") return actor.isOwner;
  if (actor.isOwner) return true;
  return role.permissions.every((p) => actor.permissions.has(p));
}
