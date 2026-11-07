import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SupportDetailView } from "@/components/support/portal-support";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Support request" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SupportRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgMember("recruitment_partner");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <SupportDetailView portal="recruiter" user={ctx.user} ticketId={id} organizationId={ctx.organization.id} />;
}
