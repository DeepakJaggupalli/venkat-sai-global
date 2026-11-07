import { ArrowRight, Award, Bell, Bookmark, BookOpen, CalendarClock, ClipboardList, LifeBuoy, ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { JobCardView } from "@/components/jobs/job-card";
import { intlLocale } from "@/components/jobs/labels";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ProgressRing } from "@/components/shared/progress-ring";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { getLocale, getT } from "@/i18n/server";
import { env } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/format";
import { logger } from "@/lib/logger";
import { getCandidateDashboardSummary } from "@/modules/candidates/queries";
import { getRecommendedJobs } from "@/modules/jobs/recommendations";
import { listSavedJobs } from "@/modules/jobs/saved-alerts-service";
import { listNotifications, unreadCount } from "@/modules/notifications/queries";
import { listMyTickets } from "@/modules/operations/support-queries";
import { listApplicationsForCandidate, listInterviewsForCandidate } from "@/modules/recruitment/queries";
import { asCandidate } from "@/modules/recruitment/service";
import { listCandidateCertificates } from "@/modules/training/certificates";
import { listPublicCourses } from "@/modules/training/queries";

import { countOwnApplicationsByStatus, countOwnSkills } from "./applications/_lib/queries";
import { stageLabel, stageTone } from "./applications/_lib/stage";
import { requireOnboardedCandidate } from "./_lib/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("common");
  return { title: t("nav.dashboard") };
}

/** Load one dashboard block; a failing block shows its empty state instead of breaking the page. */
async function safe<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    logger.warn("Talent dashboard block failed", { block: label, error });
    return fallback;
  }
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

function MiniList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul className="divide-y" aria-label={label}>
      {children}
    </ul>
  );
}

const FIRST_PAGE = (pageSize: number) => ({ page: 1, pageSize, offset: 0 });
const STATUS_ORDER = ["active", "hired", "rejected", "withdrawn", "closed"] as const;

/**
 * People Portal home (spec 8.6): profile completion with next best actions, recommended jobs with reasons,
 * saved jobs, applications by status, upcoming interviews, training with open seats, certificates, skill
 * verification, notifications and open support requests. Live data only; every block has an honest empty state.
 */
export default async function TalentDashboardPage() {
  const session = await requireOnboardedCandidate();
  const { user, candidate } = session;
  const actor = asCandidate(session);
  const [t, tj, locale] = await Promise.all([getT("talent-dashboard"), getT("talent-jobs"), getLocale()]);
  const timeZone = user.timezone ?? env().DEFAULT_TIMEZONE;
  const loc = intlLocale(locale);

  const [summary, recommended, saved, statusCounts, recentApps, interviews, courses, certificates, skills, notifications, unread, tickets] = await Promise.all([
    safe("summary", () => getCandidateDashboardSummary(session, { hints: 4 }), null),
    safe("recommended", () => getRecommendedJobs(candidate.id, { kind: "self", user, candidate }, { limit: 3 }), []),
    safe("saved", () => listSavedJobs(user, FIRST_PAGE(3), { candidateId: candidate.id }), null),
    safe("statusCounts", () => countOwnApplicationsByStatus(candidate.id), {} as Record<string, number>),
    safe("recentApps", () => listApplicationsForCandidate(actor, { status: "open" }, FIRST_PAGE(4)), null),
    safe("interviews", () => listInterviewsForCandidate(actor, { upcomingOnly: true }), []),
    safe("courses", () => listPublicCourses({ openBatchesOnly: true }, FIRST_PAGE(3)), null),
    safe("certificates", () => listCandidateCertificates({ userId: user.id, candidateId: candidate.id, displayName: user.displayName }), []),
    safe("skills", () => countOwnSkills(candidate.id), { total: 0, verified: 0 }),
    safe("notifications", () => listNotifications(user.id, { filter: "all" }, FIRST_PAGE(4)), null),
    safe("unread", () => unreadCount(user.id), 0),
    safe("tickets", () => listMyTickets(user, { status: "open" }, FIRST_PAGE(3)), null),
  ]);

  const upcoming = interviews
    .filter((i) => i.status === "scheduled" || i.status === "rescheduled")
    .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime())
    .slice(0, 3);
  const activeCertificates = certificates.filter((c) => c.status === "active");
  const totalApplications = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const statusRows = STATUS_ORDER.filter((s) => (statusCounts[s] ?? 0) > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("welcome", { name: firstName(user.displayName) })}
        description={t("subtitle")}
        actions={[
          { label: t("action.findJobs"), href: "/talent/jobs" },
          { label: t("action.editProfile"), href: "/talent/profile", variant: "outline" },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <SectionCard title={t("profile.title")} headingLevel="h2" icon={<Sparkles aria-hidden="true" />}>
          {summary ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <ProgressRing value={summary.profileCompleteness} label={t("profile.completeness")} size="lg" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{summary.profileCompleteness >= 100 ? t("profile.complete") : t("profile.percent", { value: summary.profileCompleteness })}</p>
                  <p className="text-muted-foreground">{t("profile.why")}</p>
                </div>
              </div>
              {summary.nextActions.length ? (
                <div>
                  <p className="text-sm font-semibold">{t("profile.nextSteps")}</p>
                  <ul className="mt-2 space-y-2">
                    {summary.nextActions.map((a) => {
                      const key = `next.${a.key}`;
                      const label = t(key) === key ? a.label : t(key);
                      return (
                        <li key={a.key}>
                          <Link href={a.href} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:border-teal/60 focus-visible:border-teal">
                            <span>{label}</span>
                            {a.points > 0 ? (
                              <span className="shrink-0 text-xs font-medium text-teal-strong">{t("profile.points", { count: a.points })}</span>
                            ) : (
                              <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {t("profile.visibility")}: <span className="font-medium text-foreground">{t(`visibility.${summary.visibility}`)}</span> ·{" "}
                <Link href="/talent/privacy" className="text-teal-strong underline underline-offset-2">
                  {t("profile.manageVisibility")}
                </Link>
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
          )}
        </SectionCard>

        <div className="space-y-6">
          <StatGrid columns={4}>
            <StatCard label={t("stats.openApplications")} value={statusCounts.active ?? 0} href="/talent/applications" icon={<ClipboardList aria-hidden="true" />} locale={loc} />
            <StatCard label={t("stats.upcomingInterviews")} value={upcoming.length} href="/talent/interviews" icon={<CalendarClock aria-hidden="true" />} locale={loc} />
            <StatCard label={t("stats.savedJobs")} value={saved?.total ?? null} href="/talent/saved" icon={<Bookmark aria-hidden="true" />} locale={loc} />
            <StatCard label={t("stats.unread")} value={unread} href="/talent/notifications" icon={<Bell aria-hidden="true" />} locale={loc} />
          </StatGrid>

          <SectionCard title={t("interviews.title")} headingLevel="h2" icon={<CalendarClock aria-hidden="true" />} action={upcoming.length ? { label: t("viewAll"), href: "/talent/interviews" } : undefined}>
            {upcoming.length ? (
              <MiniList label={t("interviews.title")}>
                {upcoming.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {i.roundName} · {i.jobTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(i.scheduledStart, { timeZone, locale: loc })} · {i.employerName}
                      </p>
                    </div>
                    {i.canRespond && i.candidateResponse === "pending" ? (
                      <Link href="/talent/interviews" className="text-sm font-medium text-teal-strong underline-offset-2 hover:underline">
                        {t("interviews.respond")}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </MiniList>
            ) : (
              <EmptyState size="sm" variant="plain" title={t("interviews.empty")} description={t("interviews.emptyDescription")} />
            )}
          </SectionCard>
        </div>
      </div>

      <SectionCard title={t("recommended.title")} description={t("recommended.description")} headingLevel="h2" icon={<Sparkles aria-hidden="true" />} action={{ label: t("recommended.more"), href: "/talent/jobs" }}>
        {recommended.length ? (
          <ul className="grid gap-3 lg:grid-cols-3">
            {recommended.map(({ job, reasons }) => (
              <li key={job.id} className="flex">
                <JobCardView job={job} t={tj} locale={locale} href={`/talent/jobs/${job.slug}`} viewer={{ signedIn: true, returnTo: "/talent" }} reasons={reasons} className="w-full" />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            size="sm"
            variant="plain"
            title={t("recommended.empty")}
            description={t("recommended.emptyDescription")}
            primaryAction={{ label: t("action.editProfile"), href: "/talent/profile" }}
            secondaryAction={{ label: t("action.findJobs"), href: "/talent/jobs" }}
          />
        )}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={t("applications.title")} headingLevel="h2" icon={<ClipboardList aria-hidden="true" />} action={totalApplications ? { label: t("viewAll"), href: "/talent/applications" } : undefined}>
          {totalApplications ? (
            <div className="space-y-4">
              <ul className="flex flex-wrap gap-2" aria-label={t("applications.byStatus")}>
                {statusRows.map((s) => (
                  <li key={s}>
                    <StatusBadge tone={s === "active" ? "info" : s === "hired" ? "success" : "neutral"} size="sm">
                      {t(`applications.status.${s}`)}: {statusCounts[s]}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
              {recentApps?.items.length ? (
                <MiniList label={t("applications.recent")}>
                  {recentApps.items.map((app) => (
                    <li key={app.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <Link href={`/talent/applications/${app.id}`} className="text-sm font-medium underline-offset-2 hover:underline">
                          {app.job.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">{app.job.employerName}</p>
                      </div>
                      <StatusBadge tone={stageTone(app.stage)} size="sm">
                        {stageLabel(app.stage, locale)}
                      </StatusBadge>
                    </li>
                  ))}
                </MiniList>
              ) : null}
            </div>
          ) : (
            <EmptyState size="sm" variant="plain" title={t("applications.empty")} description={t("applications.emptyDescription")} primaryAction={{ label: t("action.findJobs"), href: "/talent/jobs" }} />
          )}
        </SectionCard>

        <SectionCard title={t("saved.title")} headingLevel="h2" icon={<Bookmark aria-hidden="true" />} action={saved?.total ? { label: t("viewAll"), href: "/talent/saved" } : undefined}>
          {saved?.items.length ? (
            <MiniList label={t("saved.title")}>
              {saved.items.map((job) => (
                <li key={job.id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link href={`/talent/jobs/${job.slug}`} className="text-sm font-medium underline-offset-2 hover:underline">
                    {job.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {job.employer.name}
                    {job.closesAt ? ` · ${t("saved.closes", { date: formatDate(job.closesAt, { timeZone, locale: loc }) })}` : ""}
                  </p>
                </li>
              ))}
            </MiniList>
          ) : (
            <EmptyState size="sm" variant="plain" title={t("saved.empty")} description={t("saved.emptyDescription")} primaryAction={{ label: t("action.findJobs"), href: "/talent/jobs" }} />
          )}
        </SectionCard>

        <SectionCard title={t("training.title")} description={t("training.description")} headingLevel="h2" icon={<BookOpen aria-hidden="true" />} action={{ label: t("training.browse"), href: "/talent/training" }}>
          {courses?.items.length ? (
            <MiniList label={t("training.title")}>
              {courses.items.map((course) => (
                <li key={course.id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link href={`/training/${course.slug}`} className="text-sm font-medium underline-offset-2 hover:underline">
                    {course.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {course.provider.name}
                    {course.nextBatch?.startsOn ? ` · ${t("training.starts", { date: formatDate(course.nextBatch.startsOn, { timeZone: "UTC", locale: loc }) })}` : ""}
                  </p>
                </li>
              ))}
            </MiniList>
          ) : (
            <EmptyState size="sm" variant="plain" title={t("training.empty")} description={t("training.emptyDescription")} />
          )}
        </SectionCard>

        <SectionCard title={t("credentials.title")} headingLevel="h2" icon={<Award aria-hidden="true" />} action={{ label: t("credentials.viewCertificates"), href: "/talent/certificates" }}>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <ProgressRing value={skills.total ? Math.round((skills.verified / skills.total) * 100) : 0} label={t("credentials.skillsVerified")} size="md" tone="success" />
              <div className="text-sm">
                <p className="font-medium">{skills.total ? t("credentials.skillsCount", { verified: skills.verified, total: skills.total }) : t("credentials.noSkills")}</p>
                <Link href="/talent/assessments" className="text-teal-strong underline underline-offset-2">
                  {t("credentials.getAssessed")}
                </Link>
              </div>
            </div>
            {summary ? (
              <p className="flex items-center gap-1.5 text-sm">
                <ShieldCheck aria-hidden="true" className="size-4 text-teal-strong" />
                {t("credentials.level")}: <span className="font-medium">{t(`verificationLevel.${summary.verificationLevel}`)}</span>
              </p>
            ) : null}
            {activeCertificates.length ? (
              <MiniList label={t("credentials.certificates")}>
                {activeCertificates.slice(0, 3).map((c) => (
                  <li key={c.id} className="py-2 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.issuerTypeLabel} · {formatDate(c.issuedAt, { timeZone, locale: loc })}
                    </p>
                  </li>
                ))}
              </MiniList>
            ) : (
              <p className="text-sm text-muted-foreground">{t("credentials.noCertificates")}</p>
            )}
          </div>
        </SectionCard>

        <SectionCard title={t("notifications.title")} headingLevel="h2" icon={<Bell aria-hidden="true" />} action={{ label: t("viewAll"), href: "/talent/notifications" }}>
          {notifications?.items.length ? (
            <MiniList label={t("notifications.title")}>
              {notifications.items.map((n) => (
                <li key={n.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-2">
                    <span aria-hidden="true" className={n.readAt ? "mt-1.5 size-2 shrink-0 rounded-full" : "mt-1.5 size-2 shrink-0 rounded-full bg-teal"} />
                    <div className="min-w-0">
                      {!n.readAt ? <span className="sr-only">{t("notifications.unread")}: </span> : null}
                      {n.link ? (
                        <Link href={n.link} className="text-sm font-medium underline-offset-2 hover:underline">
                          {n.title}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium">{n.title}</span>
                      )}
                      <p className="text-xs text-muted-foreground">{formatDateTime(n.createdAt, { timeZone, locale: loc })}</p>
                    </div>
                  </div>
                </li>
              ))}
            </MiniList>
          ) : (
            <EmptyState size="sm" variant="plain" title={t("notifications.empty")} />
          )}
        </SectionCard>

        <SectionCard title={t("support.title")} headingLevel="h2" icon={<LifeBuoy aria-hidden="true" />} action={{ label: t("support.get"), href: "/talent/support" }}>
          {tickets?.items.length ? (
            <MiniList label={t("support.title")}>
              {tickets.items.map((ticket) => (
                <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{ticket.subject}</p>
                    <p className="font-mono text-xs text-muted-foreground">{ticket.code}</p>
                  </div>
                  <StatusBadge status={ticket.status} domain="ticket" size="sm" />
                </li>
              ))}
            </MiniList>
          ) : (
            <EmptyState size="sm" variant="plain" title={t("support.empty")} description={t("support.emptyDescription")} />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
