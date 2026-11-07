/**
 * Duplicate-profile matching and partner attribution rules (pure, no database access).
 *
 * Matching data (email, phone, passport, name + date of birth) is used ONLY to detect duplicate
 * profiles and to decide which partner submitted a candidate first — never for search or ranking.
 * The database side (finding candidates to compare) lives in partner-submissions.ts.
 */
import type { CandidateAttributionStatus, DuplicateMatchField } from "@/db/schema/recruitment";

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Honorifics dropped before comparing names. */
const NAME_STOPWORDS = new Set(["mr", "mrs", "ms", "miss", "dr", "shri", "sri", "smt", "kum", "kumari", "md", "mohd"]);

/**
 * Comparable form of a person's name: accents removed, lower case, punctuation removed, honorifics
 * dropped and the remaining tokens sorted (so "Kumar Ravi" matches "Ravi Kumar"). Returns "" when
 * nothing comparable remains.
 */
export function normalizePersonName(name: string | null | undefined): string {
  if (!name) return "";
  const tokens = name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((t) => t.length > 0 && !NAME_STOPWORDS.has(t));
  return tokens.sort().join(" ");
}

/** Lower-cased, trimmed email, or null. */
export function normalizeEmailAddress(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
}

/**
 * Comparable passport number, or null when it is not a plausible passport number. Uses exactly the
 * normalisation of the candidates module (normaliseIdentityNumber: spaces, hyphens and slashes
 * removed, upper case) so candidate_profiles.passportNumberHash values match — guarded by a test.
 */
export function normalizePassportNumber(value: string | null | undefined): string | null {
  const normalized = value?.replace(/[\s\-/]/g, "").toUpperCase() ?? "";
  return /^[A-Z0-9]{5,20}$/.test(normalized) ? normalized : null;
}

/** Last four characters of a normalised passport number (display / weak matching). */
export function passportLast4(normalizedPassportNumber: string | null): string | null {
  return normalizedPassportNumber ? normalizedPassportNumber.slice(-4) : null;
}

// ---------------------------------------------------------------------------
// Duplicate matching
// ---------------------------------------------------------------------------

/** The identifying details of the person being submitted (already normalised). */
export type IdentityProbe = {
  email: string | null;
  phone: string | null;
  /** Keyed hash of the normalised passport number (hmacToken(…, "passport")). */
  passportHash: string | null;
  passportLast4: string | null;
  /** YYYY-MM-DD */
  dateOfBirth: string | null;
  /** normalizePersonName() output. */
  normalizedName: string;
};

/** An existing candidate's identifying details. */
export type IdentityCandidate = {
  candidateId: string;
  email: string | null;
  phone: string | null;
  passportHash: string | null;
  passportLast4: string | null;
  dateOfBirth: string | null;
  /** Display name and/or legal name — any of them may match. */
  names: string[];
};

export type DuplicateMatch = {
  candidateId: string;
  matchedOn: DuplicateMatchField[];
  /** Confidence 0–100. */
  score: number;
  /** Email or phone identical: the same account, not merely a possible duplicate. */
  isIdentityMatch: boolean;
};

/** Base confidence per matched field (the strongest field sets the score). */
export const MATCH_FIELD_SCORES: Readonly<Record<DuplicateMatchField, number>> = {
  email: 100,
  phone: 100,
  passport_number: 95,
  passport_last4: 80,
  name_dob: 70,
};

/** Each additional matched field adds this much confidence (capped at 100). */
const EXTRA_FIELD_BONUS = 5;

/**
 * Compare a probe with one existing candidate. Returns null when nothing matches.
 *  - email / phone: exact (normalised) equality
 *  - passport_number: equal keyed hashes
 *  - passport_last4: last four characters AND date of birth equal (last 4 alone is too weak)
 *  - name_dob: normalised name AND date of birth equal
 */
export function matchIdentity(probe: IdentityProbe, existing: IdentityCandidate): DuplicateMatch | null {
  const matchedOn: DuplicateMatchField[] = [];
  if (probe.email && existing.email && probe.email === normalizeEmailAddress(existing.email)) matchedOn.push("email");
  if (probe.phone && existing.phone && probe.phone === existing.phone) matchedOn.push("phone");
  if (probe.passportHash && existing.passportHash && probe.passportHash === existing.passportHash) matchedOn.push("passport_number");
  const sameDob = Boolean(probe.dateOfBirth && existing.dateOfBirth && probe.dateOfBirth === existing.dateOfBirth);
  if (sameDob && probe.passportLast4 && existing.passportLast4 && probe.passportLast4.toUpperCase() === existing.passportLast4.toUpperCase()) {
    matchedOn.push("passport_last4");
  }
  if (sameDob && probe.normalizedName && existing.names.some((n) => normalizePersonName(n) === probe.normalizedName)) {
    matchedOn.push("name_dob");
  }
  if (!matchedOn.length) return null;
  const strongest = Math.max(...matchedOn.map((f) => MATCH_FIELD_SCORES[f]));
  const score = Math.min(100, strongest + EXTRA_FIELD_BONUS * (matchedOn.length - 1));
  return { candidateId: existing.candidateId, matchedOn, score, isIdentityMatch: matchedOn.includes("email") || matchedOn.includes("phone") };
}

/** All matches against a set of existing candidates, strongest first (ties: more fields first). */
export function findDuplicateMatches(probe: IdentityProbe, existing: readonly IdentityCandidate[]): DuplicateMatch[] {
  const seen = new Set<string>();
  const matches: DuplicateMatch[] = [];
  for (const candidate of existing) {
    if (seen.has(candidate.candidateId)) continue;
    seen.add(candidate.candidateId);
    const match = matchIdentity(probe, candidate);
    if (match) matches.push(match);
  }
  return matches.sort((a, b) => b.score - a.score || b.matchedOn.length - a.matchedOn.length);
}

// ---------------------------------------------------------------------------
// Partner attribution (spec 10.4)
// ---------------------------------------------------------------------------

export const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 90;
export const MIN_ATTRIBUTION_WINDOW_DAYS = 1;
export const MAX_ATTRIBUTION_WINDOW_DAYS = 3650;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Clamp a configured window to sane bounds (falls back to the default for invalid values). */
export function normalizeAttributionWindowDays(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return DEFAULT_ATTRIBUTION_WINDOW_DAYS;
  return Math.min(MAX_ATTRIBUTION_WINDOW_DAYS, Math.max(MIN_ATTRIBUTION_WINDOW_DAYS, Math.round(n)));
}

export function attributionExpiresAt(firstSubmittedAt: Date, windowDays: number): Date {
  return new Date(firstSubmittedAt.getTime() + normalizeAttributionWindowDays(windowDays) * DAY_MS);
}

export type AttributionLike = {
  partnerOrganizationId: string;
  status: CandidateAttributionStatus;
  expiresAt: Date | null;
};

/** Active = status active and (no expiry or expiry in the future). */
export function isAttributionActive(attribution: Pick<AttributionLike, "status" | "expiresAt">, now: Date = new Date()): boolean {
  return attribution.status === "active" && (attribution.expiresAt === null || attribution.expiresAt.getTime() > now.getTime());
}

export type AttributionDecision =
  /** No live attribution: this submission becomes the first valid submission and wins attribution. */
  | { kind: "attribute" }
  /** The submitting partner already holds attribution: keep it unchanged. */
  | { kind: "already_attributed" }
  /** Another partner holds attribution inside its window: the submission is a duplicate. */
  | { kind: "duplicate"; attributedPartnerOrganizationId: string; expiresAt: Date | null };

/**
 * First valid submission wins: decide what a new submission by `partnerOrganizationId` means for the
 * candidate's attribution, given the candidate's current attributions (any status).
 */
export function decideAttribution(existing: readonly AttributionLike[], partnerOrganizationId: string, now: Date = new Date()): AttributionDecision {
  const live = existing.find((a) => isAttributionActive(a, now));
  if (!live) return { kind: "attribute" };
  if (live.partnerOrganizationId === partnerOrganizationId) return { kind: "already_attributed" };
  return { kind: "duplicate", attributedPartnerOrganizationId: live.partnerOrganizationId, expiresAt: live.expiresAt };
}
