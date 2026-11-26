import { Bell, Briefcase, CalendarCheck, CalendarClock, ClipboardList, GraduationCap, Megaphone, MessageSquare, Search, ShieldCheck, Sparkles, UserCircle } from "lucide-react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { DashboardHeader, GettingStarted, HowToUse, QuickActions, RecentList, StatGrid, StatTile, type DashboardAction, type QuickActionItem, type RecentItem } from "@/components/dashboard";
import { ChartCard } from "@/components/dashboard/chart-card";
import { intlLocale } from "@/components/jobs/labels";
import { loadPosterPage } from "@/components/public/requirements/data";
import { Callout } from "@/components/shared/callout";
import { StatusBadge } from "@/components/shared/status-badge";
import type { Tone } from "@/components/shared/tones";
import type { SlotBookingStatus } from "@/db/schema/bookings";
import { getLocale, getT } from "@/i18n/server";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { logger } from "@/lib/logger";
import { getCandidateDashboardSummary } from "@/modules/candidates/queries";
import { getRecommendedJobs } from "@/modules/jobs/recommendations";
import { listNotifications } from "@/modules/notifications/queries";
import { listThreads, unreadThreadCount } from "@/modules/operations/queries";
import { listApplicationsForCandidate, listInterviewsForCandidate } from "@/modules/recruitment/queries";
import { asCandidate } from "@/modules/recruitment/service";
import { listCandidateEnrolments } from "@/modules/training/queries";

import { DocumentsCard } from "../_components/documents-card";
import { JourneyCard } from "../_components/journey-card";
import { buildTalentChecklist, monthSeries, postersForTrades, talentActionsFor } from "../_lib/dashboard";
import { countOwnApplicationsByMonth, listCategoryNames, listLinkedCvSubmissions, listOwnBookings, listOwnDocumentReminders, type DocumentReminder } from "../_lib/dashboard-queries";
import { requireOnboardedCandidate } from "../_lib/guard";
import { countOwnApplicationsByStatus } from "../applications/_lib/queries";
import { stageLabel, stageTone } from "../applications/_lib/stage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("common");
  return { title: t("nav.dashboard") };
}

/**
 * Load one dashboard block; a failing block shows its empty state instead of breaking the page. Next's own signals
 * (redirect, not found, dynamic rendering) keep propagating. Only the error name and database code are logged: a
 * failed query's message carries its parameters (the phone number, ids), which must not reach the logs.
 */
async function safe<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    unstable_rethrow(error);
    const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
    logger.warn("Talent dashboard block failed", { block: label, errorName: error instanceof Error ? error.name : typeof error, code: typeof cause?.code === "string" ? cause.code : undefined });
    return fallback;
  }
}

const FIRST_PAGE = (pageSize: number) => ({ page: 1, pageSize, offset: 0 });

const BOOKING_TONE: Record<SlotBookingStatus, Tone> = { booked: "info", attended: "success", no_show: "warning", cancelled: "neutral" };
const ENROLMENT_TONE: Record<string, Tone> = {
  applied: "info",
  confirmed: "success",
  waitlisted: "warning",
  in_progress: "brand",
  completed: "success",
  rejected: "neutral",
  dropped: "neutral",
  cancelled: "neutral",
};

/** Only same-site paths become links (notification links are system-made; this keeps them inside the site). */
function internalHref(link: string | null | undefined): string | null {
  return link && link.startsWith("/") && !link.startsWith("//") && !link.startsWith("/\\") ? link : null;
}

/** "HH:MM" (venue clock) in the viewer's language, e.g. "9:30 am". */
function formatSlotTime(hhmm: string, locale: string): string {
  const d = new Date(`1970-01-01T${hhmm}:00Z`);
  if (Number.isNaN(d.getTime())) return hhmm;
  return new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: "UTC" }).format(d);
}

/** Today's calendar date (YYYY-MM-DD) in the viewer's time zone. */
function todayIn(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata" }).format(now);
  }
}

/**
 * People Portal home for job seekers: a greeting, real counts, every main button, the profile checklist, the CV desk
 * journey (website CVs linked by verified phone number), requirement posters and jobs for the candidate's trade,
 * applications (with a 6-month chart), trade test bookings, training, document and passport reminders, messages and
 * notifications. Live data only; every block fails soft and has an honest empty state with a next step. Minors (who
 * reach this page only with a guardian consent) see the consent state and no overseas recruitment blocks.
 */
export default async function TalentDashboardPage() {
  const session = await requireOnboardedCandidate();
  const { user, candidate, gate } = session;
  const minor = gate.minor;
  const actor = asCandidate(session);
  const [t, tt, locale] = await Promise.all([getT("talent-dashboard"), getT("talent-training"), getLocale()]);
  const timeZone = user.timezone ?? env().DEFAULT_TIMEZONE;
  const loc = intlLocale(locale);
  const now = new Date();
  const today = todayIn(now, timeZone);
  const phoneVerified = Boolean(user.phone && user.phoneVerifiedAt);

  const [summary, statusCounts, recentApps, interviews, appMonths, cvs, bookings, enrolments, reminders, recommended, posterPage, categoryNames, threads, unreadThreads, notifications] =
    await Promise.all([
      safe("summary", () => getCandidateDashboardSummary(session, { hints: 50 }), null),
      safe("statusCounts", () => countOwnApplicationsByStatus(candidate.id), {} as Record<string, number>),
      safe("recentApps", () => listApplicationsForCandidate(actor, {}, FIRST_PAGE(5)), null),
      safe("interviews", () => listInterviewsForCandidate(actor, { upcomingOnly: true }), []),
      safe("appMonths", () => countOwnApplicationsByMonth(candidate.id, { months: 6, now }), []),
      minor ? Promise.resolve([]) : safe("cvs", () => listLinkedCvSubmissions(user, 3), []),
      safe("bookings", () => listOwnBookings(user, { limit: 4, today }), { items: [], upcoming: 0 }),
      safe("enrolments", () => listCandidateEnrolments({ userId: user.id, candidateId: candidate.id, displayName: user.displayName }), []),
      safe("reminders", () => listOwnDocumentReminders(candidate, today), [] as DocumentReminder[]),
      safe("recommended", () => getRecommendedJobs(candidate.id, { kind: "self", user, candidate }, { limit: 4 }), []),
      minor ? Promise.resolve(null) : safe("posters", () => loadPosterPage({ page: 1, pageSize: 24 }), null),
      minor ? Promise.resolve([] as string[]) : safe("categories", () => listCategoryNames(candidate.preferredCategoryIds), [] as string[]),
      safe("threads", () => listThreads({ kind: "user", user }, {}, FIRST_PAGE(4)), null),
      safe("unreadThreads", () => unreadThreadCount({ kind: "user", user }), 0),
      safe("notifications", () => listNotifications(user.id, { filter: "all" }, FIRST_PAGE(5)), null),
    ]);

  // ---- numbers -------------------------------------------------------------
  const upcomingInterviews = interviews.filter((i) => i.status === "scheduled" || i.status === "rescheduled");
  const openHints = new Set<string>(summary?.nextActions.map((a) => a.key) ?? []);
  const checklist = buildTalentChecklist({ openHints, passportStatus: candidate.passportStatus, phoneVerified, minor });
  const documentAttention = reminders.length + (summary?.documents.rejected ?? 0);

  // ---- header --------------------------------------------------------------
  const headerActions: DashboardAction[] = minor
    ? [
        { label: t("home.headerAction.findJobs"), href: "/talent/jobs", icon: Search },
        { label: t("home.headerAction.training"), href: "/talent/training/courses", icon: GraduationCap },
        { label: t("home.headerAction.profile"), href: "/talent/profile", icon: UserCircle },
      ]
    : [
        { label: t("home.headerAction.findJobs"), href: "/talent/jobs", icon: Search },
        { label: t("home.headerAction.sendCv"), href: "/send-cv" },
        { label: t("home.headerAction.requirements"), href: "/requirements" },
      ];

  // ---- quick actions (every main button; adult-only ones hidden for minors) ----
  const quickActions: QuickActionItem[] = talentActionsFor({ minor }).map((a) => ({
    label: t(`home.action.${a.key}`),
    hint: t(`home.action.${a.key}.hint`),
    href: a.href,
    icon: a.icon,
    ...(a.key === "messages" ? { badge: unreadThreads, badgeLabel: t("home.badge.unread") } : {}),
    ...(a.key === "documents" ? { badge: documentAttention, badgeLabel: t("home.badge.attention") } : {}),
  }));

  // ---- lists ---------------------------------------------------------------
  const posters = postersForTrades(posterPage?.items ?? [], [...candidate.preferredRoles, ...categoryNames, candidate.headline, candidate.currentJobTitle], 4);
  const posterItems: RecentItem[] = posters.items.map((p) => ({
    id: p.id,
    title: p.title,
    meta: [p.countryName, p.trades.map((x) => x.trade).slice(0, 3).join(", ") || null, p.applyBy ? t("home.requirements.applyBy", { date: formatDate(p.applyBy, { timeZone: "UTC", locale: loc }) }) : null]
      .filter(Boolean)
      .join(" · "),
    href: p.href,
    at: p.publishedAt,
  }));

  const jobItems: RecentItem[] = recommended.map(({ job }) => ({
    id: job.id,
    title: job.title,
    meta: [job.employer.name, [job.location.city, job.location.countryName].filter(Boolean).join(", ") || null].filter(Boolean).join(" · "),
    href: `/talent/jobs/${job.slug}`,
    at: job.publishedAt,
  }));

  const applicationItems: RecentItem[] = (recentApps?.items ?? []).map((app) => ({
    id: app.id,
    title: app.job.title,
    meta: app.job.employerName,
    href: `/talent/applications/${app.id}`,
    at: app.lastStageChangedAt,
    status: { label: stageLabel(app.stage, locale), tone: stageTone(app.stage) },
  }));

  const bookingItems: RecentItem[] = bookings.items.map((b) => ({
    id: b.id,
    title: `${t(`home.bookings.kind.${b.slot.kind}`)}: ${b.slot.title}`,
    meta: [t("home.bookings.when", { date: formatDate(b.slot.date, { timeZone: "UTC", locale: loc }), time: formatSlotTime(b.slot.startTime, loc) }), b.slot.venue].join(" · "),
    href: `/book/${encodeURIComponent(b.slot.code)}`,
    status: { label: t(`home.bookings.status.${b.status}`), tone: BOOKING_TONE[b.status] },
  }));

  const enrolmentItems: RecentItem[] = enrolments.slice(0, 4).map((e) => ({
    id: e.id,
    title: e.course.title,
    meta: [e.batch.title, e.batch.startsOn ? formatDate(e.batch.startsOn, { timeZone: "UTC", locale: loc }) : null].filter(Boolean).join(" · "),
    href: `/talent/training/enrolments/${e.id}`,
    at: e.appliedAt,
    status: { label: tt(`enrolmentStatus.${e.status}`), tone: ENROLMENT_TONE[e.status] ?? "neutral" },
  }));

  const threadItems: RecentItem[] = (threads?.items ?? []).map((th) => ({
    id: th.id,
    title: th.subject,
    meta: th.unreadCount > 0 ? t("home.messages.unread", { count: th.unreadCount }) : null,
    href: `/talent/messages/${th.id}`,
    at: th.lastMessageAt ?? th.createdAt,
    status: th.unreadCount > 0 ? { label: t("home.messages.new"), tone: "brand" } : null,
  }));

  const notificationItems: RecentItem[] = (notifications?.items ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    meta: n.body,
    href: internalHref(n.link),
    at: n.createdAt,
    status: n.readAt ? null : { label: t("home.notifications.new"), tone: "brand" },
  }));

  const chartData = monthSeries(appMonths, { months: 6, now, locale: loc, timeZone });
  const showChecklist = checklist.some((c) => !c.done);
  const bookingsCard = (
    <div id="my-tests" className="scroll-mt-24">
      <RecentList
        title={t("home.bookings.title")}
        icon={CalendarCheck}
        items={bookingItems}
        limit={4}
        viewAll={minor ? undefined : { label: t("home.bookings.bookAnother"), href: "/book?kind=trade_test" }}
        empty={{
          title: t("home.bookings.empty"),
          description: t("home.bookings.emptyDescription"),
          action: minor ? undefined : { label: t("home.bookings.book"), href: "/book?kind=trade_test" },
          icon: CalendarCheck,
        }}
      />
    </div>
  );
  const trainingCard = (
    <RecentList
      title={t("home.training.title")}
      icon={GraduationCap}
      items={enrolmentItems}
      limit={4}
      viewAll={{ label: t("viewAll"), href: "/talent/training" }}
      empty={{ title: t("home.training.empty"), description: t("home.training.emptyDescription"), action: { label: t("home.training.browse"), href: "/talent/training/courses" }, icon: GraduationCap }}
    />
  );
  // Children have no CV journey: their documents card takes its place beside "How to use", so no column is left empty.
  const howToUse = <HowToUse portal="talent" title={t("home.howToUse.title")} description={t("home.howToUse.description")} />;
  const documentsCard = (
    <DocumentsCard
      reminders={reminders}
      counts={summary ? summary.documents : null}
      askPassportExpiry={!minor && !candidate.passportExpiry}
      today={today}
      formatIsoDate={(iso) => formatDate(iso, { timeZone: "UTC", locale: loc })}
      labels={{
        title: t("home.documents.title"),
        manage: t("viewAll"),
        allGood: t("home.documents.allGood"),
        allGoodDescription: t("home.documents.allGoodDescription"),
        noPassport: t("home.documents.noPassport"),
        expired: (date) => t("home.documents.expired", { date }),
        soon: (date) => t("home.documents.soon", { date }),
        daysLeft: (count) => t("home.documents.daysLeft", { count }),
        update: t("home.documents.update"),
        rejected: (count) => t("home.documents.rejected", { count }),
        pending: (count) => t("home.documents.pending", { count }),
        verified: (count) => t("home.documents.verified", { count }),
        name: (r) => (r.kind === "passport" ? t("home.docType.passport") : (r.title ?? t(`home.docType.${r.type ?? "other"}`))),
      }}
    />
  );

  return (
    <div className="space-y-8">
      <DashboardHeader name={user.displayName} eyebrow={t("home.eyebrow")} subtitle={t("home.subtitle")} actions={headerActions} timeZone={timeZone} now={now}>
        <StatusBadge tone="success" size="sm" icon={<ShieldCheck aria-hidden="true" />}>
          {t("home.free")}
        </StatusBadge>
        {summary ? (
          <StatusBadge tone={summary.verificationLevel === "none" ? "neutral" : "info"} size="sm">
            {t(`verificationLevel.${summary.verificationLevel}`)}
          </StatusBadge>
        ) : null}
        {minor ? (
          <StatusBadge tone="brand" size="sm">
            {t("home.minorConsent")}
          </StatusBadge>
        ) : null}
      </DashboardHeader>

      {minor ? (
        <Callout tone="info" title={t("home.minorConsent")}>
          {t("home.minorNote")}
        </Callout>
      ) : null}

      <StatGrid label={t("home.stats.label")}>
        <StatTile
          label={t("home.stats.profile")}
          value={summary?.profileCompleteness ?? null}
          unit="%"
          hint={summary && summary.profileCompleteness < 100 ? t("home.stats.profileHint") : undefined}
          tone={summary?.profileCompleteness === 100 ? "positive" : "default"}
          href="/talent/profile"
          icon={UserCircle}
        />
        <StatTile label={t("home.stats.applications")} value={statusCounts.active ?? 0} hint={t("home.stats.applicationsHint")} href="/talent/applications" icon={ClipboardList} />
        <StatTile
          label={t("home.stats.interviews")}
          value={upcomingInterviews.length + bookings.upcoming}
          hint={t("home.stats.interviewsHint")}
          href={upcomingInterviews.length > 0 || bookings.upcoming === 0 ? "/talent/interviews" : "#my-tests"}
          icon={CalendarClock}
        />
        <StatTile
          label={t("home.stats.messages")}
          value={unreadThreads}
          hint={t("home.stats.messagesHint")}
          tone="attention"
          attentionLabel={t("home.stats.new")}
          href="/talent/messages"
          icon={MessageSquare}
        />
      </StatGrid>

      <QuickActions title={t("home.actions.title")} description={t("home.actions.description")} items={quickActions} />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {showChecklist ? (
            <GettingStarted
              title={t("home.checklist.title")}
              description={t("home.checklist.description", { done: checklist.filter((c) => c.done).length, total: checklist.length })}
              items={checklist.map((c) => ({ id: c.key, label: t(`home.checklist.${c.key}`), description: t(`home.checklist.${c.key}.hint`), done: c.done, href: c.href }))}
            />
          ) : null}
          {minor ? (
            documentsCard
          ) : (
            <JourneyCard
              submissions={cvs}
              phoneVerified={phoneVerified}
              formatDate={(d) => formatDate(d, { timeZone, locale: loc })}
              labels={{
                title: t("home.journey.title"),
                description: t("home.journey.description"),
                stage: (s) => t(`home.stage.${s}`),
                reference: (code) => t("home.journey.reference", { code }),
                forTitle: (title) => t("home.journey.for", { title }),
                updated: (date) => t("home.journey.updated", { date }),
                step: (current, total) => t("home.journey.step", { current, total }),
                note: t("home.journey.note"),
                onHold: t("home.journey.onHold"),
                notSuitable: t("home.journey.notSuitable"),
                others: (count) => t("home.journey.others", { count }),
                check: t("home.journey.check"),
                update: t("home.journey.update"),
                emptyTitle: t("home.journey.emptyTitle"),
                emptyDescription: t("home.journey.emptyDescription"),
                verifyHint: t("home.journey.verifyHint"),
                verify: t("home.journey.verify"),
              }}
            />
          )}
        </div>
        <div className="space-y-6">
          {howToUse}
          {minor ? null : documentsCard}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {minor ? null : (
          <RecentList
            title={posters.matched ? t("home.requirements.title") : t("home.requirements.latestTitle")}
            description={t("home.requirements.description")}
            icon={Megaphone}
            items={posterItems}
            limit={4}
            viewAll={{ label: t("home.requirements.viewAll"), href: "/requirements" }}
            empty={{ title: t("home.requirements.empty"), description: t("home.requirements.emptyDescription"), action: { label: t("home.requirements.alerts"), href: "/talent/alerts" }, icon: Megaphone }}
          />
        )}
        <RecentList
          title={t("home.jobs.title")}
          description={t("home.jobs.description")}
          icon={Sparkles}
          items={jobItems}
          limit={4}
          viewAll={{ label: t("home.jobs.viewAll"), href: "/talent/jobs" }}
          empty={{ title: t("recommended.empty"), description: t("recommended.emptyDescription"), action: { label: t("action.editProfile"), href: "/talent/profile" }, icon: Briefcase }}
        />
        {minor ? trainingCard : null}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <RecentList
          className="lg:col-span-2"
          title={t("home.applications.title")}
          icon={ClipboardList}
          items={applicationItems}
          limit={5}
          viewAll={{ label: t("viewAll"), href: "/talent/applications" }}
          empty={{ title: t("home.applications.empty"), description: t("home.applications.emptyDescription"), action: { label: t("action.findJobs"), href: "/talent/jobs" }, icon: ClipboardList }}
        />
        <ChartCard
          title={t("home.chart.title")}
          description={t("home.chart.description")}
          data={chartData}
          unit={t("home.chart.unit")}
          link={{ label: t("viewAll"), href: "/talent/applications" }}
          emptyTitle={t("home.chart.emptyTitle")}
          emptyDescription={t("home.chart.emptyDescription")}
        />
      </div>

      {minor ? (
        // Trade tests are for jobs abroad: a child only sees bookings made earlier (for training), never an invite.
        bookingItems.length > 0 ? bookingsCard : null
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {bookingsCard}
          {trainingCard}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <RecentList
          title={t("home.messages.title")}
          icon={MessageSquare}
          items={threadItems}
          limit={4}
          viewAll={{ label: t("viewAll"), href: "/talent/messages" }}
          empty={{ title: t("home.messages.empty"), description: t("home.messages.emptyDescription"), action: { label: t("home.messages.ask"), href: "/talent/support/new" }, icon: MessageSquare }}
        />
        <RecentList
          title={t("home.notifications.title")}
          icon={Bell}
          items={notificationItems}
          limit={5}
          viewAll={{ label: t("viewAll"), href: "/talent/notifications" }}
          empty={{ title: t("home.notifications.empty"), description: t("home.notifications.emptyDescription"), icon: Bell }}
        />
      </div>
    </div>
  );
}
