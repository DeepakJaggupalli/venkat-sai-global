import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AUDIENCE_LABELS, INTERVAL_LABELS, PERIOD_LABELS, RESET_LABELS } from "@/components/billing/labels";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ENTITLEMENT_KEY_LIST, ENTITLEMENTS } from "@/modules/commercial/constants";
import { listPlansForAdmin } from "@/modules/commercial/queries";
import type { PlanFeatureView, PlanPriceView } from "@/modules/commercial/types";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { currencyOptions } from "@/modules/taxonomy/queries";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../../_lib/nav";
import { DeactivatePriceButton, DefaultPlanToggle, PlanFeatureForm, PlanPriceForm, RemoveFeatureButton } from "../_components/plan-editors";
import { PlanForm } from "../_components/plan-form";

export const metadata: Metadata = { title: "Plan" };

type PageProps = { params: Promise<{ id: string }> };

export default async function PlanPage({ params }: PageProps) {
  const staff = await requireStaff("commercial.view");
  const { id } = await params;
  const [plans, currencies] = await Promise.all([listPlansForAdmin(staff), currencyOptions()]);
  const plan = plans.find((p) => p.id === id);
  if (!plan) notFound();
  const canEdit = staffCan(staff, "commercial.plans");
  const keys = ENTITLEMENT_KEY_LIST.filter((k) => ENTITLEMENTS[k].audiences.includes(plan.audience)).map((k) => ({ value: k, label: ENTITLEMENTS[k].label, description: ENTITLEMENTS[k].description }));
  const prices = [...plan.prices].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.currency.localeCompare(b.currency));

  return (
    <div className="space-y-6">
      <PageHeader
        title={plan.name}
        eyebrow={<span className="font-mono">{plan.key}</span>}
        status={<StatusBadge tone={plan.isActive ? "success" : "neutral"}>{plan.isActive ? "Active" : "Inactive"}</StatusBadge>}
        description={`${plan.kind === "base" ? "Base plan" : "Add-on"} · ${AUDIENCE_LABELS[plan.audience]} · ${plan.isPublic ? "public" : "private"}`}
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Plans", href: `${ADMIN_COMMERCIAL}/plans` }, { label: plan.name }]}
      />

      <SectionCard title="Prices" description="One price per currency and interval. Customers see prices in their billing currency." flush>
        <DataTable
          caption="Prices"
          rows={prices}
          getRowId={(p) => p.id}
          columns={[
            { id: "amount", header: "Price", primary: true, cell: (p) => <MoneyText amountMinor={p.amountMinor} currency={p.currency} /> },
            { id: "interval", header: "Interval", cell: (p) => INTERVAL_LABELS[p.interval] },
            { id: "tax", header: "Tax", hideOnMobile: true, cell: (p) => (p.taxInclusive ? "Included" : "Added on invoice") },
            {
              id: "status",
              header: "Status",
              cell: (p) => (
                <StatusBadge tone={p.isActive ? "success" : "neutral"} size="sm">
                  {p.isActive ? "Active" : "Inactive"}
                </StatusBadge>
              ),
            },
            ...(canEdit
              ? [
                  {
                    id: "actions",
                    header: <span className="sr-only">Actions</span>,
                    align: "right" as const,
                    cell: (p: PlanPriceView) => (p.isActive ? <DeactivatePriceButton priceId={p.id} label={`${p.currency} ${INTERVAL_LABELS[p.interval]}`} /> : null),
                  },
                ]
              : []),
          ]}
          empty={<EmptyState title="No prices yet" description="Without a price the plan shows “Talk to our team” to customers." size="sm" variant="plain" />}
        />
        {canEdit ? (
          <div className="border-t p-4 sm:p-5">
            <PlanPriceForm planId={plan.id} currencies={currencies} isAddOn={plan.kind === "add_on"} />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Limits" description="What the plan includes per feature. Without a limit the feature is not included." flush>
        <DataTable
          caption="Feature limits"
          rows={plan.features}
          getRowId={(f) => f.entitlementKey}
          columns={[
            { id: "feature", header: "Feature", primary: true, cell: (f) => f.label },
            { id: "limit", header: "Limit", cell: (f) => (f.limitValue === null ? "Unlimited" : f.limitValue) },
            { id: "period", header: "Period", cell: (f) => PERIOD_LABELS[f.period] },
            { id: "reset", header: "Unused allowance", hideOnMobile: true, cell: (f) => RESET_LABELS[f.resetPolicy] },
            ...(canEdit
              ? [
                  {
                    id: "actions",
                    header: <span className="sr-only">Actions</span>,
                    align: "right" as const,
                    cell: (f: PlanFeatureView) => <RemoveFeatureButton planId={plan.id} entitlementKey={f.entitlementKey} label={f.label} />,
                  },
                ]
              : []),
          ]}
          empty={<EmptyState title="No limits set" size="sm" variant="plain" />}
        />
        {canEdit ? (
          <div className="border-t p-4 sm:p-5">
            <PlanFeatureForm planId={plan.id} keys={keys} />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Plan details">
        <div className="space-y-6">
          {plan.kind === "base" ? <DefaultPlanToggle planId={plan.id} isDefault={plan.isDefault} disabled={!canEdit} /> : null}
          <PlanForm plan={plan} canEdit={canEdit} />
        </div>
      </SectionCard>
    </div>
  );
}
