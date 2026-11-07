import type { Metadata } from "next";
import { Award, BookOpen, Briefcase, CalendarClock, ClipboardCheck, GraduationCap, Percent, Users } from "lucide-react";
import Link from "next/link";

import { batchStatus, pct, ratio } from "@/components/institution/labels";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { CompletenessMeter } from "@/components/shared/progress-ring";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireOrgMember } from "@/modules/identity/authz";
import { getOrganizationOverview } from "@/modules/organizations/queries";
import { getInstitutionDashboardStats, listBatches } from "@/modules/training/queries";

import { getOutcomeRates } from "./_lib/queries";

export const metadata: Metadata = { title: "Dashboard" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function InstitutionDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgMember("institution");
  const sp = await searchParams;
  const firstName = ctx.user.displayName.split(" ")[0] || ctx.user.displayName;

  // Instructors and other members without the dashboard permission see the batches they work on.
  if (!ctx.permissions.has("institution.dashboard")) {
    const canSeeBatches = ["institution.batches.manage", "institution.students.manage", "institution.assessments.manage"].some((p) => ctx.permissions.has(p));
    const mine = canSeeBatches ? await listBatches(ctx, {}, { page: 1, pageSize: 10, offset: 0 }) : null;
    return (
      <div className="space-y-8">
        <PageHeader title={`Welcome, ${firstName}`} description={`${ctx.organization.name} · ${ctx.role.name}`} />
        <SectionCard title="Your batches" description="Batches you are assigned to as an instructor." flush>
          {mine && mine.items.length ? (
            <ul className="divide-y divide-border">
              {mine.items.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/institution/batches/${b.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">{b.title}</span>
                      <span className="block text-sm text-muted-foreground">
                        {b.courseTitle} · {b.code}
                      </span>
                    </span>
                    <StatusBadge tone={batchStatus(b.status).tone} size="sm">
                      {batchStatus(b.status).label}
                    </StatusBadge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState size="sm" variant="plain" title="No batches assigned yet" description="When a coordinator adds you as an instructor, the batch appears here." />
            </div>
          )}
        </SectionCard>
      </div>
    );
  }

  const [stats, rates, overview] = await Promise.all([getInstitutionDashboardStats(ctx), getOutcomeRates(ctx), getOrganizationOverview(ctx, ctx.organization.id)]);
  const org = overview.organization;
  const profile = overview.profile.type === "institution" ? overview.profile.data : null;
  const totalCourses = Object.entries(stats.courses).reduce((sum, [status, n]) => (status === "archived" ? sum : sum + n), 0);
  const activeBatches = stats.batches.open + stats.batches.full + stats.batches.in_progress;
  const pendingApplications = stats.enrolments.applied + stats.enrolments.waitlisted;
  const graded = rates.results.passed + rates.results.failed;
  const attendanceRate = ratio(rates.attendance.attended, rates.attendance.counted);
  const passRate = ratio(rates.results.passed, graded);

  const verified = org.status === "verified";
  const checklist = [
    { id: "profile", label: "Complete the institution profile", done: Boolean(profile?.institutionKind && org.city && (org.email || org.phone)), href: "/institution/profile" },
    {
      id: "documents",
      label: "Upload registration and accreditation or affiliation documents",
      done: overview.readiness.documentRequirements.every((d) => d.met),
      href: "/institution/profile#documents",
    },
    { id: "verified", label: "Get verified by Venkat Sai", done: verified, href: "/institution/profile#verification" },
    { id: "course", label: "Create your first course", done: totalCourses > 0, href: "/institution/courses/new" },
    { id: "batch", label: "Schedule a batch", done: Object.values(stats.batches).some((n) => n > 0), href: "/institution/batches/new" },
  ];
  const setupOpen = checklist.some((i) => !i.done);
  const canCourses = ctx.permissions.has("institution.courses.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={`${org.name} · live figures from your courses, batches and learners.`}
        actions={canCourses ? [{ label: "New course", href: "/institution/courses/new" }, { label: "Schedule a batch", href: "/institution/batches/new", variant: "outline" }] : undefined}
      />

      {sp.welcome === "1" ? (
        <Callout tone="success" title="Your institution workspace is ready">
          Next, complete your profile and upload your registration and accreditation or affiliation documents so Venkat Sai can verify your institution. Courses
          are published and certificates issued only once you are verified.
        </Callout>
      ) : null}

      {setupOpen ? (
        <CompletenessMeter
          title="Set up your institution"
          description="These steps unlock publishing courses and issuing certificates."
          items={checklist}
          maxOutstanding={5}
          completeText="Setup complete"
        />
      ) : null}

      <section aria-labelledby="training-heading" className="space-y-3">
        <h2 id="training-heading" className="font-heading text-lg font-semibold text-navy">
          Training
        </h2>
        <StatGrid columns={4}>
          <StatCard
            label="Published courses"
            value={stats.courses.published}
            icon={<BookOpen aria-hidden="true" />}
            hint={stats.courses.pending_approval ? `${stats.courses.pending_approval} in review` : `${totalCourses} in total`}
            href="/institution/courses"
          />
          <StatCard
            label="Active batches"
            value={activeBatches}
            icon={<CalendarClock aria-hidden="true" />}
            hint={`${stats.batches.in_progress} in progress · ${stats.batches.open + stats.batches.full} enrolling`}
            href="/institution/batches"
          />
          <StatCard label="Active learners" value={stats.enrolments.active} icon={<Users aria-hidden="true" />} hint={`${stats.enrolments.completed} completed so far`} href="/institution/students?status=confirmed" />
          <StatCard
            label="Applications to review"
            value={pendingApplications}
            icon={<GraduationCap aria-hidden="true" />}
            hint={`${stats.enrolments.waitlisted} on the waitlist`}
            href="/institution/students?status=applied"
          />
        </StatGrid>
      </section>

      <section aria-labelledby="outcomes-heading" className="space-y-3">
        <h2 id="outcomes-heading" className="font-heading text-lg font-semibold text-navy">
          Outcomes
        </h2>
        <StatGrid columns={4}>
          <StatCard
            label="Attendance rate"
            value={attendanceRate === null ? null : pct(attendanceRate)}
            icon={<Percent aria-hidden="true" />}
            hint={rates.attendance.counted ? `Present or late, of ${rates.attendance.counted.toLocaleString("en-IN")} marked attendances (excused not counted)` : "Shown once attendance is recorded"}
          />
          <StatCard
            label="Pass rate"
            value={passRate === null ? null : pct(passRate)}
            icon={<ClipboardCheck aria-hidden="true" />}
            hint={graded ? `${rates.results.passed} passed of ${graded} graded learners` : "Shown once results are calculated"}
            href="/institution/reports"
          />
          <StatCard label="Certificates issued" value={stats.certificates.active} icon={<Award aria-hidden="true" />} hint={`${stats.certificates.issuedLast30Days} in the last 30 days`} href="/institution/certificates" />
          <StatCard
            label="Learners placed"
            value={rates.placements.placedLearners}
            icon={<Briefcase aria-hidden="true" />}
            hint={`${rates.placements.verifiedLearners} verified by Venkat Sai · ${stats.upcomingDrives} upcoming campus drive${stats.upcomingDrives === 1 ? "" : "s"}`}
            href="/institution/placements"
          />
        </StatGrid>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SectionCard title="Upcoming batches" action={{ label: "All batches", href: "/institution/batches" }} flush>
          {stats.upcomingBatches.length ? (
            <ul className="divide-y divide-border">
              {stats.upcomingBatches.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/institution/batches/${b.id}`}
                    className="flex flex-col gap-2 px-5 py-4 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-ring sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">{b.title}</span>
                      <span className="block text-sm text-muted-foreground">
                        {b.code} · starts {b.startsOn ? <DateText value={b.startsOn} dateOnly /> : "date to be set"}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{b.capacity ? `${b.enrolledCount} of ${b.capacity} seats` : `${b.enrolledCount} enrolled`}</span>
                      <StatusBadge tone={batchStatus(b.status).tone} size="sm">
                        {batchStatus(b.status).label}
                      </StatusBadge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState
                size="sm"
                variant="plain"
                title="No upcoming batches"
                description="Schedule a batch of a published course to start taking enrolments."
                primaryAction={canCourses ? { label: "Schedule a batch", href: "/institution/batches/new" } : undefined}
              />
            </div>
          )}
        </SectionCard>

        <SectionCard title="Certificate issuing">
          <div className="space-y-3 text-sm">
            <StatusBadge tone={verified ? "success" : "neutral"} size="sm">
              {verified ? "Verified institution" : "Not verified yet"}
            </StatusBadge>
            <p className="text-muted-foreground">
              {verified ? "You can issue certificates of completion for completed enrolments in your own courses." : "Certificates can be issued once Venkat Sai verifies your institution."}
            </p>
            <p className="text-muted-foreground">
              {stats.isAuthorisedCertificateIssuer
                ? "Venkat Sai has authorised you to issue accredited certificates under your external awarding body."
                : "Accredited certificates need a certificate-issuer authorisation from Venkat Sai, granted after your accreditation is checked."}
            </p>
            <Link href="/institution/profile#issuer" className="inline-block font-medium text-teal-strong underline-offset-4 hover:underline">
              View authorisation details
            </Link>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
