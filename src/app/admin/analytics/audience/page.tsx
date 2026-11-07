import type { Metadata } from "next";

import { AnalyticsFrame } from "@/components/analytics-dashboard/page-frame";
import { RankedList } from "@/components/analytics-dashboard/ranked-list";
import { DonutChart } from "@/components/shared/charts";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { formatPercent, humanize } from "@/lib/format";
import type { SearchParams } from "@/lib/http";
import { getAnalyticsRange } from "@/modules/analytics/access";
import { getCountryBreakdown, getTechBreakdown } from "@/modules/analytics/queries";
import type { BreakdownRow } from "@/modules/analytics/types";
import { requireStaff } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Audience" };

function toRows(rows: BreakdownRow[]) {
  return rows.map((r) => ({ key: r.value, label: humanize(r.value || "unknown"), value: r.sessions, hint: formatPercent(r.share, 0) }));
}

export default async function AudiencePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("analytics.view");
  const range = getAnalyticsRange(await searchParams);
  const [tech, countries] = await Promise.all([getTechBreakdown(staff, range), getCountryBreakdown(staff, range, { limit: 25 })]);

  return (
    <AnalyticsFrame
      staff={staff}
      range={range}
      title="Audience"
      description="Device types, browser and operating-system families, and coarse country. No user-agent strings or IP addresses are stored."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Devices" description="Sessions by device type.">
          {tech.devices.length ? (
            <DonutChart
              title="Sessions by device type"
              categoryLabel="Device"
              centerLabel="sessions"
              data={tech.devices.map((d) => ({ label: humanize(d.value || "unknown"), value: d.sessions }))}
            />
          ) : (
            <EmptyState size="sm" variant="plain" title="No sessions in this period" />
          )}
        </SectionCard>
        <SectionCard title="Countries" description="From the hosting edge's country header only; city or precise location is never recorded.">
          <RankedList
            label="Sessions by country"
            valueLabel="sessions"
            rows={countries.map((c) => ({
              key: c.countryCode ?? "unknown",
              label: c.countryName ?? c.countryCode ?? "Unknown",
              value: c.sessions,
              hint: formatPercent(c.share, 0),
            }))}
            emptyTitle="No country information in this period"
            emptyDescription="Country is only available when the hosting platform supplies it."
          />
        </SectionCard>
        <SectionCard title="Browsers" description="Browser family by sessions.">
          <RankedList label="Sessions by browser" valueLabel="sessions" rows={toRows(tech.browsers)} />
        </SectionCard>
        <SectionCard title="Operating systems" description="Operating-system family by sessions.">
          <RankedList label="Sessions by operating system" valueLabel="sessions" rows={toRows(tech.operatingSystems)} />
        </SectionCard>
      </div>
    </AnalyticsFrame>
  );
}
