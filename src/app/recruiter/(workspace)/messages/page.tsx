import type { Metadata } from "next";

import { MessagesListView } from "@/components/messages/portal-messages";
import { DEFAULT_MESSAGES_LABELS } from "@/components/messages/labels";
import { env } from "@/lib/env";
import type { SearchParams } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("recruitment_partner", "partner.messages");
  return (
    <MessagesListView
      actor={{ kind: "org", ctx }}
      portal="recruiter"
      basePath="/recruiter/messages"
      newHref="/recruiter/messages/new"
      searchParams={await searchParams}
      timeZone={ctx.user.timezone ?? env().DEFAULT_TIMEZONE}
      labels={{ ...DEFAULT_MESSAGES_LABELS, description: "Conversations between your organisation and the Venkat Sai team." }}
    />
  );
}
