import type { Metadata } from "next";

import { SupportNewView } from "@/components/support/portal-support";
import type { SearchParams } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "New support request" };

export default async function NewSupportRequestPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("institution");
  return <SupportNewView portal="institution" organizationId={ctx.organization.id} searchParams={await searchParams} />;
}
