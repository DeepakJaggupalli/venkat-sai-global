import { FileSpreadsheet, Gift, Link2, Settings2, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActionDialog } from "@/components/admin/action-dialog";
import { ActionForm } from "@/components/admin/action-form";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { parsePage, withParams, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { getReferrerSummary, listReferredCvs, listReferrers, referralSummary } from "@/modules/referrals/queries";
import { REFERRAL_PAYOUT_CURRENCIES, referralFiltersSchema, REFERRER_STATUS_LABELS, REFERRER_STATUS_VALUES, REWARD_STATUS_LABELS, REWARD_STATUSES } from "@/modules/referrals/schemas";
import { getReferralRewardText } from "@/modules/referrals/service";
import { currencyOptions } from "@/modules/taxonomy/queries";

import { linkCvToReferrerAction } from "./actions";
import { ReferredTable } from "./_components/referred-table";
import { paidTotalsText, ReferrersTable } from "./_components/referrers-table";
import { TOUCH } from "./_components/touch";

export const metadata: Metadata = { title: "Referrals" };

const rewardOptions = REWARD_STATUSES.map((value) => ({ value, label: REWARD_STATUS_LABELS[value] }));
const statusOptions = REFERRER_STATUS_VALUES.map((value) => ({ value, label: REFERRER_STATUS_LABELS[value] }));

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function Tile({ label, value, detail, href, tone }: { label: string; value: number; detail?: string; href: string; tone?: "due" }) {
  return (
    <Link
      href={href}
      className={
        tone === "due" && value > 0
          ? "flex min-h-20 flex-col justify-center rounded-xl border border-warning/50 bg-warning-soft px-4 py-3 shadow-xs transition-colors hover:border-warning"
          : "flex min-h-20 flex-col justify-center rounded-xl border border-border bg-card px-4 py-3 shadow-xs transition-colors hover:border-teal/40"
      }
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="font-heading text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </Link>
  );
}

export default async function ReferralsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff("candidates.manage");
  const sp = await searchParams;
  const filters = referralFiltersSchema.parse({ view: str(sp.view), reward: str(sp.reward), status: str(sp.status), referrer: str(sp.referrer), q: str(sp.q) });
  const page = parsePage(sp, { defaultSize: 25 });
  const showReferrers = filters.view === "referrers";
  const [summary, rewardText, currencies, referred, people, referrer] = await Promise.all([
    referralSummary(ctx),
    getReferralRewardText(),
    currencyOptions(),
    showReferrers ? null : listReferredCvs(ctx, filters, page),
    showReferrers ? listReferrers(ctx, filters, page) : null,
    filters.referrer && !showReferrers ? getReferrerSummary(ctx, filters.referrer) : null,
  ]);
  const payoutCurrencies = REFERRAL_PAYOUT_CURRENCIES.flatMap((code) => {
    const found = currencies.find((c) => c.value === code);
    return found ? [found] : [];
  });
  const canContact = staffCan(ctx, "candidates.view_contact");
  const canSettings = staffCan(ctx, "settings.view");
  const exportHref = withParams(
    "/admin/referrals/export",
    {},
    showReferrers ? { view: "referrers", status: filters.status, q: filters.q } : { reward: filters.reward, referrer: filters.referrer, q: filters.q },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Referrals"
        description="People who refer friends through their link at /refer, and the rewards due when a friend departs for a job abroad."
        actions={[
          <ActionDialog
            key="link"
            title="Add a referral by hand"
            description="For a friend who applied without the link (walk-in, WhatsApp). Copy the CV reference from CV submissions and the code from the referrer's link. If the CV already has a referrer, it moves to this one."
            trigger={
              <Button variant="outline" size="sm" className={TOUCH} data-testid="referral-link-cv">
                <Link2 aria-hidden="true" />
                Add a referral
              </Button>
            }
          >
            <ActionForm
              action={linkCvToReferrerAction}
              submitLabel="Add referral"
              fields={[
                { name: "cvReference", label: "CV reference", required: true, placeholder: "VSG-CV-000123" },
                { name: "referralCode", label: "Referrer's code", required: true, placeholder: "7KQ2MX", defaultValue: referrer?.code ?? null, hint: "The 6 letters and numbers at the end of their link." },
              ]}
            />
          </ActionDialog>,
          <Button key="excel" asChild variant="outline" size="sm" className={TOUCH}>
            <a href={exportHref} rel="nofollow" data-testid="download-excel">
              <FileSpreadsheet aria-hidden="true" />
              Download Excel
            </a>
          </Button>,
        ]}
      />

      <nav aria-label="Referral totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Rewards due now" value={summary.due} href="/admin/referrals?reward=due" tone="due" detail={summary.due ? "Pay and mark paid" : "Nothing to pay"} />
        <Tile label="Rewards paid" value={summary.paid} href="/admin/referrals?reward=paid" detail={summary.paidTotals.length ? paidTotalsText(summary.paidTotals) : undefined} />
        <Tile label="In progress" value={summary.inProgress} href="/admin/referrals?reward=in_progress" detail={`${summary.referred} referred in total`} />
        <Tile label="Referrers" value={summary.referrers} href="/admin/referrals?view=referrers" detail={summary.blockedReferrers ? `${summary.blockedReferrers} blocked` : undefined} />
      </nav>

      <section aria-label="Reward shown on the website" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2">
          <Gift className="mt-0.5 size-4 shrink-0 text-teal-strong" aria-hidden="true" />
          {rewardText ? (
            <span>
              The <Link href="/refer" className="font-medium text-navy underline underline-offset-4">Refer a friend</Link> page says: <strong className="font-semibold">Reward: {rewardText}</strong>
            </span>
          ) : (
            <span>
              The <Link href="/refer" className="font-medium text-navy underline underline-offset-4">Refer a friend</Link> page shows no reward amount yet. Write one in Settings when the owner decides it.
            </span>
          )}
        </p>
        {canSettings ? (
          <Button asChild variant="outline" size="sm" className={TOUCH}>
            <Link href="/admin/settings#group-referrals">
              <Settings2 aria-hidden="true" />
              Change reward text
            </Link>
          </Button>
        ) : null}
      </section>

      {!canContact ? <p className="text-sm text-muted-foreground">Mobile numbers are hidden: they need the permission to view candidate contact details.</p> : null}

      <LinkTabs
        label="Referral views"
        items={[
          { href: "/admin/referrals", label: "Referred people", count: summary.referred },
          { href: "/admin/referrals?view=referrers", label: "Referrers", count: summary.referrers },
        ]}
      />

      {referrer ? (
        <p className="text-sm text-foreground" data-testid="referral-filter-referrer">
          Showing people referred by <strong className="font-semibold">{referrer.name}</strong> (<span className="font-mono">{referrer.code}</span>).{" "}
          <Link href="/admin/referrals" className="font-medium text-navy underline underline-offset-4">
            Show everyone
          </Link>
        </p>
      ) : null}

      <FilterScope>
        {showReferrers ? (
          <>
            <FilterBar paramKeys={["q", "status"]} search={<SearchInput label="Search by name, mobile or code" />}>
              <FilterSelect param="status" label="Status" allLabel="Any status" options={statusOptions} />
            </FilterBar>
            <FilterChips filters={[{ param: "status", label: "Status", options: statusOptions }]} />
          </>
        ) : (
          <>
            <FilterBar paramKeys={["q", "reward"]} search={<SearchInput label="Search by name, CV reference, trade, referrer or code" />}>
              <FilterSelect param="reward" label="Reward" allLabel="Any reward status" options={rewardOptions} />
            </FilterBar>
            <FilterChips filters={[{ param: "reward", label: "Reward", options: rewardOptions }]} />
          </>
        )}
        <FilterPendingRegion>
          {people ? (
            <ReferrersTable
              items={people.items}
              empty={
                <EmptyState
                  icon={<Users />}
                  title={filters.q || filters.status ? "No referrers match these filters" : "No referrers yet"}
                  description="People who get their link at /refer appear here."
                />
              }
              footer={<Pagination pathname="/admin/referrals" searchParams={sp} page={people.page} pageCount={people.pageCount} total={people.total} pageSize={people.pageSize} itemLabel="referrers" />}
            />
          ) : referred ? (
            <ReferredTable
              items={referred.items}
              currencies={payoutCurrencies}
              rewardText={rewardText}
              empty={
                <EmptyState
                  icon={<Gift />}
                  title={filters.q || filters.reward || filters.referrer ? "No referred CVs match these filters" : "No referred CVs yet"}
                  description="CVs sent through a referral link (/r/CODE) appear here, with rewards due at the top."
                />
              }
              footer={<Pagination pathname="/admin/referrals" searchParams={sp} page={referred.page} pageCount={referred.pageCount} total={referred.total} pageSize={referred.pageSize} itemLabel="referred CVs" />}
            />
          ) : null}
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
