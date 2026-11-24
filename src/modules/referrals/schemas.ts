/**
 * "Refer a friend" — constants, labels, zod schemas and the pure rules (client-safe: the public /refer page, the
 * /r/<CODE> link, the Command Centre and the tests share them). No server imports here.
 */
import { z } from "zod";

import type { CvSubmissionStatus } from "@/db/schema/cv-submissions";
import type { ReferrerStatus } from "@/db/schema/referrals";
import { currencyMinorUnits } from "@/lib/format";
import { f } from "@/lib/validation";

// ---------------------------------------------------------------------------
// Codes, links and the referral cookie
// ---------------------------------------------------------------------------

/** Alphabet of generated codes: digits 2–9 and letters without I and O, so nobody mixes up 0/O or 1/I. */
export const REFERRAL_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const REFERRAL_CODE_LENGTH = 6;
/** Any stored code (generated ones are 6 characters of the alphabet). Same rule as cv_submissions.referralCode. */
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{4,16}$/;

/** Cookie set by /r/<CODE> for 30 days; /send-cv reads it and stores the code on the CV submission. */
export const REFERRAL_COOKIE = "vsg_ref";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Path of a referrer's share link. */
export function referralLinkPath(code: string): string {
  return `/r/${code}`;
}

/**
 * A code typed, pasted or read from the cookie / URL → the stored form (upper-case, no spaces or dashes), or null.
 * A whole pasted link (".../r/7KQ2MX") is accepted too, because people copy the link more often than the code.
 */
export function normaliseReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  if (!value || value.length > 300) return null;
  const fromLink = /\/r\/([A-Za-z0-9 -]{4,40})\/?(?:[?#].*)?$/.exec(value);
  if (fromLink) value = fromLink[1]!;
  value = value.replace(/[\s-]+/g, "").toUpperCase();
  return REFERRAL_CODE_PATTERN.test(value) ? value : null;
}

/** Is this a code the generator could have made (6 characters of the unambiguous alphabet)? */
export function isGeneratedReferralCode(code: string): boolean {
  return code.length === REFERRAL_CODE_LENGTH && [...code].every((c) => REFERRAL_CODE_ALPHABET.includes(c));
}

export type ReferralCookie = {
  name: typeof REFERRAL_COOKIE;
  value: string;
  options: { httpOnly: true; sameSite: "lax"; secure: boolean; path: "/"; maxAge: number };
};

/**
 * The cookie /r/<CODE> sets for a valid, active code: httpOnly, SameSite=Lax (it must survive the click from
 * WhatsApp), Secure in production, the whole site, 30 days. Null for a value that cannot be a code.
 */
export function referralCookie(rawCode: unknown, opts: { production: boolean }): ReferralCookie | null {
  const code = normaliseReferralCode(rawCode);
  if (!code) return null;
  return { name: REFERRAL_COOKIE, value: code, options: { httpOnly: true, sameSite: "lax", secure: opts.production, path: "/", maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS } };
}

/** The WhatsApp text a referrer sends to friends (plain, short, with the link last so WhatsApp previews it). */
export function referralShareText(url: string): string {
  return `Jobs abroad for welders, fitters, electricians, helpers and other trades with Venkat Sai Global, Visakhapatnam. See the latest openings and send your CV here. Applying is free: ${url}`;
}

/** wa.me link that lets the person pick the chat or group (no number). */
export function referralWhatsAppShareHref(url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(referralShareText(url))}`;
}

// ---------------------------------------------------------------------------
// Derived reward status and what the referrer may see
// ---------------------------------------------------------------------------

export const REWARD_STATUSES = ["due", "paid", "in_progress", "not_eligible"] as const;
export type RewardStatus = (typeof REWARD_STATUSES)[number];

export const REWARD_STATUS_LABELS = {
  due: "Due",
  paid: "Paid",
  in_progress: "In progress",
  not_eligible: "Not eligible",
} as const satisfies Record<RewardStatus, string>;

export const REWARD_STATUS_TONE = {
  due: "warning",
  paid: "success",
  in_progress: "info",
  not_eligible: "neutral",
} as const satisfies Record<RewardStatus, string>;

/**
 * The reward status is never stored: a recorded payout → paid; CV departed (placed abroad) → due; not suitable →
 * not eligible; every other stage → in progress.
 */
export function deriveRewardStatus(cvStatus: CvSubmissionStatus, hasPayout: boolean): RewardStatus {
  if (hasPayout) return "paid";
  if (cvStatus === "departed") return "due";
  if (cvStatus === "not_suitable") return "not_eligible";
  return "in_progress";
}

/** Stage of a referred person as the referrer sees it (never the detailed placement stage). */
export const PUBLIC_REFERRAL_STAGES = ["received", "in_progress", "placed", "closed"] as const;
export type PublicReferralStage = (typeof PUBLIC_REFERRAL_STAGES)[number];

export const PUBLIC_REFERRAL_STAGE_LABELS = {
  received: "CV received",
  in_progress: "In progress",
  placed: "Placed abroad",
  closed: "Closed",
} as const satisfies Record<PublicReferralStage, string>;

export function publicReferralStage(cvStatus: CvSubmissionStatus): PublicReferralStage {
  if (cvStatus === "received") return "received";
  if (cvStatus === "departed") return "placed";
  if (cvStatus === "not_suitable") return "closed";
  return "in_progress";
}

const LETTERS = /[^\p{L}\p{M}]+/gu;

function displayWord(word: string): string {
  const letters = word.replace(LETTERS, "");
  // "RAVI" / "ravi" → "Ravi"; mixed case (and scripts without case) stay as typed.
  if (letters && (letters === letters.toUpperCase() || letters === letters.toLowerCase())) return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
  return letters;
}

/**
 * What a referrer sees of a person they referred: first name and the initial of the last name ("Ravi Kumar Reddy" →
 * "Ravi R."). Leading initials, common in South Indian names, are skipped ("K. Ravi Kumar" → "Ravi K.").
 */
export function publicReferredName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter((w) => w.replace(LETTERS, "").length > 0);
  if (!words.length) return "Your friend";
  const firstIndex = Math.max(0, words.findIndex((w) => w.replace(LETTERS, "").length > 1));
  const first = displayWord(words[firstIndex]!);
  const rest = words.filter((_, i) => i !== firstIndex);
  const last = rest.at(-1)?.replace(LETTERS, "");
  return last ? `${first} ${[...last][0]!.toUpperCase()}.` : first;
}

/** First name for a greeting ("K. Ravi Kumar" → "Ravi"). */
export function referrerFirstName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter((w) => w.replace(LETTERS, "").length > 0);
  const word = words.find((w) => w.replace(LETTERS, "").length > 1) ?? words[0];
  return word ? displayWord(word) : "";
}

function nameTokens(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((t) => t.length >= 2);
}

/**
 * A returning referrer gets their link back only when the name they type has two words of the stored name (the only
 * word, for a one-word name), in any order, with at most one extra word ("Ravi Kumar" for "K. Ravi Kumar", "Ravi Kumar
 * Reddy" for "Ravi Kumar"), or is the same without spaces ("Ravikumar" / "Ravi Kumar"). One common word ("Kumar",
 * "Reddy"), a part of the name or a long list of names is not enough: the link opens the referral list, so a stranger
 * who knows the mobile number must not get it by guessing a surname.
 */
export function referrerNamesMatch(stored: string, typed: string): boolean {
  const a = nameTokens(stored);
  const b = nameTokens(typed);
  if (!a.length || !b.length) return false;
  if (a.join("") === b.join("")) return true;
  const storedWords = new Set(a);
  const typedWords = new Set(b);
  const shared = [...typedWords].filter((t) => storedWords.has(t)).length;
  const extra = typedWords.size - shared;
  return shared >= Math.min(2, storedWords.size) && extra <= (storedWords.size >= 2 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Referrer status (staff)
// ---------------------------------------------------------------------------

export const REFERRER_STATUS_LABELS = { active: "Active", blocked: "Blocked" } as const satisfies Record<ReferrerStatus, string>;
export const REFERRER_STATUS_VALUES = Object.keys(REFERRER_STATUS_LABELS) as [ReferrerStatus, ...ReferrerStatus[]];

/** Currencies staff choose from when recording a payout (no default: staff always pick one). */
export const REFERRAL_PAYOUT_CURRENCIES = ["INR", "AED", "SAR", "QAR", "OMR", "KWD", "BHD", "SGD", "MYR", "EUR", "USD"] as const;
export type ReferralPayoutCurrency = (typeof REFERRAL_PAYOUT_CURRENCIES)[number];

// ---------------------------------------------------------------------------
// Public forms
// ---------------------------------------------------------------------------

/** Hidden honeypot input: accepted (never a validation error, so bots learn nothing); the service checks it. */
const honeypot = z.string().max(500).optional();

/** /refer "Get my link": name + mobile. */
export const referrerLinkSchema = z.object({
  name: f.text({ label: "Your name", max: 120 }),
  phone: f.phone(),
  consentToContact: f.bool().refine((v) => v === true, { message: "Please agree that we may call or WhatsApp you about your referrals" }),
  website: honeypot,
});
export type ReferrerLinkInput = z.output<typeof referrerLinkSchema>;

/** /refer "Check my referrals": mobile + code (or the whole link pasted). */
export const referralCheckSchema = z.object({
  phone: f.phone(),
  code: z
    .string({ error: "Enter your referral code" })
    .trim()
    .min(1, "Enter your referral code")
    .max(300, "Enter your referral code")
    .transform((value, ctx) => {
      const code = normaliseReferralCode(value);
      if (!code) {
        ctx.addIssue({ code: "custom", message: "Enter the code at the end of your link, for example 7KQ2MX" });
        return z.NEVER;
      }
      return code;
    }),
});
export type ReferralCheckInput = z.output<typeof referralCheckSchema>;

/** Result of "Get my link". */
export type ReferrerLinkResult = {
  /** First word of the stored name, for "Welcome back, Ravi". */
  firstName: string;
  code: string;
  /** Absolute share link (https://…/r/CODE). */
  url: string;
  /** The mobile number already had a link (it is shown again, unchanged). */
  returning: boolean;
};

/** One referred person as the referrer sees them (nothing else leaves the server). */
export type MyReferralItem = {
  /** "Ravi K." */
  name: string;
  trade: string;
  stage: PublicReferralStage;
  reward: RewardStatus;
};

/** Result of "Check my referrals". */
export type MyReferralsView = {
  firstName: string;
  code: string;
  url: string;
  /** blocked = the link is paused (shown as such; staff explain on WhatsApp). */
  active: boolean;
  items: MyReferralItem[];
  counts: { total: number; placed: number; due: number; paid: number };
};

// ---------------------------------------------------------------------------
// Command Centre
// ---------------------------------------------------------------------------

/** "Mark paid": the amount as typed (in the currency's units), the currency staff chose, an optional note. */
export const markReferralPaidSchema = z
  .object({
    cvSubmissionId: f.uuid(),
    amount: z.coerce.number({ error: "Enter the amount paid" }).finite("Enter the amount paid").positive("Enter the amount paid").max(10_000_000, "Check the amount"),
    currency: z.enum(REFERRAL_PAYOUT_CURRENCIES, { error: "Choose the currency you paid in" }),
    note: f.optionalText(500),
  })
  .superRefine((v, ctx) => {
    const scale = 10 ** currencyMinorUnits(v.currency);
    if (Math.abs(v.amount * scale - Math.round(v.amount * scale)) > 1e-6) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: scale === 1 ? "Enter a whole amount" : `Use at most ${Math.log10(scale)} digits after the point` });
    }
  });
export type MarkReferralPaidInput = z.output<typeof markReferralPaidSchema>;

export const referralPayoutUndoSchema = z.object({ cvSubmissionId: f.uuid() });

/** Code typed by staff (or a pasted link) → stored form; a clear field error otherwise. */
const staffReferralCode = z
  .string({ error: "Enter the referrer's code" })
  .trim()
  .min(1, "Enter the referrer's code")
  .max(300, "Enter the referrer's code")
  .transform((value, ctx) => {
    const code = normaliseReferralCode(value);
    if (!code) {
      ctx.addIssue({ code: "custom", message: "Enter the code from the referrer's link, for example 7KQ2MX" });
      return z.NEVER;
    }
    return code;
  });

/** Staff: attach a CV that arrived without the link (walk-in, WhatsApp) to the referrer who sent the person. */
export const linkCvToReferrerSchema = z.object({
  cvReference: z
    .string({ error: "Enter the CV reference" })
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^VSG-CV-\d{4,10}$/, "Enter the CV reference, for example VSG-CV-000123")),
  referralCode: staffReferralCode,
});
export type LinkCvToReferrerInput = z.output<typeof linkCvToReferrerSchema>;

/** Staff: take a CV off a referrer (wrong link, self-referral abuse). Not possible once a payment is recorded. */
export const unlinkCvReferralSchema = z.object({ cvSubmissionId: f.uuid() });

export const referrerStatusSchema = z.object({
  id: f.uuid(),
  status: f.enumOf(REFERRER_STATUS_VALUES),
});

/**
 * Digit runs for finding a referrer by a mobile number typed the way staff see it ("+91 98765 43210" in WhatsApp,
 * "98765 43210", "098765 43210"): matched against the stored E.164 number. None for fewer than 4 digits.
 */
export function phoneSearchDigits(q: string): string[] {
  const digits = q.replace(/\D/g, "");
  if (digits.length < 4) return [];
  const national = digits.replace(/^0+/, "");
  return national !== digits && national.length >= 4 ? [digits, national] : [digits];
}

export const REFERRAL_VIEWS = ["referred", "referrers"] as const;
export type ReferralView = (typeof REFERRAL_VIEWS)[number];

/** List filters from the URL (invalid values are ignored, never an error). */
export const referralFiltersSchema = z.object({
  view: z.enum(REFERRAL_VIEWS).catch("referred"),
  reward: z.enum(REWARD_STATUSES).optional().catch(undefined),
  status: z.enum(REFERRER_STATUS_VALUES).optional().catch(undefined),
  referrer: z.uuid().optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type ReferralFilters = z.output<typeof referralFiltersSchema>;
