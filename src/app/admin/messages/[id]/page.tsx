import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MessageDetailView } from "@/components/messages/portal-messages";
import { env } from "@/lib/env";
import { requireStaff } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Conversation" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StaffConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <MessageDetailView actor={{ kind: "staff", ctx }} portal="admin" basePath="/admin/messages" threadId={id} timeZone={ctx.user.timezone ?? env().DEFAULT_TIMEZONE} />;
}
