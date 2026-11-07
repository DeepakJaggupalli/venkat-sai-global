import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, Briefcase, CalendarClock, ClipboardList, FileText, FolderKanban, HandCoins, LifeBuoy, ListChecks, UserCheck, Users } from "lucide-react";

import { buildSetupChecklist, checklistProgress } from "@/components/employer/setup-checklist";
import { BarChart } from "@/components/shared/charts";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { CompletenessMeter } from "@/components/shared/progress-ring";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getOrgBillingOverview } from "@/modules/commercial/queries";
import { orgCan, requireOrgMember } from "@/modules/identity/authz";
import { countEmployerJobsByStatus } from "@/modules/jobs/queries";
import { REQUIREMENT_STATUS_LABELS } from "@/modules/operations/constants";
import { listMyTickets, listOrgRequirements } from "@/modules/operations/queries";
import { getOrganizationOverview } from "@/modules/organizations/queries";
import { getEmployerPipelineOverview } from "@/modules/recruitment/application-queries";
import { listTalentLists } from "@/modules/recruitment/talent-lists";
import { PIPELINE_COLUMNS, type PipelineColumnKey } from "@/modules/recruitment/workflow";

export const metadata: Metadata = { title: "Dashboard" };

/** Loads an optional dashboard block; a failure in one module never breaks the whole dashboard. */
async function optional<T>(enabled: boolean, load: () => Promise<T>, label: string): Promise<T | null> {
  if (!enabled) return null;
  try {
    return await load();
  } catch (error) {
    logger.warn("Employer dashboard block failed", { block: label, error });
    return null;
  }
}

const FIRST_PAGE = { page: 1, pageSize: 5, offset: 0 };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EmployerDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgMember("employer");
  const sp = await searchParams;
  const orgId = ctx.organization.id;
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const can = {
    dashboard: orgCan(ctx, "employer.dashboard"),
    company: orgCan(ctx, "employer.company.manage"),
    team: orgCan(ctx, "employer.team.manage"),
    jobsView: orgCan(ctx, "employer.jobs.view"),
    jobsManage: orgCan(ctx, "employer.jobs.manage"),
    requirements: orgCan(ctx, "employer.requirements.manage"),
    pipeline: orgCan(ctx, "employer.pipeline.view"),
    interviews: orgCan(ctx, "employer.interviews.manage"),
    offers: orgCan(ctx, "employer.offers.manage"),
    billing: orgCan(ctx, "employer.billing.view"),
    lists: orgCan(ctx, "employer.candidates.lists"),
  };

  if (!can.dashboard) {
    // Custom roles may leave the dashboard out; the sidebar still lists what this member can open.
    return (
      <div className="space-y-6">
        <PageHeader title={`Welcome, ${ctx.user.displayName}`} description={`${ctx.organization.name} · ${ctx.role.name}`} />
        <EmptyState
          title="Your role does not include the dashboard"
          description="Use the menu to open the areas your role gives you access to, or ask a workspace owner to add the dashboard to your role."
          primaryAction={can.jobsView ? { label: "Open jobs", href: "/employer/jobs" } : undefined}
        />
      </div>
    );
  }

  const [overview, jobCounts, requirements, pipeline, billing, talentLists, tickets] = await Promise.all([
    optional(true, () => getOrganizationOverview(ctx, orgId), "overview"),
    optional(can.jobsView, () => countEmployerJobsByStatus(ctx), "jobs"),
    optional(true, () => listOrgRequirements(ctx, { status: "open" }, FIRST_PAGE), "requirements"),
    optional(can.pipeline, () => getEmployerPipelineOverview(ctx), "pipeline"),
    optional(can.billing, () => getOrgBillingOverview(ctx), "billing"),
    optional(can.lists, () => listTalentLists({ kind: "employer", ctx }), "lists"),
    optional(true, () => listMyTickets(ctx.user, { status: "open", organizationId: orgId }, FIRST_PAGE), "tickets"),
  ]);

  // Pipeline totals across the organisation's jobs (applications shared with the employer only).
  const columnTotals = Object.fromEntries(PIPELINE_COLUMNS.map((c) => [c.key, 0])) as Record<PipelineColumnKey, number>;
  let totalCandidates = 0;
  for (const job of pipeline?.jobs ?? []) {
    totalCandidates += job.total;
    for (const column of PIPELINE_COLUMNS) columnTotals[column.key] += job.counts[column.key] ?? 0;
  }
  const performanceRows = totalCandidates > 0 ? PIPELINE_COLUMNS.filter((c) => c.key !== "closed").map((c) => ({ stage: c.label, candidates: columnTotals[c.key] })) : [];

  const org = overview?.organization ?? ctx.organization;
  const employerProfile = overview?.profile.type === "employer" ? overview.profile.data : null;
  const checklist = buildSetupChecklist({
    orgStatus: org.status,
    hasCompanyDetails: Boolean(org.countryCode && org.city && org.addressLine1 && (org.email || org.phone)),
    hasLogo: Boolean(overview?.logo),
    hasAbout: Boolean(employerProfile?.aboutHtml || org.description),
    documentRequirementsMet: overview?.readiness.documentRequirements.every((d) => d.met) ?? false,
    memberCount: overview?.memberCount ?? 1,
    pendingInvitationCount: overview?.pendingInvitationCount ?? 0,
    jobCount: jobCounts ? Object.values(jobCounts).reduce((a, b) => a + b, 0) : 0,
    requirementCount: requirements?.total ?? 0,
    can: { company: can.company, team: can.team, jobs: can.jobsManage, requirements: can.requirements },
  });
  const progress = checklistProgress(checklist);

  const pendingActions: { id: string; label: string; href: string }[] = [];
  if (jobCounts?.changes_requested) pendingActions.push({ id: "jobs-changes", label: `${plural(jobCounts.changes_requested, "job")} with changes requested by Venkat Sai`, href: "/employer/jobs?status=changes_requested" });
  if (jobCounts?.draft && can.jobsManage) pendingActions.push({ id: "jobs-draft", label: `${plural(jobCounts.draft, "draft job")} not yet submitted for review`, href: "/employer/jobs?status=draft" });
  const draftRequirements = requirements?.items.filter((r) => r.status === "draft").length ?? 0;
  if (draftRequirements && can.requirements) pendingActions.push({ id: "req-draft", label: `${plural(draftRequirements, "draft requirement")} to submit`, href: "/employer/requirements?status=draft" });
  if (can.company && ["draft", "rejected", "expired"].includes(org.status)) pendingActions.push({ id: "verify", label: "Submit your company for verification", href: "/employer/company/verification" });
  const daysLeft = overview?.verificationDaysLeft ?? null;
  if (daysLeft !== null && daysLeft <= 30 && can.company) pendingActions.push({ id: "renew", label: `Verification ends in ${plural(daysLeft, "day")}. Upload current documents to renew.`, href: "/employer/company/verification" });
  if (columnTotals.client_interview > 0 && can.interviews) pendingActions.push({ id: "interviews", label: `${plural(columnTotals.client_interview, "candidate")} at the interview stage`, href: "/employer/interviews" });
  if (columnTotals.offer > 0 && can.offers) pendingActions.push({ id: "offers", label: `${plural(columnTotals.offer, "candidate")} at the offer stage`, href: "/employer/offers" });

  const liveSubscription = billing?.subscriptions.find((s) => s.kind === "base") ?? billing?.subscriptions[0] ?? null;
  const outstanding = billing?.outstanding.filter((o) => o.amountMinor > 0) ?? [];
  const activeJobs = jobCounts ? jobCounts.published + jobCounts.paused : null;
  const firstName = ctx.user.displayName.split(" ")[0] || ctx.user.displayName;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={`${org.name} · ${ctx.role.name}`}
        status={<StatusBadge status={org.status} domain="organization" />}
        actions={[
          ...(can.jobsManage ? [{ label: "Post a job", href: "/employer/jobs/new" }] : []),
          ...(can.requirements ? [{ label: "New requirement", href: "/employer/requirements/new", variant: "outline" as const }] : []),
        ]}
      />

      {sp.welcome === "1" ? (
        <Callout tone="success" title="Your employer workspace is ready">
          Follow the setup steps below. Jobs can be published once Venkat Sai has verified your company.
        </Callout>
      ) : null}

      {checklist.length > 0 && !progress.complete ? (
        <SectionCard title="Set up your workspace" description={`${progress.done} of ${progress.total} steps complete`} icon={<ListChecks className="size-4" aria-hidden="true" />}>
          <CompletenessMeter title="Workspace setup" items={checklist} maxOutstanding={6} completeText="Your workspace is set up." />
        </SectionCard>
      ) : null}

      <section aria-labelledby="overview-heading" className="space-y-4">
        <h2 id="overview-heading" className="font-heading text-lg font-semibold text-navy">
          Hiring overview
        </h2>
        <StatGrid columns={4}>
          <StatCard label="Active requirements" value={requirements?.total ?? null} icon={<ClipboardList aria-hidden="true" />} href={can.requirements ? "/employer/requirements" : undefined} hint="Drafts and requirements in progress" />
          <StatCard label="Active jobs" value={activeJobs} icon={<Briefcase aria-hidden="true" />} href={can.jobsView ? "/employer/jobs?status=published" : undefined} hint="Published and paused" />
          <StatCard label="Total candidates" value={pipeline ? totalCandidates : null} icon={<Users aria-hidden="true" />} href={can.pipeline ? "/employer/pipeline" : undefined} hint="Applications shared with you" />
          <StatCard label="Shortlisted" value={pipeline ? columnTotals.shortlisted : null} icon={<UserCheck aria-hidden="true" />} />
          <StatCard label="At interview" value={pipeline ? columnTotals.client_interview : null} icon={<CalendarClock aria-hidden="true" />} href={can.interviews ? "/employer/interviews" : undefined} />
          <StatCard label="Offers" value={pipeline ? columnTotals.offer : null} icon={<HandCoins aria-hidden="true" />} href={can.offers ? "/employer/offers" : undefined} />
          <StatCard label="Positions filled" value={pipeline ? columnTotals.joined : null} icon={<FolderKanban aria-hidden="true" />} hint="Candidates who joined" />
          <StatCard label="Pending actions" value={pendingActions.length} icon={<AlertCircle aria-hidden="true" />} />
        </StatGrid>
        {!can.pipeline ? <p className="text-sm text-muted-foreground">Candidate figures are shown to members whose role includes the hiring pipeline.</p> : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard title="Pending actions" description="Things waiting for you or your team">
            {pendingActions.length ? (
              <ul className="divide-y divide-border">
                {pendingActions.map((a) => (
                  <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                    <Link href={a.href} className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
                      {a.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState size="sm" variant="plain" title="Nothing needs your attention" description="Tasks appear here when jobs, requirements or candidates need a decision." />
            )}
          </SectionCard>

          {can.pipeline ? (
            <SectionCard title="Recruitment performance" description="Candidates at each stage across your jobs">
              <BarChart
                title="Candidates by stage"
                index="stage"
                indexLabel="Stage"
                orientation="horizontal"
                data={performanceRows}
                series={[{ key: "candidates", label: "Candidates" }]}
                emptyText="No candidates have been shared with you yet."
              />
            </SectionCard>
          ) : null}

          <SectionCard title="Workforce requirements" description="Your most recent open requirements" action={can.requirements ? { label: "View all", href: "/employer/requirements" } : undefined} flush>
            {requirements?.items.length ? (
              <ul className="divide-y divide-border">
                {requirements.items.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link href={`/employer/requirements/${r.id}`} className="block truncate text-sm font-medium text-foreground underline-offset-4 hover:underline">
                        {r.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {r.code} · {plural(r.totalPositions, "position")}
                      </p>
                    </div>
                    <StatusBadge status={r.status} domain="generic" size="sm">
                      {REQUIREMENT_STATUS_LABELS[r.status]}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState
                  size="sm"
                  variant="plain"
                  title="No open requirements"
                  description="Tell Venkat Sai how many people you need and for which trades. Our team sources, screens and tests candidates for you."
                  primaryAction={can.requirements ? { label: "New requirement", href: "/employer/requirements/new" } : undefined}
                />
              </div>
            )}
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-6">
          {can.billing ? (
            <SectionCard title="Subscription" icon={<FileText className="size-4" aria-hidden="true" />} action={{ label: "Billing", href: "/employer/billing" }}>
              {billing ? (
                <div className="space-y-3 text-sm">
                  {liveSubscription ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">{liveSubscription.planName}</span>
                      <StatusBadge status={liveSubscription.status} domain="generic" size="sm" />
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No subscription. Your workspace uses the default plan.</p>
                  )}
                  {liveSubscription?.currentPeriodEnd ? (
                    <p className="text-muted-foreground">
                      Current period ends <DateText value={liveSubscription.currentPeriodEnd} timeZone={timeZone} />
                    </p>
                  ) : null}
                  <div className="border-t border-border pt-3">
                    <p className="font-medium text-foreground">Invoices due</p>
                    {outstanding.length ? (
                      <ul className="mt-1 space-y-1">
                        {outstanding.map((o) => (
                          <li key={o.currency}>
                            <MoneyText amountMinor={o.amountMinor} currency={o.currency} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-muted-foreground">Nothing outstanding.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Billing details are unavailable right now. Try again shortly.</p>
              )}
            </SectionCard>
          ) : null}

          {can.lists ? (
            <SectionCard title="Talent lists" icon={<FolderKanban className="size-4" aria-hidden="true" />} action={{ label: "Open", href: "/employer/lists" }}>
              {talentLists?.length ? (
                <ul className="space-y-2 text-sm">
                  {talentLists.slice(0, 5).map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3">
                      <Link href={`/employer/lists/${l.id}`} className="truncate font-medium text-foreground underline-offset-4 hover:underline">
                        {l.name}
                      </Link>
                      <span className="shrink-0 text-muted-foreground">{plural(l.itemCount, "candidate")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No talent lists yet. Save promising candidates to a list from search or the pipeline.</p>
              )}
            </SectionCard>
          ) : null}

          <SectionCard title="Support requests" icon={<LifeBuoy className="size-4" aria-hidden="true" />} action={{ label: "Support", href: "/employer/support" }}>
            <p className="text-sm text-muted-foreground">
              {tickets ? (tickets.total === 0 ? "No open support requests." : `${plural(tickets.total, "open request")} with Venkat Sai support.`) : "Support requests are unavailable right now."}
            </p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
