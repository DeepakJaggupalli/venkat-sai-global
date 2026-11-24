import { BadgeCheck, Gift, MessageCircle, Undo2, Unlink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ActionDialog } from "@/components/admin/action-dialog";
import { ActionForm } from "@/components/admin/action-form";
import { DataTable } from "@/components/shared/data-table";
import { RelativeTime } from "@/components/shared/relative-time";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { whatsappHref } from "@/config/contact";
import { formatDate, formatMoney } from "@/lib/format";
import { CV_SUBMISSION_STATUS_LABELS, CV_SUBMISSION_STATUS_TONE } from "@/modules/operations/cv-submission-schemas";
import type { ReferredCvItem } from "@/modules/referrals/queries";
import { publicReferredName, REWARD_STATUS_LABELS, REWARD_STATUS_TONE } from "@/modules/referrals/schemas";

import { markReferralPaidAction, undoReferralPayoutAction, unlinkCvReferralAction } from "../actions";
import { ConfirmButton } from "./confirm-button";
import { TOUCH } from "./touch";

function referrerWhatsApp(item: ReferredCvItem): string | null {
  if (!item.referrer.phone) return null;
  const friend = publicReferredName(item.name);
  const message =
    item.reward === "due"
      ? `Hello ${item.referrer.name}, this is Venkat Sai Global. Good news: ${friend}, who you referred, has gone abroad for a job through us. Your referral reward is ready. Please reply so we can arrange it.`
      : `Hello ${item.referrer.name}, this is Venkat Sai Global about ${friend}, who you referred.`;
  return whatsappHref(message, item.referrer.phone);
}

function RewardCell({ item }: { item: ReferredCvItem }) {
  return (
    <div className="space-y-1">
      <StatusBadge tone={REWARD_STATUS_TONE[item.reward]} size="sm">
        {REWARD_STATUS_LABELS[item.reward]}
      </StatusBadge>
      {item.payout ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{formatMoney(item.payout.amountMinor, item.payout.currency)}</span> on {formatDate(item.payout.paidAt, { timeZone: "Asia/Kolkata" })}
          {item.payout.paidByName ? ` by ${item.payout.paidByName}` : ""}
          {item.payout.note ? <span className="block break-words">{item.payout.note}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

function Actions({ item, currencies, rewardText }: { item: ReferredCvItem; currencies: SelectOption[]; rewardText: string }) {
  const whatsapp = referrerWhatsApp(item);
  const buttons: ReactNode[] = [];
  if (item.reward === "due" && item.referrer.status === "active") {
    buttons.push(
      <ActionDialog
        key="pay"
        title={`Mark paid: ${item.referrer.name}`}
        description={`Reward for referring ${item.name} (${item.code}). Pay the person who has the referrer's number (call or WhatsApp to confirm first), then enter what you paid and choose the currency.${rewardText ? ` The website says: "${rewardText}".` : ""}`}
        trigger={
          <Button size="sm" className={TOUCH} data-testid="referral-mark-paid">
            <Gift aria-hidden="true" />
            Mark paid
          </Button>
        }
      >
        <ActionForm
          action={markReferralPaidAction}
          hidden={{ cvSubmissionId: item.id }}
          submitLabel="Save payment"
          pendingLabel="Saving…"
          columns={2}
          fields={[
            { name: "amount", label: "Amount paid", kind: "number", required: true, min: 0, step: "any", placeholder: "0.00" },
            { name: "currency", label: "Currency", kind: "select", required: true, options: currencies, placeholder: "Choose currency" },
            { name: "note", label: "Note", kind: "textarea", optional: true, rows: 2, placeholder: "For example: Paid by UPI, ref 4521", wide: true },
          ]}
        />
      </ActionDialog>,
    );
  }
  if (item.reward === "due" && item.referrer.status !== "active") {
    buttons.push(
      <span key="blocked" className="text-xs text-muted-foreground">
        Referrer blocked: unblock to pay
      </span>,
    );
  }
  if (whatsapp) {
    buttons.push(
      <Button key="wa" asChild variant="outline" size="sm" className={TOUCH}>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer">
          <MessageCircle aria-hidden="true" className="text-success-strong" />
          WhatsApp referrer
          <span className="sr-only"> {item.referrer.name} (opens WhatsApp)</span>
        </a>
      </Button>,
    );
  }
  if (item.payout) {
    buttons.push(
      <ConfirmButton
        key="undo"
        variant="ghost"
        icon={<Undo2 aria-hidden="true" />}
        action={undoReferralPayoutAction.bind(null, { cvSubmissionId: item.id })}
        confirm={{
          title: "Remove this payment record?",
          description: `Use this only if the payment to ${item.referrer.name} was recorded by mistake. The reward shows as due again. The removal is recorded in the audit log.`,
          confirmLabel: "Remove payment record",
          destructive: true,
        }}
      >
        Undo payment
      </ConfirmButton>,
    );
  } else {
    buttons.push(
      <ConfirmButton
        key="unlink"
        variant="ghost"
        icon={<Unlink aria-hidden="true" />}
        action={unlinkCvReferralAction.bind(null, { cvSubmissionId: item.id })}
        confirm={{
          title: `Remove ${item.referrer.name} as the referrer?`,
          description: `${item.name} (${item.code}) will no longer count as referred by ${item.referrer.name}. Use it for a wrong link or misuse.`,
          confirmLabel: "Remove referral",
          destructive: true,
        }}
      >
        Remove referral
      </ConfirmButton>,
    );
  }
  return <div className="flex flex-wrap items-center gap-2">{buttons}</div>;
}

/** CVs sent through a referral link: the person, their stage, who referred them, the reward and what to do next. */
export function ReferredTable({ items, currencies, rewardText, empty, footer }: { items: ReferredCvItem[]; currencies: SelectOption[]; rewardText: string; empty: ReactNode; footer: ReactNode }) {
  return (
    <DataTable
      caption="People who sent a CV through a referral link"
      rows={items}
      getRowId={(i) => i.id}
      columns={[
        {
          id: "person",
          header: "Referred person",
          primary: true,
          cell: (i) => (
            <div className="min-w-0" data-testid="referred-row">
              <Link href={`/admin/cv-submissions/${i.id}`} className="font-medium text-navy underline-offset-4 hover:underline">
                {i.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                {i.code} · {i.tradeLabel}
              </p>
              {i.selfReferral ? (
                <StatusBadge tone="warning" size="sm" className="mt-1">
                  Same number as the referrer
                </StatusBadge>
              ) : null}
            </div>
          ),
        },
        {
          id: "stage",
          header: "CV stage",
          cell: (i) => (
            <div className="space-y-1">
              <StatusBadge tone={CV_SUBMISSION_STATUS_TONE[i.status]} size="sm">
                {CV_SUBMISSION_STATUS_LABELS[i.status]}
              </StatusBadge>
              {i.status === "departed" && i.statusChangedAt ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <BadgeCheck className="size-3.5" aria-hidden="true" />
                  Departed <RelativeTime value={i.statusChangedAt} />
                </p>
              ) : null}
            </div>
          ),
        },
        {
          id: "referrer",
          header: "Referred by",
          cell: (i) => (
            <div className="min-w-0">
              <Link href={`/admin/referrals?referrer=${i.referrer.id}`} className="font-medium text-navy underline-offset-4 hover:underline">
                {i.referrer.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono" translate="no">
                  {i.referrer.code}
                </span>
                {" · "}
                {i.referrer.phone ?? i.referrer.phoneMasked}
                {i.referrer.status === "blocked" ? " · Blocked" : ""}
              </p>
            </div>
          ),
        },
        { id: "reward", header: "Reward", cell: (i) => <RewardCell item={i} /> },
        { id: "received", header: "CV received", hideOnMobile: true, nowrap: true, cell: (i) => <RelativeTime value={i.createdAt} /> },
        { id: "actions", header: "Actions", cell: (i) => <Actions item={i} currencies={currencies} rewardText={rewardText} /> },
      ]}
      empty={empty}
      footer={footer}
    />
  );
}
