/**
 * Information-provenance states (client-safe, pure). The spec requires clearly distinguishing
 * verified, employer-supplied and unverified information (spec 8.4 / jobs.infoSource), and candidate
 * claims are self-declared until checked. Keep the wording honest: only "verified" claims a check.
 */
export const VERIFICATION_STATES = ["verified", "employer_supplied", "self_declared", "pending_review", "unverified"] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

/**
 * Map raw column values from different tables onto a provenance state:
 *  - jobs.infoSource: verified | employer_supplied | pending_review
 *  - *.verificationStatus: verified | pending | under_review | unverified | rejected | expired
 *  - candidate_credentials.issuerType: venkat_sai | accredited_external | self_declared (pass `verified` separately)
 * Anything not positively verified is never shown as verified.
 */
export function toVerificationState(value: string | null | undefined): VerificationState {
  switch ((value ?? "").trim().toLowerCase()) {
    case "verified":
    case "approved":
    case "documents_verified":
    case "skills_assessed":
      return "verified";
    case "employer_supplied":
    case "employer":
    case "organization_supplied":
      return "employer_supplied";
    case "self_declared":
    case "self":
    case "candidate_supplied":
      return "self_declared";
    case "pending":
    case "pending_review":
    case "under_review":
    case "submitted":
    case "in_review":
      return "pending_review";
    default:
      return "unverified";
  }
}

export const VERIFICATION_COPY: Record<VerificationState, { label: string; description: string }> = {
  verified: {
    label: "Verified",
    description: "Checked by Venkat Sai.",
  },
  employer_supplied: {
    label: "Employer-supplied",
    description: "Provided by the employer. Not independently verified by Venkat Sai.",
  },
  self_declared: {
    label: "Self-declared",
    description: "Provided by the candidate. Not verified yet.",
  },
  pending_review: {
    label: "Pending review",
    description: "Submitted to Venkat Sai for review. Not verified yet.",
  },
  unverified: {
    label: "Not verified",
    description: "This information has not been verified.",
  },
};
