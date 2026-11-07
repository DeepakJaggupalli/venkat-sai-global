import type { Metadata } from "next";

import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { RelativeTime } from "@/components/shared/relative-time";
import { StatusBadge } from "@/components/shared/status-badge";
import { type SearchParams } from "@/lib/http";
import { CANDIDATE_AVAILABILITY_OPTIONS, CANDIDATE_VERIFICATION_LEVEL_OPTIONS } from "@/modules/candidates/constants";
import { parseCandidateSearchParams } from "@/modules/candidates/schemas";
import { searchCandidates } from "@/modules/candidates/search";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { countryOptions, getSkillsByIds, listLanguages } from "@/modules/taxonomy/queries";

import { optionsFrom } from "../pipeline/_shared/server";
import { humanize } from "../pipeline/_shared/status";
import { SkillFilter } from "./_components/skill-filter";

export const metadata: Metadata = { title: "Candidates" };

const LEVEL_LABELS: Record<(typeof CANDIDATE_VERIFICATION_LEVEL_OPTIONS)[number], string> = {
  none: "Not verified",
  basic: "Contact verified",
  documents_verified: "Documents verified",
  skills_assessed: "Skills assessed",
};

const YES = [{ value: "true", label: "Yes" }];

function experienceText(months: number | null): string {
  if (months === null) return "Experience not given";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"}`;
}

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("candidates.view");
  const params = await searchParams;
  const filters = parseCandidateSearchParams(params);
  if (!staffCan(staff, "candidates.manage")) filters.includeHidden = false;
  const [result, countries, languages, selectedSkills] = await Promise.all([
    searchCandidates(filters, { kind: "staff", ctx: staff }),
    countryOptions(),
    listLanguages(),
    getSkillsByIds(filters.skillIds),
  ]);
  const languageOptions = languages.map((l) => ({ value: l.code, label: l.name }));
  const availabilityOptions = optionsFrom(CANDIDATE_AVAILABILITY_OPTIONS);
  const levelOptions = optionsFrom(CANDIDATE_VERIFICATION_LEVEL_OPTIONS, LEVEL_LABELS);
  const experienceOptions = [1, 2, 3, 5, 10].map((y) => ({ value: String(y), label: `${y}+ years` }));
  const activeOptions = [7, 30, 90].map((d) => ({ value: String(d), label: `Last ${d} days` }));
  const sortOptions = [
    { value: "recent", label: "Recently active" },
    { value: "experience", label: "Most experience" },
    { value: "completeness", label: "Most complete profile" },
  ];
  const paramKeys = [
    "q",
    "skillIds",
    "countryCode",
    "preferredCountryCode",
    "availability",
    "experienceMinYears",
    "languageCodes",
    "minVerificationLevel",
    "openToOverseas",
    "passportValid",
    "verifiedSkillsOnly",
    "verifiedCredentialsOnly",
    "assessedOnly",
    "activeWithinDays",
    "includeHidden",
    "sort",
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Candidates"
        description="Search every candidate profile. Results are masked: contact details and documents need a permission and a recorded reason."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Candidates" }]}
      />
      <FilterScope>
        <FilterBar paramKeys={paramKeys} search={<SearchInput label="Search by role, skill, headline or city" />}>
          <SkillFilter selected={selectedSkills.map((s) => ({ value: s.id, label: s.name }))} />
          <FilterSelect param="countryCode" label="Lives in" allLabel="Any country" options={countries} />
          <FilterSelect param="preferredCountryCode" label="Wants to work in" allLabel="Any country" options={countries} />
          <FilterSelect param="availability" label="Availability" allLabel="Any availability" options={availabilityOptions} />
          <FilterSelect param="experienceMinYears" label="Experience" allLabel="Any experience" options={experienceOptions} />
          <FilterSelect param="languageCodes" label="Language" allLabel="Any language" options={languageOptions} />
          <FilterSelect param="minVerificationLevel" label="Verification" allLabel="Any verification" options={levelOptions} />
          <FilterSelect param="openToOverseas" label="Open to overseas" allLabel="Any" options={YES} />
          <FilterSelect param="passportValid" label="Valid passport" allLabel="Any" options={YES} />
          <FilterSelect param="verifiedSkillsOnly" label="Verified skills only" allLabel="Any" options={YES} />
          <FilterSelect param="verifiedCredentialsOnly" label="Verified credentials only" allLabel="Any" options={YES} />
          <FilterSelect param="assessedOnly" label="Passed a Venkat Sai assessment" allLabel="Any" options={YES} />
          <FilterSelect param="activeWithinDays" label="Active" allLabel="Any time" options={activeOptions} />
          {staffCan(staff, "candidates.manage") ? <FilterSelect param="includeHidden" label="Include hidden profiles" allLabel="No" options={YES} /> : null}
          <FilterSelect param="sort" label="Sort" allLabel="Best match" options={sortOptions} />
        </FilterBar>
        <FilterChips
          filters={[
            { param: "countryCode", label: "Lives in", options: countries },
            { param: "preferredCountryCode", label: "Wants to work in", options: countries },
            { param: "availability", label: "Availability", options: availabilityOptions },
            { param: "experienceMinYears", label: "Experience", options: experienceOptions },
            { param: "languageCodes", label: "Language", options: languageOptions },
            { param: "minVerificationLevel", label: "Verification", options: levelOptions },
            { param: "openToOverseas", label: "Open to overseas", options: YES },
            { param: "passportValid", label: "Valid passport", options: YES },
            { param: "assessedOnly", label: "Assessed", options: YES },
            { param: "activeWithinDays", label: "Active", options: activeOptions },
          ]}
        />
        <FilterPendingRegion>
          <DataTable
            caption="Candidate search results"
            rows={result.items}
            getRowId={(c) => c.candidateId}
            rowLink={(c) => ({ href: `/admin/candidates/${c.candidateId}`, label: `Open profile of ${c.displayName}` })}
            columns={[
              {
                id: "name",
                header: "Candidate",
                primary: true,
                cell: (c) => (
                  <div className="min-w-0">
                    <p className="font-medium">{c.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.headline ?? c.currentJobTitle ?? "No headline"}</p>
                  </div>
                ),
              },
              {
                id: "location",
                header: "Location",
                cell: (c) => [c.location.city, c.location.countryName ?? c.location.countryCode].filter(Boolean).join(", ") || "—",
              },
              { id: "experience", header: "Experience", hideOnMobile: true, cell: (c) => experienceText(c.totalExperienceMonths) },
              { id: "skills", header: "Skills", hideOnMobile: true, cell: (c) => (c.skills.length ? <span className="text-xs">{c.skills.slice(0, 4).join(", ")}{c.skills.length > 4 ? ` +${c.skills.length - 4}` : ""}</span> : "—") },
              {
                id: "verification",
                header: "Verification",
                cell: (c) => (
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge tone={c.verificationLevel === "none" ? "neutral" : "success"} size="sm">{LEVEL_LABELS[c.verificationLevel]}</StatusBadge>
                    {c.passedAssessmentCount ? <StatusBadge tone="brand" size="sm">{`${c.passedAssessmentCount} Venkat Sai assessment${c.passedAssessmentCount === 1 ? "" : "s"} passed`}</StatusBadge> : null}
                  </div>
                ),
              },
              {
                id: "availability",
                header: "Availability",
                hideOnMobile: true,
                cell: (c) => (
                  <span className="text-xs">
                    {c.availability ? humanize(c.availability) : "—"}
                    {c.openToOverseas ? <span className="block text-muted-foreground">Open to overseas</span> : null}
                    {c.visibility === "hidden" ? <span className="block text-muted-foreground">Hidden profile</span> : null}
                  </span>
                ),
              },
              { id: "active", header: "Last active", hideOnMobile: true, cell: (c) => (c.lastActiveAt ? <RelativeTime value={c.lastActiveAt} /> : "—") },
            ]}
            empty={<EmptyState title="No candidates match" description="Try fewer filters or a broader search term." />}
            footer={<Pagination pathname="/admin/candidates" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="candidates" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
