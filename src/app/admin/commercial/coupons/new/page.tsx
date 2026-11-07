import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { listPlansForAdmin } from "@/modules/commercial/queries";
import { requireStaff } from "@/modules/identity/authz";
import { currencyOptions } from "@/modules/taxonomy/queries";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../../_lib/nav";
import { CouponForm } from "../_components/coupon-form";

export const metadata: Metadata = { title: "New coupon" };

export default async function NewCouponPage() {
  const staff = await requireStaff("commercial.plans");
  const [plans, currencies] = await Promise.all([listPlansForAdmin(staff), currencyOptions()]);
  return (
    <div className="space-y-6">
      <PageHeader title="New coupon" breadcrumbs={[COMMERCIAL_CRUMB, { label: "Coupons", href: `${ADMIN_COMMERCIAL}/coupons` }, { label: "New" }]} />
      <SectionCard title="Coupon">
        <CouponForm plans={plans.map((p) => ({ value: p.id, label: p.name }))} currencies={currencies} canEdit />
      </SectionCard>
    </div>
  );
}
