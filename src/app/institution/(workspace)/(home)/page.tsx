import type { Metadata } from "next";
import {
  Armchair,
  Award,
  BadgeCheck,
  BarChart3,
  BookOpen,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  GraduationCap,
  Inbox,
  Megaphone,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";

import { DashboardHeader, EmptyState, GettingStarted, HowToUse, QuickActions, RecentList, SectionCard, StatGrid, StatTile } from "@/components/dashboard";
import { ChartCard } from "@/components/dashboard/chart-card";
import { BatchRows, FactRow, RateBars, type RateRow } from "@/components/institution/dashboard-panels";
import { certificateStatus, enrolmentStatus } from "@/components/institution/labels";
import { settle } from "@/components/public/server";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { StatusBadge } from "@/components/shared/status-badge";
import { env } from "@/lib/env";
import { listPartnerAnnouncements } from "@/modules/content/queries";
import { requireOrgMember } from "@/modules/identity/authz";
import { listMyTickets, unreadThreadCount } from "@/modules/operations/queries";
import { getOrganizationOverview } from "@/modules/organizations/queries";
import { getInstitutionDashboardStats, listBatches } from "@/modules/training/queries";

import {
  BATCH_VIEW_PERMISSIONS,
  institutionHeaderActions,
  institutionQuickActions,
  institutionSetupChecklist,
  lastMonths,
  linkIf,
  monthlySeries,
  ratePercent,
  seatsLeft,
  seesOwnBatchesOnly,
  verificationSummary,
} from "../_lib/dashboard";
import { dashboardTimeZone, getInstitutionDashboardData, getOutcomeRates } from "../_lib/queries";

export const metadata: Metadata = { title: "Dashboard" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ONE = { page: 1, pageSize: 1, offset: 0 } as const;
const num = (n: number) => n.toLocaleString("en-IN");
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

export default async function InstitutionDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgMember("institution");
  const sp = await searchParams;
  const perms = ctx.permissions;
  const timeZone = dashboardTimeZone(ctx.user.timezone ?? env().DEFAULT_TIMEZONE);
  const now = new Date();

  // Messages and support never block the page: a failing source only hides its badge.
  const [unreadMessages, openSupportRequests] = await Promise.all([
    settle("institution dashboard: unread messages", () => unreadThreadCount({ kind: "org", ctx }), null),
    settle("institution dashboard: open support requests", () => listMyTickets(ctx.user, { status: "open", organizationId: ctx.organization.id }, ONE).then((r) => r.total), null),
  ]);
  const subtitle = `${ctx.organization.name} · ${ctx.role.name}`;

  // Members whose role has no dashboard permission (custom roles) get their buttons and their batches.
  if (!perms.has("institution.dashboard")) {
    const canSeeBatches = BATCH_VIEW_PERMISSIONS.some((p) => perms.has(p));
    const mine = canSeeBatches ? await listBatches(ctx, {}, { page: 1, pageSize: 6, offset: 0 }) : null;
    return (
      <div className="space-y-6">
        <DashboardHeader name={ctx.user.displayName} subtitle={subtitle} eyebrow="Institution Portal" timeZone={timeZone} now={now} />
        <QuickActions title="Quick actions" items={institutionQuickActions(perms, { unreadMessages, openSupportRequests })} />
        <HowToUse portal="institution" permissions={perms} />
        {canSeeBatches ? (
          <SectionCard title="Your batches" description="Batches you are assigned to." icon={CalendarClock} flush={Boolean(mine?.items.length)}>
            {mine?.items.length ? (
              <BatchRows kind="upcoming" canOpen items={mine.items} />
            ) : (
              <EmptyState size="sm" title="No batches assigned yet" description="When a coordinator adds you as an instructor, the batch appears here." />
            )}
          </SectionCard>
        ) : null}
      </div>
    );
  }

  const canProfile = perms.has("institution.profile.manage");
  const [stats, rates, overview, data, announcements] = await Promise.all([
    getInstitutionDashboardStats(ctx, now),
    getOutcomeRates(ctx),
    getOrganizationOverview(ctx, ctx.organization.id, now),
    getInstitutionDashboardData(ctx, { now, timeZone }),
    canProfile ? settle("institution dashboard: announcements", () => listPartnerAnnouncements(ctx), []) : Promise.resolve([]),
  ]);

  const org = overview.organization;
  const profile = overview.profile.type === "institution" ? overview.profile.data : null;
  const verified = org.status === "verified";
  const verification = verificationSummary(org.status, { daysLeft: overview.verificationDaysLeft });

  // Counts (all real; batch-based ones are limited to an instructor's own batches by the query).
  const totalCourses = Object.entries(stats.courses).reduce((sum, [status, n]) => (status === "archived" ? sum : sum + n), 0);
  const coursesInReview = stats.courses.pending_approval;
  const coursesToFix = stats.courses.changes_requested + stats.courses.rejected;
  const enrol = data.enrolmentsByStatus;
  const applicationsToReview = enrol.applied ?? 0;
  const waitlisted = enrol.waitlisted ?? 0;
  const learningNow = (enrol.confirmed ?? 0) + (enrol.in_progress ?? 0);
  const completed = enrol.completed ?? 0;
  const left = seatsLeft(data.seats);
  const batchCount = (status: string) => data.batchesByStatus[status] ?? 0;
  const graded = rates.results.passed + rates.results.failed;
  const finished = rates.completion.completed + rates.completion.dropped;

  // Links only where this member may go.
  const canBatches = BATCH_VIEW_PERMISSIONS.some((p) => perms.has(p));
  const canStudents = perms.has("institution.students.manage");
  const canCertificates = perms.has("institution.certificates.issue");
  const canPlacements = perms.has("institution.placements.manage");
  const canReports = perms.has("institution.reports.view");
  const canCourses = perms.has("institution.courses.manage");
  const canNewBatch = perms.has("institution.batches.manage");
  const ownBatchesOnly = seesOwnBatchesOnly(perms);

  const checklist = institutionSetupChecklist(perms, {
    profileComplete: Boolean(profile?.institutionKind && org.city && (org.email || org.phone)),
    documentsUploaded: overview.readiness.documentRequirements.every((d) => d.met),
    verified,
    hasCourse: totalCourses > 0,
    hasBatch: Object.values(stats.batches).some((n) => n > 0),
  });

  const quickActions = institutionQuickActions(perms, {
    applicationsToReview,
    resultsToPublish: data.assessments.unpublished,
    readyForCertificate: data.readyForCertificate,
    upcomingDrives: stats.upcomingDrives,
    pendingInvitations: overview.pendingInvitationCount,
    unreadMessages,
    openSupportRequests,
  }, { omit: ["profile"] });

  const months = lastMonths(now, 6, timeZone);
  const applicationsSeries = monthlySeries(months, data.applicationsByMonth);
  const certificatesSeries = monthlySeries(months, data.certificatesByMonth);
  const hasChartData = [...applicationsSeries, ...certificatesSeries].some((d) => d.value > 0);

  const liveAnnouncements = announcements.filter((a) => a.status === "published").length;
  const scheduledAnnouncements = announcements.filter((a) => a.status === "scheduled").length;
  const announcementsInReview = announcements.filter((a) => a.status === "draft").length;
  const latestAnnouncement = announcements[0] ?? null;

  const rateRows: RateRow[] = [
    {
      label: "Attendance",
      percent: ratePercent(rates.attendance.attended, rates.attendance.counted),
      detail: rates.attendance.counted ? `Present or late, of ${plural(rates.attendance.counted, "marked attendance")}` : "Shows once attendance is marked.",
    },
    {
      label: "Pass rate",
      percent: ratePercent(rates.results.passed, graded),
      detail: graded ? `${num(rates.results.passed)} passed of ${plural(graded, "graded learner")}` : "Shows once results are worked out.",
    },
    {
      label: "Completion",
      percent: ratePercent(rates.completion.completed, finished),
      detail: finished ? `${num(rates.completion.completed)} completed, ${num(rates.completion.dropped)} dropped out` : "Shows once learners finish a batch.",
    },
    {
      label: "Placement",
      percent: ratePercent(rates.placements.placedLearners, rates.placements.completedLearners),
      detail: rates.placements.completedLearners
        ? `${num(rates.placements.placedLearners)} placed of ${plural(rates.placements.completedLearners, "learner")} who completed`
        : "Shows once learners complete a course.",
    },
  ];

  const showVerificationNotice = verification.needsAction && verification.tone !== "neutral";

  return (
    <div className="space-y-6">
      <DashboardHeader name={ctx.user.displayName} subtitle={subtitle} eyebrow="Institution Portal" actions={institutionHeaderActions(perms)} timeZone={timeZone} now={now}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={verification.tone} icon={verified ? <BadgeCheck aria-hidden="true" /> : undefined} dot={!verified}>
            {verified ? "Verified institution" : `Verification: ${verification.label.toLowerCase()}`}
          </StatusBadge>
          {stats.isAuthorisedCertificateIssuer ? <StatusBadge tone="info">Authorised certificate issuer</StatusBadge> : null}
        </div>
      </DashboardHeader>

      {sp.welcome === "1" ? (
        <Callout tone="success" title="Your institution workspace is ready">
          Next, complete your profile and upload your registration and accreditation or affiliation documents so Venkat Sai can verify your institution. Courses are
          published and certificates issued only once you are verified.
        </Callout>
      ) : null}

      {showVerificationNotice ? (
        <Callout
          tone={verification.tone === "danger" ? "danger" : "warning"}
          title={verification.tone === "danger" ? `Verification: ${verification.label.toLowerCase()}` : "Verification needs attention"}
          action={canProfile ? { label: "Open your profile", href: "/institution/profile#verification" } : undefined}
        >
          {org.statusReason && (org.status === "rejected" || org.status === "suspended") ? org.statusReason : verification.text}
        </Callout>
      ) : null}

      <GettingStarted
        title="Set up your institution"
        description={`${checklist.filter((i) => i.done).length} of ${checklist.length} done. These steps unlock publishing courses and issuing certificates.`}
        items={checklist}
      />

      <StatGrid label="Your institution at a glance">
        <StatTile
          label="Published courses"
          value={stats.courses.published}
          icon={BookOpen}
          href={linkIf(perms, "institution.courses.manage", "/institution/courses")}
          hint={coursesToFix ? `${plural(coursesToFix, "course")} to fix` : coursesInReview ? `${num(coursesInReview)} waiting for approval` : `${plural(totalCourses, "course")} in total`}
        />
        <StatTile
          label={ownBatchesOnly ? "Your batches running" : "Batches running"}
          value={batchCount("in_progress")}
          icon={CalendarClock}
          href={linkIf(perms, BATCH_VIEW_PERMISSIONS, "/institution/batches?status=in_progress")}
          hint={`${num(batchCount("open") + batchCount("full"))} taking enrolments · ${num(batchCount("planned"))} planned`}
        />
        <StatTile
          label="Students"
          value={data.learners}
          icon={Users}
          href={linkIf(perms, "institution.students.manage", "/institution/students")}
          hint={`${num(learningNow)} enrolled now · ${plural(completed, "course completion")}`}
        />
        <StatTile
          label="Applications to review"
          value={applicationsToReview}
          icon={Inbox}
          tone="attention"
          href={linkIf(perms, "institution.students.manage", "/institution/students?status=applied")}
          hint={waitlisted ? `${num(waitlisted)} on the waitlist` : "New learner applications"}
        />
        <StatTile
          label="Seats left"
          value={data.seats.capacity > 0 ? left : data.seats.batches > 0 ? "No limit" : 0}
          icon={Armchair}
          href={linkIf(perms, BATCH_VIEW_PERMISSIONS, "/institution/batches")}
          hint={
            data.seats.batches === 0
              ? "No upcoming batch yet"
              : data.seats.capacity > 0
                ? `${num(data.seats.filled)} of ${num(data.seats.capacity)} filled in ${plural(data.seats.batches, "upcoming batch", "upcoming batches")}`
                : `${plural(data.seats.batches, "upcoming batch", "upcoming batches")}, no seat limit`
          }
        />
        <StatTile
          label="Results to publish"
          value={data.assessments.unpublished}
          icon={ClipboardCheck}
          tone="attention"
          href={linkIf(perms, "institution.assessments.manage", "/institution/assessments?view=unpublished")}
          hint={`${plural(data.assessments.total, "assessment")} in all`}
        />
        <StatTile
          label="Certificates issued"
          value={stats.certificates.active}
          icon={Award}
          href={linkIf(perms, "institution.certificates.issue", "/institution/certificates")}
          hint={data.readyForCertificate ? `${plural(data.readyForCertificate, "learner")} ready for one` : `${num(stats.certificates.issuedLast30Days)} in the last 30 days`}
        />
        <StatTile
          label="Learners placed"
          value={rates.placements.placedLearners}
          icon={Target}
          tone={rates.placements.placedLearners > 0 ? "positive" : "default"}
          href={linkIf(perms, "institution.placements.manage", "/institution/placements")}
          hint={`${num(rates.placements.verifiedLearners)} verified · ${plural(stats.upcomingDrives, "upcoming drive")}`}
        />
      </StatGrid>

      <QuickActions title="Quick actions" description="Everything you can do in this portal, one tap away." items={quickActions} />

      <HowToUse portal="institution" permissions={perms} />

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <SectionCard
          title={ownBatchesOnly ? "Your running batches" : "Running batches"}
          description="Classes in progress now, ending soonest first."
          icon={CalendarRange}
          action={canBatches && data.runningBatches.length ? { label: "View all", href: "/institution/batches?status=in_progress" } : undefined}
          flush={data.runningBatches.length > 0}
        >
          {data.runningBatches.length ? (
            <BatchRows kind="running" canOpen={canBatches} items={data.runningBatches} />
          ) : (
            <EmptyState size="sm" icon={CalendarRange} title="No batch is running now" description="When a batch starts, it shows here with its seats and end date." className="h-full justify-center" />
          )}
        </SectionCard>

        <SectionCard
          title={ownBatchesOnly ? "Your upcoming batches" : "Upcoming batches"}
          description="Starting next, with seats filled."
          icon={CalendarClock}
          action={canBatches && data.upcomingBatches.length ? { label: "View all", href: "/institution/batches" } : undefined}
          flush={data.upcomingBatches.length > 0}
        >
          {data.upcomingBatches.length ? (
            <BatchRows kind="upcoming" canOpen={canBatches} items={data.upcomingBatches} />
          ) : (
            <EmptyState
              size="sm"
              icon={CalendarClock}
              title="No upcoming batches"
              className="h-full justify-center"
              description={totalCourses ? "Schedule a batch of a published course so learners can apply." : "Add a course first, then schedule a batch."}
              action={
                canNewBatch && totalCourses
                  ? { label: "New batch", href: "/institution/batches/new" }
                  : canCourses && !totalCourses
                    ? { label: "Add a course", href: "/institution/courses/new" }
                    : undefined
              }
            />
          )}
        </SectionCard>
      </div>

      {/* With no activity at all, the lists below already say so: skip two empty charts. */}
      {hasChartData ? (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <ChartCard
            title="Applications per month"
            description="Learners applying to your batches, last 6 months."
            data={applicationsSeries}
            unit="applications"
            link={canStudents ? { label: "Students", href: "/institution/students" } : undefined}
            emptyTitle="No applications yet"
            emptyDescription="When learners apply to your batches, the months fill in here."
          />
          <ChartCard
            title="Certificates issued per month"
            description="Certificates you issued, last 6 months."
            data={certificatesSeries}
            unit="certificates"
            link={canCertificates ? { label: "Certificates", href: "/institution/certificates" } : undefined}
            emptyTitle="No certificates issued yet"
            emptyDescription={verified ? "Issue certificates to learners who completed a course." : "You can issue certificates once Venkat Sai verifies your institution."}
          />
        </div>
      ) : null}

      {canStudents || canCertificates ? (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          {canStudents ? (
            <RecentList
              title="Latest applications"
              description="Newest first. Confirm or turn them down in Students."
              icon={GraduationCap}
              now={now}
              viewAll={{ label: "View all", href: applicationsToReview ? "/institution/students?status=applied" : "/institution/students" }}
              items={data.recentApplications.map((a) => {
                const status = enrolmentStatus(a.status);
                return {
                  id: a.id,
                  title: a.candidateName,
                  meta: `${a.courseTitle} · ${a.batchCode}`,
                  href: `/institution/students?status=${a.status}`,
                  at: a.appliedAt,
                  status: { label: status.label, tone: status.tone },
                };
              })}
              empty={{
                title: "No applications yet",
                description: "When learners apply to one of your batches, they appear here.",
                icon: GraduationCap,
                action: canNewBatch && totalCourses && !data.upcomingBatches.length ? { label: "New batch", href: "/institution/batches/new" } : undefined,
              }}
            />
          ) : null}
          {canCertificates ? (
            <RecentList
              title="Recently issued certificates"
              description="Anyone can check each one online with its code."
              icon={Award}
              now={now}
              viewAll={{ label: "View all", href: "/institution/certificates" }}
              items={data.recentCertificates.map((c) => {
                const status = certificateStatus(c.status);
                return { id: c.id, title: c.holderName, meta: `${c.title} · ${c.code}`, href: "/institution/certificates", at: c.issuedAt, status: { label: status.label, tone: status.tone } };
              })}
              empty={{
                title: "No certificates issued yet",
                description: data.readyForCertificate
                  ? `${plural(data.readyForCertificate, "learner")} completed a course and can get a certificate now.`
                  : "Learners who complete a course can get a certificate from you.",
                icon: Award,
                action: data.readyForCertificate ? { label: "Issue certificates", href: "/institution/certificates" } : undefined,
              }}
            />
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <SectionCard
          title="Results so far"
          description="Worked out from the attendance, results and placements you recorded."
          icon={BarChart3}
          action={canReports ? { label: "Reports", href: "/institution/reports" } : undefined}
        >
          {rateRows.every((r) => r.percent === null) ? (
            <EmptyState
              size="sm"
              icon={BarChart3}
              title="Nothing to measure yet"
              description="Attendance, pass, completion and placement rates show here once you mark attendance and record results."
            />
          ) : (
            <RateBars rows={rateRows} />
          )}
        </SectionCard>

        <SectionCard title="Verification and certificates" icon={BadgeCheck} action={canProfile ? { label: "Profile", href: "/institution/profile#verification" } : undefined}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={verification.tone}>{verification.label}</StatusBadge>
              {org.verificationExpiresAt && verified ? (
                <span className="text-[13px] text-muted-foreground">
                  Valid until <DateText value={org.verificationExpiresAt} timeZone={timeZone} />
                </span>
              ) : null}
            </div>
            <p className="text-sm text-pretty text-muted-foreground">{verification.text}</p>
            <dl className="divide-y divide-border border-y border-border">
              <FactRow label="Completion certificates">{verified ? "You can issue them" : "After verification"}</FactRow>
              <FactRow label="Accredited certificates">{stats.isAuthorisedCertificateIssuer ? "Authorised" : "Not authorised yet"}</FactRow>
              {profile?.authorisedUntil && stats.isAuthorisedCertificateIssuer ? (
                <FactRow label="Authorised until">
                  <DateText value={profile.authorisedUntil} timeZone={timeZone} />
                </FactRow>
              ) : null}
              <FactRow label="Ready for a certificate">{plural(data.readyForCertificate, "learner")}</FactRow>
            </dl>
            {!stats.isAuthorisedCertificateIssuer ? (
              <p className="text-[13px] text-pretty text-muted-foreground">Accredited certificates need an authorisation from Venkat Sai, given after your accreditation is checked.</p>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Placements" icon={Target} action={canPlacements ? { label: "Open", href: "/institution/placements" } : undefined}>
          <div className="space-y-4">
            <dl className="divide-y divide-border border-y border-border">
              <FactRow label="Learners placed">{num(rates.placements.placedLearners)}</FactRow>
              <FactRow label="Verified by Venkat Sai">{num(rates.placements.verifiedLearners)}</FactRow>
              <FactRow label="Upcoming campus drives">{num(stats.upcomingDrives)}</FactRow>
            </dl>
            {data.nextDrive ? (
              <div className="rounded-2xl border border-border bg-surface-subtle/60 p-3.5">
                <p className="text-xs font-semibold tracking-wide text-accent-text uppercase">Next drive</p>
                {canPlacements ? (
                  <Link href={`/institution/placements/drives/${data.nextDrive.id}`} className="mt-1 block font-semibold text-foreground underline-offset-4 hover:underline">
                    {data.nextDrive.title}
                  </Link>
                ) : (
                  <p className="mt-1 font-semibold text-foreground">{data.nextDrive.title}</p>
                )}
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {data.nextDrive.employerName ? `${data.nextDrive.employerName} · ` : ""}
                  {data.nextDrive.driveDate ? <DateText value={data.nextDrive.driveDate} dateOnly /> : "Date not set yet"}
                </p>
              </div>
            ) : (
              <p className="text-sm text-pretty text-muted-foreground">
                No campus drive planned. {canPlacements ? "Plan one with a company, or record a job a learner got." : "Your placement team plans drives with companies."}
              </p>
            )}
          </div>
        </SectionCard>

        {canProfile ? (
          <SectionCard title="Announcements" icon={Megaphone} action={{ label: "Manage", href: "/institution/announcements" }}>
            <div className="space-y-4">
              <dl className="divide-y divide-border border-y border-border">
                <FactRow label="Live on Venkat Sai">{num(liveAnnouncements)}</FactRow>
                <FactRow label="Approved, scheduled">{num(scheduledAnnouncements)}</FactRow>
                <FactRow label="Waiting for review">{num(announcementsInReview)}</FactRow>
              </dl>
              {latestAnnouncement ? (
                <p className="truncate text-sm text-muted-foreground">
                  Latest: <span className="font-semibold text-foreground">{latestAnnouncement.title}</span>
                </p>
              ) : (
                <p className="text-sm text-pretty text-muted-foreground">
                  {verified ? "Share admissions, new batches or results with learners on Venkat Sai." : "Once verified, you can share admissions and new batches with learners on Venkat Sai."}
                </p>
              )}
            </div>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
