import type { Metadata } from "next";
import { CalendarClock, ClipboardList, HardHat, ListTodo, Plane, Receipt } from "lucide-react";

import { DashboardHeader, GettingStarted, HowToUse, QuickActions, RecentList, StatGrid, StatTile, type RecentItem } from "@/components/dashboard";
import { ChartCard } from "@/components/dashboard/chart-card";
import { Callout } from "@/components/shared/callout";
import { StatusBadge } from "@/components/shared/status-badge";
import type { Tone } from "@/components/shared/tones";
import type { PlacementStatus } from "@/db/schema";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { logger } from "@/lib/logger";
import { getOrgBillingOverview } from "@/modules/commercial/queries";
import { listOrgWorkerInvoices } from "@/modules/commercial/worker-invoices";
import { orgCan, requireOrgMember } from "@/modules/identity/authz";
import { countEmployerJobsByStatus } from "@/modules/jobs/queries";
import { REQUIREMENT_STATUS_LABELS } from "@/modules/operations/constants";
import { listMyTickets, listOrgRequirements } from "@/modules/operations/queries";
import { unreadThreadCount } from "@/modules/operations/threads-queries";
import { employerKindOf } from "@/modules/organizations/employer-kind";
import { getOrganizationOverview } from "@/modules/organizations/queries";
import { getEmployerPipelineOverview } from "@/modules/recruitment/application-queries";
import { listInterviewsForEmployer, listPlacementsForEmployer } from "@/modules/recruitment/queries";
import { formatInTimeZone } from "@/modules/recruitment/timezone";

import { BulkOrderCard } from "./_components/bulk-order-card";
import { VerificationNextStep } from "./_components/verification-next-step";
import {
  dashboardCopy,
  employerHeaderActions,
  employerQuickActions,
  employerSetupChecklist,
  employerStatTiles,
  employerTodos,
  hasDashboardActivity,
  joinAmounts,
  pipelineChartData,
  pipelineTotals,
  requestChartData,
  verificationPlan,
  weekRange,
  type EmployerDashboardFacts,
} from "./_lib/dashboard";
import { countInterviewsBetween, countOffersByStatus, countPlacementsByStatus, countUnpaidInvoices, getRequirementSummary } from "./_lib/dashboard-queries";

export const metadata: Metadata = { title: "Dashboard" };

/** Loads one dashboard block; a failure in one area never breaks the whole dashboard (the tile shows "—"). */
async function optional<T>(enabled: boolean, load: () => Promise<T>, label: string): Promise<T | null> {
  if (!enabled) return null;
  try {
    return await load();
  } catch (error) {
    logger.warn("Employer dashboard block failed", { block: label, error });
    return null;
  }
}

const RECENT = { page: 1, pageSize: 5, offset: 0 };

const PLACEMENT_LABELS: Record<PlacementStatus, { label: string; tone: Tone }> = {
  pending_joining: { label: "Waiting to join", tone: "info" },
  mobilising: { label: "Getting ready to travel", tone: "info" },
  joined: { label: "Joined", tone: "success" },
  replacement_required: { label: "Replacement needed", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  completed: { label: "Completed", tone: "success" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EmployerDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgMember("employer");
  const sp = await searchParams;
  const orgId = ctx.organization.id;
  const kind = employerKindOf(ctx.organization) ?? "direct_company";
  const copy = dashboardCopy(kind);
  const base = copy.base;
  const permissions = ctx.permissions;
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const now = new Date();
  const can = {
    dashboard: orgCan(ctx, "employer.dashboard"),
    requirementsView: orgCan(ctx, ["employer.requirements.manage", "employer.dashboard"], "any"),
    requirements: orgCan(ctx, "employer.requirements.manage"),
    jobsView: orgCan(ctx, "employer.jobs.view"),
    pipeline: orgCan(ctx, "employer.pipeline.view"),
    interviews: orgCan(ctx, ["employer.interviews.manage", "employer.pipeline.view"], "any"),
    offers: orgCan(ctx, "employer.offers.manage"),
    placements: orgCan(ctx, ["employer.offers.manage", "employer.pipeline.view"], "any"),
    billing: orgCan(ctx, "employer.billing.view"),
  };
  const week = weekRange(now, timeZone);

  const [overview, requirementSummary, recentRequirements, jobCounts, pipeline, interviewsThisWeek, upcoming, offerCounts, placementCounts, recentPlacements, billing, unpaid, workerInvoices, unread, tickets] =
    await Promise.all([
      optional(true, () => getOrganizationOverview(ctx, orgId, now), "overview"),
      optional(can.requirementsView, () => getRequirementSummary(ctx), "requirement-summary"),
      optional(can.requirementsView, () => listOrgRequirements(ctx, {}, RECENT), "requirements"),
      optional(can.jobsView && kind === "direct_company", () => countEmployerJobsByStatus(ctx), "jobs"),
      optional(can.pipeline, () => getEmployerPipelineOverview(ctx), "pipeline"),
      optional(can.interviews, () => countInterviewsBetween(ctx, week.from, week.to), "interviews-week"),
      optional(can.interviews, () => listInterviewsForEmployer(ctx, { from: new Date(now.getTime() - 60 * 60 * 1000) }, { page: 1, pageSize: 12, offset: 0 }), "interviews"),
      optional(can.offers, () => countOffersByStatus(ctx), "offers"),
      optional(can.placements, () => countPlacementsByStatus(ctx), "placements"),
      optional(can.placements, () => listPlacementsForEmployer(ctx, {}, RECENT), "recent-placements"),
      optional(can.billing, () => getOrgBillingOverview(ctx), "billing"),
      optional(can.billing, () => countUnpaidInvoices(ctx), "unpaid-invoices"),
      optional(can.billing, () => listOrgWorkerInvoices(ctx, { page: 1, pageSize: 4, offset: 0 }), "worker-invoices"),
      optional(true, () => unreadThreadCount({ kind: "org", ctx }), "unread"),
      optional(true, () => listMyTickets(ctx.user, { status: "open", organizationId: orgId }, { page: 1, pageSize: 1, offset: 0 }), "tickets"),
    ]);

  const org = overview?.organization ?? ctx.organization;
  const columns = pipeline ? pipelineTotals(pipeline.jobs) : null;
  const amountDue = billing ? joinAmounts(billing.outstanding, (minor, currency) => formatMoney(minor, currency)) : null;

  const facts: EmployerDashboardFacts = {
    requirements: requirementSummary ? { open: requirementSummary.open, openPositions: requirementSummary.openPositions, drafts: requirementSummary.drafts, total: requirementSummary.total } : null,
    pipeline: columns
      ? {
          active: Object.entries(columns).reduce((sum, [key, n]) => (key === "closed" || key === "joined" ? sum : sum + n), 0),
          shortlisted: columns.shortlisted,
          atInterview: columns.client_interview,
          offer: columns.offer,
          joined: columns.joined,
        }
      : null,
    interviewsThisWeek,
    offers: offerCounts ? { awaitingReply: offerCounts.issued, accepted: offerCounts.accepted, drafts: offerCounts.draft } : null,
    placements: placementCounts ? { deployed: placementCounts.joined + placementCounts.completed, onTheWay: placementCounts.pending_joining + placementCounts.mobilising } : null,
    jobs: jobCounts
      ? {
          live: jobCounts.published,
          drafts: jobCounts.draft,
          inReview: jobCounts.pending_approval,
          changesRequested: jobCounts.changes_requested,
          total: Object.values(jobCounts).reduce((a, b) => a + b, 0),
        }
      : null,
    billing: billing ? { amountDue, unpaidInvoices: unpaid ?? 0 } : null,
    team: overview ? { members: overview.memberCount, pendingInvitations: overview.pendingInvitationCount } : null,
  };

  const employerProfile = overview?.profile.type === "employer" ? overview.profile.data : null;
  const setupFacts = {
    orgStatus: org.status,
    hasDetails: Boolean(org.countryCode && org.city && org.addressLine1 && (org.email || org.phone)),
    hasBranding: Boolean(overview?.logo && (employerProfile?.aboutHtml || org.description)),
    documentsMet: overview?.readiness.documentRequirements.every((d) => d.met) ?? false,
    memberCount: overview?.memberCount ?? 1,
    pendingInvitationCount: overview?.pendingInvitationCount ?? 0,
    requirementCount: requirementSummary?.total ?? 0,
    jobCount: facts.jobs?.total ?? 0,
  };
  const checklist = employerSetupChecklist(kind, permissions, setupFacts);
  const checklistOpen = checklist.some((i) => !i.done);
  const plan = verificationPlan(kind, permissions, setupFacts);
  const active = hasDashboardActivity(facts);
  const showTiles = can.dashboard && (!plan || active);

  const quickActions = employerQuickActions(kind, permissions, {
    draftRequirements: requirementSummary?.drafts,
    interviewsThisWeek,
    draftOffers: offerCounts?.draft,
    unpaidInvoices: unpaid,
    pendingInvitations: overview?.pendingInvitationCount,
    unreadMessages: unread,
    openSupportRequests: tickets?.total,
  });
  const todos = employerTodos(kind, permissions, {
    orgStatus: org.status,
    verificationDaysLeft: overview?.verificationDaysLeft ?? null,
    jobs: facts.jobs,
    draftRequirements: requirementSummary?.drafts ?? 0,
    pipeline: facts.pipeline,
    draftOffers: offerCounts?.draft ?? 0,
    unpaidInvoices: unpaid ?? 0,
    unreadMessages: unread ?? 0,
  });

  const requirementItems: RecentItem[] = (recentRequirements?.items ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    meta: [r.code, `${r.totalPositions.toLocaleString("en-IN")} ${r.totalPositions === 1 ? "position" : "positions"}`, r.countryCode].filter(Boolean).join(" · "),
    href: can.requirements ? `${base}/requirements/${r.id}` : null,
    at: r.submittedAt ?? r.createdAt,
    status: { value: r.status, label: REQUIREMENT_STATUS_LABELS[r.status] },
  }));
  const interviewItems: RecentItem[] = (upcoming?.items ?? [])
    .filter((iv) => iv.status === "scheduled" || iv.status === "rescheduled")
    .slice(0, 5)
    .map((iv) => ({
      id: iv.id,
      title: iv.candidateName,
      meta: `${iv.jobTitle} · ${iv.roundName} · ${formatInTimeZone(new Date(iv.scheduledStart), timeZone)}`,
      href: `${base}/interviews`,
      at: iv.scheduledStart,
      status: { value: iv.status },
    }));
  const placementItems: RecentItem[] = (recentPlacements?.items ?? []).map((p) => ({
    id: p.id,
    title: p.candidateName,
    meta: [p.jobTitle, p.workLocation].filter(Boolean).join(" · "),
    href: `${base}/offers?tab=placements`,
    at: p.joinedOn ?? p.placedOn,
    status: { value: p.status, label: PLACEMENT_LABELS[p.status].label, tone: PLACEMENT_LABELS[p.status].tone },
  }));
  const invoiceItems: RecentItem[] = (workerInvoices?.items ?? []).map((inv) => ({
    id: inv.id,
    title: inv.code ?? "Invoice",
    meta: [
      `${inv.workers.length} ${inv.workers.length === 1 ? "worker" : "workers"}`,
      formatMoney(inv.totalMinor, inv.currency),
      inv.outstandingMinor > 0 ? `${formatMoney(inv.outstandingMinor, inv.currency)} due` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    href: `/billing/invoices/${inv.id}`,
    at: inv.issuedAt ?? inv.createdAt,
    status: { value: inv.status, domain: "invoice" },
  }));

  const chart = columns
    ? { title: copy.pipelineTitle, description: copy.pipelineDescription, data: pipelineChartData(columns), unit: copy.people, link: { label: "Open pipeline", href: `${base}/pipeline` } }
    : requirementSummary
      ? {
          title: "Manpower requests by stage",
          description: "Where each of your requests stands.",
          data: requestChartData(requirementSummary.byStatus),
          unit: "requests",
          link: can.requirements ? { label: "All requests", href: `${base}/requirements` } : undefined,
        }
      : null;

  const liveSubscription = billing?.subscriptions.find((s) => s.kind === "base") ?? billing?.subscriptions[0] ?? null;
  const showStartRow = Boolean(plan) || checklistOpen;
  const howToUse = <HowToUse portal={copy.portal} permissions={permissions} />;

  return (
    <div className="space-y-8">
      <DashboardHeader
        name={ctx.user.displayName}
        eyebrow={copy.portalName}
        subtitle={`${org.name} · ${ctx.role.name}`}
        actions={employerHeaderActions(kind, permissions)}
        timeZone={timeZone}
        now={now}
      >
        <StatusBadge status={org.status} domain="organization" />
      </DashboardHeader>

      {sp.welcome === "1" ? (
        <Callout tone="success" title={`Your ${copy.noun} workspace is ready`}>
          Follow the steps below. You can send manpower requests now; every feature opens once Venkat Sai has verified your {copy.noun}.
        </Callout>
      ) : null}

      {showStartRow ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="min-w-0 space-y-6 lg:col-span-3">
            {plan ? <VerificationNextStep plan={plan} /> : null}
            <GettingStarted title="Set up your workspace" description="Each step takes a few minutes. Tap a step to go straight there." items={checklist} />
          </div>
          <div className="min-w-0 lg:col-span-2">{howToUse}</div>
        </div>
      ) : null}

      {showTiles ? (
        <section aria-labelledby="overview-heading" className="space-y-4">
          <div>
            <h2 id="overview-heading" className="font-heading text-xl font-bold text-foreground">
              {copy.overviewTitle}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{copy.overviewDescription}</p>
          </div>
          <StatGrid columns={4}>
            {employerStatTiles(kind, permissions, facts).map(({ key, ...tile }) => (
              <StatTile key={key} {...tile} />
            ))}
          </StatGrid>
        </section>
      ) : !can.dashboard ? (
        <Callout tone="info" title="Your role does not include the overview">
          Use the buttons below to open the areas your role gives you. A workspace owner can add the dashboard to your role.
        </Callout>
      ) : null}

      <QuickActions title="Quick actions" description="Everything you can do in this portal, in one place." items={quickActions} columns={4} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* A brand-new workspace sees one clear next step (the requests card), not a stack of empty cards. */}
          {chart && can.dashboard && active ? (
            <ChartCard
              title={chart.title}
              description={chart.description}
              data={chart.data}
              unit={chart.unit}
              link={chart.link}
              emptyTitle={columns ? `No ${copy.people} shared with you yet` : "No manpower requests yet"}
              emptyDescription={columns ? `When our team puts ${copy.people} forward for your ${kind === "travel_agency" ? "requests" : "jobs"}, you will see them here stage by stage.` : copy.requestsEmptyDescription}
            />
          ) : null}

          {can.requirementsView ? (
            <RecentList
              title={copy.requestsTitle}
              description={copy.requestsDescription}
              icon={ClipboardList}
              items={requirementItems}
              viewAll={can.requirements ? { label: "All requests", href: `${base}/requirements` } : undefined}
              now={now}
              empty={{
                title: copy.requestsEmptyTitle,
                description: copy.requestsEmptyDescription,
                icon: HardHat,
                action: can.requirements ? { label: "Request manpower", href: `${base}/requirements/new` } : undefined,
              }}
            />
          ) : null}

          {can.interviews && active ? (
            <RecentList
              title="Upcoming interviews"
              description={`Times in your time zone (${timeZone}).`}
              icon={CalendarClock}
              items={interviewItems}
              viewAll={{ label: "Interview calendar", href: `${base}/interviews?view=week` }}
              now={now}
              empty={{
                title: "No interviews coming up",
                description: `Interviews you or our team schedule with ${copy.people} appear here.`,
                icon: CalendarClock,
              }}
            />
          ) : null}

          {can.placements && active ? (
            <RecentList
              title={kind === "travel_agency" ? "Workers supplied" : "Recent placements"}
              description={kind === "travel_agency" ? "Workers selected for your clients and their journey to the site." : "People who accepted an offer and their joining."}
              icon={Plane}
              items={placementItems}
              viewAll={{ label: "All placements", href: `${base}/offers?tab=placements` }}
              now={now}
              empty={{
                title: kind === "travel_agency" ? "No workers supplied yet" : "No placements yet",
                description: "When a candidate accepts an offer, you can follow their visa, travel and joining here.",
                icon: Plane,
              }}
            />
          ) : null}
        </div>

        <div className="min-w-0 space-y-6">
          {showStartRow ? null : howToUse}

          <RecentList
            title="Needs your action"
            icon={ListTodo}
            items={todos.map((t) => ({ id: t.id, title: t.title, meta: t.meta, href: t.href }))}
            empty={{ title: "Nothing needs your attention", description: "Tasks appear here when a request, candidate, offer or invoice needs you." }}
          />

          <BulkOrderCard title={copy.bulkTitle} description={copy.bulkDescription} organizationName={org.name} />

          {can.billing ? (
            <RecentList
              title="Invoices & billing"
              description={
                billing
                  ? `${amountDue ? `${amountDue} due` : "Nothing due"} · ${liveSubscription ? `Plan: ${liveSubscription.planName}` : "Default plan"}`
                  : "Billing details are unavailable right now. Try again shortly."
              }
              icon={Receipt}
              items={invoiceItems}
              limit={4}
              viewAll={{ label: "Billing", href: `${base}/billing` }}
              now={now}
              empty={{
                title: "No worker invoices yet",
                description: "Invoices for the workers we supply appear here, one line per worker, with a PDF to download.",
                action: { label: "Open billing", href: `${base}/billing`, variant: "secondary" },
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
