import type { Metadata } from "next";

import { MessagesListView } from "@/components/messages/portal-messages";
import { Callout } from "@/components/shared/callout";
import { env } from "@/lib/env";
import type { SearchParams } from "@/lib/http";
import { requireCandidate } from "@/modules/candidates/guard";

import { getMessagesT, getTalentMessagesLabels } from "./_lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getMessagesT();
  return { title: t("title") };
}

/**
 * People Portal conversations. Candidates cannot start threads (the module routes their questions to
 * support requests); they read and reply to conversations Venkat Sai staff start with them.
 */
export default async function TalentMessagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user } = await requireCandidate();
  const { labels, contextLabels, locale, t } = await getTalentMessagesLabels();
  return (
    <div className="space-y-6">
      <MessagesListView
        actor={{ kind: "user", user }}
        portal="talent"
        basePath="/talent/messages"
        searchParams={await searchParams}
        labels={labels}
        contextLabels={contextLabels}
        timeZone={user.timezone ?? env().DEFAULT_TIMEZONE}
        locale={locale}
      />
      <Callout tone="info" action={{ label: labels.newConversation, href: "/talent/support/new" }}>
        {t("supportHint")}
      </Callout>
    </div>
  );
}
