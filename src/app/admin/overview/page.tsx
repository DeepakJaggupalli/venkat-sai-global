import { BookOpen, BriefcaseBusiness, FileText, FileUser, HardHat, Megaphone, Plane, PlaneLanding, Trophy, UserCheck } from "lucide-react";
import type { Metadata } from "next";

import { BarChart } from "@/components/shared/charts";
import { LinkTabs } from "@/components/shared/link-tabs";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { humanize } from "@/lib/format";
import type { SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { CV_SUBMISSION_STATUS_LABELS } from "@/modules/operations/cv-submission-schemas";
import { getOwnerOverview, OVERVIEW_PERIODS, parseOverviewPeriod, type CurrencyTotal } from "@/modules/operations/owner-overview";

export const metadata: Metadata = { title: "Owner overview" };

/**
 * Owner overview: the business on one screen for the last 7, 30 or 90 days (dashboard.view). Every figure is a live
 * aggregate; money is listed per currency and never added across currencies (commercial.view).
 */
export default async function OwnerOverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff("dashboard.view");
  const sp = await searchParams;
  const days = parseOverviewPeriod(typeof sp.days === "string" ? sp.days : undefined);
  const o = await getOwnerOverview(ctx, days);
  const link = (href: string, permission: Parameters<typeof staffCan>[1]) => (staffCan(ctx, permission) ? href : undefined);
  const period = `last ${days} days`;

  const tradeRows = o.cvs.byTrade.map((t) => ({ trade: t.trade, cvs: t.count }));
  const statusRows = o.cvs.byStatus.map((s) => ({ status: (CV_SUBMISSION_STATUS_LABELS as Record<string, string>)[s.status] ?? humanize(s.status), cvs: s.count }));
  const countryRows = o.posters.topCountries.map((c) => ({ country: c.countryName, posters: c.count }));

  return (
    <div className="space-y-6">
      <PageHeader title="Owner overview" description={`How the business is doing over the ${period}. Live figures from the database; money is shown per currency.`} />
      <LinkTabs
        label="Period"
        activeHref={`/admin/overview?days=${days}`}
        items={OVERVIEW_PERIODS.map((d) => ({ href: `/admin/overview?days=${d}`, label: `${d} days` }))}
      />

      <section aria-labelledby="overview-funnel" className="space-y-3">
        <h2 id="overview-funnel" className="font-heading text-lg font-semibold">
          Candidates and requirements
        </h2>
        <StatGrid columns={4}>
          <StatCard label="CVs received" value={o.cvs.total} icon={<FileUser />} hint={period} href={link("/admin/cv-submissions", "candidates.view")} />
          <StatCard label="Posters published" value={o.posters.published} icon={<Megaphone />} hint={`${o.posters.open} open now`} href={link("/admin/requirements/posters?status=published", "content.view")} />
          <StatCard label="Requirements open" value={o.requirements.open} icon={<HardHat />} hint={`${o.requirements.received} received in the ${period}`} href={link("/admin/requirements", "requirements.view")} />
          <StatCard
            label="Requirements filled"
            value={o.requirements.filled}
            icon={<UserCheck />}
            hint={`${o.requirements.positionsFilled} ${o.requirements.positionsFilled === 1 ? "position" : "positions"} · ${period}`}
            href={link("/admin/requirements", "requirements.view")}
          />
        </StatGrid>
      </section>

      <section aria-labelledby="overview-delivery" className="space-y-3">
        <h2 id="overview-delivery" className="font-heading text-lg font-semibold">
          Delivery
        </h2>
        <StatGrid columns={4}>
          <StatCard label="Applications" value={o.recruitment.applications} icon={<BriefcaseBusiness />} hint={period} href={link("/admin/pipeline", "recruitment.view")} />
          <StatCard label="Placements" value={o.recruitment.placements} icon={<Trophy />} hint={`${o.recruitment.joined} joined · ${period}`} href={link("/admin/mobilisation", "recruitment.mobilisation")} />
          <StatCard label="Workers departed" value={o.recruitment.departed} icon={<Plane />} hint={period} href={link("/admin/mobilisation", "recruitment.mobilisation")} />
          <StatCard label="Workers arrived" value={o.recruitment.arrived} icon={<PlaneLanding />} hint={period} href={link("/admin/mobilisation", "recruitment.mobilisation")} />
          <StatCard label="Training enrolments" value={o.training.enrolments} icon={<BookOpen />} hint={period} href={link("/admin/training", "training.view")} />
          <StatCard label="Resume service requests" value={o.resumeRequests} icon={<FileText />} hint={period} href={link("/admin/resume-requests", "candidates.manage")} />
        </StatGrid>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="CVs by trade" description={o.cvs.otherTrades ? `Top 10 trades · ${o.cvs.otherTrades} more ${o.cvs.otherTrades === 1 ? "CV" : "CVs"} in other trades` : `Top 10 trades · ${period}`}>
          <BarChart title="CVs received by trade" orientation="horizontal" index="trade" indexLabel="Trade" data={tradeRows} series={[{ key: "cvs", label: "CVs" }]} emptyText={`No CVs received in the ${period}.`} />
        </SectionCard>
        <SectionCard title="CV status" description={`Where the CVs received in the ${period} stand now.`}>
          <BarChart
            title="CVs by status"
            orientation="horizontal"
            index="status"
            indexLabel="Status"
            data={o.cvs.total ? statusRows : []}
            series={[{ key: "cvs", label: "CVs" }]}
            emptyText={`No CVs received in the ${period}.`}
          />
        </SectionCard>
        <SectionCard title="Poster destinations" description={`Countries of the posters published in the ${period}.`}>
          <BarChart title="Posters by destination country" orientation="horizontal" index="country" indexLabel="Country" data={countryRows} series={[{ key: "posters", label: "Posters" }]} emptyText={`No posters with a destination country published in the ${period}.`} />
        </SectionCard>
        {o.money ? (
          <SectionCard title="Money" description="Received in the period (net of refunds) and outstanding now, per currency. Currencies are never added together.">
            <div className="grid gap-6 sm:grid-cols-2">
              <CurrencyList title="Received" rows={o.money.received} empty={`No payments received in the ${period}.`} unit="payment" />
              <CurrencyList title="Outstanding invoices" rows={o.money.outstanding} empty="No unpaid invoices." unit="invoice" />
            </div>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}

function CurrencyList({ title, rows, empty, unit }: { title: string; rows: CurrencyTotal[]; empty: string; unit: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {rows.length ? (
        <ul className="mt-2 space-y-2">
          {rows.map((r) => (
            <li key={r.currency} className="flex items-baseline justify-between gap-3">
              <MoneyText amountMinor={r.amountMinor} currency={r.currency} tabular className="text-lg font-semibold text-foreground" />
              <span className="text-xs text-muted-foreground">
                {r.count} {r.count === 1 ? unit : `${unit}s`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
