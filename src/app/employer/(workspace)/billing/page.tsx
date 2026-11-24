import type { Metadata } from "next";

import { PortalBillingOverview } from "@/components/billing/portal/portal-overview";
import { requireOrgMember } from "@/modules/identity/authz";

import { WorkerInvoicesSection } from "./_components/worker-invoices-section";

export const metadata: Metadata = { title: "Billing" };

/** Billing overview; the latest invoices for workers we supplied come first (travel agencies and companies). */
export default async function BillingPage() {
  const ctx = await requireOrgMember("employer", "employer.billing.view");
  return <PortalBillingOverview portal="employer" ctx={ctx} intro={<WorkerInvoicesSection ctx={ctx} limit={3} compact />} />;
}
