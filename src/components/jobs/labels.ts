/**
 * Display helpers for job discovery (client-safe, pure). Every visible word goes through the
 * translator (`talent-jobs` namespace) so the same helpers serve server and client components.
 */
import { formatSalaryRange } from "@/lib/format";

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Enum groups translated under `enum.<group>.<value>` in talent-jobs.json. */
export type EnumGroup =
  | "employmentType"
  | "workMode"
  | "experienceLevel"
  | "salaryPeriod"
  | "visa"
  | "infoSource"
  | "interviewMode"
  | "interviewStatus"
  | "interviewResponse"
  | "offerStatus"
  | "checklistStatus"
  | "alertFrequency"
  | "alertChannel"
  | "sort";

/** Humanise a raw enum value ("full_time" → "Full time") — the fallback when a key is missing. */
export function humanizeValue(value: string): string {
  const text = value.replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
}

/** Translated label of an enum value, falling back to a humanised value (never shows a raw key). */
export function enumLabel(t: Translate, group: EnumGroup, value: string | null | undefined): string {
  if (!value) return "";
  const key = `enum.${group}.${value}`;
  const text = t(key);
  return text === key ? humanizeValue(value) : text;
}

/** BCP 47 locale for Intl formatting of an app locale ("hi" → "hi-IN"). */
export function intlLocale(locale: string | null | undefined): string {
  if (locale === "hi") return "hi-IN";
  if (locale === "te") return "te-IN";
  return "en-IN";
}

export type JobPlace = { city: string | null; stateRegion: string | null; countryName: string | null; countryCode: string | null };

/** "Visakhapatnam, Andhra Pradesh, India" — skips empty parts and repeated names. */
export function placeText(place: JobPlace): string {
  const parts = [place.city, place.stateRegion, place.countryName ?? place.countryCode].map((p) => p?.trim()).filter((p): p is string => !!p);
  return parts.filter((p, i) => parts.indexOf(p) === i).join(", ");
}

const DAY_MS = 86_400_000;

/** Whole days until a moment (rounded up; 0 when it is today or past). */
export function daysUntil(at: Date | string | null | undefined, now: Date = new Date()): number | null {
  if (!at) return null;
  const time = (at instanceof Date ? at : new Date(at)).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.ceil((time - now.getTime()) / DAY_MS));
}

/** A job closes "soon" when applications end within this many days. */
export const CLOSING_SOON_DAYS = 7;
/** A job counts as "new" for this many days after publication. */
export const NEW_JOB_DAYS = 3;

export function isClosingSoon(closesAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  const days = daysUntil(closesAt, now);
  return days !== null && days <= CLOSING_SOON_DAYS;
}

export function isNewJob(publishedAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!publishedAt) return false;
  const time = (publishedAt instanceof Date ? publishedAt : new Date(publishedAt)).getTime();
  return !Number.isNaN(time) && now.getTime() - time >= 0 && now.getTime() - time < NEW_JOB_DAYS * DAY_MS;
}

export type SalaryLike = { minMinor: number | null; maxMinor: number | null; currency: string; period: string };

/**
 * Salary text in the record's own currency ("AED 2,500 – 3,200 a month"), or null when the salary is
 * hidden or not stated. Never converts or assumes a currency.
 */
export function salaryText(t: Translate, salary: SalaryLike | null | undefined, locale: string): string | null {
  if (!salary) return null;
  const amount = formatSalaryRange(salary.minMinor, salary.maxMinor, salary.currency, null, intlLocale(locale));
  if (!amount) return null;
  const key = `salary.per.${salary.period}`;
  const text = t(key, { amount });
  return text === key ? `${amount} / ${humanizeValue(salary.period).toLowerCase()}` : text;
}

/** Experience requirement text: "2–5 years", "At least 3 years", "Up to 2 years", or null. */
export function experienceText(t: Translate, min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return min === max ? t("experience.exact", { count: min }) : t("experience.range", { min, max });
  if (min !== null) return min === 0 ? t("experience.none") : t("experience.atLeast", { count: min });
  if (max !== null) return t("experience.upTo", { count: max });
  return null;
}
