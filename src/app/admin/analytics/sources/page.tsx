import type { Metadata } from "next";

import { CampaignDialog, DeleteCampaignButton } from "@/components/analytics-dashboard/campaign-form";
import { minorToMajorInput } from "@/components/analytics-dashboard/format";
import { AnalyticsFrame } from "@/components/analytics-dashboard/page-frame";
import { RankedList } from "@/components/analytics-dashboard/ranked-list";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatPercent, humanize } from "@/lib/format";
import type { SearchParams } from "@/lib/http";
import { getAnalyticsRange } from "@/modules/analytics/access";
import { ANALYTICS_EVENT_LABELS, isAnalyticsEvent } from "@/modules/analytics/events";
import { getCampaignPerformance, getReferrers, getTrafficSources, listCampaigns } from "@/modules/analytics/queries";
import { CAMPAIGN_CHANNEL_OPTIONS } from "@/modules/analytics/schemas";
import type { CampaignRow } from "@/modules/analytics/types";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { currencyOptions } from "@/modules/taxonomy/queries";

export const metadata: Metadata = { title: "Sources and campaigns" };

const eventLabel = (name: string) => (isAnalyticsEvent(name) ? ANALYTICS_EVENT_LABELS[name] : humanize(name));

export default async function SourcesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("analytics.view");
  const range = getAnalyticsRange(await searchParams);
  const canConfigure = staffCan(staff, "analytics.configure");

  const [sources, referrers, campaigns, definitions, currencies] = await Promise.all([
    getTrafficSources(staff, range, { limit: 50 }),
    getReferrers(staff, range, { limit: 20 }),
    getCampaignPerformance(staff, range),
    listCampaigns(staff),
    canConfigure ? currencyOptions() : Promise.resolve([]),
  ]);
  const channelOptions = CAMPAIGN_CHANNEL_OPTIONS.map((c) => ({ value: c, label: humanize(c) }));

  return (
    <AnalyticsFrame
      staff={staff}
      range={range}
      title="Sources and campaigns"
      description="Where consented visitors come from, which campaigns bring conversions, and what each conversion cost."
      actions={canConfigure ? <CampaignDialog channelOptions={channelOptions} currencyOptions={currencies} /> : undefined}
    >
      <SectionCard title="Traffic sources" description="utm_source when tagged, otherwise the referring site, otherwise direct." flush>
        <DataTable
          caption="Traffic sources and mediums"
          rows={sources}
          getRowId={(r) => `${r.source}|${r.medium}`}
          columns={[
            { id: "source", header: "Source", primary: true, cell: (r) => r.source },
            { id: "medium", header: "Medium", cell: (r) => r.medium },
            { id: "sessions", header: "Sessions", align: "right", cell: (r) => r.sessions.toLocaleString("en-IN") },
            { id: "visitors", header: "Visitors", align: "right", hideOnMobile: true, cell: (r) => r.visitors.toLocaleString("en-IN") },
            { id: "bounce", header: "Bounce rate", align: "right", hideOnMobile: true, cell: (r) => formatPercent(r.bounceRate) },
            { id: "conversions", header: "Conversions", align: "right", cell: (r) => r.conversions.toLocaleString("en-IN") },
          ]}
          empty={<EmptyState size="sm" variant="plain" title="No consented sessions in this period" />}
        />
      </SectionCard>

      <SectionCard title="Campaign performance" description="Sessions tagged with utm_campaign. Cost per conversion uses the campaign's whole retained history, so it does not change with the period." flush>
        <DataTable
          caption="Campaign performance"
          rows={campaigns}
          getRowId={(r) => r.utmCampaign}
          columns={[
            {
              id: "campaign",
              header: "Campaign",
              primary: true,
              cell: (r) => (
                <div className="min-w-0">
                  <p className="font-medium">{r.name ?? r.utmCampaign}</p>
                  <p className="text-xs text-muted-foreground">
                    <code className="font-mono">{r.utmCampaign}</code>
                    {r.channel ? ` · ${humanize(r.channel)}` : ""}
                  </p>
                </div>
              ),
            },
            { id: "sessions", header: "Sessions", align: "right", cell: (r) => r.sessions.toLocaleString("en-IN") },
            { id: "conversions", header: "Conversions (period)", align: "right", cell: (r) => r.conversions.toLocaleString("en-IN") },
            {
              id: "lifetime",
              header: "Conversions (all time)",
              align: "right",
              hideOnMobile: true,
              cell: (r) => <LifetimeConversions row={r} />,
            },
            {
              id: "cost",
              header: "Ad cost",
              align: "right",
              cell: (r) => (r.costMinor !== null && r.currency ? <MoneyText amountMinor={r.costMinor} currency={r.currency} /> : <span className="text-muted-foreground">Not entered</span>),
            },
            {
              id: "cpa",
              header: "Cost per conversion",
              align: "right",
              cell: (r) => (r.costPerConversionMinor !== null && r.currency ? <MoneyText amountMinor={r.costPerConversionMinor} currency={r.currency} /> : "—"),
            },
            ...(canConfigure
              ? [
                  {
                    id: "actions",
                    header: <span className="sr-only">Actions</span>,
                    align: "right" as const,
                    cell: (r: CampaignRow) =>
                      r.campaignId ? null : <CampaignDialog suggestedKey={r.utmCampaign} channelOptions={channelOptions} currencyOptions={currencies} />,
                  },
                ]
              : []),
          ]}
          empty={
            <EmptyState
              size="sm"
              variant="plain"
              title="No tagged campaign traffic in this period"
              description="Add utm_source, utm_medium and utm_campaign to the links you share in ads, emails and WhatsApp messages."
            />
          }
        />
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Referring sites" description="Other websites that sent visitors.">
          <RankedList
            label="Referring sites by sessions"
            valueLabel="sessions"
            rows={referrers.map((r) => ({
              key: r.referrerDomain,
              label: r.referrerDomain,
              value: r.sessions,
              hint: `${r.conversions.toLocaleString("en-IN")} conv.`,
            }))}
            emptyTitle="No referring sites in this period"
          />
        </SectionCard>

        <SectionCard title="Campaign records" description={canConfigure ? "Names, channels and manual ad costs." : "Names, channels and manual ad costs (read only)."} flush>
          <DataTable
            caption="Campaign records"
            rows={definitions}
            getRowId={(c) => c.id}
            columns={[
              {
                id: "name",
                header: "Campaign",
                primary: true,
                cell: (c) => (
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <code className="font-mono">{c.utmCampaign}</code> · {humanize(c.channel)}
                    </p>
                  </div>
                ),
              },
              {
                id: "dates",
                header: "Runs",
                hideOnMobile: true,
                cell: (c) =>
                  c.startsOn ? (
                    <span className="text-sm">
                      <DateText value={c.startsOn} dateOnly />
                      {c.endsOn ? (
                        <>
                          {" – "}
                          <DateText value={c.endsOn} dateOnly />
                        </>
                      ) : (
                        " onwards"
                      )}
                    </span>
                  ) : (
                    <StatusBadge tone="neutral" size="sm">
                      No dates
                    </StatusBadge>
                  ),
              },
              {
                id: "cost",
                header: "Cost",
                align: "right",
                cell: (c) => (c.costMinor !== null && c.currency ? <MoneyText amountMinor={c.costMinor} currency={c.currency} /> : "—"),
              },
              ...(canConfigure
                ? [
                    {
                      id: "actions",
                      header: <span className="sr-only">Actions</span>,
                      align: "right" as const,
                      cell: (c: (typeof definitions)[number]) => (
                        <div className="flex justify-end gap-1">
                          <CampaignDialog
                            channelOptions={channelOptions}
                            currencyOptions={currencies}
                            campaign={{
                              id: c.id,
                              utmCampaign: c.utmCampaign,
                              name: c.name,
                              channel: c.channel,
                              startsOn: c.startsOn,
                              endsOn: c.endsOn,
                              cost: minorToMajorInput(c.costMinor, c.currency),
                              currency: c.currency,
                              notes: c.notes,
                            }}
                          />
                          <DeleteCampaignButton id={c.id} name={c.name} />
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
            empty={
              <EmptyState
                size="sm"
                variant="plain"
                title="No campaigns recorded"
                description={canConfigure ? "Add a campaign to give its utm_campaign a name and enter what it cost." : "Staff with analytics configuration rights can add campaigns."}
              />
            }
          />
        </SectionCard>
      </div>
    </AnalyticsFrame>
  );
}

function LifetimeConversions({ row }: { row: CampaignRow }) {
  const entries = Object.entries(row.lifetimeConversions).filter(([, n]) => n > 0);
  if (!entries.length) return <span>0</span>;
  return (
    <span title={entries.map(([k, n]) => `${eventLabel(k)}: ${n}`).join(", ")}>
      {row.lifetimeConversionTotal.toLocaleString("en-IN")}
      <span className="sr-only"> ({entries.map(([k, n]) => `${eventLabel(k)}: ${n}`).join(", ")})</span>
    </span>
  );
}
