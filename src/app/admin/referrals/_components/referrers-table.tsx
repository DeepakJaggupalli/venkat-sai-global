import { Ban, ListChecks, MessageCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DataTable } from "@/components/shared/data-table";
import { RelativeTime } from "@/components/shared/relative-time";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { whatsappHref } from "@/config/contact";
import { formatMoney } from "@/lib/format";
import type { PaidTotal, ReferrerItem } from "@/modules/referrals/queries";
import { REFERRER_STATUS_LABELS } from "@/modules/referrals/schemas";

import { setReferrerStatusAction } from "../actions";
import { ConfirmButton } from "./confirm-button";
import { TOUCH } from "./touch";

export function paidTotalsText(totals: PaidTotal[]): string {
  return totals.map((t) => formatMoney(t.amountMinor, t.currency)).join(" · ");
}

function Count({ value, label, href }: { value: number; label: string; href?: string }) {
  const body = (
    <>
      <span className="font-semibold tabular-nums text-foreground">{value}</span> <span className="text-muted-foreground">{label}</span>
    </>
  );
  return href && value > 0 ? (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1 underline-offset-4 hover:underline md:min-h-9">
      {body}
    </Link>
  ) : (
    <span className="inline-flex min-h-11 items-center gap-1 md:min-h-9">{body}</span>
  );
}

/** Referrers: contact, code, how many they referred, rewards due and paid (per currency), block / unblock. */
export function ReferrersTable({ items, empty, footer }: { items: ReferrerItem[]; empty: ReactNode; footer: ReactNode }) {
  return (
    <DataTable
      caption="Referrers"
      rows={items}
      getRowId={(r) => r.id}
      columns={[
        {
          id: "name",
          header: "Referrer",
          primary: true,
          cell: (r) => (
            <div className="min-w-0" data-testid="referrer-row">
              <p className="font-medium text-foreground">{r.name}</p>
              <p className="text-xs text-muted-foreground">
                Code{" "}
                <span className="font-mono font-semibold text-foreground" translate="no">
                  {r.code}
                </span>
              </p>
              {r.status === "blocked" ? (
                <StatusBadge tone="danger" size="sm" className="mt-1">
                  {REFERRER_STATUS_LABELS.blocked}
                </StatusBadge>
              ) : null}
            </div>
          ),
        },
        {
          id: "phone",
          header: "Mobile",
          cell: (r) =>
            r.phone ? (
              <a href={`tel:${r.phone}`} className="inline-flex min-h-11 items-center font-medium text-navy underline-offset-4 hover:underline md:min-h-9">
                {r.phone}
              </a>
            ) : (
              <span className="text-muted-foreground">{r.phoneMasked}</span>
            ),
        },
        {
          id: "counts",
          header: "Referred",
          cell: (r) => (
            <div className="flex flex-wrap gap-x-3 text-sm">
              <Count value={r.referredCount} label="sent a CV" href={`/admin/referrals?referrer=${r.id}`} />
              <Count value={r.placedCount} label="placed" />
              <Count value={r.dueCount} label="due" href={`/admin/referrals?referrer=${r.id}&reward=due`} />
            </div>
          ),
        },
        {
          id: "paid",
          header: "Paid",
          cell: (r) =>
            r.paidTotals.length ? (
              <div className="text-sm">
                <p className="font-medium tabular-nums text-foreground">{paidTotalsText(r.paidTotals)}</p>
                <p className="text-xs text-muted-foreground">
                  {r.paidCount} {r.paidCount === 1 ? "reward" : "rewards"}
                </p>
              </div>
            ) : (
              <span className="text-muted-foreground">Nothing yet</span>
            ),
        },
        { id: "joined", header: "Joined", hideOnMobile: true, nowrap: true, cell: (r) => <RelativeTime value={r.createdAt} /> },
        {
          id: "actions",
          header: "Actions",
          cell: (r) => (
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm" className={TOUCH}>
                <Link href={`/admin/referrals?referrer=${r.id}`}>
                  <ListChecks aria-hidden="true" />
                  Referrals
                  <span className="sr-only"> of {r.name}</span>
                </Link>
              </Button>
              {r.phone ? (
                <Button asChild variant="outline" size="sm" className={TOUCH}>
                  <a href={whatsappHref(`Hello ${r.name}, this is Venkat Sai Global about your referrals. Your link: ${r.url}`, r.phone)} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden="true" className="text-success-strong" />
                    WhatsApp
                    <span className="sr-only"> {r.name} (opens WhatsApp)</span>
                  </a>
                </Button>
              ) : null}
              {r.status === "active" ? (
                <ConfirmButton
                  variant="ghost"
                  icon={<Ban aria-hidden="true" />}
                  action={setReferrerStatusAction.bind(null, { id: r.id, status: "blocked" })}
                  confirm={{
                    title: `Block ${r.name}?`,
                    description: "Their link stops working and no reward can be recorded for them until you unblock them. CVs already sent stay in the list.",
                    confirmLabel: "Block referrer",
                    destructive: true,
                  }}
                  testId="referrer-block"
                >
                  Block
                </ConfirmButton>
              ) : (
                <ConfirmButton variant="outline" icon={<RotateCcw aria-hidden="true" />} action={setReferrerStatusAction.bind(null, { id: r.id, status: "active" })} testId="referrer-unblock">
                  Unblock
                </ConfirmButton>
              )}
            </div>
          ),
        },
      ]}
      empty={empty}
      footer={footer}
    />
  );
}
