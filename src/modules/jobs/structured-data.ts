/**
 * schema.org JobPosting JSON-LD for public job pages (pure, client-safe), following Google's job
 * posting guidelines: datePosted, validThrough, employmentType, hiringOrganization, jobLocation (or
 * TELECOMMUTE + applicantLocationRequirements for remote jobs), baseSalary only when the salary is
 * public, identifier and directApply. Only build it for published, unexpired jobs.
 *
 * Confidential / Venkat Sai-managed jobs name the employer as described on the job (never the
 * hidden organisation, and never Venkat Sai as if it were the employer).
 */
import { GOOGLE_EMPLOYMENT_TYPE } from "./constants";
import type { PublicJobDetail } from "./types";

const UNIT_TEXT: Partial<Record<string, string>> = { hour: "HOUR", day: "DAY", week: "WEEK", month: "MONTH", year: "YEAR" };

type JsonLd = Record<string, unknown>;

function minorToMajor(amountMinor: number, currency: string): number {
  let digits = 2;
  try {
    digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    digits = 2;
  }
  return amountMinor / 10 ** digits;
}

const escapeHtml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Google requires an HTML description: the sanitised body plus responsibilities and requirements. */
function descriptionHtml(job: PublicJobDetail): string {
  const parts: string[] = [];
  if (job.descriptionHtml) parts.push(job.descriptionHtml);
  else if (job.summary) parts.push(`<p>${escapeHtml(job.summary)}</p>`);
  const block = (heading: string, text: string | null) => {
    if (text?.trim()) parts.push(`<h3>${heading}</h3><p>${escapeHtml(text.trim()).replace(/\r?\n/g, "<br>")}</p>`);
  };
  block("Responsibilities", job.responsibilities);
  block("Requirements", job.qualificationsText);
  block("Selection process", job.recruitmentProcess);
  return parts.join("\n") || `<p>${escapeHtml(job.title)}</p>`;
}

function place(p: { countryCode: string | null; stateRegion: string | null; city: string | null }): JsonLd {
  const address: JsonLd = { "@type": "PostalAddress" };
  if (p.city) address.addressLocality = p.city;
  if (p.stateRegion) address.addressRegion = p.stateRegion;
  if (p.countryCode) address.addressCountry = p.countryCode;
  return { "@type": "Place", address };
}

export function buildJobPostingJsonLd(job: PublicJobDetail, opts: { url: string; siteName?: string }): JsonLd {
  const data: JsonLd = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: descriptionHtml(job),
    url: opts.url,
    identifier: { "@type": "PropertyValue", name: opts.siteName ?? "Venkat Sai Global", value: job.code },
    employmentType: GOOGLE_EMPLOYMENT_TYPE[job.employmentType],
    directApply: job.applyMode === "platform",
  };
  if (job.publishedAt) data.datePosted = job.publishedAt.toISOString();
  if (job.closesAt) data.validThrough = job.closesAt.toISOString();

  const org: JsonLd = { "@type": "Organization", name: job.employer.name };
  if (!job.employer.confidential && job.employer.logoUrl) org.logo = job.employer.logoUrl;
  if (!job.employer.confidential && job.employerProfile?.website) org.sameAs = job.employerProfile.website;
  data.hiringOrganization = org;

  if (job.workMode === "remote") {
    data.jobLocationType = "TELECOMMUTE";
    if (job.location.countryCode) {
      data.applicantLocationRequirements = { "@type": "Country", name: job.location.countryName ?? job.location.countryCode };
    }
  } else {
    const places = [job.location, ...job.locations].filter((p) => p.countryCode);
    const unique = places.filter((p, i) => places.findIndex((q) => q.countryCode === p.countryCode && q.city === p.city && q.stateRegion === p.stateRegion) === i);
    if (unique.length) data.jobLocation = unique.length === 1 ? place(unique[0]!) : unique.map(place);
  }

  const unit = job.salary ? UNIT_TEXT[job.salary.period] : undefined;
  if (job.salary && unit && (job.salary.minMinor !== null || job.salary.maxMinor !== null)) {
    const { minMinor, maxMinor, currency } = job.salary;
    const value: JsonLd = { "@type": "QuantitativeValue", unitText: unit };
    if (minMinor !== null && maxMinor !== null && minMinor !== maxMinor) {
      value.minValue = minorToMajor(minMinor, currency);
      value.maxValue = minorToMajor(maxMinor, currency);
    } else {
      value.value = minorToMajor((minMinor ?? maxMinor)!, currency);
    }
    data.baseSalary = { "@type": "MonetaryAmount", currency, value };
  }

  if (job.experienceMinYears !== null && job.experienceMinYears > 0) {
    data.experienceRequirements = { "@type": "OccupationalExperienceRequirements", monthsOfExperience: job.experienceMinYears * 12 };
  }
  if (job.industry) data.industry = job.industry.name;
  if (job.category) data.occupationalCategory = job.category.name;
  if (job.skillDetails.length) data.skills = job.skillDetails.map((s) => s.name).join(", ");
  if (job.openings > 0) data.totalJobOpenings = job.openings;
  return data;
}

/**
 * JSON for a `<script type="application/ld+json">` element: `<`, `>` and `&` are escaped so job text
 * can never close the script element (render with dangerouslySetInnerHTML={{ __html: … }} — the
 * value is JSON, not user HTML).
 */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
