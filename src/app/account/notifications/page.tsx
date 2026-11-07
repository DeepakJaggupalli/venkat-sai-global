import type { Metadata } from "next";

import { NotificationList } from "@/components/notifications/notification-list";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { env } from "@/lib/env";
import { parsePage, sp, type SearchParams } from "@/lib/http";
import { requireUser } from "@/modules/identity/session";
import { listNotifications, toNotificationListItem, unreadCount } from "@/modules/notifications/queries";

import { NOTIFICATIONS_PATH, NotificationSectionTabs } from "./_components/section-tabs";

export const metadata: Metadata = { title: "Notifications", robots: { index: false, follow: false } };

/**
 * /account/notifications — notification centre for every signed-in user (the bell's "View all" target in
 * the business portals). All / Unread views, mark as read, archive, pagination. Preferences live on the
 * sibling tab /account/notifications/preferences.
 */
export default async function AccountNotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const params = await searchParams;
  const filter = sp(params, "filter") === "unread" ? "unread" : "all";
  const page = parsePage(params, { defaultSize: 20, maxSize: 50 });
  const [result, unread] = await Promise.all([listNotifications(user.id, { filter }, page), unreadCount(user.id)]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Updates about your account, applications, requests and messages across Venkat Sai Global."
        className="pb-0"
      />
      <NotificationSectionTabs active="inbox" />
      <NotificationList
        items={result.items.map(toNotificationListItem)}
        filter={filter}
        hrefs={{ all: NOTIFICATIONS_PATH, unread: `${NOTIFICATIONS_PATH}?filter=unread` }}
        unreadCount={unread}
        timeZone={user.timezone ?? env().DEFAULT_TIMEZONE}
        allowArchive
      />
      <Pagination
        pathname={NOTIFICATIONS_PATH}
        searchParams={params}
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        pageSize={result.pageSize}
        itemLabel="notifications"
      />
    </div>
  );
}
