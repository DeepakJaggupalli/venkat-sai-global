/**
 * Small pure rules shared by the candidates services, search and the jobs module (client-safe).
 */
import type { CandidateVerificationLevel } from "@/db/schema/candidates";

/**
 * Highest verification Venkat Sai has completed for a profile (stored in verificationLevel):
 *  - skills_assessed: a published, passed Venkat Sai assessment (or a skill verified by one)
 *  - documents_verified: staff verified an identity document (passport or ID proof)
 *  - basic: the account has a verified email address or phone number
 *  - none: nothing verified yet
 */
export function computeVerificationLevel(facts: {
  contactVerified: boolean;
  identityDocumentVerified: boolean;
  passedAssessment: boolean;
}): CandidateVerificationLevel {
  if (facts.passedAssessment) return "skills_assessed";
  if (facts.identityDocumentVerified) return "documents_verified";
  if (facts.contactVerified) return "basic";
  return "none";
}

export const VERIFICATION_LEVEL_RANK: Record<CandidateVerificationLevel, number> = {
  none: 0,
  basic: 1,
  documents_verified: 2,
  skills_assessed: 3,
};

/** Full years between a YYYY-MM-DD birth date and `today` (UTC calendar dates). */
export function ageOn(dateOfBirth: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  let age = today.getUTCFullYear() - y;
  const beforeBirthday = today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export const ADULT_AGE = 18;

/**
 * Is the candidate a child under the DPDP Act (has not completed 18 years)? Uses the date of birth
 * when known; otherwise a recorded guardian consent marks the account as a minor's. Sign-up asks
 * users to confirm they are 18+, so an unknown date of birth without guardian consent counts as adult.
 * Minors are excluded from overseas matching and from employer searches for overseas roles.
 */
export function isMinor(dateOfBirth: string | null | undefined, hasGuardianConsent: boolean, today: Date = new Date()): boolean {
  if (dateOfBirth) {
    const age = ageOn(dateOfBirth, today);
    if (age !== null) return age < ADULT_AGE;
  }
  return hasGuardianConsent;
}

/** Last four characters of an identity number, for display next to the encrypted value. */
export function last4(value: string): string {
  const compact = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return compact.slice(-4);
}

/** Normalise an identity number before hashing (blind index) or encrypting. */
export function normaliseIdentityNumber(value: string): string {
  return value.replace(/[\s\-/]/g, "").toUpperCase();
}

/**
 * Keywords typed by a user → a safe prefix tsquery for to_tsquery('simple', …):
 * "TIG weld" → "tig:* & weld:*". Only letters and digits survive, so the result can never carry
 * tsquery operators from the input; at most 8 terms. Null when nothing searchable remains.
 */
export function toPrefixTsQuery(input: string | null | undefined, maxTerms = 8): string | null {
  if (!input) return null;
  // Letters, combining marks (Telugu / Hindi vowel signs and viramas belong to words) and digits.
  // Built with the constructor: Unicode property escapes need an ES2018 regex literal target.
  const terms = (input.toLowerCase().match(new RegExp("[\\p{L}\\p{M}\\p{N}]+", "gu")) ?? []).slice(0, maxTerms);
  if (!terms.length) return null;
  return [...new Set(terms)].map((t) => `${t}:*`).join(" & ");
}

/** Escape LIKE wildcards in user input (use with ilike and explicit % around it). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Denormalised search text: unique words of the given phrases, capped to keep the tsvector small. */
export function buildSearchText(parts: ReadonlyArray<string | null | undefined>, maxLength = 4000): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const value = part?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  const text = out.join(" ").slice(0, maxLength).trim();
  return text.length ? text : null;
}
