import type { Metadata } from "next";

import { COUPON_DURATION_LABELS } from "@/components/billing/labels";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { env } from "@/lib/env";
import { parsePage } from "@/lib/http";
import { listCoupons } from "@/modules/commercial/queries";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../_lib/nav";
import { CouponActiveToggle } from "./_components/coupon-form";

export const metadata: Metadata = { title: "Coupons" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CouponsPage({ searchParams }: PageProps) {
  const staff = await requireStaff("commercial.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.trim().slice(0, 40) : undefined;
  const active = sp.active === "1" ? true : sp.active === "0" ? false : undefined;
  const result = await listCoupons(staff, { q, active }, parsePage(sp));
  const canEdit = staffCan(staff, "commercial.plans");
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;
  const pathname = `${ADMIN_COMMERCIAL}/coupons`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coupons"
        description="Discount codes for plans and invoices. Coupons never apply to candidates, who are never charged."
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Coupons" }]}
        actions={canEdit ? [{ label: "New coupon", href: `${pathname}/new` }] : []}
      />
      <SectionCard title="All coupons" flush>
        <div className="p-4 sm:p-5">
          <FilterBar paramKeys={["q", "active"]} search={<SearchInput label="Search codes" />}>
            <FilterSelect
              param="active"
              label="Status"
              allLabel="All coupons"
              options={[
                { value: "1", label: "Active" },
                { value: "0", label: "Inactive" },
              ]}
            />
          </FilterBar>
        </div>
        <DataTable
          caption="Coupons"
          rows={result.items}
          getRowId={(c) => c.id}
          rowLink={(c) => ({ href: `${pathname}/${c.id}`, label: `Open coupon ${c.code}` })}
          columns={[
            { id: "code", header: "Code", primary: true, cell: (c) => <span className="font-mono font-medium">{c.code}</span> },
            { id: "discount", header: "Discount", cell: (c) => (c.discountType === "percent" ? `${c.percentOff}% off` : c.amountOffMinor !== null && c.currency ? <MoneyText amountMinor={c.amountOffMinor} currency={c.currency} /> : "—") },
            { id: "duration", header: "Applies to", hideOnMobile: true, cell: (c) => (c.duration === "repeating" ? `${c.durationCycles} billing cycles` : COUPON_DURATION_LABELS[c.duration]) },
            { id: "used", header: "Redeemed", align: "right", cell: (c) => `${c.redeemedCount}${c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}` },
            { id: "until", header: "Valid until", hideOnMobile: true, cell: (c) => (c.validUntil ? <DateText value={c.validUntil} timeZone={timeZone} /> : "No end date") },
            { id: "active", header: "Active", cell: (c) => (canEdit ? <CouponActiveToggle couponId={c.id} isActive={c.isActive} /> : c.isActive ? "Yes" : "No") },
          ]}
          empty={<EmptyState title="No coupons" description="Create a coupon to offer a discount on a plan or invoice." size="sm" variant="plain" />}
          footer={<Pagination pathname={pathname} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="coupons" />}
        />
      </SectionCard>
    </div>
  );
}
