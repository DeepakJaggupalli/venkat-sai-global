import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MessageDetailView } from "@/components/messages/portal-messages";
import { env } from "@/lib/env";

import { getMessagesT, getTalentMessagesLabels } from "../_lib/i18n";
import { requireOnboardedCandidate } from "../../_lib/guard";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getMessagesT();
  return { title: t("conversation") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TalentConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireOnboardedCandidate();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { labels, contextLabels, locale } = await getTalentMessagesLabels();
  return (
    <MessageDetailView
      actor={{ kind: "user", user }}
      portal="talent"
      basePath="/talent/messages"
      threadId={id}
      labels={labels}
      contextLabels={contextLabels}
      timeZone={user.timezone ?? env().DEFAULT_TIMEZONE}
      locale={locale}
    />
  );
}
