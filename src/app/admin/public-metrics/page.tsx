import type { Metadata } from "next";

import { MetricCard, type MetricCardData } from "@/components/cms/metric-card";
import { CreateCustomMetricButton, RefreshLiveMetricsButton } from "@/components/cms/metric-tools";
import { Callout } from "@/components/shared/callout";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { env } from "@/lib/env";
import { requireStaff } from "@/modules/identity/authz";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";
import { listMetricConfigs } from "@/modules/content/queries";
import { getFiles, toFileSummary } from "@/modules/files";

export const metadata: Metadata = { title: "Public statistics" };

export default async function PublicMetricsPage() {
  const ctx = await requireStaff("metrics.public_manage");
  const metrics = await listMetricConfigs(ctx);
  const evidenceIds = metrics.map((m) => m.evidenceFileId).filter((id): id is string => Boolean(id));
  const files = evidenceIds.length ? await getFiles(evidenceIds) : [];
  const fileById = new Map(files.map((f) => [f.id, toFileSummary(f)]));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.user.timezone ?? env().DEFAULT_TIMEZONE }).format(new Date());
  const shown = metrics.filter((m) => m.publicValue !== null).length;

  const cards: MetricCardData[] = metrics.map((m) => ({
    key: m.key,
    label: m.label,
    mode: m.mode,
    isVisible: m.isVisible,
    definition: m.definition,
    isStandard: m.isStandard,
    liveValue: m.liveValue,
    liveValueComputedAt: m.liveValueComputedAt?.toISOString() ?? null,
    manualValue: m.manualValue,
    asOfDate: m.asOfDate,
    approvedValue: m.approvedValue,
    approvedAsOfDate: m.approvedAsOfDate,
    approvedAt: m.approvedAt?.toISOString() ?? null,
    approvedByName: m.approvedByName,
    manualApprovalCurrent: m.manualApprovalCurrent,
    evidenceNote: m.evidenceNote,
    evidenceFile: m.evidenceFileId ? (fileById.get(m.evidenceFileId) ?? null) : null,
    minDisplayValue: m.minDisplayValue,
    sortOrder: m.sortOrder,
    publicValue: m.publicValue,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Public statistics"
        description={`The credibility figures on the homepage. ${shown === 0 ? "None are shown at the moment, so the section is hidden." : `${shown} ${shown === 1 ? "is" : "are"} shown at the moment.`}`}
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Content", href: CONTENT_ADMIN_PATHS.content }, { label: "Public statistics" }]}
        actions={[<RefreshLiveMetricsButton key="refresh" />, <CreateCustomMetricButton key="create" />]}
      />

      <Callout tone="warning" title="Only true, verifiable numbers">
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Live counts come straight from platform records and update automatically. Prefer them.</li>
          <li>A manual figure needs the date it was true and evidence of how it was checked, and is shown only after it is approved. Changing the value or date removes the approval.</li>
          <li>Never round up, estimate, or include placements, clients or partners that cannot be proven. When in doubt, hide the statistic.</li>
          <li>Small numbers are honest. Use “Show only from” instead of inflating a figure.</li>
        </ul>
      </Callout>

      {cards.length === 0 ? (
        <EmptyState title="No statistics are configured" description="The standard counters are created by the content seed. Ask an administrator to run it, or add a custom figure." />
      ) : (
        <div className="space-y-4">
          {cards.map((m) => (
            <MetricCard key={m.key} metric={m} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}
