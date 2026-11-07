import type { Metadata } from "next";

import { AUDIENCE_LABELS } from "@/components/billing/labels";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { PLAN_AUDIENCE_OPTIONS } from "@/modules/commercial/constants";
import { listPlansForAdmin } from "@/modules/commercial/queries";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../_lib/nav";

export const metadata: Metadata = { title: "Plans" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PlansPage({ searchParams }: PageProps) {
  const staff = await requireStaff("commercial.view");
  const sp = await searchParams;
  const audience = PLAN_AUDIENCE_OPTIONS.find((a) => a === sp.audience);
  const plans = await listPlansForAdmin(staff, { audience });
  const canEdit = staffCan(staff, "commercial.plans");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plans"
        description="Plans, prices per currency and interval, and limits per feature. Prices are data: nothing is hardcoded."
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Plans" }]}
        actions={canEdit ? [{ label: "New plan", href: `${ADMIN_COMMERCIAL}/plans/new` }] : []}
      />
      <SectionCard title="All plans" flush>
        <div className="p-4 sm:p-5">
          <FilterBar paramKeys={["audience"]}>
            <FilterSelect param="audience" label="Audience" allLabel="All audiences" options={PLAN_AUDIENCE_OPTIONS.map((a) => ({ value: a, label: AUDIENCE_LABELS[a] }))} />
          </FilterBar>
        </div>
        <DataTable
          caption="Plans"
          rows={plans}
          getRowId={(p) => p.id}
          rowLink={(p) => ({ href: `${ADMIN_COMMERCIAL}/plans/${p.id}`, label: `Open ${p.name}` })}
          columns={[
            {
              id: "name",
              header: "Plan",
              primary: true,
              cell: (p) => (
                <span className="font-medium">
                  {p.name}
                  <span className="block font-mono text-xs font-normal text-muted-foreground">{p.key}</span>
                </span>
              ),
            },
            { id: "audience", header: "Audience", cell: (p) => AUDIENCE_LABELS[p.audience] },
            { id: "kind", header: "Kind", hideOnMobile: true, cell: (p) => (p.kind === "base" ? "Base" : "Add-on") },
            { id: "prices", header: "Active prices", align: "right", cell: (p) => p.prices.filter((x) => x.isActive).length },
            { id: "limits", header: "Limits", align: "right", hideOnMobile: true, cell: (p) => p.features.length },
            {
              id: "state",
              header: "Status",
              cell: (p) => (
                <span className="flex flex-wrap gap-1">
                  <StatusBadge tone={p.isActive ? "success" : "neutral"} size="sm">
                    {p.isActive ? "Active" : "Inactive"}
                  </StatusBadge>
                  <StatusBadge tone={p.isPublic ? "info" : "neutral"} size="sm">
                    {p.isPublic ? "Public" : "Private"}
                  </StatusBadge>
                  {p.isDefault ? (
                    <StatusBadge tone="brand" size="sm">
                      Default
                    </StatusBadge>
                  ) : null}
                </span>
              ),
            },
          ]}
          empty={
            <EmptyState
              title="No plans yet"
              description="Portals show a “Talk to our team” message until a public, active plan with a price exists."
              primaryAction={canEdit ? { label: "Create a plan", href: `${ADMIN_COMMERCIAL}/plans/new` } : undefined}
              size="sm"
              variant="plain"
            />
          }
        />
      </SectionCard>
    </div>
  );
}
