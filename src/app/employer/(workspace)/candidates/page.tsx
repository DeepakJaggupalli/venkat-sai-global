import type { Metadata } from "next";
import { SearchX, Users } from "lucide-react";

import { CandidateFilters } from "@/components/employer-talent/candidate-filters";
import { CandidateResultCard } from "@/components/employer-talent/candidate-result-card";
import { CompareBar, CompareSelectionProvider } from "@/components/employer-talent/compare-selection";
import { countActiveCandidateFilters } from "@/components/employer-talent/search-query";
import { Callout } from "@/components/shared/callout";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { ActionError } from "@/lib/actions";
import type { SearchParams } from "@/lib/http";
import { parseCandidateSearchParams } from "@/modules/candidates/schemas";
import { searchCandidates } from "@/modules/candidates/search";
import type { CandidateSearchResult } from "@/modules/candidates/types";
import { requireOrgMember } from "@/modules/identity/authz";

import { loadListChoices } from "./_lib/lists";
import { filterValuesFrom, loadCandidateFilterOptions } from "./_lib/options";

export const metadata: Metadata = { title: "Find candidates" };

const SORT_OPTIONS = [
  { value: "recent", label: "Recently active" },
  { value: "experience", label: "Most experience" },
  { value: "completeness", label: "Most complete profiles" },
];

const ERROR_HELP: Record<string, { title: string; action?: { label: string; href: string } }> = {
  entitlement_required: { title: "Candidate search is not included in your plan", action: { label: "View plans and credits", href: "/employer/billing" } },
  organization_inactive: { title: "Search is paused for your organisation", action: { label: "Check verification", href: "/employer/company/verification" } },
  feature_disabled: { title: "Candidate search is not available right now" },
  rate_limited: { title: "Too many searches in a short time" },
  forbidden: { title: "You do not have access to candidate search" },
};

export default async function CandidateSearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("employer", "employer.candidates.search");
  const sp = await searchParams;
  const filters = parseCandidateSearchParams(sp);

  let result: CandidateSearchResult | null = null;
  let error: { message: string; code?: string } | null = null;
  try {
    result = await searchCandidates(filters, { kind: "employer", ctx });
  } catch (err) {
    if (!(err instanceof ActionError)) throw err;
    error = { message: err.message, code: err.code };
  }

  const [options, values, { lists, canUseLists }] = await Promise.all([loadCandidateFilterOptions(), filterValuesFrom(filters), loadListChoices(ctx)]);
  const activeCount = countActiveCandidateFilters(sp);
  const help = error ? (ERROR_HELP[error.code ?? ""] ?? { title: "Search could not run" }) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Find candidates"
        description="Search people who chose to be discoverable by employers. Profiles stay masked until a candidate applies to your job or you unlock their contact details."
        breadcrumbs={[{ label: "Employer", href: "/employer" }, { label: "Find candidates" }]}
        actions={canUseLists ? [{ label: "Talent lists", href: "/employer/lists", variant: "outline" }] : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside aria-label="Filters" className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          <CandidateFilters key={JSON.stringify(sp)} options={options} values={values} activeCount={activeCount} />
        </aside>

        <section aria-labelledby="results-heading" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="results-heading" className="font-heading text-lg font-semibold" aria-live="polite">
              {result ? `${result.total.toLocaleString("en-IN")} ${result.total === 1 ? "candidate" : "candidates"}` : "Results"}
            </h2>
            <FilterSelect param="sort" label="Sort by" options={SORT_OPTIONS} allLabel="Best match" />
          </div>

          {error && help ? (
            <Callout tone="warning" title={help.title} action={help.action}>
              {error.message}
            </Callout>
          ) : null}

          {result && result.items.length === 0 ? (
            activeCount || filters.q ? (
              <EmptyState
                icon={<SearchX aria-hidden />}
                title="No candidates match these filters"
                description="Try fewer filters, a broader location or related skills. Only people who chose to be discoverable appear here."
                primaryAction={{ label: "Clear filters", href: "/employer/candidates" }}
                secondaryAction={{ label: "Post a job to receive applications", href: "/employer/jobs/new" }}
              />
            ) : (
              <EmptyState
                icon={<Users aria-hidden />}
                title="No discoverable candidates yet"
                description="Candidates appear here once they make their profile visible to employers. Posting a job is the quickest way to reach people now."
                primaryAction={{ label: "Post a job", href: "/employer/jobs/new" }}
                secondaryAction={{ label: "Submit a workforce requirement", href: "/employer/requirements" }}
              />
            )
          ) : null}

          {result && result.items.length > 0 ? (
            <CompareSelectionProvider>
              <ul className="grid gap-4 xl:grid-cols-2" aria-label="Candidates">
                {result.items.map((card) => (
                  <li key={card.candidateId} className="flex">
                    <div className="w-full">
                      <CandidateResultCard card={card} lists={lists} canUseLists={canUseLists} />
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination
                pathname="/employer/candidates"
                searchParams={sp}
                page={result.page}
                pageCount={result.pageCount}
                total={result.total}
                pageSize={result.pageSize}
                itemLabel="candidates"
              />
              <CompareBar lists={lists} canUseLists={canUseLists} />
            </CompareSelectionProvider>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Candidates are never charged to be found, contacted or interviewed. Photos are not shown in search to reduce bias. Opening a profile is recorded in the
            candidate&apos;s access history.
          </p>
        </section>
      </div>
    </div>
  );
}
