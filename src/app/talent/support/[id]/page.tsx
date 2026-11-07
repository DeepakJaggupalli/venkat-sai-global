import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SupportDetailView } from "@/components/support/portal-support";
import { requireOnboardedCandidate } from "../../_lib/guard";

export const metadata: Metadata = { title: "Support request" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SupportRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOnboardedCandidate();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <SupportDetailView portal="talent" user={ctx.user} ticketId={id} />;
}
