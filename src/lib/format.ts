/**
 * Display formatting (client-safe). Money is always integer minor units + ISO currency.
 * Never assume INR — always pass the record's currency.
 */
import { formatDistanceToNowStrict } from "date-fns";

const DEFAULT_LOCALE = "en-IN";

/** Number of minor units for a currency (2 for INR/USD/AED, 3 for KWD/BHD/OMR, 0 for JPY). */
export function currencyMinorUnits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * 10 ** currencyMinorUnits(currency));
}

export function fromMinorUnits(amountMinor: number, currency: string): number {
  return amountMinor / 10 ** currencyMinorUnits(currency);
}

export function formatMoney(amountMinor: number | null | undefined, currency: string | null | undefined, locale = DEFAULT_LOCALE): string {
  if (amountMinor === null || amountMinor === undefined || !currency) return "—";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: currencyMinorUnits(currency) }).format(
      fromMinorUnits(amountMinor, currency),
    );
  } catch {
    return `${currency} ${fromMinorUnits(amountMinor, currency).toFixed(2)}`;
  }
}

/** Salary range display, e.g. "AED 2,500 – 3,200 / month". */
export function formatSalaryRange(
  minMinor: number | null | undefined,
  maxMinor: number | null | undefined,
  currency: string | null | undefined,
  period?: string | null,
  locale = DEFAULT_LOCALE,
): string | null {
  if (!currency || (minMinor == null && maxMinor == null)) return null;
  const units = currencyMinorUnits(currency);
  const fmt = (v: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: units > 0 ? 0 : 0 }).format(fromMinorUnits(v, currency));
  const range =
    minMinor != null && maxMinor != null && minMinor !== maxMinor
      ? `${fmt(minMinor)} – ${fmt(maxMinor)}`
      : fmt((minMinor ?? maxMinor) as number);
  return `${currency} ${range}${period ? ` / ${period.replace("_", " ")}` : ""}`;
}

export function formatNumber(value: number | null | undefined, locale = DEFAULT_LOCALE): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(locale).format(value);
}

export function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

export function formatDate(value: Date | string | null | undefined, opts: { timeZone?: string; locale?: string } = {}): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(opts.locale ?? DEFAULT_LOCALE, { dateStyle: "medium", timeZone: opts.timeZone }).format(d);
}

export function formatDateTime(value: Date | string | null | undefined, opts: { timeZone?: string; locale?: string } = {}): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(opts.locale ?? DEFAULT_LOCALE, { dateStyle: "medium", timeStyle: "short", timeZone: opts.timeZone }).format(d);
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

/** r***@gmail.com */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user?.[0] ?? ""}***@${domain}`;
}

/** +91 ******3210 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\s+/g, "");
  return `${digits.slice(0, 3)} ******${digits.slice(-4)}`;
}

export function maskValue(value: string | null | undefined, visible = 4): string {
  if (!value) return "—";
  return `${"•".repeat(Math.max(4, value.length - visible))}${value.slice(-visible)}`;
}

/** "under_review" → "Under review" */
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  const s = value.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
