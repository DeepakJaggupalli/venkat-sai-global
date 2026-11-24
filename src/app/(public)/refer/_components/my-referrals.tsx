"use client";

import { PauseCircle, UserRound } from "lucide-react";
import { useEffect, useRef } from "react";

import { WhatsAppIcon } from "@/components/public/contact-links";
import { WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { cn } from "@/lib/utils";
import {
  PUBLIC_REFERRAL_STAGE_LABELS,
  REWARD_STATUS_LABELS,
  referralWhatsAppShareHref,
  type MyReferralItem,
  type MyReferralsView,
  type RewardStatus,
} from "@/modules/referrals/schemas";

import { PILL_LIGHT } from "./styles";

const REWARD_STYLES: Record<RewardStatus, string> = {
  due: "bg-warning-soft text-warning-strong",
  paid: "bg-success-soft text-success-strong",
  in_progress: "bg-surface-subtle text-foreground",
  not_eligible: "bg-surface-subtle text-muted-foreground",
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="font-display text-2xl tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function ReferralRow({ item }: { item: MyReferralItem }) {
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="my-referral">
      <div className="flex min-w-0 items-start gap-3">
        <UserRound className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">{item.name}</p>
          <p className="truncate text-sm text-muted-foreground">{item.trade}</p>
        </div>
      </div>
      <dl className="flex flex-wrap gap-2 text-sm sm:justify-end">
        <div className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-3 py-1">
          <dt className="text-muted-foreground">Stage:</dt>
          <dd className="font-medium text-foreground">{PUBLIC_REFERRAL_STAGE_LABELS[item.stage]}</dd>
        </div>
        <div className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1", REWARD_STYLES[item.reward])}>
          <dt>Reward:</dt>
          <dd className="font-semibold">{REWARD_STATUS_LABELS[item.reward]}</dd>
        </div>
      </dl>
    </li>
  );
}

/** "Check my referrals" result: counts, the people (first name + last initial, trade, stage, reward) and next steps. */
export function MyReferrals({ view }: { view: MyReferralsView }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [view]);
  const more = view.counts.total - view.items.length;

  return (
    <section ref={ref} tabIndex={-1} aria-labelledby="my-referrals-heading" className="space-y-5 focus:outline-none" data-testid="my-referrals">
      <div>
        <p className="text-sm text-muted-foreground">
          Code{" "}
          <span className="font-mono font-semibold tracking-wider text-foreground" translate="no">
            {view.code}
          </span>
        </p>
        <h3 id="my-referrals-heading" className="mt-1 font-display text-2xl text-foreground">
          {view.firstName ? `Hello ${view.firstName}. ` : ""}
          {view.counts.total === 0 ? "No CVs through your link yet." : view.counts.total === 1 ? "1 person sent a CV through your link." : `${view.counts.total} people sent a CV through your link.`}
        </h3>
      </div>

      {!view.active ? (
        <p className="flex items-start gap-2 rounded-2xl border border-border bg-surface-subtle p-4 text-base text-foreground" data-testid="my-referrals-paused">
          <PauseCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          Your referral link is paused. Please WhatsApp or call us.
        </p>
      ) : null}

      {view.counts.total > 0 ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Sent a CV" value={view.counts.total} />
          <Stat label="Placed abroad" value={view.counts.placed} />
          <Stat label="Reward due" value={view.counts.due} />
          <Stat label="Reward paid" value={view.counts.paid} />
        </dl>
      ) : null}

      {view.counts.due > 0 ? (
        <div className="rounded-2xl border border-warning/40 bg-warning-soft p-4 text-base text-foreground" data-testid="my-referrals-due">
          <p className="font-semibold">A reward is due to you.</p>
          <p className="mt-1">We will call or WhatsApp you on this number to arrange it. You can also message us now.</p>
          <WhatsAppButton message={`Hello Venkat Sai, I am asking about my referral reward. My referral code is ${view.code}.`} label="WhatsApp us" className="mt-3 w-full sm:w-auto" />
        </div>
      ) : null}

      {view.items.length ? (
        <ul className="space-y-3" aria-label="People you referred">
          {view.items.map((item, i) => (
            <ReferralRow key={`${item.name}-${i}`} item={item} />
          ))}
        </ul>
      ) : null}
      {more > 0 ? <p className="text-sm text-muted-foreground">Showing the latest {view.items.length}. {more} more are counted above.</p> : null}

      {view.active ? (
        <div className="space-y-2">
          {view.counts.total === 0 ? <p className="text-base text-muted-foreground">Share your link with friends who want a job abroad. Their CV shows here as soon as they send it.</p> : null}
          <a href={referralWhatsAppShareHref(view.url)} target="_blank" rel="noopener noreferrer" className={cn(PILL_LIGHT, "w-full sm:w-auto")}>
            <WhatsAppIcon className="text-green-strong" />
            <span>Share my link on WhatsApp</span>
            <span className="sr-only"> (opens WhatsApp)</span>
          </a>
        </div>
      ) : null}
    </section>
  );
}
