import type { Metadata } from "next";

import { SupportListView } from "@/components/support/portal-support";
import type { SearchParams } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("employer");
  return <SupportListView portal="employer" user={ctx.user} organizationId={ctx.organization.id} searchParams={await searchParams} />;
}
