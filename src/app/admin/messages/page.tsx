import type { Metadata } from "next";

import { MessagesListView } from "@/components/messages/portal-messages";
import { DEFAULT_MESSAGES_LABELS } from "@/components/messages/labels";
import { env } from "@/lib/env";
import type { SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { organizationNames } from "./_lib/queries";

export const metadata: Metadata = { title: "Messages" };

/**
 * Staff inbox: conversations the staff member takes part in plus those their context permissions open
 * (organisations, requirements, partner work, applications and placements).
 */
export default async function StaffMessagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff();
  return (
    <MessagesListView
      actor={{ kind: "staff", ctx }}
      portal="admin"
      basePath="/admin/messages"
      newHref={staffCan(ctx, ["orgs.view", "candidates.view"], "any") ? "/admin/messages/new" : undefined}
      searchParams={await searchParams}
      timeZone={ctx.user.timezone ?? env().DEFAULT_TIMEZONE}
      labels={{
        ...DEFAULT_MESSAGES_LABELS,
        description: "Conversations with candidates, employers, partners and institutions.",
        emptyDescription: "Conversations you take part in, or that your permissions give you access to, appear here.",
      }}
      describeRows={organizationNames}
    />
  );
}
