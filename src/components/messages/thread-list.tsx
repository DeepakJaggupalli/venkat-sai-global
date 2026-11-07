import { BellOff, MessageSquare } from "lucide-react";
import Link from "next/link";

import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

import { DEFAULT_MESSAGES_LABELS, unreadLabel, type MessagesLabels } from "./labels";

export type ThreadListRow = {
  id: string;
  subject: string;
  contextLabel?: string | null;
  /** Extra line (staff inbox: organisation name). */
  meta?: string | null;
  status: "open" | "closed";
  lastMessageAt: Date | null;
  createdAt: Date;
  unreadCount: number;
  isMuted: boolean;
};

/**
 * Conversation list: unread conversations are bold with a text badge ("3 unread"), muted and closed
 * conversations are labelled. A plain list of links (keyboard and screen-reader friendly), stacked on phones.
 */
export function ThreadList({
  rows,
  basePath,
  timeZone,
  labels = DEFAULT_MESSAGES_LABELS,
  filtered = false,
  emptyAction,
  locale,
}: {
  rows: ThreadListRow[];
  basePath: string;
  timeZone?: string;
  labels?: MessagesLabels;
  filtered?: boolean;
  emptyAction?: { label: string; href: string };
  locale?: string;
}) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={<MessageSquare aria-hidden="true" />}
        title={filtered ? labels.emptyFilteredTitle : labels.emptyTitle}
        description={filtered ? undefined : labels.emptyDescription}
        primaryAction={filtered ? undefined : emptyAction}
      />
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" aria-label={labels.listCaption} data-testid="thread-list">
      {rows.map((t) => {
        const unread = t.unreadCount > 0;
        return (
          <li key={t.id}>
            <Link
              href={`${basePath}/${t.id}`}
              className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-surface-subtle focus-visible:bg-surface-subtle sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="flex min-w-0 flex-1 items-start gap-3">
                <span aria-hidden="true" className={cn("mt-2 size-2 shrink-0 rounded-full", unread ? "bg-teal" : "bg-transparent")} />
                <span className="min-w-0">
                  <span className={cn("block truncate text-sm", unread ? "font-semibold text-foreground" : "font-medium text-foreground")}>{t.subject}</span>
                  {t.contextLabel || t.meta ? (
                    <span className="block truncate text-xs text-muted-foreground">{[t.contextLabel, t.meta].filter(Boolean).join(" · ")}</span>
                  ) : null}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2 pl-5 sm:pl-0">
                {unread ? (
                  <StatusBadge tone="brand" size="sm" className="unread-badge">
                    {unreadLabel(labels, t.unreadCount)}
                  </StatusBadge>
                ) : null}
                {t.isMuted ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <BellOff className="size-3.5" aria-hidden="true" />
                    {labels.muted}
                  </span>
                ) : null}
                {t.status === "closed" ? (
                  <StatusBadge tone="neutral" size="sm">
                    {labels.closed}
                  </StatusBadge>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  <span className="sr-only">{labels.lastActivity}: </span>
                  <DateText value={t.lastMessageAt ?? t.createdAt} mode="datetime" timeZone={timeZone} locale={locale} />
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
