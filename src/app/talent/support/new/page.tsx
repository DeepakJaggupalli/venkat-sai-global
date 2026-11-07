import type { Metadata } from "next";

import { SupportNewView } from "@/components/support/portal-support";
import type { SearchParams } from "@/lib/http";
import { requireOnboardedCandidate } from "../../_lib/guard";

export const metadata: Metadata = { title: "New support request" };

export default async function NewSupportRequestPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOnboardedCandidate();
  return <SupportNewView portal="talent" searchParams={await searchParams} />;
}
