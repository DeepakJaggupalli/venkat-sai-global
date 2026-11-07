import { Activity } from "lucide-react";
import type { Metadata } from "next";

import { AutoRefresh } from "@/components/analytics-dashboard/auto-refresh";
import { AnalyticsFrame } from "@/components/analytics-dashboard/page-frame";
import { RankedList } from "@/components/analytics-dashboard/ranked-list";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { getActiveVisitors } from "@/modules/analytics/queries";
import { requireStaff } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Real-time visitors" };

export default async function RealtimePage() {
  const staff = await requireStaff("analytics.view");
  const active = await getActiveVisitors(staff);
  const pagesWithVisitors = active.pages.length;

  return (
    <AnalyticsFrame
      staff={staff}
      title="Real-time"
      description="Consented visitors active in the last 5 minutes and the pages they are on."
      actions={<AutoRefresh asOf={active.asOf.toISOString()} />}
    >
      <StatGrid columns={2}>
        <StatCard label="Active sessions" value={active.sessions} icon={<Activity />} hint="Seen in the last 5 minutes" />
        <StatCard label="Pages being viewed" value={pagesWithVisitors} hint="Distinct pages with an active session" />
      </StatGrid>
      <SectionCard title="Current pages" description="Where active sessions were last seen.">
        {active.sessions ? (
          <RankedList
            label="Active sessions by current page"
            valueLabel="active sessions"
            rows={active.pages.map((p) => ({ key: p.path, label: <code className="font-mono text-xs">{p.path}</code>, value: p.sessions }))}
          />
        ) : (
          <EmptyState
            size="sm"
            title="Nobody is active right now"
            description="Only visitors who accepted analytics cookies appear here. Staff browsing is never counted."
          />
        )}
      </SectionCard>
    </AnalyticsFrame>
  );
}
