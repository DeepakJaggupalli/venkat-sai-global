import type { Metadata } from "next";

import { isPreviewablePath } from "@/components/analytics-dashboard/format";
import { HeatmapViewer } from "@/components/analytics-dashboard/heatmap-viewer";
import { AnalyticsFrame } from "@/components/analytics-dashboard/page-frame";
import { BarChart } from "@/components/shared/charts";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterPendingRegion, FilterScope, FilterSelect } from "@/components/shared/filters";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import type { SearchParams } from "@/lib/http";
import { getAnalyticsRange } from "@/modules/analytics/access";
import { getHeatmap, listHeatmapPages } from "@/modules/analytics/behaviour";
import { heatmapQuerySchema } from "@/modules/analytics/schemas";
import { requireStaff } from "@/modules/identity/authz";
import { isFeatureEnabled } from "@/modules/settings";

export const metadata: Metadata = { title: "Heatmaps" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const VIEWPORT_OPTIONS = [
  { value: "desktop", label: "Desktop" },
  { value: "tablet", label: "Tablet" },
  { value: "mobile", label: "Mobile" },
];
const KIND_OPTIONS = [
  { value: "dead_click", label: "Dead clicks only" },
  { value: "rage_click", label: "Rage clicks only" },
];

export default async function HeatmapsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("analytics.view");
  const sp = await searchParams;
  const range = getAnalyticsRange(sp);
  const viewportParsed = heatmapQuerySchema.shape.viewport.safeParse(first(sp.viewport) ?? undefined);
  const viewport = viewportParsed.success ? viewportParsed.data : "desktop";
  const kindParsed = heatmapQuerySchema.shape.kind.safeParse(first(sp.kind) ?? undefined);
  const kind = kindParsed.success ? kindParsed.data : undefined;

  const [pages, heatmapsOn] = await Promise.all([listHeatmapPages(staff, range, { viewport, limit: 50 }), isFeatureEnabled("analytics.heatmaps")]);
  const requestedPath = first(sp.path)?.trim();
  const path = requestedPath && requestedPath.startsWith("/") && requestedPath.length <= 1024 ? requestedPath : pages[0]?.path;
  const heatmap = path ? await getHeatmap(staff, range, { path, viewport, kind }) : null;

  const pageOptions = pages.map((p) => ({ value: p.path, label: `${p.path} (${p.clicks.toLocaleString("en-IN")} clicks)` }));
  if (path && !pages.some((p) => p.path === path)) pageOptions.unshift({ value: path, label: path });

  return (
    <AnalyticsFrame
      staff={staff}
      range={range}
      title="Heatmaps"
      description="Where people click and how far they scroll, per page and screen size. Element text and form values are never captured."
    >
      {!heatmapsOn ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Heatmap collection is switched off in analytics settings. Data recorded earlier is still shown until it expires.
        </p>
      ) : null}

      <FilterScope>
        <div className="space-y-6">
          <FilterBar paramKeys={["path", "viewport", "kind"]} label="Heatmap options">
            <FilterSelect param="path" label="Page" showLabel allLabel="Most clicked page" options={pageOptions} triggerClassName="w-72 max-w-full" />
            <FilterSelect param="viewport" label="Screen size" showLabel allLabel="Desktop" options={VIEWPORT_OPTIONS.slice(1)} />
            <FilterSelect param="kind" label="Clicks" showLabel allLabel="All clicks" options={KIND_OPTIONS} />
          </FilterBar>

          <FilterPendingRegion>
            {!heatmap ? (
              <EmptyState
                title="No heatmap data in this period"
                description="Click positions are recorded for visitors who accepted analytics cookies, on public pages, while heatmaps are switched on. Try a longer period or another screen size."
              />
            ) : (
              <div className="space-y-6">
                <StatGrid columns={4}>
                  <StatCard label="Clicks" value={heatmap.totals.clicks} />
                  <StatCard label="Rage clicks" value={heatmap.totals.rageClicks} hint="Repeated fast clicks in one spot" />
                  <StatCard label="Dead clicks" value={heatmap.totals.deadClicks} hint="Clicks that changed nothing" />
                  <StatCard
                    label="Average scroll depth"
                    value={heatmap.scroll.avgMaxDepth === null ? null : `${Math.round(heatmap.scroll.avgMaxDepth)}%`}
                    hint={`${heatmap.scroll.sessions.toLocaleString("en-IN")} sessions measured`}
                  />
                </StatGrid>

                <SectionCard title={`Click density · ${heatmap.path}`} description={`${VIEWPORT_OPTIONS.find((v) => v.value === viewport)?.label} screens.`}>
                  {heatmap.cells.length ? (
                    <HeatmapViewer
                      key={`${heatmap.path}|${viewport}|${kind ?? "all"}`}
                      path={heatmap.path}
                      viewport={viewport}
                      cells={heatmap.cells}
                      docHeight={heatmap.docHeight}
                      previewable={isPreviewablePath(heatmap.path)}
                      totalClicks={heatmap.totals.clicks}
                    />
                  ) : (
                    <EmptyState size="sm" variant="plain" title="No clicks recorded for this page and screen size" />
                  )}
                </SectionCard>

                <div className="grid gap-6 xl:grid-cols-2">
                  <SectionCard title="Scroll depth" description="Share of measured sessions that reached each depth of the page.">
                    {heatmap.scroll.sessions ? (
                      <BarChart
                        title="Share of sessions reaching each scroll depth"
                        index="depth"
                        indexLabel="Scroll depth"
                        data={heatmap.scroll.reach.map((r) => ({ depth: `${r.depth}%`, share: r.share, sessions: r.sessions }))}
                        series={[{ key: "share", label: "Sessions reaching this depth" }]}
                        numberFormat={{ style: "percent", maximumFractionDigits: 0 }}
                      />
                    ) : (
                      <EmptyState size="sm" variant="plain" title="No scroll measurements for this page" />
                    )}
                  </SectionCard>

                  <SectionCard title="Most clicked elements" description="Readable selectors, with rage and dead clicks per element." flush>
                    <DataTable
                      caption="Most clicked elements"
                      rows={heatmap.topSelectors}
                      getRowId={(r) => r.selector}
                      columns={[
                        { id: "selector", header: "Element", primary: true, cell: (r) => <code className="font-mono text-xs break-all">{r.selector}</code> },
                        { id: "clicks", header: "Clicks", align: "right", cell: (r) => r.clicks.toLocaleString("en-IN") },
                        { id: "rage", header: "Rage", align: "right", cell: (r) => r.rageClicks.toLocaleString("en-IN") },
                        { id: "dead", header: "Dead", align: "right", cell: (r) => r.deadClicks.toLocaleString("en-IN") },
                      ]}
                      empty={<EmptyState size="sm" variant="plain" title="No element clicks recorded" />}
                    />
                  </SectionCard>
                </div>
              </div>
            )}
          </FilterPendingRegion>
        </div>
      </FilterScope>
    </AnalyticsFrame>
  );
}
