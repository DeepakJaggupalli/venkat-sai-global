import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { formatRelativeTime } from "@/components/layout/time";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { SectionCard, type SectionCardLink } from "./section-card";
import type { DashboardAction, RecentItem } from "./types";

export type RecentListProps = {
  title: string;
  description?: string;
  /** Newest first. Only the first `limit` rows show. */
  items: readonly RecentItem[];
  /** Shown when `items` is empty: what will appear here and the next step. */
  empty: { title: string; description?: string; action?: DashboardAction; icon?: LucideIcon };
  /** "View all" link in the header. */
  viewAll?: SectionCardLink;
  icon?: LucideIcon;
  limit?: number;
  headingLevel?: "h2" | "h3";
  /** For deterministic relative times in tests. */
  now?: Date;
  className?: string;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const ABSOLUTE = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

/**
 * Latest items of one kind (new CVs, applications, submissions…) with status and "2 hours ago".
 * Rows are links when they have an href; an honest empty state with a next step otherwise. Server component.
 */
export function RecentList({ title, description, items, empty, viewAll, icon, limit = 6, headingLevel, now = new Date(), className }: RecentListProps) {
  const rows = items.slice(0, limit);
  return (
    <SectionCard title={title} description={description} icon={icon} action={rows.length > 0 ? viewAll : undefined} headingLevel={headingLevel} flush={rows.length > 0} className={className}>
      {rows.length === 0 ? (
        <EmptyState size="sm" title={empty.title} description={empty.description} action={empty.action} icon={empty.icon} />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((item) => (
            <li key={item.id}>
              <RecentRow item={item} now={now} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function RecentRow({ item, now }: { item: RecentItem; now: Date }) {
  const at = toDate(item.at);
  const status = item.status;
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-snug font-semibold text-foreground">{item.title}</span>
        {item.meta ? <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{item.meta}</span> : null}
        {status || at ? (
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 sm:hidden">
            {status ? <RowStatus status={status} /> : null}
            {at ? <RowTime at={at} now={now} /> : null}
          </span>
        ) : null}
      </span>
      {status || at ? (
        <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
          {status ? <RowStatus status={status} /> : null}
          {at ? <RowTime at={at} now={now} /> : null}
        </span>
      ) : null}
      {item.href ? <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/60" /> : null}
    </>
  );
  const base = "flex min-h-14 items-center gap-3 px-4 py-3 sm:px-5";
  return item.href ? (
    <Link href={item.href} className={cn(base, "hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

function RowStatus({ status }: { status: NonNullable<RecentItem["status"]> }) {
  return (
    <StatusBadge status={status.value} domain={status.domain} tone={status.tone} size="sm">
      {status.label}
    </StatusBadge>
  );
}

function RowTime({ at, now }: { at: Date; now: Date }) {
  return (
    <time dateTime={at.toISOString()} title={ABSOLUTE.format(at)} className="text-xs whitespace-nowrap text-muted-foreground">
      {formatRelativeTime(at, "en", now.getTime())}
    </time>
  );
}
