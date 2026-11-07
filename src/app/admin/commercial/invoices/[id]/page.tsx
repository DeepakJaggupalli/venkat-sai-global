import { Printer } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BillingProfileForm } from "@/components/billing/billing-profile-form";
import { PROVIDER_LABELS, TAX_TREATMENT_LABELS } from "@/components/billing/labels";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { env } from "@/lib/env";
import { getBillingProfile } from "@/modules/commercial/billing-profiles";
import { placeOfSupplyLabel } from "@/modules/commercial/constants";
import { formatMinorPlain, minorUnitsFor } from "@/modules/commercial/money";
import { getInvoiceForStaff } from "@/modules/commercial/queries";
import { formatRate } from "@/modules/commercial/tax";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { countryOptions } from "@/modules/taxonomy/queries";

import { OfflinePaymentForm } from "../../_components/offline-payment-form";
import { DeleteDraftButton, DraftCouponControl, IssueInvoiceButton, RefundRequestButton, VoidInvoiceButton } from "../../_components/record-actions";
import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../../_lib/nav";
import { listInvoicePayments } from "../../_lib/queries";
import { InvoiceEditor } from "../_components/invoice-editor";
import { loadInvoiceEditorData } from "../_lib/editor-data";

export const metadata: Metadata = { title: "Invoice" };

type PageProps = { params: Promise<{ id: string }> };

function isoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export default async function InvoicePage({ params }: PageProps) {
  const staff = await requireStaff("commercial.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const doc = await getInvoiceForStaff(staff, id);
  if (!doc) notFound();
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;
  const canInvoice = staffCan(staff, "commercial.invoices");
  const canPay = staffCan(staff, "commercial.payments");
  const canRefund = staffCan(staff, ["commercial.payments", "commercial.refunds"], "any");
  const isDraft = doc.status === "draft";
  const minor = minorUnitsFor(doc.currency);
  const [payments, editor, profile, countries] = await Promise.all([
    isDraft ? Promise.resolve([]) : listInvoicePayments(staff, doc.id),
    isDraft && canInvoice ? loadInvoiceEditorData(staff) : Promise.resolve(null),
    isDraft && canInvoice && doc.organizationId ? getBillingProfile(doc.organizationId) : Promise.resolve(null),
    isDraft && canInvoice && doc.organizationId ? countryOptions() : Promise.resolve([]),
  ]);
  const title = doc.documentType === "credit_note" ? `Credit note ${doc.code ?? ""}` : isDraft ? "Draft invoice" : `Invoice ${doc.code ?? ""}`;
  const voidable = (doc.status === "issued" || doc.status === "overdue") && doc.amountPaidMinor === 0 && doc.documentType === "invoice";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        status={<StatusBadge status={doc.status} domain="invoice" />}
        description={doc.buyer?.legalName ?? undefined}
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Invoices", href: `${ADMIN_COMMERCIAL}/invoices` }, { label: doc.code ?? "Draft" }]}
        actions={[{ label: isDraft ? "Preview print" : "Print or save as PDF", href: `/billing/invoices/${doc.id}`, icon: <Printer className="size-4" aria-hidden="true" />, variant: "outline" as const }]}
      />

      {isDraft && canInvoice ? (
        <SectionCard title="Issue" description="Issuing assigns the GST invoice number and freezes the details.">
          <div className="flex flex-wrap items-center gap-3">
            <IssueInvoiceButton invoiceId={doc.id} />
            <DeleteDraftButton invoiceId={doc.id} />
          </div>
          <div className="mt-5 border-t pt-5">
            <DraftCouponControl invoiceId={doc.id} couponCode={doc.couponCode} />
          </div>
        </SectionCard>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Summary" className="lg:col-span-2">
          <KeyValueList
            columns={2}
            items={[
              { label: "Total", value: <MoneyText amountMinor={doc.totalMinor} currency={doc.currency} /> },
              { label: "Balance due", value: doc.documentType === "invoice" ? <MoneyText amountMinor={doc.outstandingMinor} currency={doc.currency} /> : "—" },
              { label: "Paid", value: <MoneyText amountMinor={doc.amountPaidMinor} currency={doc.currency} /> },
              { label: "Refunded", value: <MoneyText amountMinor={doc.amountRefundedMinor} currency={doc.currency} /> },
              { label: "Issued", value: doc.issuedAt ? <DateText value={doc.issuedAt} timeZone={timeZone} /> : "Not yet" },
              { label: "Due", value: doc.dueAt ? <DateText value={doc.dueAt} timeZone={timeZone} /> : "—" },
              { label: "Tax treatment", value: TAX_TREATMENT_LABELS[doc.taxTreatment] ?? doc.taxTreatment },
              { label: "Place of supply", value: placeOfSupplyLabel(doc.placeOfSupply) ?? "—" },
              ...(doc.purchaseOrderReference ? [{ label: "Purchase order", value: doc.purchaseOrderReference }] : []),
              ...(doc.originalInvoice ? [{ label: "Credit note for", value: <a className="text-teal-strong underline underline-offset-4" href={`${ADMIN_COMMERCIAL}/invoices/${doc.originalInvoice.id}`}>{doc.originalInvoice.code ?? "Invoice"}</a> }] : []),
              ...(doc.voidReason ? [{ label: "Void reason", value: doc.voidReason, fullWidth: true }] : []),
              ...(doc.internalNotes ? [{ label: "Internal notes", value: doc.internalNotes, fullWidth: true }] : []),
            ]}
          />
          {!isDraft && canInvoice && voidable ? (
            <div className="mt-5 border-t pt-5">
              <VoidInvoiceButton invoiceId={doc.id} code={doc.code} />
            </div>
          ) : null}
        </SectionCard>
        <SectionCard title="Buyer">
          {doc.buyer ? (
            <KeyValueList
              items={[
                { label: "Legal name", value: doc.buyer.legalName },
                { label: "Tax number", value: doc.buyer.taxId ?? "Not registered" },
                { label: "Address", value: [doc.buyer.addressLine1, doc.buyer.addressLine2, doc.buyer.city, doc.buyer.postalCode].filter(Boolean).join(", ") || "—" },
                { label: "Email", value: doc.buyer.email ?? "—" },
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Buyer details are frozen when the invoice is issued.</p>
          )}
        </SectionCard>
      </div>

      {!isDraft ? (
        <SectionCard title="Lines" flush>
          <DataTable
            caption="Invoice lines"
            rows={doc.lines}
            getRowId={(l) => l.id}
            columns={[
              { id: "desc", header: "Description", primary: true, cell: (l) => <span>{l.description}{l.taxCode ? <span className="block text-xs text-muted-foreground">SAC/HSN {l.taxCode}</span> : null}</span> },
              { id: "qty", header: "Qty", align: "right", cell: (l) => l.quantity },
              { id: "unit", header: "Unit price", align: "right", nowrap: true, cell: (l) => <MoneyText amountMinor={l.unitAmountMinor} currency={doc.currency} /> },
              { id: "amount", header: "Taxable", align: "right", nowrap: true, cell: (l) => <MoneyText amountMinor={l.amountMinor} currency={doc.currency} /> },
              { id: "tax", header: "Tax", align: "right", nowrap: true, cell: (l) => <span><MoneyText amountMinor={l.taxMinor} currency={doc.currency} /><span className="block text-xs text-muted-foreground">{l.taxes.map((t) => `${t.name} ${formatRate(t.rateBasisPoints)}`).join(" + ") || "No tax"}</span></span> },
            ]}
          />
        </SectionCard>
      ) : null}

      {!isDraft && doc.documentType === "invoice" ? (
        <SectionCard title="Payments" flush>
          <DataTable
            caption="Payments against this invoice"
            rows={payments}
            getRowId={(p) => p.id}
            columns={[
              { id: "code", header: "Payment", primary: true, cell: (p) => p.code },
              { id: "date", header: "Received", cell: (p) => (p.receivedAt ? <DateText value={p.receivedAt} timeZone={timeZone} /> : "—") },
              { id: "provider", header: "Via", cell: (p) => PROVIDER_LABELS[p.provider] },
              { id: "ref", header: "Reference", hideOnMobile: true, cell: (p) => p.externalReference ?? "—" },
              { id: "amount", header: "Amount", align: "right", nowrap: true, cell: (p) => <MoneyText amountMinor={p.amountMinor} currency={p.currency} /> },
              { id: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} domain="payment" size="sm" /> },
              ...(canRefund
                ? [{ id: "actions", header: <span className="sr-only">Actions</span>, align: "right" as const, cell: (p: (typeof payments)[number]) => (["succeeded", "partially_refunded"].includes(p.status) && p.amountRefundedMinor < p.amountMinor ? <RefundRequestButton paymentId={p.id} label={p.code} /> : null) }]
                : []),
            ]}
            empty={<EmptyState title="No payments yet" size="sm" variant="plain" />}
          />
          {canPay && doc.outstandingMinor > 0 && doc.status !== "void" ? (
            <div className="border-t p-4 sm:p-5">
              <h3 className="mb-3 font-heading text-base font-semibold">Record an offline payment</h3>
              <OfflinePaymentForm mode="invoice" invoice={{ id: doc.id, currency: doc.currency, outstanding: formatMinorPlain(doc.outstandingMinor, minor) }} today={new Date().toISOString().slice(0, 10)} />
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {doc.creditNotes.length ? (
        <SectionCard title="Credit notes" flush>
          <DataTable
            caption="Credit notes"
            rows={doc.creditNotes}
            getRowId={(c) => c.id}
            rowLink={(c) => ({ href: `${ADMIN_COMMERCIAL}/invoices/${c.id}`, label: `Open credit note ${c.code ?? ""}` })}
            columns={[
              { id: "code", header: "Number", primary: true, cell: (c) => c.code ?? "—" },
              { id: "date", header: "Issued", cell: (c) => (c.issuedAt ? <DateText value={c.issuedAt} timeZone={timeZone} /> : "—") },
              { id: "total", header: "Amount", align: "right", cell: (c) => <MoneyText amountMinor={c.totalMinor} currency={doc.currency} /> },
            ]}
          />
        </SectionCard>
      ) : null}

      {isDraft && editor ? (
        <SectionCard title="Edit draft">
          <InvoiceEditor
            {...editor}
            draft={{
              id: doc.id,
              organizationId: doc.organizationId,
              currency: doc.currency,
              lines: doc.lines.map((l) => ({
                description: l.description,
                quantity: String(l.quantity),
                unitAmount: formatMinorPlain(l.unitAmountMinor, minor),
                discount: l.discountMinor ? formatMinorPlain(l.discountMinor, minor) : "",
                taxCode: l.taxCode ?? "",
              })),
              notes: doc.notes,
              internalNotes: doc.internalNotes,
              purchaseOrderReference: doc.purchaseOrderReference,
              taxTreatment: doc.taxTreatment === "standard" ? "auto" : doc.taxTreatment,
              servicePeriodStart: isoDate(doc.servicePeriodStart),
              servicePeriodEnd: isoDate(doc.servicePeriodEnd),
            }}
          />
        </SectionCard>
      ) : null}

      {isDraft && editor && doc.organizationId ? (
        <SectionCard title="Buyer billing details" description="Printed on the invoice when it is issued. Changes apply to this organisation's future invoices too.">
          <BillingProfileForm target={{ organizationId: doc.organizationId }} defaults={profile} countries={countries} currencies={editor.currencies} canEdit />
        </SectionCard>
      ) : null}
    </div>
  );
}
