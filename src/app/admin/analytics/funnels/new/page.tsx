import type { Metadata } from "next";

import { FunnelBuilder } from "@/components/analytics-dashboard/funnel-builder";
import { AnalyticsFrame } from "@/components/analytics-dashboard/page-frame";
import type { SearchParams } from "@/lib/http";
import { getAnalyticsRange } from "@/modules/analytics/access";
import { ANALYTICS_EVENT_LABELS, ANALYTICS_EVENTS } from "@/modules/analytics/events";
import { requireStaff, staffCan } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Build a funnel" };

export default async function NewFunnelPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("analytics.view");
  const range = getAnalyticsRange(await searchParams);
  const eventOptions = ANALYTICS_EVENTS.map((e) => ({ value: e, label: `${ANALYTICS_EVENT_LABELS[e]} (${e})` }));

  return (
    <AnalyticsFrame
      staff={staff}
      range={range}
      title="Build a funnel"
      trail={[{ label: "Journeys and funnels", href: "/admin/analytics/funnels" }]}
      description="Define the ordered steps of a journey, preview it against the selected period, then save it."
    >
      <FunnelBuilder
        eventOptions={eventOptions}
        range={{ range: range.preset, from: range.from, to: range.to }}
        canSave={staffCan(staff, "analytics.configure")}
      />
    </AnalyticsFrame>
  );
}
