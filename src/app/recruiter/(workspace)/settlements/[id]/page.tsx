import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { labelOf, SETTLEMENT_LINE_LABELS, SETTLEMENT_STATUS } from "@/components/recruiter/labels";
import { PartnerInvoiceForm, SettlementDisputeForm } from "@/components/recruiter/settlement-forms";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { FileList } from "@/components/shared/file-list";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { getSettlementDetail } from "@/modules/commercial/queries";
import { getFiles, toFileSummary } from "@/modules/files";
import { requireOrgMember } from "@/modules/identity/authz";

import { loadOr404, viewerTimeZone } from "../../_lib/page-utils";
import { isUuid } from "../../_lib/queries";

export const metadata: Metadata = { title: "Settlement" };

type Params = { id: string };

export default async function RecruiterSettlementDetailPage({ params }: { params: Promise<Params> }) {
  const ctx = await requireOrgMember("recruitment_partner", "partner.settlements.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const s = await loadOr404(getSettlementDetail(ctx, id));
  if (!s) notFound();
  const timeZone = viewerTimeZone(ctx);
  const status = labelOf(SETTLEMENT_STATUS, s.status);
  const invoiceRow = s.partnerInvoiceFileId ? (await getFiles([s.partnerInvoiceFileId]))[0] : undefined;
  const invoiceFile = invoiceRow ? toFileSummary(invoiceRow) : undefined;
  const canInvoice = ["pending_approval", "approved", "disputed"].includes(s.status);
  const canDispute = ["approved", "paid"].includes(s.status);

  return (
    <div className="space-y-8">
      <PortalBreadcrumb items={[{ label: "Settlements", href: "/recruiter/settlements" }, { label: s.code }]} />
      <PageHeader
        eyebrow="Settlement"
        title={s.code}
        description={
          <span>
            Period <DateText value={s.periodStart} dateOnly /> – <DateText value={s.periodEnd} dateOnly /> · {s.currency}
          </span>
        }
        backLink={{ href: "/recruiter/settlements", label: "Back to settlements" }}
        status={
          <StatusBadge tone={status.tone} size="md">
            {status.label}
          </StatusBadge>
        }
      />

      {s.status === "disputed" ? (
        <Callout tone="warning" title="Query raised with Venkat Sai finance">
          {s.disputeReason ?? "Your query is being looked at."} You will be notified when it is resolved.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard title="Lines" flush>
            <DataTable
              caption="Settlement lines"
              bordered={false}
              rows={s.lines}
              getRowId={(l) => l.id}
              columns={[
                { id: "kind", header: "Type", cell: (l) => SETTLEMENT_LINE_LABELS[l.kind] ?? l.kind },
                { id: "description", header: "Description", primary: true, cell: (l) => <span className="text-sm">{l.description}</span> },
                { id: "placement", header: "Placement", cell: (l) => l.placementCode ?? "—", hideOnMobile: true },
                { id: "amount", header: "Amount", align: "right", cell: (l) => <MoneyText amountMinor={l.amountMinor} currency={s.currency} tabular /> },
              ]}
            />
          </SectionCard>
          {s.notes ? (
            <SectionCard title="Notes from Venkat Sai">
              <p className="text-sm whitespace-pre-line">{s.notes}</p>
            </SectionCard>
          ) : null}
          {canDispute ? (
            <SectionCard title="Something not right?" description="Raise a query and the Venkat Sai finance team will review the settlement with you.">
              <SettlementDisputeForm settlementId={s.id} />
            </SectionCard>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Totals and payment">
          <SectionCard title="Totals">
            <KeyValueList
              items={[
                { label: "Amount", value: <MoneyText amountMinor={s.amountMinor} currency={s.currency} /> },
                { label: "Tax deducted at source", value: <MoneyText amountMinor={s.withholdingTaxMinor} currency={s.currency} /> },
                { label: "Net payable", value: <span className="font-semibold"><MoneyText amountMinor={s.netPayableMinor} currency={s.currency} /></span> },
                { label: "Approved", value: s.approvedAt ? <DateText value={s.approvedAt} timeZone={timeZone} /> : null },
                { label: "Paid", value: s.paidAt ? <DateText value={s.paidAt} timeZone={timeZone} /> : null },
                { label: "Payment reference", value: s.paymentReference },
              ]}
              emptyText="Not yet"
            />
          </SectionCard>
          <SectionCard title="Your invoice">
            {invoiceFile ? (
              <div className="mb-4">
                <FileList label="Your invoice file" files={[{ id: invoiceFile.id, name: invoiceFile.name, size: invoiceFile.size ?? undefined, mimeType: invoiceFile.mimeType, href: invoiceFile.url }]} />
              </div>
            ) : null}
            {canInvoice ? (
              <PartnerInvoiceForm settlementId={s.id} organizationId={ctx.organization.id} defaultNumber={s.partnerInvoiceNumber} canUpload={ctx.permissions.has("partner.profile.manage") || ctx.permissions.has("partner.settlements.view")} />
            ) : (
              <KeyValueList items={[{ label: "Invoice number", value: s.partnerInvoiceNumber }]} emptyText="Not provided" />
            )}
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
