import type { Metadata } from "next";
import { Gauge } from "lucide-react";

import { formatRate } from "@/components/recruiter/labels";
import { BarChart } from "@/components/shared/charts";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRangeFilter, FilterBar } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { requireOrgMember } from "@/modules/identity/authz";
import { getPartnerPerformance } from "@/modules/recruitment/queries";

import { sp } from "../_lib/page-utils";

export const metadata: Metadata = { title: "Performance" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value || !ISO.test(value)) return undefined;
  const d = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function RecruiterPerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgMember("recruitment_partner", "partner.performance.view");
  const params = await searchParams;
  const from = parseDay(sp(params, "from"));
  const to = parseDay(sp(params, "to"), true);
  const perf = await getPartnerPerformance({ kind: "partner", ctx }, { from, to });
  const hasData = perf.profilesSubmitted > 0;
  const funnel = [
    { stage: "Submitted", candidates: perf.profilesSubmitted },
    { stage: "Accepted", candidates: perf.accepted },
    { stage: "Shortlisted", candidates: perf.shortlisted },
    { stage: "Interviewed", candidates: perf.interviewed },
    { stage: "Placed", candidates: perf.placed },
    { stage: "Joined", candidates: perf.joined },
  ];
  const median = perf.timeliness.medianHoursToFirstSubmission;

  return (
    <div className="space-y-6">
      <PageHeader title="Performance" description="Live figures from your submissions and their outcomes on Venkat Sai Global. Choose a period to compare." />
      <FilterBar paramKeys={["from", "to"]} label="Choose a period">
        <DateRangeFilter label="Submitted" emptyLabel="All time" />
      </FilterBar>

      {!hasData ? (
        <EmptyState
          icon={<Gauge aria-hidden="true" />}
          title={from || to ? "No submissions in this period" : "No submissions yet"}
          description="Your performance figures appear here once you submit candidates to assigned requirements."
          primaryAction={{ label: "View requirements", href: "/recruiter/requirements" }}
        />
      ) : (
        <>
          <StatGrid columns={4}>
            <StatCard label="Profiles submitted" value={perf.profilesSubmitted} hint={`${perf.uniqueCandidates} unique candidates`} />
            <StatCard label="Acceptance rate" value={formatRate(perf.rates.acceptance)} hint={`${perf.accepted} accepted · ${perf.rejected} not accepted`} />
            <StatCard label="Placements" value={perf.placed} hint={`${perf.joined} joined`} />
            <StatCard label="Pending review" value={perf.pendingReview} hint={`${perf.duplicates} held as duplicates`} />
          </StatGrid>

          <div className="grid gap-6 lg:grid-cols-3">
            <SectionCard title="From submission to joining" className="lg:col-span-2">
              <BarChart
                title="Candidates at each stage"
                description="Number of your submitted candidates who reached each stage."
                data={funnel}
                index="stage"
                indexLabel="Stage"
                series={[{ key: "candidates", label: "Candidates" }]}
                orientation="horizontal"
                size="md"
              />
            </SectionCard>
            <SectionCard title="Conversion">
              <dl className="space-y-3 text-sm">
                {[
                  { label: "Shortlisted", value: formatRate(perf.rates.shortlist) },
                  { label: "Interviewed", value: formatRate(perf.rates.interview) },
                  { label: "Placed", value: formatRate(perf.rates.placement) },
                  { label: "Profiles verified by Venkat Sai", value: `${perf.verifiedProfiles} of ${perf.uniqueCandidates}` },
                ].map((r) => (
                  <div key={r.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">{r.label}</dt>
                    <dd className="font-medium tabular-nums text-foreground">{r.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">Rates are shares of the profiles you submitted in the period.</p>
            </SectionCard>
          </div>

          <SectionCard title="Timeliness">
            <StatGrid columns={3}>
              <StatCard label="Submitted before the due date" value={formatRate(perf.timeliness.onTimeRate)} hint={`${perf.timeliness.onTime} of ${perf.timeliness.submissionsWithDueDate} submissions with a due date`} />
              <StatCard label="Median time to first submission" value={median === null ? null : median < 48 ? Math.round(median) : Math.round((median / 24) * 10) / 10} unit={median === null ? undefined : median < 48 ? "hours" : "days"} hint="From assignment to your first candidate" />
              <StatCard label="Duplicates" value={perf.duplicates} hint="Candidates another partner already represented" />
            </StatGrid>
          </SectionCard>
        </>
      )}
    </div>
  );
}
