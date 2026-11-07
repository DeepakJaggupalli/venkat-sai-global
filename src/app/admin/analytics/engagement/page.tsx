import type { Metadata } from "next";

import { AnalyticsFrame } from "@/components/analytics-dashboard/page-frame";
import { RankedList } from "@/components/analytics-dashboard/ranked-list";
import { BarChart } from "@/components/shared/charts";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatPercent, humanize } from "@/lib/format";
import type { SearchParams } from "@/lib/http";
import { getAnalyticsRange } from "@/modules/analytics/access";
import { getCtaPerformance, getFormAnalytics, getSearchAnalytics } from "@/modules/analytics/behaviour";
import { requireStaff } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Forms, search and CTAs" };

const n = (v: number) => v.toLocaleString("en-IN");

export default async function EngagementPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("analytics.view");
  const range = getAnalyticsRange(await searchParams);
  const [forms, search, ctas] = await Promise.all([getFormAnalytics(staff, range), getSearchAnalytics(staff, range), getCtaPerformance(staff, range)]);
  const chartForms = forms.slice(0, 8).map((f) => ({ form: humanize(f.formId), started: f.started, submitted: f.submitted }));

  return (
    <AnalyticsFrame
      staff={staff}
      range={range}
      title="Forms, search and CTAs"
      description="Where people give up on forms, what they look for, and which calls to action lead to conversions. Field values and search words are never recorded."
    >
      <nav aria-label="On this page" className="flex flex-wrap gap-3 text-sm">
        <a className="font-medium text-teal-strong underline-offset-4 hover:underline" href="#forms">
          Form abandonment
        </a>
        <a className="font-medium text-teal-strong underline-offset-4 hover:underline" href="#search">
          Search insights
        </a>
        <a className="font-medium text-teal-strong underline-offset-4 hover:underline" href="#ctas">
          CTA performance
        </a>
      </nav>

      <SectionCard id="forms" title="Form abandonment" description="Forms marked with data-analytics-form: started on first field focus, submitted on submit.">
        {forms.length ? (
          <div className="space-y-6">
            <BarChart
              title="Forms started and submitted"
              orientation="horizontal"
              index="form"
              indexLabel="Form"
              data={chartForms}
              series={[
                { key: "started", label: "Started" },
                { key: "submitted", label: "Submitted" },
              ]}
            />
            <DataTable
              caption="Form completion and abandonment"
              rows={forms}
              getRowId={(r) => r.formId}
              bordered
              columns={[
                { id: "form", header: "Form", primary: true, cell: (r) => <code className="font-mono text-xs">{r.formId}</code> },
                { id: "started", header: "Started", align: "right", cell: (r) => n(r.started) },
                { id: "submitted", header: "Submitted", align: "right", cell: (r) => n(r.submitted) },
                { id: "completion", header: "Completion", align: "right", hideOnMobile: true, cell: (r) => formatPercent(r.completionRate) },
                {
                  id: "abandonment",
                  header: "Abandonment",
                  align: "right",
                  cell: (r) => (
                    <StatusBadge size="sm" tone={r.abandonmentRate >= 0.6 && r.started >= 10 ? "warning" : "neutral"}>
                      {formatPercent(r.abandonmentRate)}
                    </StatusBadge>
                  ),
                },
              ]}
            />
          </div>
        ) : (
          <EmptyState size="sm" variant="plain" title="No form activity in this period" description="Forms report here once visitors who accepted analytics start filling them in." />
        )}
      </SectionCard>

      <SectionCard id="search" title="Search insights" description="Job and course searches: categories and filters used. Typed keywords are never stored.">
        <div className="space-y-6">
          <StatGrid columns={2}>
            <StatCard label="Searches" value={search.searches} />
            <StatCard label="Listing page views" value={search.listingPageViews} hint="Job and course listing pages" />
          </StatGrid>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="font-heading text-base font-semibold">Categories searched</h3>
              <RankedList
                label="Search categories"
                valueLabel="searches"
                rows={search.categories.map((c) => ({ key: c.value, label: humanize(c.value), value: c.count }))}
                emptyTitle="No categories chosen in this period"
              />
            </div>
            <div className="space-y-3">
              <h3 className="font-heading text-base font-semibold">Filters used</h3>
              <RankedList
                label="Filters used"
                valueLabel="uses"
                rows={search.filterKeys.map((c) => ({ key: c.key, label: humanize(c.key), value: c.count }))}
                emptyTitle="No filters used in this period"
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard id="ctas" title="CTA performance" description="Buttons and links marked with data-analytics-cta, and how many of the sessions that clicked went on to convert." flush>
        <DataTable
          caption="Call-to-action performance"
          rows={ctas}
          getRowId={(r) => r.cta}
          columns={[
            {
              id: "cta",
              header: "Call to action",
              primary: true,
              cell: (r) => (
                <div>
                  <code className="font-mono text-xs">{r.cta}</code>
                  {r.locations.length ? <p className="text-xs text-muted-foreground">On: {r.locations.join(", ")}</p> : null}
                </div>
              ),
            },
            { id: "clicks", header: "Clicks", align: "right", cell: (r) => n(r.clicks) },
            { id: "sessions", header: "Sessions", align: "right", hideOnMobile: true, cell: (r) => n(r.sessions) },
            { id: "converted", header: "Converted sessions", align: "right", hideOnMobile: true, cell: (r) => n(r.convertedSessions) },
            { id: "rate", header: "Conversion rate", align: "right", cell: (r) => formatPercent(r.conversionRate) },
          ]}
          empty={<EmptyState size="sm" variant="plain" title="No CTA clicks in this period" />}
        />
      </SectionCard>
    </AnalyticsFrame>
  );
}
