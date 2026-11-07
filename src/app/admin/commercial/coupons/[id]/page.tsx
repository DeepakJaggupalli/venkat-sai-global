import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatMinorPlain, minorUnitsFor } from "@/modules/commercial/money";
import { listPlansForAdmin } from "@/modules/commercial/queries";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { currencyOptions } from "@/modules/taxonomy/queries";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../../_lib/nav";
import { getCoupon } from "../../_lib/queries";
import { CouponForm } from "../_components/coupon-form";

export const metadata: Metadata = { title: "Coupon" };

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function CouponPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("commercial.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [coupon, plans, currencies] = await Promise.all([getCoupon(staff, id), listPlansForAdmin(staff), currencyOptions()]);
  if (!coupon) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="font-mono">{coupon.code}</span>}
        status={<StatusBadge tone={coupon.isActive ? "success" : "neutral"}>{coupon.isActive ? "Active" : "Inactive"}</StatusBadge>}
        description={`Redeemed ${coupon.redeemedCount} time${coupon.redeemedCount === 1 ? "" : "s"}.`}
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Coupons", href: `${ADMIN_COMMERCIAL}/coupons` }, { label: coupon.code }]}
      />
      <SectionCard title="Coupon">
        <CouponForm
          canEdit={staffCan(staff, "commercial.plans")}
          plans={plans.map((p) => ({ value: p.id, label: p.name }))}
          currencies={currencies}
          coupon={{
            id: coupon.id,
            code: coupon.code,
            description: coupon.description,
            discountType: coupon.discountType,
            percentOff: coupon.percentOff,
            amountOff: coupon.amountOffMinor !== null && coupon.currency ? formatMinorPlain(coupon.amountOffMinor, minorUnitsFor(coupon.currency)) : null,
            currency: coupon.currency,
            duration: coupon.duration,
            durationCycles: coupon.durationCycles,
            maxRedemptions: coupon.maxRedemptions,
            maxRedemptionsPerOrganization: coupon.maxRedemptionsPerOrganization,
            validFrom: iso(coupon.validFrom),
            validUntil: iso(coupon.validUntil),
            planIds: coupon.planIds,
            isActive: coupon.isActive,
            redeemedCount: coupon.redeemedCount,
          }}
        />
      </SectionCard>
    </div>
  );
}
