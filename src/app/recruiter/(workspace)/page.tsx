import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ClipboardList, Inbox, UserCheck } from "lucide-react";

import { ASSIGNMENT_STATUS, daysUntil, labelOf, SUBMISSION_STATUS } from "@/components/recruiter/labels";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { logger } from "@/lib/logger";
import { requireOrgMember } from "@/modules/identity/authz";
import { listPartnerAgreements, listPartnerLicences } from "@/modules/organizations/partner";
import { getPartnerPerformance, listAssignmentsForPartner, listInterviewsForPartner, listSubmissionsForPartner } from "@/modules/recruitment/queries";

import { viewerTimeZone } from "./_lib/page-utils";
import { listPartnerMobilisations } from "./_lib/queries";

export const metadata: Metadata = { title: "Dashboard" };

const FIVE = { page: 1, pageSize: 5, offset: 0 };
const ONE = { page: 1, pageSize: 1, offset: 0 };

/** Optional dashboard sections must never take the whole page down. */
async function safe<T>(label: string, load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    logger.warn("Partner dashboard section failed", { error, section: label });
    return null;
  }
}

export default async function RecruiterDashboardPage() {
  const ctx = await requireOrgMember("recruitment_partner");
  const can = (p: string) => ctx.permissions.has(p);
  const timeZone = viewerTimeZone(ctx);
  const org = ctx.organization;
  const now = new Date();

  const [assignments, submissions, pendingReview, interviews, performance, mobilisations, agreements, licences] = await Promise.all([
    can("partner.requirements.view") ? safe("assignments", () => listAssignmentsForPartner(ctx, { status: "active" }, FIVE)) : null,
    can("partner.submissions.view") ? safe("submissions", () => listSubmissionsForPartner(ctx, {}, FIVE)) : null,
    can("partner.submissions.view")
      ? safe("pending", async () => {
          const [submitted, review] = await Promise.all([listSubmissionsForPartner(ctx, { status: "submitted" }, ONE), listSubmissionsForPartner(ctx, { status: "under_review" }, ONE)]);
          return submitted.total + review.total;
        })
      : null,
    can("partner.submissions.view") ? safe("interviews", () => listInterviewsForPartner(ctx, { from: now }, FIVE)) : null,
    can("partner.performance.view") ? safe("performance", () => getPartnerPerformance({ kind: "partner", ctx })) : null,
    can("partner.documents.manage") ? safe("documents", () => listPartnerMobilisations(ctx, { openOnly: true })) : null,
    can("partner.profile.manage") ? safe("agreements", () => listPartnerAgreements(ctx, org.id)) : null,
    can("partner.profile.manage") ? safe("licences", () => listPartnerLicences(ctx, org.id)) : null,
  ]);

  const pendingAgreement = agreements?.find((a) => a.status === "pending") ?? null;
  const expiringLicences = (licences ?? []).filter((l) => {
    const d = daysUntil(l.validUntil, now);
    return l.verificationStatus === "verified" && d !== null && d <= 60;
  });
  const documentsNeeded = (mobilisations ?? []).filter((m) => m.openItems > 0);
  const verified = org.status === "verified";
  const firstName = ctx.user.displayName.split(" ")[0] || ctx.user.displayName;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={org.name}
        title={`Welcome, ${firstName}`}
        description="Your assigned requirements, submissions and what needs your attention."
        actions={can("partner.requirements.view") ? [{ label: "View requirements", href: "/recruiter/requirements" }] : undefined}
      />

      <section className="space-y-3" aria-label="Needs attention">
        {!verified ? (
          <Callout tone={org.status === "rejected" || org.status === "suspended" ? "warning" : "info"} title="Finish setting up your agency" action={{ label: "Open agency profile", href: "/recruiter/profile" }}>
            Venkat Sai assigns requirements and accepts submissions from verified agencies only. Add your licences, documents and territories, accept the partner agreement
            and submit for verification.
          </Callout>
        ) : null}
        {pendingAgreement ? (
          <Callout tone="warning" title={`Partner agreement to accept (version ${pendingAgreement.version})`} action={{ label: "Read and accept", href: "/recruiter/profile#agreement" }}>
            Venkat Sai has issued an agreement for your agency. Read it and accept it to work on requirements.
          </Callout>
        ) : null}
        {expiringLicences.map((l) => {
          const d = daysUntil(l.validUntil, now) ?? 0;
          return (
            <Callout key={l.id} tone={d < 0 ? "danger" : "warning"} title={d < 0 ? `Licence ${l.licenceNumber} has expired` : `Licence ${l.licenceNumber} expires in ${d} days`} action={{ label: "Update licence", href: "/recruiter/profile#licences" }}>
              Upload the renewed licence so Venkat Sai can verify it before it lapses. Overseas requirements need a valid recruitment licence.
            </Callout>
          );
        })}
        {documentsNeeded.length ? (
          <Callout tone="info" title={`${documentsNeeded.length} ${documentsNeeded.length === 1 ? "candidate needs" : "candidates need"} documents`} action={{ label: "Open documents", href: "/recruiter/documents" }}>
            Venkat Sai is waiting for documents for candidates you placed.
          </Callout>
        ) : null}
      </section>

      <StatGrid columns={4}>
        <StatCard label="Open requirements" value={assignments ? assignments.total : null} href={assignments ? "/recruiter/requirements" : undefined} icon={<ClipboardList aria-hidden="true" />} />
        <StatCard label="Awaiting Venkat Sai review" value={pendingReview} href={pendingReview !== null ? "/recruiter/submissions?status=submitted" : undefined} icon={<Inbox aria-hidden="true" />} />
        <StatCard label="Upcoming interviews" value={interviews ? interviews.total : null} href={interviews ? "/recruiter/interviews" : undefined} icon={<CalendarClock aria-hidden="true" />} />
        <StatCard label="Candidates joined" value={performance ? performance.joined : null} hint={performance ? `${performance.placed} placed in total` : undefined} href={performance ? "/recruiter/performance" : undefined} icon={<UserCheck aria-hidden="true" />} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        {assignments ? (
          <SectionCard title="Open requirements" action={{ label: "View all", href: "/recruiter/requirements" }} flush>
            {assignments.items.length ? (
              <ul className="divide-y divide-border">
                {assignments.items.map((a) => {
                  const d = daysUntil(a.dueDate, now);
                  const st = labelOf(ASSIGNMENT_STATUS, a.status);
                  return (
                    <li key={a.id}>
                      <Link
                        href={`/recruiter/requirements/${a.id}`}
                        className="flex flex-col gap-1 px-5 py-3 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground">{a.title || "Requirement"}</span>
                          <span className="block text-xs text-muted-foreground">
                            {a.submissionLimit !== null ? `${a.submissionsUsed} of ${a.submissionLimit} submissions` : `${a.submissionsUsed} submitted`}
                            {a.dueDate ? (
                              <>
                                {" "}
                                · due <DateText value={a.dueDate} dateOnly />
                              </>
                            ) : null}
                          </span>
                        </span>
                        {d !== null && d >= 0 && d <= 7 ? (
                          <StatusBadge tone="warning" size="sm">
                            {d === 0 ? "Due today" : `${d} days left`}
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone={st.tone} size="sm">
                            {st.label}
                          </StatusBadge>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState size="sm" variant="plain" title="No open requirements" description={verified ? "You will be notified when Venkat Sai assigns a requirement to you." : "Requirements are assigned once your agency is verified."} />
              </div>
            )}
          </SectionCard>
        ) : null}

        {submissions ? (
          <SectionCard title="Recent submissions" action={{ label: "View all", href: "/recruiter/submissions" }} flush>
            {submissions.items.length ? (
              <ul className="divide-y divide-border">
                {submissions.items.map((s) => {
                  const st = labelOf(SUBMISSION_STATUS, s.status);
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/recruiter/submissions/${s.id}`}
                        className="flex flex-col gap-1 px-5 py-3 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground">{s.candidate.displayName}</span>
                          <span className="block text-xs text-muted-foreground">
                            {s.jobTitle ?? "Job to be decided"} · <DateText value={s.createdAt} timeZone={timeZone} />
                          </span>
                        </span>
                        <StatusBadge tone={st.tone} size="sm">
                          {st.label}
                        </StatusBadge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState size="sm" variant="plain" title="No submissions yet" description="Submit consenting candidates from an open requirement." />
              </div>
            )}
          </SectionCard>
        ) : null}

        {interviews && interviews.items.length ? (
          <SectionCard title="Next interviews" action={{ label: "View all", href: "/recruiter/interviews" }} flush>
            <ul className="divide-y divide-border">
              {interviews.items.map((i) => (
                <li key={i.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{i.candidateName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {i.jobTitle} · {i.roundName || `Round ${i.roundNumber}`}
                    </span>
                  </span>
                  <span className="text-sm text-foreground">
                    <DateText value={i.scheduledStart} mode="datetime" timeZone={i.timezone} />
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        Venkat Sai Global never charges candidates. If anyone asks a candidate for money in Venkat Sai&apos;s name, report it through{" "}
        <Link href="/recruiter/support" className="font-medium text-navy underline underline-offset-4 hover:no-underline">
          support
        </Link>
        .
      </p>
    </div>
  );
}
