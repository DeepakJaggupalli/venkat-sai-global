/**
 * schema.org JobPosting JSON-LD for a requirement poster page (pure, client-safe), for Google job listings.
 *
 *  - validThrough: the "apply by" date, else published + 30 days. Expired posters get no JobPosting (null).
 *  - employmentType FULL_TIME unless the poster text says part-time. directApply false (candidates send a CV).
 *  - hiringOrganization: the company when the poster names it, else Venkat Sai (the recruiter publishing it).
 *  - baseSalary only when every salary on the trade lines is a plain amount (or range) with one ISO currency
 *    ("1500 SAR", "AED 900 - 1200", "1500 SAR / month"); anything else ("900 + food 350") omits it. Gulf and
 *    overseas trade salaries are quoted per month, so MONTH is used unless the line states another period.
 */

export type JobPostingPoster = {
  title: string;
  summary: string | null;
  description: string | null;
  countryCode: string | null;
  companyName: string | null;
  /** `pay` is the salary text with its currency (see formatPay in components/public/requirements/data.ts). */
  trades: { trade: string; pay: string | null }[];
  benefits: string[];
  /** YYYY-MM-DD */
  applyBy: string | null;
  publishedAt: Date;
  imageUrl?: string | null;
};

export type JobPostingSite = { name: string; url: string; logo: string };

type JsonLd = Record<string, unknown>;

export const DEFAULT_VALIDITY_DAYS = 30;

const UNITS: Record<string, string> = { hour: "HOUR", hr: "HOUR", day: "DAY", week: "WEEK", month: "MONTH", mon: "MONTH", year: "YEAR", yr: "YEAR", annum: "YEAR" };

const AMOUNT = String.raw`(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?`;
const SALARY = new RegExp(
  String.raw`^(?:([A-Z]{3})\s*)?` + AMOUNT + String.raw`(?:\s*(?:-|–|to)\s*` + AMOUNT + String.raw`)?\s*(?:([A-Z]{3}))?(?:\s*(?:\/|[Pp]er|a)\s*([A-Za-z]+))?$`,
);

let currencyList: Set<string> | null = null;
function isCurrency(code: string): boolean {
  if (!currencyList) {
    const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    currencyList = new Set(supported ? supported("currency") : []);
  }
  return currencyList.size ? currencyList.has(code) : /^[A-Z]{3}$/.test(code);
}

const toNumber = (text: string): number => Number(text.replace(/,/g, ""));

export type ParsedSalary = { min: number; max: number; currency: string; unit: string };

/** "1500 SAR" / "AED 900 - 1200" / "2,000 QAR per month" → amount(s), currency and period; otherwise null. */
export function parseSalary(text: string | null | undefined): ParsedSalary | null {
  const value = text?.trim().replace(/\s+/g, " ");
  if (!value) return null;
  const match = SALARY.exec(value);
  if (!match) return null;
  const amounts = [...value.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g)].map((m) => Number(m[0].replace(/,/g, "")));
  const [, prefix, lowText, , suffix, unitText] = match;
  if (prefix && suffix && prefix !== suffix) return null;
  const currency = prefix ?? suffix;
  if (!currency || !isCurrency(currency)) return null;
  const unit = unitText ? UNITS[unitText.toLowerCase()] : "MONTH";
  if (!unit) return null;
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  if (!lowText || !Number.isFinite(min) || min <= 0 || toNumber(lowText) <= 0) return null;
  return { min, max, currency, unit };
}

/** One salary for the posting: every stated salary must parse, in one currency and period. */
export function posterBaseSalary(trades: JobPostingPoster["trades"]): JsonLd | null {
  const stated = trades.filter((t) => t.pay?.trim());
  if (!stated.length) return null;
  const parsed = stated.map((t) => parseSalary(t.pay));
  if (parsed.some((p) => !p)) return null;
  const all = parsed as ParsedSalary[];
  const { currency, unit } = all[0]!;
  if (all.some((p) => p.currency !== currency || p.unit !== unit)) return null;
  const min = Math.min(...all.map((p) => p.min));
  const max = Math.max(...all.map((p) => p.max));
  const value: JsonLd = { "@type": "QuantitativeValue", unitText: unit, ...(min === max ? { value: min } : { minValue: min, maxValue: max }) };
  return { "@type": "MonetaryAmount", currency, value };
}

const escapeHtml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function descriptionHtml(poster: JobPostingPoster): string {
  const parts: string[] = [];
  const intro = poster.description ?? poster.summary;
  if (intro?.trim()) parts.push(`<p>${escapeHtml(intro.trim()).replace(/\r?\n/g, "<br>")}</p>`);
  if (poster.trades.length) {
    const items = poster.trades.map((t) => `<li>${escapeHtml(t.trade)}${t.pay ? ` - ${escapeHtml(t.pay)}` : ""}</li>`).join("");
    parts.push(`<p>Trades and salary:</p><ul>${items}</ul>`);
  }
  if (poster.benefits.length) parts.push(`<p>Benefits:</p><ul>${poster.benefits.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`);
  if (!parts.length) parts.push(`<p>${escapeHtml(poster.title)}</p>`);
  parts.push("<p>Apply free: send your CV and trade. Candidates are never charged to apply.</p>");
  return parts.join("\n");
}

/** End of the validity window, or null when it has passed (the poster is expired). */
export function posterValidThrough(poster: Pick<JobPostingPoster, "applyBy" | "publishedAt">, now: Date): string | null {
  if (poster.applyBy && /^\d{4}-\d{2}-\d{2}$/.test(poster.applyBy)) {
    // The whole "apply by" day counts (UTC+14 is the latest time zone to finish that day).
    const end = Date.parse(`${poster.applyBy}T23:59:59+14:00`);
    return Number.isFinite(end) && end >= now.getTime() ? poster.applyBy : null;
  }
  const end = new Date(poster.publishedAt.getTime() + DEFAULT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
  return end.getTime() >= now.getTime() ? end.toISOString() : null;
}

export function buildRequirementJobPosting(poster: JobPostingPoster, opts: { url: string; site: JobPostingSite; now?: Date }): JsonLd | null {
  const validThrough = posterValidThrough(poster, opts.now ?? new Date());
  if (!validThrough) return null;
  const text = [poster.title, poster.summary, poster.description].filter(Boolean).join(" ");
  const hiringOrganization: JsonLd = poster.companyName
    ? { "@type": "Organization", name: poster.companyName }
    : { "@type": "Organization", name: opts.site.name, sameAs: opts.site.url, logo: opts.site.logo };
  const data: JsonLd = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: poster.title,
    description: descriptionHtml(poster),
    url: opts.url,
    datePosted: poster.publishedAt.toISOString(),
    validThrough,
    employmentType: /\bpart[\s-]?time\b/i.test(text) ? "PART_TIME" : "FULL_TIME",
    hiringOrganization,
    directApply: false,
  };
  if (poster.countryCode && /^[A-Z]{2}$/.test(poster.countryCode)) {
    data.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: poster.countryCode } };
  }
  const baseSalary = posterBaseSalary(poster.trades);
  if (baseSalary) data.baseSalary = baseSalary;
  if (poster.imageUrl) data.image = poster.imageUrl;
  return data;
}
