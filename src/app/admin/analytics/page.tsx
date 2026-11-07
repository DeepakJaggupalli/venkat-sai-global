import { Activity, Clock, Eye, MousePointerClick, Repeat, Timer, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";

import { formatDuration, returningVisitors } from "@/components/analytics-dashboard/format";
import { AnalyticsFrame } from "@/components/analytics-dashboard/page-frame";
import { AreaChart, LineChart } from "@/components/shared/charts";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { formatPercent } from "@/lib/format";
import type { SearchParams } from "@/lib/http";
import { getAnalyticsRange } from "@/modules/analytics/access";
import { getActiveVisitors, getAnalyticsOverview, getAnalyticsTimeSeries } from "@/modules/analytics/queries";
import { requireStaff } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Website analytics" };

export default async function AnalyticsOverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("analytics.view");
  const sp = await searchParams;
  const range = getAnalyticsRange(sp);
  const previousRange = { ...range, from: range.previousFrom, to: range.previousTo };

  const [overview, series, previousSeries, active] = await Promise.all([
    getAnalyticsOverview(staff, range),
    getAnalyticsTimeSeries(staff, range),
    getAnalyticsTimeSeries(staff, previousRange),
    getActiveVisitors(staff),
  ]);
  const { current, change } = overview;
  const period = "vs previous period";
  const delta = (value: number | null, goodDirection: "up" | "down" = "up") =>
    value === null ? undefined : { value, format: "percent" as const, period, goodDirection };

  // Same-length periods, aligned by day number, so the two lines compare like for like.
  const comparison = series.map((point, i) => ({
    day: `Day ${i + 1}`,
    current: point.sessions,
    previous: previousSeries[i]?.sessions ?? 0,
  }));
  const hasTraffic = current.sessions > 0 || series.some((p) => p.sessions > 0);

  return (
    <AnalyticsFrame
      root
      staff={staff}
      range={range}
      title="Website analytics"
      description="Traffic, engagement and conversions on the public website and portals, from visitors who consented to analytics."
    >
      <section aria-labelledby="kpi-heading" className="space-y-3">
        <h2 id="kpi-heading" className="sr-only">
          Key figures
        </h2>
        <StatGrid columns={4}>
          <StatCard label="Active now" value={active.sessions} icon={<Activity />} hint="Sessions in the last 5 minutes" href="/admin/analytics/realtime" />
          <StatCard label="Unique visitors" value={current.visitors} icon={<Users />} delta={delta(change.visitors)} />
          <StatCard label="New visitors" value={current.newVisitors} icon={<UserPlus />} delta={delta(change.newVisitors)} />
          <StatCard
            label="Returning visitors"
            value={returningVisitors(current.visitors, current.newVisitors)}
            icon={<Repeat />}
            hint="Visited before this period"
          />
          <StatCard label="Sessions" value={current.sessions} icon={<Clock />} delta={delta(change.sessions)} />
          <StatCard label="Page views" value={current.pageViews} icon={<Eye />} delta={delta(change.pageViews)} hint={`${current.pagesPerSession.toFixed(1)} per session`} />
          <StatCard
            label="Average session"
            value={formatDuration(current.avgSessionDuration)}
            icon={<Timer />}
            delta={delta(change.avgSessionDuration)}
          />
          <StatCard label="Bounce rate" value={formatPercent(current.bounceRate)} icon={<Repeat />} delta={delta(change.bounceRate, "down")} hint="Single-page sessions" />
          <StatCard label="Conversions" value={current.conversions} icon={<MousePointerClick />} delta={delta(change.conversions)} hint="Key actions completed" />
          <StatCard
            label="Conversion rate"
            value={formatPercent(current.conversionRate)}
            icon={<MousePointerClick />}
            delta={delta(change.conversionRate)}
            hint="Sessions with a key action"
          />
        </StatGrid>
      </section>

      {hasTraffic ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Traffic over time" description="Sessions and unique visitors per day.">
            <LineChart
              title="Sessions and visitors per day"
              index="date"
              indexLabel="Date"
              xFormat="date"
              data={series}
              series={[
                { key: "sessions", label: "Sessions" },
                { key: "visitors", label: "Visitors" },
              ]}
            />
          </SectionCard>
          <SectionCard title="This period vs the previous one" description="Sessions per day, aligned by day number.">
            <LineChart
              title="Sessions per day, this period compared with the previous period"
              index="day"
              indexLabel="Day"
              data={comparison}
              series={[
                { key: "current", label: "This period" },
                { key: "previous", label: "Previous period" },
              ]}
            />
          </SectionCard>
          <SectionCard title="Page views per day">
            <AreaChart title="Page views per day" index="date" indexLabel="Date" xFormat="date" data={series} series={[{ key: "pageViews", label: "Page views" }]} />
          </SectionCard>
          <SectionCard title="Conversions per day" description="Key actions such as applications, enquiries and registrations.">
            <AreaChart title="Conversions per day" index="date" indexLabel="Date" xFormat="date" data={series} series={[{ key: "conversions", label: "Conversions" }]} />
          </SectionCard>
        </div>
      ) : (
        <EmptyState
          title="No consented visits in this period"
          description="Analytics only counts visitors who accept analytics cookies. Try a longer period, or check that first-party analytics is switched on in settings."
          primaryAction={{ label: "Analytics settings", href: "/admin/analytics/settings" }}
          secondaryAction={{ label: "Last 90 days", href: "/admin/analytics?range=90d" }}
        />
      )}
    </AnalyticsFrame>
  );
}
