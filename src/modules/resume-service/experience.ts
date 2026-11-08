/**
 * Experience totals and date formatting for the resume (pure: no server or DB imports).
 *
 * Totals merge overlapping or back-to-back periods so a candidate who changed jobs mid-month, or listed two
 * overlapping contracts, is not counted twice. End dates are inclusive (01.01.2020 to 31.12.2022 = 3 years);
 * a remainder of 15 days or more counts as a whole month.
 */

/** The parts of an experience row the totals need (ExperienceRow fits; `to` may be absent for current jobs). */
export type ExperiencePeriod = { from: string; to?: string | null; current: boolean };

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "2024-03-07" → "07.03.2024" ("" for empty; anything that is not an ISO date is returned unchanged). */
export function formatDateDots(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = ISO.exec(iso.trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso.trim();
}

/** "Still Continue" for a current job, else the end date as dd.mm.yyyy. */
export function periodTo(row: Pick<ExperiencePeriod, "to" | "current">): string {
  return row.current ? "Still Continue" : formatDateDots(row.to);
}

function parseIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = ISO.exec(iso.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** `from` plus `months` calendar months, clamping the day to the target month's length (31 Jan + 1 = 28/29 Feb). */
function addMonths(from: number, months: number): number {
  const d = new Date(from);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay));
}

/** Whole months in [start, endExclusive), rounding a remainder of 15+ days up. */
function monthsIn(start: number, endExclusive: number): number {
  if (endExclusive <= start) return 0;
  const a = new Date(start);
  const b = new Date(endExclusive);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  while (months > 0 && addMonths(start, months) > endExclusive) months--;
  const remainderDays = Math.round((endExclusive - addMonths(start, months)) / DAY_MS);
  return months + (remainderDays >= 15 ? 1 : 0);
}

/**
 * Total months for one group of rows (abroad or India). Current rows run to `today`. Rows with missing or
 * reversed dates are ignored.
 */
export function experienceMonths(rows: readonly ExperiencePeriod[], today: Date): number {
  const todayMs = utcMidnight(today);
  const intervals: [number, number][] = [];
  for (const row of rows) {
    const start = parseIso(row.from);
    const end = row.current ? todayMs : parseIso(row.to);
    if (start === null || end === null || end < start) continue;
    intervals.push([start, end + DAY_MS]); // inclusive end → exclusive bound
  }
  intervals.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of intervals) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged.reduce((sum, [start, end]) => sum + monthsIn(start, end), 0);
}

/**
 * "03 Years 1 Month" (title) / "08 YEARS 2 MONTHS" (upper). Years are zero-padded to two digits and left out
 * when zero ("5 Months"); "" for no experience.
 */
export function formatExperienceTotal(months: number, style: "title" | "upper"): string {
  const total = Math.max(0, Math.floor(months));
  if (total === 0) return "";
  const years = Math.floor(total / 12);
  const rest = total % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${String(years).padStart(2, "0")} ${years === 1 ? "Year" : "Years"}`);
  if (rest > 0) parts.push(`${rest} ${rest === 1 ? "Month" : "Months"}`);
  const text = parts.join(" ");
  return style === "upper" ? text.toUpperCase() : text;
}
