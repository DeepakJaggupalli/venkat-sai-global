import type { Metadata } from "next";

import { PortalBillingOverview } from "@/components/billing/portal/portal-overview";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const ctx = await requireOrgMember("employer", "employer.billing.view");
  return <PortalBillingOverview portal="employer" ctx={ctx} />;
}
