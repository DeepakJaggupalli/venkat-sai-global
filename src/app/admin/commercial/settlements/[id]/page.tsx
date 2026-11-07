import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BillingStatusBadge } from "@/components/billing/billing-status";
import { SETTLEMENT_LINE_KIND_LABELS } from "@/components/billing/labels";
import { FileLink } from "@/components/files";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { env } from "@/lib/env";
import { formatMinorPlain, minorUnitsFor } from "@/modules/commercial/money";
import { getSettlementDetail } from "@/modules/commercial/queries";
import type { SettlementDetail } from "@/modules/commercial/types";
import { getFile, toFileSummary } from "@/modules/files";
import { requireStaff } from "@/modules/identity/authz";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../../_lib/nav";
import { CancelSettlementButton, MarkPaidForm, RemoveLineButton, ResolveDisputeForm, SettlementDraftForm, SettlementLineForm, SubmitSettlementButton } from "../_components/settlement-forms";

export const metadata: Metadata = { title: "Settlement" };

type Line = SettlementDetail["lines"][number];

export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("partners.settlements");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await getSettlementDetail(staff, id);
  if (!s) notFound();
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;
  const isDraft = s.status === "draft";
  const today = new Date().toISOString().slice(0, 10);
  const invoiceFile = s.partnerInvoiceFileId ? await getFile(s.partnerInvoiceFileId).catch(() => null) : null;
  const lines = s.lines.filter((l) => !l.voidedAt);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Settlement ${s.code}`}
        status={<BillingStatusBadge kind="settlement" status={s.status} size="md" />}
        description={`${s.partnerName} · ${s.periodStart} to ${s.periodEnd} · ${s.currency}`}
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Partner settlements", href: `${ADMIN_COMMERCIAL}/settlements` }, { label: s.code }]}
        actions={s.approvalRequestId ? [{ label: "Open approval", href: `/admin/approvals/${s.approvalRequestId}`, variant: "outline" as const }] : []}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Amounts" className="lg:col-span-2">
          <KeyValueList
            columns={2}
            items={[
              { label: "Gross", value: <MoneyText amountMinor={s.amountMinor} currency={s.currency} /> },
              { label: "Tax deducted at source", value: <MoneyText amountMinor={s.withholdingTaxMinor} currency={s.currency} /> },
              { label: "Net payable", value: <span className="font-heading text-lg font-semibold"><MoneyText amountMinor={s.netPayableMinor} currency={s.currency} /></span> },
              { label: "Partner invoice", value: s.partnerInvoiceNumber ? <span>{s.partnerInvoiceNumber}{invoiceFile ? <span className="mt-1 block"><FileLink file={toFileSummary(invoiceFile)} /></span> : null}</span> : "Not submitted yet" },
              ...(s.approvedAt ? [{ label: "Approved", value: <DateText value={s.approvedAt} timeZone={timeZone} /> }] : []),
              ...(s.paidAt ? [{ label: "Paid", value: <><DateText value={s.paidAt} timeZone={timeZone} />{s.paymentReference ? ` · ${s.paymentReference}` : ""}</> }] : []),
              ...(s.notes ? [{ label: "Note to partner", value: s.notes, fullWidth: true }] : []),
              ...(s.internalNotes ? [{ label: "Internal notes", value: s.internalNotes, fullWidth: true }] : []),
              ...(s.disputeReason ? [{ label: "Partner's query", value: s.disputeReason, fullWidth: true }] : []),
            ]}
          />
        </SectionCard>
        <SectionCard title="Next step">
          {isDraft ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Check the lines and tax deducted at source, then submit for approval.</p>
              <div className="flex flex-wrap gap-2">
                <SubmitSettlementButton settlementId={s.id} />
                <CancelSettlementButton settlementId={s.id} />
              </div>
            </div>
          ) : s.status === "approved" ? (
            <div className="space-y-4">
              <MarkPaidForm settlementId={s.id} today={today} />
              <CancelSettlementButton settlementId={s.id} />
            </div>
          ) : s.status === "disputed" ? (
            <ResolveDisputeForm settlementId={s.id} />
          ) : (
            <p className="text-sm text-muted-foreground">{s.status === "pending_approval" ? "Waiting for approval in the approvals inbox." : s.status === "paid" ? "Paid. Nothing else to do." : "Cancelled."}</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Lines" flush>
        <DataTable
          caption="Settlement lines"
          rows={lines}
          getRowId={(l) => l.id}
          columns={[
            { id: "kind", header: "Type", primary: true, cell: (l) => SETTLEMENT_LINE_KIND_LABELS[l.kind] },
            { id: "desc", header: "Description", cell: (l) => <span>{l.description}{l.placementCode ? <span className="block text-xs text-muted-foreground">Placement {l.placementCode}</span> : null}</span> },
            { id: "amount", header: "Amount", align: "right", nowrap: true, cell: (l) => <MoneyText amountMinor={l.kind === "deduction" ? -Math.abs(l.amountMinor) : l.amountMinor} currency={s.currency} /> },
            ...(isDraft ? [{ id: "actions", header: <span className="sr-only">Actions</span>, align: "right" as const, cell: (l: Line) => <RemoveLineButton lineId={l.id} label={l.description} /> }] : []),
          ]}
          empty={<EmptyState title="No lines" size="sm" variant="plain" />}
        />
        {isDraft ? (
          <div className="grid gap-6 border-t p-4 sm:p-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 font-heading text-base font-semibold">Add a bonus, adjustment or deduction</h3>
              <SettlementLineForm settlementId={s.id} />
            </div>
            <div>
              <h3 className="mb-3 font-heading text-base font-semibold">Deductions and notes</h3>
              <SettlementDraftForm
                settlementId={s.id}
                withholdingTax={s.withholdingTaxMinor ? formatMinorPlain(s.withholdingTaxMinor, minorUnitsFor(s.currency)) : ""}
                notes={s.notes ?? ""}
                internalNotes={s.internalNotes ?? ""}
              />
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
