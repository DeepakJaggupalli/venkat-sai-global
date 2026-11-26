import {
  BookOpen,
  BriefcaseBusiness,
  Coins,
  FileText,
  FileUser,
  Globe2,
  HardHat,
  ListFilter,
  Megaphone,
  Plane,
  PlaneLanding,
  Receipt,
  Tags,
  Trophy,
  UserCheck,
} from "lucide-react";
import type { Metadata } from "next";

import { bucketSeries, fillDailySeries, plural, tileColumns } from "@/components/admin/command-centre/config";
import { RankedBars } from "@/components/admin/command-centre/ranked-bars";
import { EmptyState, SectionCard, StatGrid, StatTile } from "@/components/dashboard";
import { ChartCard } from "@/components/dashboard/chart-card";
import { LinkTabs } from "@/components/shared/link-tabs";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { humanize } from "@/lib/format";
import type { SearchParams } from "@/lib/http";
import { cn } from "@/lib/utils";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { CV_SUBMISSION_STATUS_LABELS } from "@/modules/operations/cv-submission-schemas";
import { getOwnerOverview, OVERVIEW_PERIODS, parseOverviewPeriod, type CurrencyTotal } from "@/modules/operations/owner-overview";

export const metadata: Metadata = { title: "Owner overview" };

type Tile = {
  key: string;
  label: string;
  value: number;
  hint: string;
  icon: typeof FileUser;
  href?: string;
  tone?: "default" | "positive";
};

/**
 * Owner overview: the business on one screen for the last 7, 30 or 90 days (dashboard.view). Every figure is a live
 * aggregate; money is listed per currency and never added across currencies (commercial.view). Tiles and rows link to
 * the list behind them only when the viewer may open it.
 */
export default async function OwnerOverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff("dashboard.view");
  const sp = await searchParams;
  const days = parseOverviewPeriod(typeof sp.days === "string" ? sp.days : undefined);
  const now = new Date();
  const o = await getOwnerOverview(ctx, days, now);
  const link = (href: string, permission: Parameters<typeof staffCan>[1]) => (staffCan(ctx, permission) ? href : undefined);
  const period = `last ${days} days`;
  const canCvs = staffCan(ctx, "candidates.view");

  const daily = fillDailySeries(o.cvs.perDay, now, days);
  const series = days > 30 ? bucketSeries(daily, 7) : daily;

  const funnel: Tile[] = [
    {
      key: "cvs",
      label: "CVs received",
      value: o.cvs.total,
      icon: FileUser,
      hint: period,
      href: link("/admin/cv-submissions", "candidates.view"),
    },
    {
      key: "posters",
      label: "Posters published",
      value: o.posters.published,
      icon: Megaphone,
      hint: `${o.posters.open} live on the website now`,
      href: link("/admin/requirements/posters?status=published", "content.view"),
    },
    {
      key: "req-open",
      label: "Manpower requests open",
      value: o.requirements.open,
      icon: HardHat,
      hint: `${o.requirements.received} received in the ${period}`,
      href: link("/admin/requirements", "requirements.view"),
    },
    {
      key: "req-filled",
      label: "Requests filled",
      value: o.requirements.filled,
      icon: UserCheck,
      tone: "positive",
      hint: `${plural(o.requirements.positionsFilled, "position")} filled · ${period}`,
      href: link("/admin/requirements?status=filled", "requirements.view"),
    },
  ];
  const delivery: Tile[] = [
    {
      key: "applications",
      label: "Applications",
      value: o.recruitment.applications,
      icon: BriefcaseBusiness,
      hint: `Through the People Portal · ${period}`,
      href: link("/admin/pipeline", "recruitment.view"),
    },
    {
      key: "placements",
      label: "Placements",
      value: o.recruitment.placements,
      icon: Trophy,
      tone: "positive",
      hint: `${o.recruitment.joined} joined · ${period}`,
      href: link("/admin/mobilisation", "recruitment.mobilisation"),
    },
    {
      key: "departed",
      label: "Workers departed",
      value: o.recruitment.departed,
      icon: Plane,
      hint: period,
      href: link("/admin/mobilisation", "recruitment.mobilisation"),
    },
    {
      key: "arrived",
      label: "Workers arrived",
      value: o.recruitment.arrived,
      icon: PlaneLanding,
      hint: period,
      href: link("/admin/mobilisation", "recruitment.mobilisation"),
    },
    {
      key: "enrolments",
      label: "Training enrolments",
      value: o.training.enrolments,
      icon: BookOpen,
      hint: period,
      href: link("/admin/training", "training.view"),
    },
    {
      key: "resume",
      label: "Resume service requests",
      value: o.resumeRequests,
      icon: FileText,
      hint: period,
      href: link("/admin/resume-requests", "candidates.manage"),
    },
  ];
  const statuses = o.cvs.byStatus.map((s) => ({
    key: s.status,
    label: (CV_SUBMISSION_STATUS_LABELS as Record<string, string>)[s.status] ?? humanize(s.status),
    value: s.count,
    href: canCvs ? `/admin/cv-submissions?status=${s.status}` : null,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Owner overview"
        description={`How the business did over the ${period}. Live figures from the database; money is shown per currency.`}
        actions={[{ label: "Back to dashboard", href: "/admin", variant: "outline" }]}
      />
      <LinkTabs
        label="Period"
        activeHref={`/admin/overview?days=${days}`}
        items={OVERVIEW_PERIODS.map((d) => ({
          href: `/admin/overview?days=${d}`,
          label: `${d} days`,
        }))}
      />

      <TileSection id="overview-funnel" title="Candidates and requirements" tiles={funnel} />
      <TileSection id="overview-delivery" title="Delivery" tiles={delivery} />

      <ChartCard
        title="CVs received over time"
        description={days > 30 ? `Per week, ${period} · ${plural(o.cvs.total, "CV")}` : `Per day, ${period} · ${plural(o.cvs.total, "CV")}`}
        data={series.map((d) => ({ label: d.label, value: d.value }))}
        unit="CVs"
        link={canCvs ? { label: "All CVs", href: "/admin/cv-submissions" } : undefined}
        emptyTitle={`No CVs in the ${period}`}
        emptyDescription="CVs from the website, Excel imports and phone calls show here as they come in."
      />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <SectionCard icon={ListFilter} title="Where the CVs stand" description={`Status today of the CVs received in the ${period}.`}>
          {o.cvs.total ? (
            <RankedBars unit={{ one: "CV", many: "CVs" }} items={statuses} ranked={false} />
          ) : (
            <EmptyState size="sm" icon={ListFilter} title={`No CVs in the ${period}`} description="Each stage, from CV received to departed, shows here." />
          )}
        </SectionCard>
        <SectionCard
          icon={Tags}
          title="CVs by trade"
          description={o.cvs.otherTrades ? `Top 10 trades · ${plural(o.cvs.otherTrades, "more CV")} in other trades` : `Top 10 trades · ${period}`}
        >
          {o.cvs.byTrade.length ? (
            <RankedBars
              unit={{ one: "CV", many: "CVs" }}
              items={o.cvs.byTrade.map((t) => ({
                key: t.trade.toLowerCase(),
                label: t.trade,
                value: t.count,
                href: canCvs ? `/admin/cv-submissions?q=${encodeURIComponent(t.trade)}` : null,
              }))}
            />
          ) : (
            <EmptyState size="sm" icon={Tags} title={`No CVs in the ${period}`} description="The trades people apply for show here, most popular first." />
          )}
        </SectionCard>
        <SectionCard icon={Globe2} title="Poster destinations" description={`Countries of the posters published in the ${period}.`}>
          {o.posters.topCountries.length ? (
            <RankedBars
              unit={{ one: "poster", many: "posters" }}
              items={o.posters.topCountries.map((c) => ({
                key: c.countryCode,
                label: c.countryName,
                value: c.count,
              }))}
            />
          ) : (
            <EmptyState size="sm" icon={Globe2} title="No destinations yet" description={`Posters published in the ${period} with a country show here.`} />
          )}
        </SectionCard>
      </div>

      {o.money ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            icon={Coins}
            title="Money received"
            description={`Net of refunds, ${period}. Each currency on its own line.`}
            action={{ label: "Revenue", href: "/admin/commercial" }}
          >
            <CurrencyList rows={o.money.received} empty={`No payments received in the ${period}.`} unit="payment" />
          </SectionCard>
          <SectionCard
            icon={Receipt}
            title="Unpaid invoices"
            description="Outstanding right now. Currencies are never added together."
            action={{ label: "Invoices", href: "/admin/commercial/invoices" }}
          >
            <CurrencyList rows={o.money.outstanding} empty="No unpaid invoices." unit="invoice" />
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}

function TileSection({ id, title, tiles }: { id: string; title: string; tiles: Tile[] }) {
  const columns = tileColumns(tiles.length);
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="font-heading text-foreground text-lg font-bold">
        {title}
      </h2>
      <StatGrid columns={columns === 5 ? 4 : columns} className={cn(columns === 5 && "xl:grid-cols-5")}>
        {tiles.map(({ key, ...tile }) => (
          <StatTile key={key} {...tile} />
        ))}
      </StatGrid>
    </section>
  );
}

function CurrencyList({ rows, empty, unit }: { rows: CurrencyTotal[]; empty: string; unit: string }) {
  if (!rows.length) return <p className="text-muted-foreground text-sm">{empty}</p>;
  return (
    <ul className="divide-border divide-y">
      {rows.map((r) => (
        <li key={r.currency} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <MoneyText amountMinor={r.amountMinor} currency={r.currency} tabular className="font-display text-foreground text-2xl" />
          <span className="text-muted-foreground text-sm">{plural(r.count, unit)}</span>
        </li>
      ))}
    </ul>
  );
}
