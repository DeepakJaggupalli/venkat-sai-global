import { z } from "zod";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filters";
import { MoneyText } from "@/components/shared/money-text";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { parsePage, type SearchParams } from "@/lib/http";
import { getBillingProfile } from "@/modules/commercial/billing-profiles";
import { INVOICE_STATUS_OPTIONS } from "@/modules/commercial/constants";
import { listOrgDisputes, listOrgInvoices, listOrgPayments } from "@/modules/commercial/queries";
import type { OrgContext } from "@/modules/identity/authz";
import { countryOptions, currencyOptions } from "@/modules/taxonomy/queries";

import { BillingProfileForm } from "../billing-profile-form";
import { BillingQueryForm } from "../billing-query-form";
import { BillingStatusBadge } from "../billing-status";
import { OPTIONS } from "../labels";
import { BILLING_PORTALS, type BillingPortal } from "../portal-config";
import { InvoiceTable, PaymentTable } from "../record-tables";
import { PortalBillingHeader } from "./portal-header";

type PageArgs = { portal: BillingPortal; ctx: OrgContext; searchParams: SearchParams };

const invoiceFilters = z.object({
  status: z.enum(["open", ...INVOICE_STATUS_OPTIONS.filter((s) => s !== "draft")]).optional().catch(undefined),
  documentType: z.enum(["invoice", "credit_note"]).optional().catch(undefined),
});

/** /<portal>/billing/invoices — invoices and credit notes, billing queries. */
export async function PortalBillingInvoices({ portal, ctx, searchParams }: PageArgs) {
  const cfg = BILLING_PORTALS[portal];
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const filters = invoiceFilters.parse({ status: searchParams.status, documentType: searchParams.documentType });
  const page = parsePage(searchParams);
  const [result, recent, disputes] = await Promise.all([
    listOrgInvoices(ctx, filters, page),
    listOrgInvoices(ctx, { documentType: "invoice" }, { page: 1, pageSize: 50, offset: 0 }),
    listOrgDisputes(ctx, { page: 1, pageSize: 20, offset: 0 }),
  ]);
  const pathname = `${cfg.base}/invoices`;

  return (
    <div className="space-y-8">
      <PortalBillingHeader portal={portal} title="Invoices" description="Invoices and credit notes issued to your organisation. Open one to print it, save it as PDF or pay it." />
      <SectionCard title="Invoices and credit notes" flush>
        <div className="p-4 sm:p-5">
          <FilterBar paramKeys={["status", "documentType"]}>
            <FilterSelect param="status" label="Status" allLabel="All statuses" options={OPTIONS.invoiceStatus.filter((o) => o.value !== "draft")} />
            <FilterSelect
              param="documentType"
              label="Type"
              allLabel="All documents"
              options={[
                { value: "invoice", label: "Invoices" },
                { value: "credit_note", label: "Credit notes" },
              ]}
            />
          </FilterBar>
        </div>
        <InvoiceTable
          audience="portal"
          rows={result.items}
          timeZone={timeZone}
          footer={<Pagination pathname={pathname} searchParams={searchParams} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="documents" />}
        />
      </SectionCard>

      <SectionCard title="Billing queries" description="Something wrong with an invoice or payment? Tell our finance team and track the answer here.">
        <div className="space-y-6">
          {recent.items.length ? (
            <BillingQueryForm portal={portal} invoices={recent.items.map((i) => ({ value: i.id, label: `${i.code ?? "Invoice"} · ${formatMoney(i.totalMinor, i.currency)}` }))} />
          ) : (
            <p className="text-sm text-muted-foreground">You can raise a query once an invoice has been issued.</p>
          )}
          {disputes.items.length ? (
            <DataTable
              caption="Your billing queries"
              rows={disputes.items}
              getRowId={(d) => d.id}
              columns={[
                { id: "date", header: "Raised", primary: true, cell: (d) => <DateText value={d.createdAt} timeZone={timeZone} /> },
                { id: "invoice", header: "Invoice", cell: (d) => d.invoiceCode ?? "—" },
                { id: "amount", header: "Amount", align: "right", cell: (d) => (d.amountMinor !== null && d.currency ? <MoneyText amountMinor={d.amountMinor} currency={d.currency} /> : "Whole document") },
                { id: "status", header: "Status", cell: (d) => <BillingStatusBadge kind="dispute" status={d.status} /> },
                { id: "resolution", header: "Answer", cell: (d) => d.resolution ?? "—" },
              ]}
            />
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}

/** /<portal>/billing/payments — payments received from the organisation. */
export async function PortalBillingPayments({ portal, ctx, searchParams }: PageArgs) {
  const cfg = BILLING_PORTALS[portal];
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const page = parsePage(searchParams);
  const result = await listOrgPayments(ctx, page);
  return (
    <div className="space-y-8">
      <PortalBillingHeader portal={portal} title="Payments" description="Payments we have received from your organisation, online or by bank transfer." />
      <SectionCard title="Payment history" flush>
        <PaymentTable
          audience="portal"
          rows={result.items}
          timeZone={timeZone}
          empty={<EmptyState title="No payments yet" description="When you pay an invoice, the payment appears here." size="sm" variant="plain" primaryAction={{ label: "View invoices", href: `${cfg.base}/invoices` }} />}
          footer={<Pagination pathname={`${cfg.base}/payments`} searchParams={searchParams} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="payments" />}
        />
      </SectionCard>
    </div>
  );
}

/** /<portal>/billing/details — billing profile printed on invoices. */
export async function PortalBillingDetails({ portal, ctx }: Omit<PageArgs, "searchParams">) {
  const cfg = BILLING_PORTALS[portal];
  const [profile, countries, currencies] = await Promise.all([getBillingProfile(ctx.organization.id), countryOptions(), currencyOptions()]);
  return (
    <div className="space-y-8">
      <PortalBillingHeader portal={portal} title="Billing details" description="The legal name, tax number and address printed on your invoices." />
      <SectionCard title="Invoice details" description="Changes apply to invoices issued from now on. Issued invoices are never changed.">
        <BillingProfileForm target={{ portal }} defaults={profile} countries={countries} currencies={currencies} canEdit={ctx.permissions.has(cfg.managePermission)} />
      </SectionCard>
    </div>
  );
}
