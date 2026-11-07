import type { ReactNode } from "react";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { StatusBadge } from "@/components/shared/status-badge";
import type { InvoiceListItem, PaymentListItem } from "@/modules/commercial/types";

import { METHOD_LABELS, PROVIDER_LABELS } from "./labels";

type Common = { timeZone?: string; empty?: ReactNode; footer?: ReactNode; caption?: string };

/** Invoices and credit notes. Staff tables show the buyer and link to the Command Centre record. */
export function InvoiceTable({ rows, timeZone, empty, footer, caption = "Invoices", audience }: Common & { rows: InvoiceListItem[]; audience: "portal" | "staff" }) {
  return (
    <DataTable
      caption={caption}
      rows={rows}
      getRowId={(r) => r.id}
      rowLink={(r) =>
        audience === "staff"
          ? { href: `/admin/commercial/invoices/${r.id}`, label: `Open ${r.code ?? "draft invoice"}` }
          : { href: `/billing/invoices/${r.id}`, label: `View or print ${r.documentType === "credit_note" ? "credit note" : "invoice"} ${r.code ?? ""}` }
      }
      footer={footer}
      columns={[
        {
          id: "code",
          header: "Number",
          primary: true,
          cell: (r) => (
            <span className="font-medium">
              {r.code ?? "Draft"}
              {r.documentType === "credit_note" ? <span className="ml-2 text-xs font-normal text-muted-foreground">Credit note</span> : null}
            </span>
          ),
        },
        ...(audience === "staff" ? [{ id: "buyer", header: "Buyer", cell: (r: InvoiceListItem) => r.organizationName ?? r.buyerName ?? "—" }] : []),
        { id: "issued", header: "Issued", hideOnMobile: true, cell: (r) => (r.issuedAt ? <DateText value={r.issuedAt} timeZone={timeZone} /> : "—") },
        { id: "due", header: "Due", cell: (r) => (r.dueAt && r.documentType === "invoice" ? <DateText value={r.dueAt} timeZone={timeZone} /> : "—") },
        { id: "total", header: "Total", align: "right", nowrap: true, cell: (r) => <MoneyText amountMinor={r.totalMinor} currency={r.currency} /> },
        { id: "outstanding", header: "Balance due", align: "right", nowrap: true, cell: (r) => (r.documentType === "invoice" && r.outstandingMinor > 0 ? <MoneyText amountMinor={r.outstandingMinor} currency={r.currency} /> : "—") },
        { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} domain="invoice" size="sm" /> },
      ]}
      empty={empty ?? <EmptyState title="No invoices yet" description="Invoices appear here once they are issued." size="sm" variant="plain" />}
    />
  );
}

/** Payments received. Staff tables show the payer and failure reasons. */
export function PaymentTable({ rows, timeZone, empty, footer, caption = "Payments", audience, actions }: Common & { rows: PaymentListItem[]; audience: "portal" | "staff"; actions?: (row: PaymentListItem) => ReactNode }) {
  return (
    <DataTable
      caption={caption}
      rows={rows}
      getRowId={(r) => r.id}
      footer={footer}
      columns={[
        { id: "code", header: "Payment", primary: true, cell: (r) => <span className="font-medium">{r.code}</span> },
        ...(audience === "staff" ? [{ id: "payer", header: "Payer", cell: (r: PaymentListItem) => r.organizationName ?? "—" }] : []),
        { id: "date", header: "Received", cell: (r) => (r.receivedAt ? <DateText value={r.receivedAt} timeZone={timeZone} /> : <DateText value={r.createdAt} timeZone={timeZone} />) },
        {
          id: "invoice",
          header: "Invoice",
          hideOnMobile: true,
          cell: (r) =>
            r.invoiceId ? (
              <a className="text-teal-strong underline-offset-4 hover:underline" href={audience === "staff" ? `/admin/commercial/invoices/${r.invoiceId}` : `/billing/invoices/${r.invoiceId}`}>
                {r.invoiceCode ?? "View"}
              </a>
            ) : (
              "Advance"
            ),
        },
        { id: "method", header: "Method", hideOnMobile: true, cell: (r) => (r.method ? METHOD_LABELS[r.method] : PROVIDER_LABELS[r.provider]) },
        ...(audience === "staff" ? [{ id: "reference", header: "Reference", hideOnMobile: true, cell: (r: PaymentListItem) => r.externalReference ?? "—" }] : []),
        {
          id: "amount",
          header: "Amount",
          align: "right",
          nowrap: true,
          cell: (r) => (
            <span>
              <MoneyText amountMinor={r.amountMinor} currency={r.currency} />
              {r.amountRefundedMinor > 0 ? (
                <span className="block text-xs text-muted-foreground">
                  <MoneyText amountMinor={r.amountRefundedMinor} currency={r.currency} /> refunded
                </span>
              ) : null}
            </span>
          ),
        },
        {
          id: "status",
          header: "Status",
          cell: (r) => (
            <span>
              <StatusBadge status={r.status} domain="payment" size="sm" />
              {audience === "staff" && r.failureReason ? <span className="mt-1 block text-xs text-muted-foreground">{r.failureReason}</span> : null}
            </span>
          ),
        },
        ...(actions ? [{ id: "actions", header: <span className="sr-only">Actions</span>, align: "right" as const, cell: (r: PaymentListItem) => actions(r) }] : []),
      ]}
      empty={empty ?? <EmptyState title="No payments yet" description="Payments appear here once they are received." size="sm" variant="plain" />}
    />
  );
}
