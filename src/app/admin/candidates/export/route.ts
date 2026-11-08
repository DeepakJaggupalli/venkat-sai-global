import type { NextRequest } from "next/server";

import { humanize } from "@/lib/format";
import { formatExportDateTime } from "@/lib/xlsx-export";
import { CANDIDATE_VERIFICATION_LEVEL_OPTIONS } from "@/modules/candidates/constants";
import { parseCandidateSearchParams } from "@/modules/candidates/schemas";
import { searchCandidates } from "@/modules/candidates/search";
import type { CandidateCard } from "@/modules/candidates/types";
import { EXPORT_FETCH_LIMIT, queryObject, staffExport } from "@/modules/exports/http";
import { candidatePeople, EMPTY_PERSON, type PersonColumns } from "@/modules/exports/people";
import { staffCan } from "@/modules/identity/authz";
import { countryOptions, getSkillsByIds } from "@/modules/taxonomy/queries";

type Row = CandidateCard & { person: PersonColumns };

const LEVEL_LABELS: Record<(typeof CANDIDATE_VERIFICATION_LEVEL_OPTIONS)[number], string> = {
  none: "Not verified",
  basic: "Contact verified",
  documents_verified: "Documents verified",
  skills_assessed: "Skills assessed",
};

function experienceText(months: number | null): string {
  if (months === null) return "";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years ? `${years} yr` : null, rest ? `${rest} mo` : null].filter(Boolean).join(" ") || "0 mo";
}

/** GET /admin/candidates/export?<search filters> — Excel download of the candidate search results (candidates.view). */
export async function GET(request: NextRequest): Promise<Response> {
  const params = queryObject(request.nextUrl);
  return staffExport<Row>({
    permission: "candidates.view",
    list: "candidates",
    slug: "candidates",
    dataCategory: "contact",
    build: async (ctx) => {
      const filters = parseCandidateSearchParams(params);
      if (!staffCan(ctx, "candidates.manage")) filters.includeHidden = false;
      const result = await searchCandidates({ ...filters, page: 1, pageSize: EXPORT_FETCH_LIMIT }, { kind: "staff", ctx });
      const [people, countries, skills] = await Promise.all([candidatePeople(ctx, result.items.map((c) => c.candidateId)), countryOptions(), getSkillsByIds(filters.skillIds)]);
      const country = (code: string | undefined) => (code ? (countries.find((c) => c.value === code)?.label ?? code) : null);
      const labels = [
        filters.q ? `Search: "${filters.q}"` : null,
        skills.length ? `Skills: ${skills.map((s) => s.name).join(", ")}` : null,
        filters.countryCode ? `Lives in: ${country(filters.countryCode)}` : null,
        filters.preferredCountryCode ? `Wants to work in: ${country(filters.preferredCountryCode)}` : null,
        filters.availability.length ? `Availability: ${filters.availability.map(humanize).join(", ")}` : null,
        filters.experienceMinYears !== undefined ? `Experience: ${filters.experienceMinYears}+ years` : null,
        filters.languageCodes.length ? `Languages: ${filters.languageCodes.join(", ")}` : null,
        filters.minVerificationLevel ? `Verification: ${LEVEL_LABELS[filters.minVerificationLevel]}` : null,
        filters.openToOverseas ? "Open to overseas" : null,
        filters.passportValid ? "Valid passport" : null,
        filters.verifiedSkillsOnly ? "Verified skills only" : null,
        filters.verifiedCredentialsOnly ? "Verified credentials only" : null,
        filters.assessedOnly ? "Passed a Venkat Sai assessment" : null,
        filters.activeWithinDays ? `Active in the last ${filters.activeWithinDays} days` : null,
        filters.includeHidden ? "Including hidden profiles" : null,
      ].filter((v): v is string => Boolean(v));
      return {
        title: "Candidates",
        filters: labels,
        filterValues: { ...filters, page: undefined, pageSize: undefined },
        total: result.total,
        rows: result.items.map((c) => ({ ...c, person: people.get(c.candidateId) ?? { ...EMPTY_PERSON, name: c.displayName } })),
        columns: [
          { header: "Name", value: (r) => r.person.name || r.displayName },
          { header: "Trade", value: (r) => r.person.trade },
          { header: "Passport No", value: (r) => r.person.passport },
          { header: "Phone number(s)", value: (r) => r.person.phone },
          { header: "Candidate notes", value: (r) => r.person.candidateNotes, wrap: true },
          { header: "Staff remarks", value: (r) => r.person.staffRemarks, wrap: true },
          { header: "Lives in", value: (r) => [r.location.city, r.location.countryName].filter(Boolean).join(", ") },
          { header: "Experience", value: (r) => experienceText(r.totalExperienceMonths) },
          { header: "Availability", value: (r) => (r.availability ? humanize(r.availability) : "") },
          { header: "Passport status", value: (r) => (r.passportStatus ? humanize(r.passportStatus) : "") },
          { header: "Open to overseas", value: (r) => (r.openToOverseas ? "Yes" : "No") },
          { header: "Verification", value: (r) => LEVEL_LABELS[r.verificationLevel as keyof typeof LEVEL_LABELS] ?? humanize(r.verificationLevel) },
          { header: "Last active", value: (r) => (r.lastActiveAt ? formatExportDateTime(r.lastActiveAt) : "") },
        ],
      };
    },
  });
}
