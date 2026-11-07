import type { Metadata } from "next";

import { PortalBillingInvoices } from "@/components/billing/portal/portal-records";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Invoices" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BillingInvoicesPage({ searchParams }: PageProps) {
  const ctx = await requireOrgMember("employer", "employer.billing.view");
  return <PortalBillingInvoices portal="employer" ctx={ctx} searchParams={await searchParams} />;
}
