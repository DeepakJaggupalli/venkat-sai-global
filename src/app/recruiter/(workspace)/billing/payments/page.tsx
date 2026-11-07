import type { Metadata } from "next";

import { PortalBillingPayments } from "@/components/billing/portal/portal-records";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Payments" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BillingPaymentsPage({ searchParams }: PageProps) {
  const ctx = await requireOrgMember("recruitment_partner", "partner.billing.manage");
  return <PortalBillingPayments portal="recruiter" ctx={ctx} searchParams={await searchParams} />;
}
