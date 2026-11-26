import {
  BookOpen,
  CalendarCheck,
  FileSearch,
  FileText,
  FolderOpen,
  Gift,
  type LucideIcon,
  Megaphone,
  MessageSquare,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";

import type { CvSubmissionStatus } from "@/db/schema/cv-submissions";
import { CV_SUBMISSION_JOURNEY } from "@/modules/operations/cv-submission-schemas";

/**
 * Pure rules of the People Portal home (src/app/talent/(home)/page.tsx): which buttons a job seeker sees, the profile
 * checklist, the placement journey position, requirement posters for the candidate's trade, the month buckets of the
 * applications chart and document expiry reminders. No data access here (tested in dashboard.test.ts).
 */

// ---------------------------------------------------------------------------
// Quick actions ("What do you want to do?")
// ---------------------------------------------------------------------------

export const TALENT_ACTION_KEYS = ["requirements", "jobs", "sendCv", "cvStatus", "bookTest", "training", "resume", "refer", "documents", "messages", "account"] as const;
export type TalentActionKey = (typeof TALENT_ACTION_KEYS)[number];

export type TalentActionDef = {
  key: TalentActionKey;
  href: string;
  icon: LucideIcon;
  /**
   * Part of the overseas recruitment funnel (requirement posters, the CV desk, trade tests) or a cash reward: shown to
   * adults only. Children are kept out of overseas recruitment (recruitment/rules.ts minorOverseasBlocker).
   */
  adultOnly?: boolean;
};

export const TALENT_ACTIONS: readonly TalentActionDef[] = [
  { key: "requirements", href: "/requirements", icon: Megaphone, adultOnly: true },
  { key: "jobs", href: "/talent/jobs", icon: Search },
  { key: "sendCv", href: "/send-cv", icon: Upload, adultOnly: true },
  { key: "cvStatus", href: "/status", icon: FileSearch, adultOnly: true },
  { key: "bookTest", href: "/book?kind=trade_test", icon: CalendarCheck, adultOnly: true },
  { key: "training", href: "/talent/training/courses", icon: BookOpen },
  { key: "resume", href: "/talent/career/resume", icon: FileText },
  { key: "refer", href: "/refer", icon: Gift, adultOnly: true },
  { key: "documents", href: "/talent/profile#documents", icon: FolderOpen },
  { key: "messages", href: "/talent/messages", icon: MessageSquare },
  { key: "account", href: "/account/security", icon: ShieldCheck },
];

/** The buttons this job seeker may use, in display order (minors do not see the adult-only ones). */
export function talentActionsFor(viewer: { minor: boolean }): TalentActionDef[] {
  return TALENT_ACTIONS.filter((a) => !(viewer.minor && a.adultOnly));
}

// ---------------------------------------------------------------------------
// Profile checklist
// ---------------------------------------------------------------------------

export const TALENT_CHECKLIST_KEYS = ["trade", "experience", "skills", "cv", "passport", "phone"] as const;
export type TalentChecklistKey = (typeof TALENT_CHECKLIST_KEYS)[number];

export type TalentChecklistInput = {
  /** Keys of the profile completeness hints still open (candidates/completeness.ts NextBestActionKey). */
  openHints: ReadonlySet<string>;
  passportStatus: string | null;
  phoneVerified: boolean;
  minor: boolean;
};

export type TalentChecklistStep = { key: TalentChecklistKey; href: string; done: boolean };

const CHECKLIST_HREF: Record<TalentChecklistKey, string> = {
  trade: "/talent/profile#preferences",
  experience: "/talent/profile#experience",
  skills: "/talent/profile#skills",
  cv: "/talent/profile#resume",
  passport: "/talent/profile#personal",
  phone: "/account#contact",
};

/**
 * Six short steps that matter most for a tradesperson. "Done" comes from real data: the open completeness hints, the
 * passport status and a verified phone number (which also links CVs and bookings made on the website). Minors do not
 * get the passport step (no overseas jobs before 18).
 */
export function buildTalentChecklist(input: TalentChecklistInput): TalentChecklistStep[] {
  const done: Record<TalentChecklistKey, boolean> = {
    trade: !input.openHints.has("add_preferred_roles"),
    experience: !input.openHints.has("add_experience"),
    skills: !input.openHints.has("add_skills"),
    cv: !input.openHints.has("upload_resume"),
    passport: Boolean(input.passportStatus),
    phone: input.phoneVerified,
  };
  return TALENT_CHECKLIST_KEYS.filter((key) => !(input.minor && key === "passport")).map((key) => ({ key, href: CHECKLIST_HREF[key], done: done[key] }));
}

// ---------------------------------------------------------------------------
// Placement journey (CV desk)
// ---------------------------------------------------------------------------

export type JourneyPosition = {
  /** Index in CV_SUBMISSION_JOURNEY of the stage reached (-1 when the CV is on hold or not suitable). */
  index: number;
  total: number;
  /** "on_hold" / "not_suitable" sit outside the journey. */
  side: Extract<CvSubmissionStatus, "on_hold" | "not_suitable"> | null;
};

export function journeyPosition(status: CvSubmissionStatus): JourneyPosition {
  const total = CV_SUBMISSION_JOURNEY.length;
  if (status === "on_hold" || status === "not_suitable") return { index: -1, total, side: status };
  return { index: (CV_SUBMISSION_JOURNEY as readonly string[]).indexOf(status), total, side: null };
}

export { CV_SUBMISSION_JOURNEY };

// ---------------------------------------------------------------------------
// Requirement posters for my trade
// ---------------------------------------------------------------------------

/** Words that say nothing about the trade itself ("general helper", "skilled worker"). */
const GENERIC_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "worker",
  "workers",
  "helper",
  "helpers",
  "general",
  "skilled",
  "unskilled",
  "semi",
  "senior",
  "junior",
  "assistant",
  "staff",
  "job",
  "jobs",
  "male",
  "female",
  "experienced",
  "fresher",
  "trainee",
]);

/** Lower-case trade words of 3+ letters, plural "s" dropped, generic words removed. */
export function tradeWords(text: string | null | undefined): Set<string> {
  const words = new Set<string>();
  for (const raw of (text ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3 || GENERIC_WORDS.has(raw)) continue;
    words.add(raw.length > 3 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw);
  }
  return words;
}

export type PosterLike = { title: string; trades: readonly { trade: string }[] };

/**
 * Posters whose trades share a trade word with the candidate's trades (preferred roles, job categories, headline),
 * newest first as given. `matched` is false when nothing matched and the latest posters are returned instead, so the
 * page can say "Latest requirements" rather than claim a match.
 */
export function postersForTrades<T extends PosterLike>(posters: readonly T[], candidateTrades: readonly (string | null | undefined)[], limit = 3): { items: T[]; matched: boolean } {
  const wanted = new Set<string>();
  for (const t of candidateTrades) for (const w of tradeWords(t)) wanted.add(w);
  if (wanted.size > 0) {
    const hits = posters.filter((p) => {
      const words = tradeWords([p.title, ...p.trades.map((t) => t.trade)].join(" "));
      for (const w of words) if (wanted.has(w)) return true;
      return false;
    });
    if (hits.length > 0) return { items: hits.slice(0, limit), matched: true };
  }
  return { items: posters.slice(0, limit), matched: false };
}

// ---------------------------------------------------------------------------
// Applications per month (chart)
// ---------------------------------------------------------------------------

/** "YYYY-MM" of the last `months` calendar months in `timeZone`, oldest first (the current month last). */
export function lastMonthKeys(months: number, now: Date = new Date(), timeZone = "Asia/Kolkata"): string[] {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** Zero-filled chart points for the last `months` months; label is the short month name in the viewer's language. */
export function monthSeries(rows: readonly { month: string; value: number }[], opts: { months?: number; now?: Date; locale?: string; timeZone?: string } = {}): { label: string; value: number }[] {
  const byMonth = new Map(rows.map((r) => [r.month, r.value]));
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat(opts.locale ?? "en-IN", { month: "short", timeZone: "UTC" });
  } catch {
    format = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" });
  }
  return lastMonthKeys(opts.months ?? 6, opts.now, opts.timeZone).map((key) => {
    const [y, m] = key.split("-").map(Number);
    return { label: format.format(new Date(Date.UTC(y!, m! - 1, 1))), value: byMonth.get(key) ?? 0 };
  });
}

// ---------------------------------------------------------------------------
// Document reminders
// ---------------------------------------------------------------------------

/** Passports are flagged 6 months ahead (most countries need 6 months of validity); other documents 60 days ahead. */
export const PASSPORT_WARNING_MONTHS = 6;
export const DOCUMENT_WARNING_DAYS = 60;

/** YYYY-MM-DD plus whole months (UTC calendar, day clamped to the month's length). */
export function addMonthsIso(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const first = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d!, lastDay));
  return first.toISOString().slice(0, 10);
}

export function addDaysIso(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export type ExpiryState = "expired" | "soon";

/** "expired" before today, "soon" up to and including `limit`, otherwise null (nothing to remind). */
export function expiryState(expiresOn: string | null | undefined, today: string, limit: string): ExpiryState | null {
  if (!expiresOn) return null;
  if (expiresOn < today) return "expired";
  return expiresOn <= limit ? "soon" : null;
}

/** Whole days from today to the date (negative when past). */
export function daysUntil(expiresOn: string, today: string): number {
  return Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
