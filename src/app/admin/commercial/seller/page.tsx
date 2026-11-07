import type { Metadata } from "next";

import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { getSetting } from "@/modules/settings";
import { countryOptions } from "@/modules/taxonomy/queries";

import { COMMERCIAL_CRUMB } from "../_lib/nav";
import { SellerForm } from "./seller-form";

export const metadata: Metadata = { title: "Seller details" };

const s = (v: unknown) => (typeof v === "string" ? v : "");

export default async function SellerPage() {
  const staff = await requireStaff("commercial.view");
  const [raw, homeCountry, countries] = await Promise.all([getSetting("commercial.seller_details"), getSetting("platform.home_country"), countryOptions()]);
  const v = (raw ?? {}) as Record<string, unknown>;
  const registered = Boolean(s(v.taxId).trim());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Seller details"
        description="The supplier printed on invoices. Issued invoices keep the details they were issued with."
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Seller details" }]}
      />
      <Callout tone={registered ? "neutral" : "info"} title={registered ? "GST registered" : "Not GST-registered"}>
        {registered
          ? "Invoices are titled “Tax invoice” and charge GST by place of supply."
          : "No GSTIN is recorded, so invoices are titled “Invoice” and no GST is charged. Enter the GSTIN once registration is granted."}
      </Callout>
      <SectionCard title="Supplier">
        <SellerForm
          canEdit={staffCan(staff, "commercial.plans")}
          countries={countries}
          defaults={{
            legalName: s(v.legalName),
            addressLine1: s(v.addressLine1) || s(v.address),
            addressLine2: s(v.addressLine2),
            city: s(v.city),
            stateRegion: s(v.stateRegion),
            postalCode: s(v.postalCode),
            countryCode: (s(v.countryCode) || s(homeCountry) || "IN").toUpperCase(),
            stateCode: s(v.stateCode),
            taxId: s(v.taxId),
            email: s(v.email),
            phone: s(v.phone),
            paymentInstructions: s(v.paymentInstructions),
          }}
        />
      </SectionCard>
    </div>
  );
}
