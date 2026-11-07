import type { Metadata } from "next";

import { analyticsHref, formatDuration } from "@/components/analytics-dashboard/format";
import { AnalyticsFrame } from "@/components/analytics-dashboard/page-frame";
import { RankedList } from "@/components/analytics-dashboard/ranked-list";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { formatPercent } from "@/lib/format";
import type { SearchParams } from "@/lib/http";
import { getAnalyticsRange } from "@/modules/analytics/access";
import { getExitPages, getLandingPages, getTopPages } from "@/modules/analytics/queries";
import { requireStaff } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Page analytics" };

const empty = <EmptyState size="sm" variant="plain" title="No page views in this period" />;
const pathCell = (path: string) => <code className="font-mono text-xs break-all">{path}</code>;
const n = (v: number) => v.toLocaleString("en-IN");

export default async function PagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("analytics.view");
  const range = getAnalyticsRange(await searchParams);

  const [top, landing, exits] = await Promise.all([
    getTopPages(staff, range, { limit: 100 }),
    getLandingPages(staff, range, { limit: 25 }),
    getExitPages(staff, range, { limit: 25 }),
  ]);
  const services = top.filter((p) => p.path.startsWith("/services/")).slice(0, 10);

  return (
    <AnalyticsFrame
      staff={staff}
      range={range}
      title="Pages"
      description="Most viewed pages, where sessions start and end, and which services draw the most interest. Identifiers in paths are replaced, e.g. /jobs/[id]."
    >
      <SectionCard title="Top pages" description="Page views, sessions and how far people scroll." flush>
        <DataTable
          caption="Top pages by page views"
          rows={top.slice(0, 25)}
          getRowId={(r) => r.path}
          rowLink={(r) => ({ href: analyticsHref("/admin/analytics/heatmaps", range, { path: r.path }), label: `Open the heatmap for ${r.path}` })}
          columns={[
            { id: "path", header: "Page", primary: true, cell: (r) => pathCell(r.path) },
            { id: "views", header: "Page views", align: "right", cell: (r) => n(r.pageViews) },
            { id: "sessions", header: "Sessions", align: "right", hideOnMobile: true, cell: (r) => n(r.sessions) },
            { id: "scroll", header: "Avg scroll depth", align: "right", cell: (r) => (r.avgScrollDepth === null ? "—" : `${Math.round(r.avgScrollDepth)}%`) },
          ]}
          empty={empty}
        />
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Landing pages" description="The first page of each session." flush>
          <DataTable
            caption="Landing pages"
            rows={landing}
            getRowId={(r) => r.path}
            columns={[
              { id: "path", header: "Page", primary: true, cell: (r) => pathCell(r.path) },
              { id: "sessions", header: "Sessions", align: "right", cell: (r) => n(r.sessions) },
              { id: "bounce", header: "Bounce", align: "right", cell: (r) => formatPercent(r.bounceRate) },
              { id: "duration", header: "Avg session", align: "right", hideOnMobile: true, cell: (r) => formatDuration(r.avgSessionDuration) },
              { id: "conversions", header: "Conversions", align: "right", cell: (r) => n(r.conversions) },
            ]}
            empty={empty}
          />
        </SectionCard>

        <SectionCard title="Exit pages" description="The last page of each session." flush>
          <DataTable
            caption="Exit pages"
            rows={exits}
            getRowId={(r) => r.path}
            columns={[
              { id: "path", header: "Page", primary: true, cell: (r) => pathCell(r.path) },
              { id: "exits", header: "Exits", align: "right", cell: (r) => n(r.exits) },
              { id: "views", header: "Page views", align: "right", hideOnMobile: true, cell: (r) => n(r.pageViews) },
              { id: "rate", header: "Exit rate", align: "right", cell: (r) => formatPercent(r.exitRate) },
            ]}
            empty={empty}
          />
        </SectionCard>
      </div>

      <SectionCard title="Most visited services" description="Service pages (/services/…) by page views.">
        <RankedList
          label="Service pages by page views"
          valueLabel="page views"
          rows={services.map((s) => ({ key: s.path, label: pathCell(s.path), value: s.pageViews }))}
          emptyTitle="No service pages viewed in this period"
        />
      </SectionCard>
    </AnalyticsFrame>
  );
}
