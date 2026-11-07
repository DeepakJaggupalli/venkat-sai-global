import type { Metadata } from "next";

import { PortalBillingDetails } from "@/components/billing/portal/portal-records";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Billing details" };

export default async function BillingDetailsPage() {
  const ctx = await requireOrgMember("recruitment_partner", "partner.billing.manage");
  return <PortalBillingDetails portal="recruiter" ctx={ctx} />;
}
