"use client";

import { Archive, BellOff, Check, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { RelativeTime } from "@/components/shared/relative-time";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { archiveNotificationsAction, markAllNotificationsReadAction, markNotificationsReadAction } from "@/modules/notifications/actions";
import type { NotificationListItem } from "@/modules/notifications/types";

export type NotificationListLabels = {
  views: string;
  all: string;
  unread: string;
  list: string;
  markRead: string;
  markAllRead: string;
  archive: string;
  unreadMarker: string;
  emptyAllTitle: string;
  emptyAllDescription: string;
  emptyUnreadTitle: string;
  emptyUnreadDescription: string;
  error: string;
  markedRead: string;
  archived: string;
};

export const NOTIFICATION_LIST_DEFAULT_LABELS: NotificationListLabels = {
  views: "Notification views",
  all: "All",
  unread: "Unread",
  list: "Notifications",
  markRead: "Mark as read",
  markAllRead: "Mark all as read",
  archive: "Archive",
  unreadMarker: "Unread",
  emptyAllTitle: "No notifications yet",
  emptyAllDescription: "Updates about your account, applications, requests and messages will appear here.",
  emptyUnreadTitle: "You are all caught up",
  emptyUnreadDescription: "There are no unread notifications.",
  error: "That did not work. Please try again.",
  markedRead: "Marked as read",
  archived: "Notification archived",
};

type NotificationListProps = {
  items: NotificationListItem[];
  filter: "all" | "unread";
  /** Links for the filter tabs (keep other query parameters, reset the page). */
  hrefs: { all: string; unread: string };
  unreadCount: number;
  /** IANA zone for exact timestamps (viewer's zone). */
  timeZone?: string;
  /** Show an archive button on each notification. */
  allowArchive?: boolean;
  /** Translations (People Portal); English by default. */
  labels?: Partial<NotificationListLabels>;
  className?: string;
};

type OptimisticOp = { type: "read"; id: string; at: string } | { type: "readAll"; at: string } | { type: "archive"; id: string };

/** Only relative in-app paths are followed (the server stores nothing else, this is defence in depth). */
function isAppPath(link: string | null): link is string {
  return Boolean(link && link.startsWith("/") && !link.startsWith("//") && !link.startsWith("/\\"));
}

/**
 * Notification centre list: All / Unread tabs (URL-driven), unread markers that do not rely on colour,
 * mark one / all as read, optional archive, and links that mark the notification read when followed.
 * Mutations are optimistic (useOptimistic) and roll back with an error toast; the page data refreshes afterwards.
 */
export function NotificationList({ items, filter, hrefs, unreadCount, timeZone, allowArchive = false, labels: labelOverrides, className }: NotificationListProps) {
  const labels = { ...NOTIFICATION_LIST_DEFAULT_LABELS, ...labelOverrides };
  const router = useRouter();
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();
  // Optimistic view of the server-provided items; it falls back to the props when the transition ends
  // (successful actions refresh the page data inside the same transition, failures simply roll back).
  const [rows, applyOptimistic] = useOptimistic(items, (current: NotificationListItem[], op: OptimisticOp) => {
    if (op.type === "read") return current.map((r) => (r.id === op.id && !r.readAt ? { ...r, readAt: op.at } : r));
    if (op.type === "readAll") return current.map((r) => (r.readAt ? r : { ...r, readAt: op.at }));
    return current.filter((r) => r.id !== op.id);
  });
  const unreadInItems = items.filter((r) => !r.readAt).length;
  const unread = Math.max(0, unreadCount - (unreadInItems - rows.filter((r) => !r.readAt).length));

  function run(op: OptimisticOp, action: () => Promise<{ ok: boolean; error?: string; message?: string }>, opts: { silent?: boolean; announce?: string; toastSuccess?: boolean } = {}) {
    startTransition(async () => {
      applyOptimistic(op);
      const result = await action();
      if (!result.ok) {
        if (!opts.silent) toast.error(result.error || labels.error);
        return;
      }
      if (opts.toastSuccess && result.message) toast.success(result.message);
      if (opts.announce) setAnnouncement(opts.announce);
      if (!opts.silent) router.refresh();
    });
  }

  const markRead = (id: string, opts: { silent?: boolean } = {}) => {
    if (rows.find((r) => r.id === id)?.readAt) return;
    run({ type: "read", id, at: new Date().toISOString() }, () => markNotificationsReadAction({ ids: [id] }), { silent: opts.silent, announce: labels.markedRead });
  };
  const markAllRead = () => run({ type: "readAll", at: new Date().toISOString() }, () => markAllNotificationsReadAction({}), { toastSuccess: true });
  const archiveOne = (id: string) => run({ type: "archive", id }, () => archiveNotificationsAction({ ids: [id] }), { announce: labels.archived });

  const visible = filter === "unread" ? rows.filter((r) => !r.readAt) : rows;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <LinkTabs
          label={labels.views}
          className="min-w-0 flex-1"
          activeHref={filter === "unread" ? hrefs.unread : hrefs.all}
          items={[
            { href: hrefs.all, label: labels.all },
            { href: hrefs.unread, label: labels.unread, count: unread },
          ]}
        />
        {unread > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={markAllRead} disabled={isPending}>
            <CheckCheck aria-hidden />
            {labels.markAllRead}
          </Button>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {visible.length === 0 ? (
        <EmptyState
          icon={<BellOff />}
          title={filter === "unread" ? labels.emptyUnreadTitle : labels.emptyAllTitle}
          description={filter === "unread" ? labels.emptyUnreadDescription : labels.emptyAllDescription}
        />
      ) : (
        <ul aria-label={labels.list} className={cn("space-y-2 transition-opacity", isPending && "opacity-80")}>
          {visible.map((item) => {
            const isUnread = !item.readAt;
            return (
              <li
                key={item.id}
                className={cn(
                  "relative flex gap-3 rounded-xl border bg-white p-4 sm:p-5",
                  isUnread ? "border-teal/40 bg-teal-soft/40" : "border-border",
                )}
              >
                <span aria-hidden className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", isUnread ? "bg-teal" : "bg-transparent")} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{item.categoryLabel}</span>
                    <span aria-hidden>·</span>
                    <RelativeTime value={item.createdAt} timeZone={timeZone} />
                    {isUnread && (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-teal-strong ring-1 ring-teal/30">
                        {labels.unreadMarker}
                      </span>
                    )}
                  </p>
                  <p className={cn("text-sm break-words text-navy sm:text-base", isUnread ? "font-semibold" : "font-medium")}>
                    {isAppPath(item.link) ? (
                      <Link
                        href={item.link}
                        onClick={() => markRead(item.id, { silent: true })}
                        className="rounded-sm underline-offset-4 after:absolute after:inset-0 after:rounded-xl hover:underline focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      item.title
                    )}
                  </p>
                  {item.body && <p className="line-clamp-3 text-sm break-words whitespace-pre-line text-muted-foreground">{item.body}</p>}
                </div>
                <div className="relative z-10 flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start">
                  {isUnread && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => markRead(item.id)} aria-label={`${labels.markRead}: ${item.title}`}>
                      <Check aria-hidden />
                      <span className="hidden sm:inline">{labels.markRead}</span>
                    </Button>
                  )}
                  {allowArchive && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => archiveOne(item.id)} aria-label={`${labels.archive}: ${item.title}`}>
                      <Archive aria-hidden />
                      <span className="hidden sm:inline">{labels.archive}</span>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
