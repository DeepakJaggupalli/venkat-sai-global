import type { Metadata } from "next";
import { z } from "zod";

import { OPTIONS } from "@/components/billing/labels";
import { PaymentTable } from "@/components/billing/record-tables";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { parsePage } from "@/lib/http";
import { PAYMENT_PROVIDER_OPTIONS, PAYMENT_STATUS_OPTIONS } from "@/modules/commercial/constants";
import { listPayments } from "@/modules/commercial/queries";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { AllocatePaymentButton, RefundRequestButton } from "../_components/record-actions";
import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../_lib/nav";
import { listPayableInvoiceOptions } from "../_lib/queries";

export const metadata: Metadata = { title: "Payments" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const filtersSchema = z.object({
  status: z.enum(PAYMENT_STATUS_OPTIONS).optional().catch(undefined),
  provider: z.enum(PAYMENT_PROVIDER_OPTIONS).optional().catch(undefined),
  organizationId: z.uuid().optional().catch(undefined),
  unallocated: z.literal("1").optional().catch(undefined),
});

export default async function PaymentsPage({ searchParams }: PageProps) {
  const staff = await requireStaff("commercial.view");
  const sp = await searchParams;
  const f = filtersSchema.parse({ status: sp.status, provider: sp.provider, organizationId: sp.org, unallocated: sp.unallocated });
  const canPay = staffCan(staff, "commercial.payments");
  const canRefund = staffCan(staff, ["commercial.payments", "commercial.refunds"], "any");
  const [result, payable] = await Promise.all([
    listPayments(staff, { status: f.status, provider: f.provider, organizationId: f.organizationId, unallocated: f.unallocated === "1" }, parsePage(sp)),
    canPay ? listPayableInvoiceOptions(staff) : Promise.resolve([]),
  ]);
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;
  const pathname = `${ADMIN_COMMERCIAL}/payments`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Online and offline payments. Record bank transfers, UPI and cheques here; refunds go through approval."
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Payments" }]}
        actions={canPay ? [{ label: "Record payment", href: `${pathname}/new` }] : []}
      />
      <SectionCard title="All payments" flush>
        <div className="p-4 sm:p-5">
          <FilterBar paramKeys={["status", "provider", "unallocated", "org"]}>
            <FilterSelect param="status" label="Status" allLabel="All statuses" options={OPTIONS.paymentStatus} />
            <FilterSelect param="provider" label="Provider" allLabel="All providers" options={OPTIONS.provider} />
            <FilterSelect param="unallocated" label="Allocation" allLabel="All payments" options={[{ value: "1", label: "Advance (not allocated)" }]} />
          </FilterBar>
        </div>
        <PaymentTable
          audience="staff"
          rows={result.items}
          timeZone={timeZone}
          actions={(p) => (
            <span className="flex justify-end gap-1">
              {canPay && !p.invoiceId && p.status === "succeeded" && p.organizationId ? (
                <AllocatePaymentButton
                  paymentId={p.id}
                  invoices={payable
                    .filter((i) => i.organizationId === p.organizationId && i.currency === p.currency)
                    .map((i) => ({ value: i.id, label: `${i.code ?? "Invoice"} · due ${formatMoney(i.totalMinor - i.paidMinor, i.currency)}` }))}
                />
              ) : null}
              {canRefund && ["succeeded", "partially_refunded"].includes(p.status) && p.amountRefundedMinor < p.amountMinor ? <RefundRequestButton paymentId={p.id} label={p.code} /> : null}
            </span>
          )}
          empty={<EmptyState title="No payments match" description="Recorded and online payments appear here." size="sm" variant="plain" />}
          footer={<Pagination pathname={pathname} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="payments" />}
        />
      </SectionCard>
    </div>
  );
}
