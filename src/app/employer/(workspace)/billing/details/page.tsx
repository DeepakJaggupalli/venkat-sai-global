import type { Metadata } from "next";

import { PortalBillingDetails } from "@/components/billing/portal/portal-records";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Billing details" };

export default async function BillingDetailsPage() {
  const ctx = await requireOrgMember("employer", "employer.billing.view");
  return <PortalBillingDetails portal="employer" ctx={ctx} />;
}
