import type { Metadata } from "next";

import { PortalBillingOverview } from "@/components/billing/portal/portal-overview";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const ctx = await requireOrgMember("institution", "institution.billing.manage");
  return <PortalBillingOverview portal="institution" ctx={ctx} />;
}
