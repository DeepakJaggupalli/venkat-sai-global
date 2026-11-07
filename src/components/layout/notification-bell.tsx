"use client";

import { Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLocale } from "@/i18n/client";
import { cn } from "@/lib/utils";

import { safeInternalHref } from "./nav-utils";
import {
  EMPTY_NOTIFICATION_SUMMARY as EMPTY,
  parseNotificationSummary,
  type NotificationSummary,
  type NotificationSummaryItem,
} from "./notification-summary";
import { NOTIFICATION_SUMMARY_ENDPOINT } from "./portal-config";
import { useShellLang, useShellT, type ShellT } from "./shell-i18n";
import { TOPBAR_ICON_BUTTON } from "./shell-styles";
import { formatRelativeTime } from "./time";

const POLL_INTERVAL_MS = 60_000;
/** Focus and visibility events can arrive together; don't refetch more often than this. */
const MIN_REFETCH_GAP_MS = 5_000;
const MAX_ITEMS = 6;

/**
 * In-app notification bell. Polls GET /api/v1/notifications/summary every 60 s while the tab is
 * visible, and again on focus. It degrades quietly: a 404 (endpoint not deployed) stops polling,
 * a 401/403 (session ended) pauses polling until the window regains focus, and network errors
 * keep the last known state. In all of those cases the bell simply shows no unread count.
 */
export function NotificationBell({ viewAllHref, className }: { viewAllHref: string; className?: string }) {
  const t = useShellT();
  const locale = useLocale();
  const lang = useShellLang();
  const [summary, setSummary] = useState<NotificationSummary>(EMPTY);
  const [open, setOpen] = useState(false);
  /** Count to announce to screen readers when new notifications arrive (null = nothing to say). */
  const [announceCount, setAnnounceCount] = useState<number | null>(null);
  const refreshRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let disposed = false;
    let endpointMissing = false;
    let signedOut = false;
    let controller: AbortController | null = null;
    let lastFetchAt = 0;
    let lastUnread: number | null = null;

    async function load(force: boolean) {
      if (disposed || endpointMissing || document.visibilityState === "hidden") return;
      const now = Date.now();
      if (!force && now - lastFetchAt < MIN_REFETCH_GAP_MS) return;
      lastFetchAt = now;

      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch(NOTIFICATION_SUMMARY_ENDPOINT, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
          signal: request.signal,
        });
        if (disposed) return;
        if (response.status === 404) {
          endpointMissing = true;
          setSummary(EMPTY);
          return;
        }
        if (response.status === 401 || response.status === 403) {
          signedOut = true;
          setSummary(EMPTY);
          return;
        }
        if (!response.ok) return; // transient server error: keep what we have
        const next = parseNotificationSummary(await response.json());
        if (!next || disposed) return;
        signedOut = false;
        if (lastUnread !== null && next.unreadCount > lastUnread) setAnnounceCount(next.unreadCount);
        lastUnread = next.unreadCount;
        setSummary(next);
      } catch {
        // Offline, aborted or invalid JSON: keep the last known state and retry on the next tick.
      }
    }

    refreshRef.current = () => void load(true);
    void load(true);
    const interval = window.setInterval(() => {
      if (!signedOut) void load(false);
    }, POLL_INTERVAL_MS);
    const onFocus = () => void load(false);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const unread = summary.unreadCount;
  const items = summary.items.slice(0, MAX_ITEMS);
  const close = () => setOpen(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) refreshRef.current();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(TOPBAR_ICON_BUTTON, "relative", className)}
          aria-label={unread > 0 ? t("shell.notificationsUnread", { count: unread }) : t("shell.notifications")}
        >
          <Bell aria-hidden />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2 ring-white"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <span role="status" className="sr-only">
        {announceCount !== null ? t("shell.unreadAnnouncement", { count: announceCount }) : ""}
      </span>
      <PopoverContent align="end" sideOffset={8} lang={lang} className="w-[min(23rem,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <p className="font-heading text-sm font-semibold text-navy">{t("shell.notifications")}</p>
          {unread > 0 && (
            <span className="rounded-full bg-teal-soft px-2 py-0.5 text-xs font-medium text-accent-foreground">
              {t("shell.unreadCount", { count: unread })}
            </span>
          )}
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-surface-subtle text-muted-foreground" aria-hidden>
              <BellOff className="size-5" />
            </span>
            <p className="max-w-[16rem] text-sm text-muted-foreground">{t("shell.noNotifications")}</p>
          </div>
        ) : (
          <ul className="max-h-[min(26rem,60dvh)] divide-y divide-border overflow-y-auto overscroll-contain">
            {items.map((item) => (
              <NotificationRow key={item.id} item={item} locale={locale} t={t} fallbackHref={viewAllHref} onNavigate={close} />
            ))}
          </ul>
        )}
        <div className="border-t bg-surface-subtle/60 p-1.5">
          <Link
            href={viewAllHref}
            onClick={close}
            className="flex h-10 items-center justify-center rounded-md text-sm font-medium text-navy transition-colors hover:bg-white focus-visible:bg-white focus-visible:-outline-offset-2"
          >
            {t("shell.viewAllNotifications")}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({
  item,
  locale,
  t,
  fallbackHref,
  onNavigate,
}: {
  item: NotificationSummaryItem;
  locale: string;
  t: ShellT;
  fallbackHref: string;
  onNavigate: () => void;
}) {
  const unread = !item.readAt;
  // Only follow relative in-app links; anything else opens the notification centre instead.
  const href = safeInternalHref(item.link) ?? fallbackHref;
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        className="flex gap-3 px-4 py-3 transition-colors hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:-outline-offset-2"
      >
        <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", unread ? "bg-teal" : "bg-border")} />
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm text-navy", unread ? "font-semibold" : "font-medium")}>
            {unread && <span className="sr-only">{t("shell.unread")}: </span>}
            {item.title}
          </span>
          {item.body && <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{item.body}</span>}
          <time dateTime={item.createdAt} className="mt-1 block text-xs text-muted-foreground">
            {formatRelativeTime(item.createdAt, locale)}
          </time>
        </span>
      </Link>
    </li>
  );
}
