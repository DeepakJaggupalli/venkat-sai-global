import { Settings2 } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NotificationList } from "@/components/notifications/notification-list";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { getT } from "@/i18n/server";
import { env } from "@/lib/env";
import { parsePage, sp, type SearchParams } from "@/lib/http";
import { requireCandidate } from "@/modules/candidates/guard";
import { listNotifications, toNotificationListItem, unreadCount } from "@/modules/notifications/queries";

import { getAgeGateForCandidate } from "../onboarding/_lib/state";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("common");
  return { title: t("nav.notifications") };
}

const PATH = "/talent/notifications";

/**
 * /talent/notifications — the People Portal inbox (the bell's "View all" target in /talent).
 * All / Unread, mark read, archive; channel preferences live on /account/notifications/preferences.
 */
export default async function TalentNotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireCandidate();
  const { user } = session;
  if ((await getAgeGateForCandidate(session.candidate)).state !== "complete") redirect("/talent/onboarding");
  const [t, tc, params] = await Promise.all([getT("talent-account"), getT("common"), searchParams]);
  const filter = sp(params, "filter") === "unread" ? "unread" : "all";
  const page = parsePage(params, { defaultSize: 20, maxSize: 50 });
  const [result, unread] = await Promise.all([listNotifications(user.id, { filter }, page), unreadCount(user.id)]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={tc("nav.notifications")}
        description={t("notifications.description")}
        breadcrumbs={[{ label: tc("portal.talent"), href: "/talent" }, { label: tc("nav.notifications") }]}
        actions={[{ label: t("notifications.preferences"), href: "/account/notifications/preferences", variant: "outline", icon: <Settings2 aria-hidden="true" /> }]}
      />
      <NotificationList
        items={result.items.map(toNotificationListItem)}
        filter={filter}
        hrefs={{ all: PATH, unread: `${PATH}?filter=unread` }}
        unreadCount={unread}
        timeZone={user.timezone ?? env().DEFAULT_TIMEZONE}
        allowArchive
        labels={{
          views: t("notifications.views"),
          all: t("notifications.all"),
          unread: t("notifications.unread"),
          list: tc("nav.notifications"),
          markRead: t("notifications.markRead"),
          markAllRead: t("notifications.markAllRead"),
          archive: t("notifications.archive"),
          unreadMarker: t("notifications.unreadMarker"),
          emptyAllTitle: t("notifications.emptyAllTitle"),
          emptyAllDescription: t("notifications.emptyAllDescription"),
          emptyUnreadTitle: t("notifications.emptyUnreadTitle"),
          emptyUnreadDescription: t("notifications.emptyUnreadDescription"),
          error: t("notifications.error"),
          markedRead: t("notifications.markedRead"),
          archived: t("notifications.archived"),
        }}
      />
      <Pagination
        pathname={PATH}
        searchParams={params}
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        pageSize={result.pageSize}
        itemLabel={t("notifications.itemLabel")}
        labels={{ previous: tc("pagination.previous"), next: tc("pagination.next") }}
      />
    </div>
  );
}
