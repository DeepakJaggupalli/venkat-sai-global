import type { Metadata } from "next";
import { z } from "zod";

import { OPTIONS } from "@/components/billing/labels";
import { InvoiceTable } from "@/components/billing/record-tables";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { env } from "@/lib/env";
import { parsePage } from "@/lib/http";
import { INVOICE_STATUS_OPTIONS } from "@/modules/commercial/constants";
import { listInvoices } from "@/modules/commercial/queries";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../_lib/nav";

export const metadata: Metadata = { title: "Invoices" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const filtersSchema = z.object({
  status: z.enum(["open", ...INVOICE_STATUS_OPTIONS]).optional().catch(undefined),
  documentType: z.enum(["invoice", "credit_note"]).optional().catch(undefined),
  organizationId: z.uuid().optional().catch(undefined),
  currency: z.string().regex(/^[A-Z]{3}$/).optional().catch(undefined),
  q: z.string().trim().min(1).max(100).optional().catch(undefined),
});

export default async function InvoicesPage({ searchParams }: PageProps) {
  const staff = await requireStaff("commercial.view");
  const sp = await searchParams;
  const filters = filtersSchema.parse({ status: sp.status, documentType: sp.documentType, organizationId: sp.org, currency: typeof sp.currency === "string" ? sp.currency.toUpperCase() : undefined, q: sp.q });
  const result = await listInvoices(staff, filters, parsePage(sp));
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;
  const pathname = `${ADMIN_COMMERCIAL}/invoices`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Drafts, issued invoices and credit notes. Numbers are assigned in GST series only when an invoice is issued."
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Invoices" }]}
        actions={staffCan(staff, "commercial.invoices") ? [{ label: "New invoice", href: `${pathname}/new` }] : []}
      />
      <SectionCard title="All documents" flush>
        <div className="p-4 sm:p-5">
          <FilterBar paramKeys={["q", "status", "documentType", "org", "currency"]} search={<SearchInput label="Search number or buyer" />}>
            <FilterSelect param="status" label="Status" allLabel="All statuses" options={OPTIONS.invoiceStatus} />
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
          {filters.organizationId ? <p className="mt-3 text-sm text-muted-foreground">Showing one organisation&apos;s documents. Reset filters to see all.</p> : null}
        </div>
        <InvoiceTable
          audience="staff"
          rows={result.items}
          timeZone={timeZone}
          empty={<EmptyState title="No invoices match" description="Try other filters, or create a manual invoice." size="sm" variant="plain" />}
          footer={<Pagination pathname={pathname} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="documents" />}
        />
      </SectionCard>
    </div>
  );
}
