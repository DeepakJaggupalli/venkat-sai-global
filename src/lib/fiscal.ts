/**
 * Indian financial year helpers (client-safe, no I/O).
 */

/**
 * Indian financial year (1 April – 31 March, evaluated in IST) as a compact label:
 * any date from 2026-04-01 to 2027-03-31 → "2627".
 */
export function financialYearLabel(date: Date = new Date(), timeZone = "Asia/Kolkata"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "numeric" }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`;
}

/** Human label for a financial year label, e.g. "2627" → "FY 2026–27". */
export function financialYearDisplay(label: string): string {
  return `FY 20${label.slice(0, 2)}–${label.slice(2)}`;
}
