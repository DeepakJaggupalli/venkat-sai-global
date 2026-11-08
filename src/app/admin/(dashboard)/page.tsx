import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  Activity,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Coins,
  FileWarning,
  GraduationCap,
  Handshake,
  HardHat,
  Headset,
  ListChecks,
  Mail,
  MousePointerClick,
  Receipt,
  Repeat,
  Send,
  Star,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";

import {
  getActiveSubscriptionCount,
  getDashboardCounts,
  getOutstandingInvoices,
  getRevenue30d,
  getWeeklyTrends,
  type CurrencyAmount,
} from "@/components/admin/dashboard-queries";
import { Sparkline } from "@/components/admin/sparkline";
import { BusinessSetupDashboard } from "@/components/layout/setup-dashboards";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import type { PlatformPermission } from "@/config/permissions";
import { formatPercent, humanize } from "@/lib/format";
import { getAnalyticsRange } from "@/modules/analytics/access";
import { getAnalyticsOverview, getAnalyticsTimeSeries } from "@/modules/analytics/queries";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { myTaskCounts } from "@/modules/operations/queries";

export const metadata: Metadata = { title: "Executive dashboard" };

/**
 * Command Centre home (spec 12.1). Every figure is a live database count or a first-party analytics
 * aggregate; tiles link to their area when the viewer may open it. Money is shown per currency.
 * Staff without dashboard.view (every staff member lands here after sign-in) get quick links instead.
 */
export default async function ExecutiveDashboardPage() {
  const staff = await requireStaff();
  if (!staffCan(staff, "dashboard.view")) {
    return (
      <BusinessSetupDashboard
        portal="admin"
        userName={staff.user.displayName}
        permissions={Array.from(staff.permissions)}
        roleName={staff.roleKeys.map(humanize).join(", ") || null}
      />
    );
  }
  const canMoney = staffCan(staff, "commercial.view");
  const canTraffic = staffCan(staff, "analytics.view");
  const range = canTraffic ? getAnalyticsRange({ range: "30d" }) : null;

  const [counts, trends, tasks, revenue, outstanding, subscriptions, traffic, series] = await Promise.all([
    getDashboardCounts(),
    getWeeklyTrends(12),
    myTaskCounts(staff),
    canMoney ? getRevenue30d() : Promise.resolve(null),
    canMoney ? getOutstandingInvoices() : Promise.resolve(null),
    canMoney ? getActiveSubscriptionCount() : Promise.resolve(null),
    range ? getAnalyticsOverview(staff, range).catch(() => null) : Promise.resolve(null),
    range ? getAnalyticsTimeSeries(staff, range).catch(() => []) : Promise.resolve([]),
  ]);
  const link = (href: string, permission?: PlatformPermission) => (!permission || staffCan(staff, permission) ? href : undefined);
  const firstName = staff.user.displayName.split(" ")[0] || staff.user.displayName;
  const attention = [
    counts.approvalsOpen ? `${counts.approvalsOpen} approval ${counts.approvalsOpen === 1 ? "request" : "requests"} waiting` : null,
    counts.grievancesOpen ? `${counts.grievancesOpen} open ${counts.grievancesOpen === 1 ? "grievance" : "grievances"}` : null,
    tasks.overdue ? `${tasks.overdue} of your tasks overdue` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Executive dashboard"
        description={`Welcome back, ${firstName}. Live figures across Venkat Sai Global.`}
        actions={[
          ...(staffCan(staff, ["content.edit", "media.manage"]) ? [{ label: "Post requirement", href: "/admin/requirements/posters/new" }] : []),
          ...(staffCan(staff, "candidates.view") ? [{ label: "CV submissions", href: "/admin/cv-submissions", variant: "outline" as const }] : []),
        ]}
        meta={
          <span className="text-sm text-muted-foreground">
            Figures as of <DateText value={new Date()} mode="datetime" />
          </span>
        }
      />

      {attention.length ? (
        <Callout tone="warning" title="Needs attention">
          {attention.join(" · ")}
        </Callout>
      ) : null}

      <Section id="queue" title="Work queue" description="What the team needs to act on now.">
        <StatGrid columns={3}>
          <StatCard label="Pending approvals" value={counts.approvalsOpen} icon={<ListChecks />} href={link("/admin/approvals", "approvals.view")} />
          <StatCard label="Jobs awaiting approval" value={counts.jobsPendingApproval} icon={<FileWarning />} href={link("/admin/jobs?statuses=pending_approval", "jobs.view")} />
          <StatCard
            label="Open complaints and support requests"
            value={counts.ticketsOpen}
            icon={<Headset />}
            hint={counts.grievancesOpen ? `${counts.grievancesOpen} registered grievances` : "No open grievances"}
            href={link("/admin/support", "support.view")}
          />
          <StatCard label="My open tasks" value={tasks.open} icon={<ClipboardCheck />} hint={tasks.overdue ? `${tasks.overdue} overdue` : "None overdue"} href="/admin/tasks" />
          <StatCard label="Open requirements" value={counts.requirementsOpen} icon={<HardHat />} href={link("/admin/requirements", "requirements.view")} />
          <StatCard label="Open leads" value={counts.leadsOpen} icon={<Mail />} href={link("/admin/leads", "leads.view")} />
        </StatGrid>
      </Section>

      <Section id="people" title="People and organisations">
        <StatGrid columns={4}>
          <StatCard
            label="Users"
            value={counts.users}
            icon={<Users />}
            hint={<Trend values={trends.users} label="New users per week, last 12 weeks" caption={`${counts.usersNew30d} joined in 30 days`} />}
            href={link("/admin/users", "users.view")}
          />
          <StatCard label="Active candidates" value={counts.candidatesActive} icon={<UserCheck />} hint={`${counts.candidatesVerified} verified by Venkat Sai`} href={link("/admin/candidates", "candidates.view")} />
          <StatCard label="Verified employers" value={counts.employersVerified} icon={<Building2 />} hint={`${counts.employersTotal} registered`} href={link("/admin/organizations?type=employer", "orgs.view")} />
          <StatCard label="Verified partners" value={counts.partnersVerified} icon={<Handshake />} hint={`${counts.partnersTotal} registered`} href={link("/admin/organizations?type=recruitment_partner", "orgs.view")} />
          <StatCard label="Verified institutions" value={counts.institutionsVerified} icon={<GraduationCap />} href={link("/admin/organizations?type=institution", "orgs.view")} />
        </StatGrid>
      </Section>

      <Section id="hiring" title="Hiring and training">
        <StatGrid columns={4}>
          <StatCard
            label="Active jobs"
            value={counts.jobsActive}
            icon={<Briefcase />}
            hint={<Trend values={trends.jobs} label="Jobs published per week, last 12 weeks" caption="Published per week" />}
            href={link("/admin/jobs?statuses=published", "jobs.view")}
          />
          <StatCard
            label="Applications"
            value={counts.applications}
            icon={<Send />}
            hint={<Trend values={trends.applications} label="Applications per week, last 12 weeks" caption={`${counts.applications30d} in 30 days`} />}
            href={link("/admin/pipeline", "recruitment.view")}
          />
          <StatCard label="Shortlisted" value={counts.shortlisted} icon={<Star />} hint="Active applications" href={link("/admin/pipeline", "recruitment.view")} />
          <StatCard label="Upcoming interviews" value={counts.interviewsUpcoming} icon={<CalendarClock />} hint={`${counts.interviews30d} held in 30 days`} href={link("/admin/interviews", "recruitment.view")} />
          <StatCard
            label="Placements"
            value={counts.placements}
            icon={<Trophy />}
            hint={<Trend values={trends.placements} label="Placements per week, last 12 weeks" caption={`${counts.placements30d} in 30 days`} />}
            href={link("/admin/mobilisation", "recruitment.mobilisation")}
          />
          <StatCard label="Training enrolments" value={counts.enrolmentsActive} icon={<BookOpen />} hint="Confirmed or in progress" href={link("/admin/training", "training.view")} />
          <StatCard label="Internship applications" value={counts.internshipApplications} icon={<BadgeCheck />} href={link("/admin/jobs?employmentTypes=internship", "jobs.view")} />
        </StatGrid>
      </Section>

      {canMoney ? (
        <Section id="revenue" title="Revenue and billing" description="Grouped by currency. Amounts are never added across currencies.">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Active subscriptions" value={subscriptions} icon={<Repeat />} href="/admin/commercial" />
            <MoneyTile title="Received in the last 30 days" icon={<Coins />} rows={revenue ?? []} empty="No payments received in the last 30 days." href="/admin/commercial" countLabel="payments" />
            <MoneyTile title="Outstanding invoices" icon={<Receipt />} rows={outstanding ?? []} empty="No unpaid invoices." href="/admin/commercial/invoices" countLabel="invoices" />
          </div>
        </Section>
      ) : null}

      {canTraffic ? <TrafficSection traffic={traffic} sessions={series.map((p) => p.sessions)} /> : null}
    </div>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`dash-${id}`} className="space-y-3">
      <div>
        <h2 id={`dash-${id}`} className="font-heading text-lg font-semibold text-foreground">
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Trend({ values, label, caption }: { values: number[]; label: string; caption: string }) {
  return (
    <span className="block">
      <span className="block">{caption}</span>
      {values.some((v) => v > 0) ? <Sparkline values={values} label={label} /> : null}
    </span>
  );
}

function MoneyTile({ title, icon, rows, empty, href, countLabel }: { title: string; icon: ReactNode; rows: CurrencyAmount[]; empty: string; href: string; countLabel: string }) {
  return (
    <SectionCard title={title} icon={icon} action={{ label: "Open", href, variant: "ghost" }} headingLevel="h3">
      {rows.length ? (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.currency} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-xl font-semibold tracking-tight text-foreground">
                <MoneyText amountMinor={r.amountMinor} currency={r.currency} />
              </span>
              <span className="text-xs text-muted-foreground">
                {r.count} {countLabel}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </SectionCard>
  );
}

type Overview = Awaited<ReturnType<typeof getAnalyticsOverview>> | null;

function TrafficSection({ traffic, sessions }: { traffic: Overview; sessions: number[] }) {
  if (!traffic) {
    return (
      <Section id="traffic" title="Website (last 30 days)">
        <p className="text-sm text-muted-foreground">Website analytics are not available right now.</p>
      </Section>
    );
  }
  const { current, change } = traffic;
  const delta = (v: number | null) => (v === null ? undefined : { value: v, format: "percent" as const, period: "vs previous 30 days" });
  return (
    <Section id="traffic" title="Website (last 30 days)" description="Consent-based, first-party analytics. Staff and under-18 visitors are never tracked.">
      <StatGrid columns={4}>
        <StatCard
          label="Sessions"
          value={current.sessions}
          icon={<Activity />}
          delta={delta(change.sessions)}
          hint={sessions.some((v) => v > 0) ? <Sparkline values={sessions} label="Sessions per day, last 30 days" /> : undefined}
          href="/admin/analytics"
        />
        <StatCard label="Visitors" value={current.visitors} icon={<Users />} delta={delta(change.visitors)} href="/admin/analytics" />
        <StatCard label="Conversions" value={current.conversions} icon={<MousePointerClick />} delta={delta(change.conversions)} href="/admin/analytics" />
        <StatCard label="Conversion rate" value={formatPercent(current.conversionRate)} icon={<BadgeCheck />} hint="Sessions with a key action" href="/admin/analytics" />
      </StatGrid>
    </Section>
  );
}
