import type { Metadata } from "next";

import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRangeFilter, FilterBar, FilterPendingRegion, FilterScope, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { formatPercent } from "@/lib/format";
import { sp, type SearchParams } from "@/lib/http";
import { requireStaff } from "@/modules/identity/authz";
import { getPartnerPerformance } from "@/modules/recruitment/queries";
import type { PartnerPerformance } from "@/modules/recruitment/partner-queries";

import { partnerOptions } from "../../pipeline/_shared/options";
import { isUuid } from "../../pipeline/_shared/server";
import { PartnerTabs } from "../_components/partner-tabs";

export const metadata: Metadata = { title: "Performance · Partners" };

function day(value: string | undefined, end = false): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
}

const pct = (v: number | null) => (v === null ? "—" : formatPercent(v));

export default async function PartnerPerformancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("partners.view");
  const params = await searchParams;
  const partnerParam = sp(params, "partner");
  const period = { from: day(sp(params, "from")), to: day(sp(params, "to"), true) };
  const partners = await partnerOptions({ verifiedOnly: true });
  const scope = isUuid(partnerParam) ? partners.filter((p) => p.value === partnerParam) : partners.slice(0, 50);
  const rows: (PartnerPerformance & { name: string })[] = await Promise.all(
    scope.map(async (p) => ({ ...(await getPartnerPerformance({ kind: "staff", ctx: staff, partnerOrganizationId: p.value }, period)), name: p.label })),
  );
  rows.sort((a, b) => b.profilesSubmitted - a.profilesSubmitted);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner performance"
        description="Live counts from submissions and applications. Rates are relative to profiles submitted in the period."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Partners", href: "/admin/partners" }, { label: "Performance" }]}
      />
      <PartnerTabs />
      <FilterScope>
        <FilterBar paramKeys={["partner", "from", "to"]}>
          <FilterSelect param="partner" label="Partner" allLabel="All verified partners" options={partners} />
          <DateRangeFilter label="Submitted" />
        </FilterBar>
        <FilterPendingRegion>
          <DataTable
            caption="Partner performance"
            rows={rows}
            getRowId={(r) => r.partnerOrganizationId}
            rowLink={(r) => ({ href: `/admin/partners?partner=${r.partnerOrganizationId}`, label: `Assignments of ${r.name}` })}
            mobile="cards"
            columns={[
              { id: "name", header: "Partner", primary: true, cell: (r) => <span className="font-medium">{r.name}</span> },
              { id: "submitted", header: "Submitted", align: "right", cell: (r) => `${r.profilesSubmitted} (${r.uniqueCandidates} unique)` },
              { id: "verified", header: "Verified profiles", align: "right", hideOnMobile: true, cell: (r) => r.verifiedProfiles },
              { id: "accepted", header: "Accepted", align: "right", cell: (r) => `${r.accepted} · ${pct(r.rates.acceptance)}` },
              { id: "rejected", header: "Rejected / duplicates", align: "right", hideOnMobile: true, cell: (r) => `${r.rejected} / ${r.duplicates}` },
              { id: "pending", header: "Pending", align: "right", hideOnMobile: true, cell: (r) => r.pendingReview },
              { id: "shortlist", header: "Shortlist", align: "right", hideOnMobile: true, cell: (r) => pct(r.rates.shortlist) },
              { id: "interview", header: "Interview", align: "right", hideOnMobile: true, cell: (r) => pct(r.rates.interview) },
              { id: "placed", header: "Placed / joined", align: "right", cell: (r) => `${r.placed} / ${r.joined}` },
              { id: "ontime", header: "On time", align: "right", hideOnMobile: true, cell: (r) => (r.timeliness.onTimeRate === null ? "—" : pct(r.timeliness.onTimeRate)) },
              { id: "first", header: "Median hours to first submission", align: "right", hideOnMobile: true, cell: (r) => r.timeliness.medianHoursToFirstSubmission ?? "—" },
              { id: "complaints", header: "Complaints", align: "right", cell: (r) => r.complaints ?? 0 },
            ]}
            empty={<EmptyState title="No verified partners yet" description="Performance appears once verified partners submit candidates." />}
          />
        </FilterPendingRegion>
      </FilterScope>
      {!isUuid(partnerParam) && partners.length > 50 ? <p className="text-xs text-muted-foreground">Showing the first 50 partners alphabetically. Choose a partner to see others.</p> : null}
    </div>
  );
}
