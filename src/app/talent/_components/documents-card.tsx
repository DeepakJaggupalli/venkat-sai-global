import { BadgeCheck, CalendarClock, FileWarning, FolderOpen, Hourglass } from "lucide-react";
import Link from "next/link";

import { EmptyState, SectionCard } from "@/components/dashboard";
import { StatusBadge } from "@/components/shared/status-badge";

import { daysUntil } from "../_lib/dashboard";
import type { DocumentReminder } from "../_lib/dashboard-queries";

export type DocumentsCardLabels = {
  title: string;
  manage: string;
  allGood: string;
  allGoodDescription: string;
  noPassport: string;
  expired: (date: string) => string;
  soon: (date: string) => string;
  daysLeft: (count: number) => string;
  update: string;
  rejected: (count: number) => string;
  pending: (count: number) => string;
  verified: (count: number) => string;
  /** Name of a reminder: the passport, or the document / licence type. */
  name: (reminder: DocumentReminder) => string;
};

export type DocumentsCardProps = {
  reminders: readonly DocumentReminder[];
  counts: { verified: number; pending: number; rejected: number } | null;
  /** Show the "add your passport expiry date" hint (adults with no expiry date on file). */
  askPassportExpiry: boolean;
  today: string;
  labels: DocumentsCardLabels;
  formatIsoDate: (iso: string) => string;
  className?: string;
};

/**
 * Documents and passport: what expired or expires soon (passport 6 months ahead, others 60 days), and how many
 * uploaded documents are verified, being checked or need attention. Every row links to the profile documents.
 */
export function DocumentsCard({ reminders, counts, askPassportExpiry, today, labels, formatIsoDate, className }: DocumentsCardProps) {
  const chips = counts
    ? ([
        counts.rejected > 0 ? { key: "rejected", tone: "danger", icon: FileWarning, text: labels.rejected(counts.rejected) } : null,
        counts.pending > 0 ? { key: "pending", tone: "warning", icon: Hourglass, text: labels.pending(counts.pending) } : null,
        counts.verified > 0 ? { key: "verified", tone: "success", icon: BadgeCheck, text: labels.verified(counts.verified) } : null,
      ].filter(Boolean) as { key: string; tone: "danger" | "warning" | "success"; icon: typeof BadgeCheck; text: string }[])
    : [];

  return (
    <SectionCard title={labels.title} icon={FolderOpen} action={{ label: labels.manage, href: "/talent/profile#documents" }} className={className}>
      {chips.length ? (
        <ul className="mb-3 flex flex-wrap gap-2">
          {chips.map(({ key, tone, icon: Icon, text }) => (
            <li key={key}>
              <StatusBadge tone={tone} size="sm" dot={false} icon={<Icon aria-hidden="true" />}>
                {text}
              </StatusBadge>
            </li>
          ))}
        </ul>
      ) : null}

      {reminders.length ? (
        <ul className="divide-y divide-border">
          {reminders.slice(0, 4).map((r) => {
            const days = daysUntil(r.expiresOn, today);
            const href = r.kind === "passport" ? "/talent/profile#personal" : "/talent/profile#documents";
            return (
              <li key={r.id}>
                <Link href={href} className="-mx-2 flex min-h-14 items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-ring">
                  <span
                    aria-hidden="true"
                    className={
                      r.state === "expired"
                        ? "flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger-strong"
                        : "flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning-strong"
                    }
                  >
                    <CalendarClock className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-foreground">{labels.name(r)}</span>
                    <span className="block text-[13px] text-muted-foreground">{r.state === "expired" ? labels.expired(formatIsoDate(r.expiresOn)) : labels.soon(formatIsoDate(r.expiresOn))}</span>
                  </span>
                  {r.state === "soon" ? (
                    <StatusBadge tone="warning" size="sm">
                      {labels.daysLeft(days)}
                    </StatusBadge>
                  ) : (
                    <span className="text-sm font-semibold text-accent-text">{labels.update}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState size="sm" icon={BadgeCheck} title={labels.allGood} description={labels.allGoodDescription} />
      )}

      {askPassportExpiry ? (
        <p className="mt-3 rounded-xl bg-surface-subtle px-4 py-3 text-sm text-pretty text-muted-foreground">
          {labels.noPassport}{" "}
          <Link href="/talent/profile#personal" className="font-semibold text-accent-text underline underline-offset-2">
            {labels.update}
          </Link>
        </p>
      ) : null}
    </SectionCard>
  );
}
