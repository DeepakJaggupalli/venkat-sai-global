import type { Metadata } from "next";

import { SupportNewView } from "@/components/support/portal-support";
import type { SearchParams } from "@/lib/http";
import { requireCandidate } from "@/modules/candidates/guard";

export const metadata: Metadata = { title: "New support request" };

export default async function NewSupportRequestPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireCandidate();
  return <SupportNewView portal="talent" searchParams={await searchParams} />;
}
