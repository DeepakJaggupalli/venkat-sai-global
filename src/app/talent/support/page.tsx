import type { Metadata } from "next";

import { SupportListView } from "@/components/support/portal-support";
import type { SearchParams } from "@/lib/http";
import { requireCandidate } from "@/modules/candidates/guard";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCandidate();
  return <SupportListView portal="talent" user={ctx.user} searchParams={await searchParams} />;
}
