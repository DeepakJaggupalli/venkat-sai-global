import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { FunnelBuilder } from "@/components/analytics-dashboard/funnel-builder";
import { AnalyticsFrame } from "@/components/analytics-dashboard/page-frame";
import type { SearchParams } from "@/lib/http";
import { getAnalyticsRange } from "@/modules/analytics/access";
import { ANALYTICS_EVENT_LABELS, ANALYTICS_EVENTS } from "@/modules/analytics/events";
import { getFunnel } from "@/modules/analytics/funnels";
import { requireStaff } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Edit funnel" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditFunnelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("analytics.configure");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [funnel, sp] = await Promise.all([getFunnel(staff, id), searchParams]);
  if (!funnel) notFound();
  const range = getAnalyticsRange(sp);
  const eventOptions = ANALYTICS_EVENTS.map((e) => ({ value: e, label: `${ANALYTICS_EVENT_LABELS[e]} (${e})` }));

  return (
    <AnalyticsFrame
      staff={staff}
      range={range}
      title={`Edit ${funnel.name}`}
      trail={[{ label: "Journeys and funnels", href: `/admin/analytics/funnels?funnel=${funnel.id}` }]}
      description="Change the steps or completion window. Results are recalculated from recorded events, so past periods update too."
    >
      <FunnelBuilder
        canSave
        eventOptions={eventOptions}
        range={{ range: range.preset, from: range.from, to: range.to }}
        initial={{
          id: funnel.id,
          name: funnel.name,
          description: funnel.description,
          windowDays: funnel.windowDays,
          isActive: funnel.isActive,
          steps: funnel.steps,
          isDefault: funnel.key !== null,
        }}
      />
    </AnalyticsFrame>
  );
}
