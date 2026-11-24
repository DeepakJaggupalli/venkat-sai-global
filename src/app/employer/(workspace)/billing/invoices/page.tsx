import type { Metadata } from "next";

import { PortalBillingInvoices } from "@/components/billing/portal/portal-records";
import { requireOrgMember } from "@/modules/identity/authz";

import { WorkerInvoicesSection } from "../_components/worker-invoices-section";

export const metadata: Metadata = { title: "Invoices" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Company / Travel Agency portal invoices: worker invoices (with PDF downloads) first, then every document. */
export default async function BillingInvoicesPage({ searchParams }: PageProps) {
  const ctx = await requireOrgMember("employer", "employer.billing.view");
  return <PortalBillingInvoices portal="employer" ctx={ctx} searchParams={await searchParams} intro={<WorkerInvoicesSection ctx={ctx} />} />;
}
