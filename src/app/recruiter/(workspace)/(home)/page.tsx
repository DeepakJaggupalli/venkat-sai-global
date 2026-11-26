import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { BadgeCheck, BarChart3, Building2, CalendarClock, CircleCheck, ClipboardList, FileText, Inbox, UserPlus, Users, UsersRound, Wallet } from "lucide-react";

import { DashboardHeader, GettingStarted, HowToUse, QuickActions, RecentList, SectionCard, StatGrid, StatTile, type DashboardAction, type RecentItem } from "@/components/dashboard";
import { ChartCard } from "@/components/dashboard/chart-card";
import { AGREEMENT_STATUS, ASSIGNMENT_STATUS, INTERVIEW_RESPONSE, labelOf, SETTLEMENT_STATUS, SUBMISSION_STATUS } from "@/components/recruiter/labels";
import { Callout } from "@/components/shared/callout";
import { StatusBadge } from "@/components/shared/status-badge";
import type { Tone } from "@/components/shared/tones";
import { formatMoney } from "@/lib/format";
import { requireOrgMember } from "@/modules/identity/authz";

import { CHART_WEEKS, loadPartnerDashboard } from "../_lib/dashboard";
import { balanceColumns, daysFromToday, EMPTY_ROWS, expiringLicences, hiringFunnel, needsSetup, partnerQuickActions, partnerSetupChecklist, submissionStages, submitCandidateHref, summarizeSettlements, weeklySeries } from "../_lib/dashboard-model";
import { viewerTimeZone } from "../_lib/page-utils";

export const metadata: Metadata = { title: "Dashboard" };

const SHORT_DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function shortDate(isoDate: string | null): string {
  if (!isoDate) return "";
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : SHORT_DATE.format(d);
}

function dateTimeIn(value: Date | string, timeZone: string): string {
  const d = new Date(value);
  try {
    return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d);
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type DashboardCard = { key: string; rows: number; node: ReactNode };

const RESPONSE_TONE: Record<string, Tone> = { pending: "neutral", confirmed: "success", declined: "danger", reschedule_requested: "warning" };

export default async function RecruiterDashboardPage() {
  const ctx = await requireOrgMember("recruitment_partner");
  const can = (p: string) => ctx.permissions.has(p);
  const timeZone = viewerTimeZone(ctx);
  const org = ctx.organization;
  const now = new Date();
  const data = await loadPartnerDashboard(ctx, timeZone, now);
  const { assignments, submissions, interviews, documents, settlements, performance, overview, agreements, licences } = data;

  const verified = org.status === "verified";
  const pendingReview = submissions ? (submissions.byStatus.submitted ?? 0) + (submissions.byStatus.under_review ?? 0) : null;
  const submissionsMade = submissions ? Object.entries(submissions.byStatus).reduce((n, [status, count]) => (status === "withdrawn" ? n : n + count), 0) : 0;
  const money = settlements ? summarizeSettlements(settlements.totals) : null;
  const pendingAgreement = agreements?.find((a) => a.status === "pending") ?? null;
  const activeAgreement = agreements?.find((a) => a.status === "active") ?? null;
  const expiring = licences ? expiringLicences(licences, now) : [];
  const submitHref = submitCandidateHref(assignments?.recent, assignments?.counts.open);

  const actions = partnerQuickActions(
    ctx.permissions,
    {
      openRequirements: assignments?.counts.open,
      pendingReview,
      upcomingInterviews: interviews?.upcoming,
      documentsNeeded: documents?.openItems,
      settlementsAwaiting: money?.awaitingCount,
      unreadMessages: data.unreadMessages,
      pendingInvites: can("partner.team.manage") ? overview?.pendingInvitationCount : null,
    },
    submitHref,
  );

  const headerActions: DashboardAction[] = [];
  if (can("partner.candidates.submit")) headerActions.push({ label: "Submit a candidate", href: submitHref, icon: UserPlus });
  if (can("partner.requirements.view")) headerActions.push({ label: "Requirements", href: "/recruiter/requirements", icon: ClipboardList, variant: headerActions.length ? "secondary" : "primary" });
  if (!headerActions.length && can("partner.settlements.view")) headerActions.push({ label: "Settlements", href: "/recruiter/settlements", icon: Wallet });

  const checklist =
    can("partner.profile.manage") && overview
      ? partnerSetupChecklist({
          orgStatus: org.status,
          readinessIssueCodes: overview.readiness.issues.map((i) => i.code),
          agreementStatuses: (agreements ?? []).map((a) => a.status),
          memberCount: overview.memberCount,
          pendingInvites: overview.pendingInvitationCount,
          submissionsMade,
          canManageTeam: can("partner.team.manage"),
          canSubmit: can("partner.candidates.submit"),
        })
      : null;

  // ------------------------------------------------------------------ stat tiles
  const nextInterview = interviews?.next[0] ?? null;
  const tiles = [
    assignments ? (
      <StatTile
        key="requirements"
        label="Open requirements"
        value={assignments.counts.open}
        icon={ClipboardList}
        href="/recruiter/requirements"
        hint={
          assignments.counts.overdue > 0
            ? `${plural(assignments.counts.overdue, "is", "are")} past the due date`
            : assignments.counts.dueThisWeek > 0
              ? `${assignments.counts.dueThisWeek} due in the next 7 days`
              : assignments.counts.open > 0
                ? "Open for your submissions"
                : verified
                  ? "We tell you when one is assigned"
                  : "Assigned once you are verified"
        }
      />
    ) : null,
    submissions ? (
      <StatTile
        key="review"
        label="Waiting for our review"
        value={pendingReview}
        icon={Inbox}
        href="/recruiter/submissions"
        hint={(submissions.byStatus.duplicate ?? 0) > 0 ? `${submissions.byStatus.duplicate} held as possible duplicates` : "Submitted and under review"}
      />
    ) : null,
    interviews ? (
      <StatTile
        key="interviews"
        label="Upcoming interviews"
        value={interviews.upcoming}
        icon={CalendarClock}
        href="/recruiter/interviews"
        hint={nextInterview ? `Next: ${dateTimeIn(nextInterview.scheduledStart, nextInterview.timezone)}` : "None scheduled yet"}
      />
    ) : null,
    documents ? (
      <StatTile
        key="documents"
        label="Documents needed"
        value={documents.openItems}
        icon={FileText}
        tone="attention"
        href="/recruiter/documents"
        hint={
          documents.openItems > 0
            ? `For ${plural(documents.candidates, "candidate", "candidates")}${documents.rejectedItems ? ` · ${documents.rejectedItems} to upload again` : ""}`
            : "Nothing needed right now"
        }
      />
    ) : null,
    submissions ? (
      <StatTile
        key="accepted"
        label="Accepted by Venkat Sai"
        value={submissions.byStatus.accepted ?? 0}
        icon={CircleCheck}
        tone="positive"
        href="/recruiter/submissions?status=accepted"
        hint={submissionsMade > 0 ? `Of ${plural(submissionsMade, "submission", "submissions")}` : "No submissions yet"}
      />
    ) : null,
    performance ? (
      <StatTile key="joined" label="Candidates joined" value={performance.joined} icon={BadgeCheck} tone="positive" href="/recruiter/performance" hint={`${performance.placed} placed in total`} />
    ) : null,
    money ? (
      <StatTile
        key="settlements"
        label="Settlements awaiting payment"
        value={money.awaitingCount}
        icon={Wallet}
        href="/recruiter/settlements"
        hint={
          money.awaitingAmounts.length
            ? `${money.awaitingAmounts.join(" + ")} net`
            : money.paidAmounts.length
              ? `${money.paidAmounts.join(" + ")} paid so far`
              : money.disputedCount
                ? `${plural(money.disputedCount, "query", "queries")} open`
                : "No settlements yet"
        }
      />
    ) : null,
    can("partner.team.manage") && overview ? (
      <StatTile
        key="team"
        label="Team members"
        value={overview.memberCount}
        icon={UsersRound}
        href="/recruiter/team"
        hint={overview.pendingInvitationCount ? `${plural(overview.pendingInvitationCount, "invitation", "invitations")} pending` : "Invite your recruiters"}
      />
    ) : null,
  ].filter(Boolean);
  // Full rows on desktop: 5 tiles sit in one row, 6 in two rows of 3, 8 in two rows of 4.
  const tileColumns: 2 | 3 | 4 = tiles.length === 4 || tiles.length === 5 || tiles.length >= 7 ? 4 : tiles.length <= 2 ? 2 : 3;
  const tileGridClass = tiles.length === 5 ? "lg:grid-cols-5" : undefined;

  // ------------------------------------------------------------------ recent lists
  const today = new Date(`${data.todayIso}T00:00:00Z`);
  const requirementItems: RecentItem[] = (assignments?.recent ?? []).map((a) => {
    const d = daysFromToday(a.dueDate, today);
    const st = labelOf(ASSIGNMENT_STATUS, a.status);
    const used = a.submissionLimit !== null ? `${a.submissionsUsed} of ${a.submissionLimit} submitted` : `${a.submissionsUsed} submitted`;
    const place = a.job?.city ?? a.requirement?.locations ?? null;
    return {
      id: a.id,
      title: a.title || a.requirement?.title || "Requirement",
      meta: [used, place, a.dueDate ? `due ${shortDate(a.dueDate)}` : null].filter(Boolean).join(" · "),
      href: `/recruiter/requirements/${a.id}`,
      at: a.createdAt,
      status:
        d !== null && d < 0
          ? { label: "Past due date", tone: "danger" }
          : d !== null && d <= 7
            ? { label: d === 0 ? "Due today" : `${plural(d, "day", "days")} left`, tone: "warning" }
            : { label: st.label, tone: st.tone },
    };
  });

  const submissionItems: RecentItem[] = (submissions?.recent ?? []).map((s) => {
    const st = labelOf(SUBMISSION_STATUS, s.status);
    return {
      id: s.id,
      title: s.candidate.displayName,
      meta: [s.jobTitle ?? "Job to be decided", s.application ? `Stage: ${s.application.stageName}` : null].filter(Boolean).join(" · "),
      href: `/recruiter/submissions/${s.id}`,
      at: s.createdAt,
      status: { label: st.label, tone: st.tone },
    };
  });

  const interviewItems: RecentItem[] = (interviews?.next ?? []).map((i) => ({
    id: i.id,
    title: i.candidateName,
    meta: [i.jobTitle, i.roundName || `Round ${i.roundNumber}`, dateTimeIn(i.scheduledStart, i.timezone)].join(" · "),
    href: "/recruiter/interviews",
    at: i.scheduledStart,
    status: { label: INTERVIEW_RESPONSE[i.candidateResponse] ?? "Awaiting candidate reply", tone: RESPONSE_TONE[i.candidateResponse] ?? "neutral" },
  }));

  const documentItems: RecentItem[] = (documents?.items ?? []).slice(0, 5).map((m) => ({
    id: m.id,
    title: m.candidateName,
    meta: [m.jobTitle, m.destinationCountryCode, m.travelDate ? `travel ${shortDate(m.travelDate)}` : null].filter(Boolean).join(" · "),
    href: `/recruiter/documents/${m.placementId}`,
    status: m.rejectedItems > 0 ? { label: `${m.rejectedItems} to upload again`, tone: "danger" } : { label: `${m.openItems} needed`, tone: "warning" },
  }));

  const settlementItems: RecentItem[] = (settlements?.recent ?? []).map((s) => {
    const st = labelOf(SETTLEMENT_STATUS, s.status);
    return {
      id: s.id,
      title: `${s.code} · ${shortDate(s.periodStart)} to ${shortDate(s.periodEnd)}`,
      meta: `Net payable ${formatMoney(s.netPayableMinor, s.currency)}`,
      href: `/recruiter/settlements/${s.id}`,
      at: s.paidAt ?? s.approvedAt ?? s.createdAt,
      status: { label: st.label, tone: st.tone },
    };
  });

  const stages = submissions ? submissionStages(submissions.byStatus) : [];

  return (
    <div className="space-y-6 lg:space-y-8">
      <DashboardHeader name={ctx.user.displayName} eyebrow="Partner Portal" subtitle={`${ctx.role.name} · ${org.name}`} actions={headerActions} timeZone={timeZone}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Agency</span>
          <StatusBadge status={org.status} domain="organization" size="sm" />
          {activeAgreement ? (
            <StatusBadge tone="success" size="sm">
              Agreement in force
            </StatusBadge>
          ) : pendingAgreement ? (
            <StatusBadge tone="warning" size="sm">
              Agreement to accept
            </StatusBadge>
          ) : null}
        </div>
      </DashboardHeader>

      <AttentionNotices
        orgStatus={org.status}
        canManageProfile={can("partner.profile.manage")}
        pendingAgreementVersion={pendingAgreement?.version ?? null}
        expiring={expiring}
        documentsCandidates={documents?.candidates ?? 0}
        disputed={money?.disputedCount ?? 0}
      />

      {tiles.length ? (
        <StatGrid label="Your agency at a glance" columns={tileColumns} className={tileGridClass}>
          {tiles}
        </StatGrid>
      ) : null}

      {checklist && needsSetup(checklist) ? <GettingStarted items={checklist} title="Set up your agency" description="Finish these steps to receive requirements and get paid for placements." /> : null}

      <HowToUse portal="recruiter" permissions={ctx.permissions} />

      {actions.work.length + actions.agency.length <= 6 ? (
        // Small roles (finance, custom roles): one short row instead of two half-empty sections.
        <QuickActions title="Quick actions" description="Everything your role can do, one tap away." items={[...actions.agency, ...actions.work]} columns={4} />
      ) : (
        <>
          <QuickActions title="Recruitment work" description="Everything you do every day, one tap away." items={actions.work} columns={4} />
          <QuickActions title="Your agency" description="Money, results and your team." items={actions.agency} columns={actions.agency.length === 3 || actions.agency.length > 4 ? 3 : 4} />
        </>
      )}

      {submissions || performance ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {submissions?.weekly ? (
            <ChartCard
              title="Submissions per week"
              description={`Candidates your agency submitted in the last ${CHART_WEEKS} weeks.`}
              data={weeklySeries(submissions.weekly, data.todayIso, CHART_WEEKS)}
              type="bar"
              unit="submissions"
              link={{ label: "All submissions", href: "/recruiter/submissions" }}
              emptyTitle={`No submissions in the last ${CHART_WEEKS} weeks`}
              emptyDescription={can("partner.candidates.submit") ? "Open a requirement and submit a consenting candidate." : "Submissions from your agency will show here."}
            />
          ) : null}
          {performance ? (
            <ChartCard
              title="From submission to joining"
              description="How far your candidates have gone, all time."
              data={hiringFunnel(performance)}
              type="bar"
              unit="candidates"
              link={{ label: "Performance", href: "/recruiter/performance" }}
              emptyTitle="Nothing to show yet"
              emptyDescription="Your results appear once Venkat Sai reviews your first submissions."
            />
          ) : (
            <SubmissionStagesCard stages={stages} />
          )}
        </div>
      ) : null}

      {submissions && performance && submissionsMade + (submissions.byStatus.withdrawn ?? 0) > 0 ? <SubmissionStagesCard stages={stages} wide /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {balanceColumns<DashboardCard>(
          [
            assignments
              ? {
                  key: "requirements",
                  rows: requirementItems.length || EMPTY_ROWS,
                  node: (
                    <RecentList
                      title="Open requirements"
                      description="Requirements Venkat Sai assigned to your agency."
                      icon={ClipboardList}
                      items={requirementItems}
                      limit={5}
                      now={now}
                      viewAll={{ label: "View all", href: "/recruiter/requirements" }}
                      empty={{
                        title: "No open requirements",
                        description: verified ? "We will notify you when Venkat Sai assigns a requirement to your agency." : "Requirements are assigned once your agency is verified.",
                        action: can("partner.profile.manage") && !verified ? { label: "Finish verification", href: "/recruiter/profile/verification" } : undefined,
                      }}
                    />
                  ),
                }
              : null,
            submissions
              ? {
                  key: "submissions",
                  rows: submissionItems.length || EMPTY_ROWS,
                  node: (
                    <RecentList
                      title="Latest submissions"
                      description="Our review and each candidate's hiring stage."
                      icon={Inbox}
                      items={submissionItems}
                      limit={5}
                      now={now}
                      viewAll={{ label: "View all", href: "/recruiter/submissions" }}
                      empty={{
                        title: "No submissions yet",
                        description: "Submit consenting candidates from an open requirement.",
                        action: can("partner.candidates.submit") ? { label: "Submit a candidate", href: submitHref } : undefined,
                      }}
                    />
                  ),
                }
              : null,
            interviews
              ? {
                  key: "interviews",
                  rows: interviewItems.length || EMPTY_ROWS,
                  node: (
                    <RecentList
                      title="Next interviews"
                      description="Help your candidates prepare and attend on time."
                      icon={CalendarClock}
                      items={interviewItems}
                      limit={5}
                      now={now}
                      viewAll={{ label: "View all", href: "/recruiter/interviews" }}
                      empty={{ title: "No interviews coming up", description: "Interviews for your accepted candidates appear here once they are scheduled." }}
                    />
                  ),
                }
              : null,
            documents
              ? {
                  key: "documents",
                  rows: documentItems.length || EMPTY_ROWS,
                  node: (
                    <RecentList
                      title="Documents needed"
                      description="Papers Venkat Sai needs before your candidates travel."
                      icon={FileText}
                      items={documentItems}
                      limit={5}
                      now={now}
                      viewAll={{ label: "View all", href: "/recruiter/documents" }}
                      empty={{ title: "No documents needed", description: "When a candidate you placed needs papers for travel, the list appears here." }}
                    />
                  ),
                }
              : null,
            settlements
              ? {
                  key: "settlements",
                  rows: settlementItems.length || EMPTY_ROWS,
                  node: (
                    <RecentList
                      title="Settlements"
                      description="Commission statements for your placements."
                      icon={Wallet}
                      items={settlementItems}
                      limit={4}
                      now={now}
                      viewAll={{ label: "View all", href: "/recruiter/settlements" }}
                      empty={{ title: "No settlements yet", description: "Venkat Sai prepares a statement after your candidates join. You can check and query it here." }}
                    />
                  ),
                }
              : null,
            can("partner.profile.manage") && overview
              ? {
                  key: "agency",
                  rows: can("partner.team.manage") ? 4 : 3,
                  node: (
                    <AgencyStatusCard
                      orgStatus={org.status}
                      verificationDaysLeft={overview.verificationDaysLeft}
                      agreement={activeAgreement ? { kind: "active", version: activeAgreement.version } : pendingAgreement ? { kind: "pending", version: pendingAgreement.version } : { kind: "none" }}
                      licences={licences ?? []}
                      nextExpiry={expiring[0] ?? null}
                      team={can("partner.team.manage") ? { members: overview.memberCount, invites: overview.pendingInvitationCount } : null}
                    />
                  ),
                }
              : null,
          ].filter((card) => card !== null),
        ).map((column, index) => (
          <div key={index} className="grid min-w-0 gap-6">
            {column.map((card) => (
              <Fragment key={card.key}>{card.node}</Fragment>
            ))}
          </div>
        ))}
      </div>

      <p className="text-sm text-pretty text-muted-foreground">
        Venkat Sai Global never charges candidates. If anyone asks a candidate for money in Venkat Sai&apos;s name, report it through{" "}
        <Link href="/recruiter/support/new" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
          support
        </Link>
        .
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function AttentionNotices({
  orgStatus,
  canManageProfile,
  pendingAgreementVersion,
  expiring,
  documentsCandidates,
  disputed,
}: {
  orgStatus: string;
  canManageProfile: boolean;
  pendingAgreementVersion: string | null;
  expiring: { id: string; licenceNumber: string; daysLeft: number }[];
  documentsCandidates: number;
  disputed: number;
}) {
  const notices = [];
  if (orgStatus === "rejected" || orgStatus === "suspended") {
    notices.push(
      <Callout
        key="status"
        tone="warning"
        title={orgStatus === "suspended" ? "Your agency is suspended" : "Verification was not approved"}
        action={canManageProfile ? { label: "Open verification", href: "/recruiter/profile/verification" } : undefined}
      >
        {canManageProfile ? "Read the feedback, update your details or documents and send them again." : "Your agency owner can see the reason in Agency profile."}
      </Callout>,
    );
  } else if (orgStatus !== "verified" && !canManageProfile) {
    notices.push(
      <Callout key="status" tone="info" title="Your agency is not verified yet">
        Venkat Sai assigns requirements once your agency owner finishes verification.
      </Callout>,
    );
  }
  if (pendingAgreementVersion) {
    notices.push(
      <Callout key="agreement" tone="warning" title={`Partner agreement to accept (version ${pendingAgreementVersion})`} action={{ label: "Read and accept", href: "/recruiter/profile#agreement" }}>
        Venkat Sai has issued an agreement for your agency. Read it and accept it to work on requirements.
      </Callout>,
    );
  }
  for (const l of expiring) {
    notices.push(
      <Callout
        key={l.id}
        tone={l.daysLeft < 0 ? "danger" : "warning"}
        title={
          l.daysLeft < 0 ? `Licence ${l.licenceNumber} has expired` : l.daysLeft === 0 ? `Licence ${l.licenceNumber} expires today` : `Licence ${l.licenceNumber} expires in ${plural(l.daysLeft, "day", "days")}`
        }
        action={{ label: "Update licence", href: "/recruiter/profile#licences" }}
      >
        Upload the renewed licence so Venkat Sai can check it before it lapses. Overseas requirements need a valid recruitment licence.
      </Callout>,
    );
  }
  if (documentsCandidates > 0) {
    notices.push(
      <Callout key="documents" tone="info" title={`${plural(documentsCandidates, "candidate needs", "candidates need")} documents`} action={{ label: "Open documents", href: "/recruiter/documents" }}>
        Venkat Sai is waiting for documents for candidates you placed.
      </Callout>,
    );
  }
  if (disputed > 0) {
    notices.push(
      <Callout key="disputed" tone="info" title={`${plural(disputed, "settlement query is", "settlement queries are")} open`} action={{ label: "Open settlements", href: "/recruiter/settlements" }}>
        Venkat Sai finance is looking into it. You will see the answer on the settlement.
      </Callout>,
    );
  }
  if (!notices.length) return null;
  return (
    <section aria-label="Needs your attention" className="space-y-3">
      {notices}
    </section>
  );
}

/** Short stage names for the stage tiles (the full labels are on the Submissions page). */
const STAGE_LABEL: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  duplicate: "Duplicate check",
  accepted: "Accepted",
  rejected: "Not accepted",
  withdrawn: "Withdrawn",
};

function SubmissionStagesCard({ stages, wide = false }: { stages: { status: string; count: number }[]; wide?: boolean }) {
  const total = stages.reduce((n, s) => n + s.count, 0);
  return (
    <SectionCard title="Submissions by stage" description="Every candidate your agency has submitted, by where they are now." icon={BarChart3} action={{ label: "View all", href: "/recruiter/submissions" }}>
      <ul className={wide ? "grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6" : "grid grid-cols-2 gap-2.5 sm:grid-cols-3"}>
        {stages.map((s) => {
          const st = labelOf(SUBMISSION_STATUS, s.status);
          const label = STAGE_LABEL[s.status] ?? st.label;
          return (
            <li key={s.status} className="min-w-0">
              <Link
                href={`/recruiter/submissions?status=${s.status}`}
                aria-label={`${st.label}: ${s.count}`}
                className="flex h-full min-h-11 flex-col gap-2 rounded-2xl border border-border bg-surface-subtle/60 p-3.5 transition-colors hover:border-[#d5dae2] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
              >
                <span className="font-heading text-2xl leading-none font-extrabold text-foreground tabular-nums">{s.count}</span>
                <StatusBadge tone={st.tone} size="sm" className="max-w-full self-start">
                  {label}
                </StatusBadge>
              </Link>
            </li>
          );
        })}
      </ul>
      {total === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nothing submitted yet. Each stage fills up as you submit candidates.</p> : null}
    </SectionCard>
  );
}

type AgreementState = { kind: "active"; version: string } | { kind: "pending"; version: string } | { kind: "none" };

function AgencyStatusCard({
  orgStatus,
  verificationDaysLeft,
  agreement,
  licences,
  nextExpiry,
  team,
}: {
  orgStatus: string;
  verificationDaysLeft: number | null;
  agreement: AgreementState;
  licences: { verificationStatus: string; validUntil: string | null }[];
  nextExpiry: { licenceNumber: string; daysLeft: number; validUntil: string | null } | null;
  team: { members: number; invites: number } | null;
}) {
  const verifiedLicences = licences.filter((l) => l.verificationStatus === "verified").length;
  const pendingLicences = licences.filter((l) => l.verificationStatus === "pending").length;
  const agreementLabel = agreement.kind === "none" ? null : labelOf(AGREEMENT_STATUS, agreement.kind);
  const rowClass = "flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4";

  return (
    <SectionCard title="Agency status" description="Verification, agreement, licences and team." icon={Building2} action={{ label: "Agency profile", href: "/recruiter/profile" }}>
      <dl className="divide-y divide-border">
        <div className={rowClass}>
          <dt className="text-sm font-medium text-foreground">Verification</dt>
          <dd className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge status={orgStatus} domain="organization" size="sm" />
            {verificationDaysLeft !== null && verificationDaysLeft <= 60 ? (
              <span>{verificationDaysLeft < 0 ? "Renewal overdue" : `Renew within ${plural(verificationDaysLeft, "day", "days")}`}</span>
            ) : null}
          </dd>
        </div>
        <div className={rowClass}>
          <dt className="text-sm font-medium text-foreground">Partner agreement</dt>
          <dd className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {agreementLabel ? (
              <StatusBadge tone={agreementLabel.tone} size="sm">
                {agreementLabel.label}
              </StatusBadge>
            ) : (
              <span>Not issued yet</span>
            )}
            {agreement.kind !== "none" ? <span>Version {agreement.version}</span> : null}
          </dd>
        </div>
        <div className={rowClass}>
          <dt className="text-sm font-medium text-foreground">Recruitment licences</dt>
          <dd className="text-sm text-muted-foreground">
            {licences.length === 0 ? (
              <span>
                None on file ·{" "}
                <Link href="/recruiter/profile#licences" className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 hover:no-underline">
                  Add a licence
                </Link>
              </span>
            ) : (
              <span>
                {verifiedLicences} verified{pendingLicences ? ` · ${pendingLicences} being checked` : ""}
                {nextExpiry ? ` · ${nextExpiry.licenceNumber} ${nextExpiry.daysLeft < 0 ? "expired" : `valid until ${shortDate(nextExpiry.validUntil)}`}` : ""}
              </span>
            )}
          </dd>
        </div>
        {team ? (
          <div className={rowClass}>
            <dt className="text-sm font-medium text-foreground">Team</dt>
            <dd className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users aria-hidden="true" className="size-4" />
              <span>
                {plural(team.members, "member", "members")}
                {team.invites ? ` · ${plural(team.invites, "invitation", "invitations")} pending` : ""}
              </span>
            </dd>
          </div>
        ) : null}
      </dl>
    </SectionCard>
  );
}
