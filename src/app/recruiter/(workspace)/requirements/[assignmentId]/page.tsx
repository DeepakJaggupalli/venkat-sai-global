import type { Metadata } from "next";
import { UserPlus } from "lucide-react";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { ASSIGNMENT_STATUS, daysUntil, labelOf, SUBMISSION_STATUS } from "@/components/recruiter/labels";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText, SalaryRangeText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireOrgMember } from "@/modules/identity/authz";
import { getAssignmentForPartner, listSubmissionsForPartner } from "@/modules/recruitment/queries";
import { countryOptions } from "@/modules/taxonomy/queries";

import { loadOr404 } from "../../_lib/page-utils";

export const metadata: Metadata = { title: "Requirement" };

const COMMISSION_MODEL_LABELS: Record<string, string> = {
  fixed_per_placement: "Fixed fee per placement",
  percent_of_fee: "Percentage of the placement fee",
  none: "No commission",
  custom: "Custom terms",
};

type Params = { assignmentId: string };

export default async function RecruiterRequirementDetailPage({ params }: { params: Promise<Params> }) {
  const ctx = await requireOrgMember("recruitment_partner", "partner.requirements.view");
  const { assignmentId } = await params;
  const assignment = await loadOr404(getAssignmentForPartner(ctx, assignmentId));
  const canSeeSubmissions = ctx.permissions.has("partner.submissions.view");
  const [submissions, countries] = await Promise.all([
    canSeeSubmissions ? listSubmissionsForPartner(ctx, { assignmentId: assignment.id }, { page: 1, pageSize: 50, offset: 0 }) : Promise.resolve(null),
    countryOptions(),
  ]);
  const countryName = new Map(countries.map((c) => [c.value, c.label]));
  const status = labelOf(ASSIGNMENT_STATUS, assignment.status);
  const verified = ctx.organization.status === "verified";
  const canSubmit = ctx.permissions.has("partner.candidates.submit");
  const limitReached = assignment.submissionLimit !== null && assignment.submissionsUsed >= assignment.submissionLimit;
  const open = assignment.status === "active";
  const cc = assignment.job?.countryCode ?? assignment.requirement?.countryCode ?? null;
  const location = [assignment.job?.city ?? assignment.requirement?.locations, cc ? (countryName.get(cc) ?? cc) : null].filter(Boolean).join(", ");
  const days = daysUntil(assignment.dueDate);
  const terms = assignment.commissionTerms;
  const countsEntries = Object.entries(assignment.submissionCounts).filter(([, n]) => (n ?? 0) > 0);

  return (
    <div className="space-y-8">
      <PortalBreadcrumb items={[{ label: "Assigned requirements", href: "/recruiter/requirements" }, { label: assignment.title || "Requirement" }]} />
      <PageHeader
        eyebrow={assignment.requirement?.code ?? assignment.job?.code}
        title={assignment.title || "Requirement"}
        description={location || undefined}
        backLink={{ href: "/recruiter/requirements", label: "Back to requirements" }}
        status={
          <StatusBadge tone={status.tone} size="md">
            {status.label}
          </StatusBadge>
        }
        actions={
          canSubmit && open && verified && !limitReached ? [{ label: "Submit a candidate", href: `/recruiter/requirements/${assignment.id}/submit`, icon: <UserPlus aria-hidden="true" /> }] : undefined
        }
      />

      {!open ? (
        <Callout tone="neutral" title="Not open for submissions">
          This assignment is {status.label.toLowerCase()}. You can still follow the candidates you submitted.
        </Callout>
      ) : limitReached ? (
        <Callout tone="warning" title="Submission limit reached">
          You have used all {assignment.submissionLimit} submissions for this requirement. Withdrawn submissions do not count towards the limit.
        </Callout>
      ) : !verified ? (
        <Callout tone="info" title="Verification needed" action={{ label: "Go to verification", href: "/recruiter/profile/verification" }}>
          Your agency must be verified before you can submit candidates.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard title="Targets and limits">
            <KeyValueList
              columns={2}
              items={[
                { label: "Positions to fill", value: assignment.positionsTarget ?? assignment.requirement?.totalPositions ?? null },
                { label: "Submissions", value: assignment.submissionLimit !== null ? `${assignment.submissionsUsed} used of ${assignment.submissionLimit}` : `${assignment.submissionsUsed} (no limit)` },
                {
                  label: "Due date",
                  value: assignment.dueDate ? <DateText value={assignment.dueDate} dateOnly /> : null,
                  hint: open && days !== null ? (days < 0 ? "Past the due date" : days === 0 ? "Due today" : `${days} days left`) : undefined,
                },
                { label: "Assigned", value: <DateText value={assignment.createdAt} /> },
                { label: "Location", value: location || null },
                { label: "Jobs you can submit to", value: assignment.targetJobs.length ? assignment.targetJobs.map((j) => `${j.title} (${j.code})`).join(", ") : null },
              ]}
            />
          </SectionCard>

          <SectionCard title="Instructions from Venkat Sai">
            {assignment.instructions ? <p className="text-sm leading-6 whitespace-pre-line text-foreground">{assignment.instructions}</p> : <p className="text-sm text-muted-foreground">No special instructions.</p>}
          </SectionCard>

          <SectionCard title="Roles" flush>
            {assignment.requirementLines.length ? (
              <ul className="divide-y divide-border">
                {assignment.requirementLines.map((line, i) => {
                  const exp =
                    line.experienceMinYears !== null || line.experienceMaxYears !== null
                      ? `${line.experienceMinYears ?? 0}${line.experienceMaxYears !== null ? `–${line.experienceMaxYears}` : "+"} years`
                      : null;
                  return (
                    <li key={`${line.roleTitle}-${i}`} className="space-y-2 px-5 py-4">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                        <p className="font-medium text-foreground">{line.roleTitle}</p>
                        <p className="text-sm text-muted-foreground">
                          {line.positions} {line.positions === 1 ? "position" : "positions"}
                        </p>
                      </div>
                      <KeyValueList
                        columns={3}
                        dense
                        items={[
                          { label: "Experience", value: exp },
                          { label: "Qualification", value: line.qualification },
                          {
                            label: "Salary",
                            value: line.salaryCurrency ? <SalaryRangeText minMinor={line.salaryMinMinor} maxMinor={line.salaryMaxMinor} currency={line.salaryCurrency} period={line.salaryPeriod ?? undefined} /> : null,
                          },
                        ]}
                        emptyText="Not specified"
                      />
                      {line.requiredSkills.length ? (
                        <ul className="flex flex-wrap gap-1.5" aria-label={`Skills for ${line.roleTitle}`}>
                          {line.requiredSkills.map((s) => (
                            <li key={s} className="rounded-full bg-surface-subtle px-2.5 py-0.5 text-xs text-foreground">
                              {s}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState size="sm" variant="plain" title="No role breakdown" description="See the instructions and the target job for what is needed." />
              </div>
            )}
          </SectionCard>

          {submissions ? (
            <SectionCard
              title="Your submissions for this requirement"
              flush
              action={canSubmit && open && verified && !limitReached ? { label: "Submit a candidate", href: `/recruiter/requirements/${assignment.id}/submit` } : undefined}
            >
              <DataTable
                caption="Your submissions for this requirement"
                rows={submissions.items}
                getRowId={(s) => s.id}
                rowLink={(s) => ({ href: `/recruiter/submissions/${s.id}`, label: `Open submission ${s.code}` })}
                bordered={false}
                columns={[
                  { id: "candidate", header: "Candidate", primary: true, cell: (s) => s.candidate.displayName },
                  { id: "code", header: "Reference", cell: (s) => s.code, hideOnMobile: true },
                  { id: "submitted", header: "Submitted", cell: (s) => <DateText value={s.createdAt} /> },
                  {
                    id: "status",
                    header: "Status",
                    cell: (s) => {
                      const st = labelOf(SUBMISSION_STATUS, s.status);
                      return (
                        <StatusBadge tone={st.tone} size="sm">
                          {st.label}
                        </StatusBadge>
                      );
                    },
                  },
                  { id: "stage", header: "Hiring stage", cell: (s) => s.application?.stageName || "—" },
                ]}
                empty={<EmptyState size="sm" variant="plain" title="No submissions yet" description="Candidates you submit for this requirement appear here." />}
              />
            </SectionCard>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Commission and progress">
          <SectionCard title="Your commission terms" description="Agreed for this assignment. Paid by Venkat Sai after the conditions are met; never charged to candidates.">
            {terms.model ? (
              <KeyValueList
                items={[
                  { label: "Model", value: COMMISSION_MODEL_LABELS[terms.model] ?? terms.model },
                  { label: "Amount", value: terms.amountMinor !== undefined && terms.currency ? <MoneyText amountMinor={terms.amountMinor} currency={terms.currency} /> : null },
                  { label: "Rate", value: terms.percentBasisPoints !== undefined ? `${terms.percentBasisPoints / 100}%` : null },
                  { label: "Payable", value: terms.payableAfterDays !== undefined ? `${terms.payableAfterDays} days after joining` : null },
                  { label: "Notes", value: terms.notes ?? null },
                ]}
                emptyText="Not specified"
              />
            ) : (
              <p className="text-sm text-muted-foreground">The terms of your partner agreement apply. See your agency profile.</p>
            )}
          </SectionCard>
          <SectionCard title="Submission progress">
            {countsEntries.length ? (
              <ul className="space-y-2 text-sm">
                {countsEntries.map(([key, n]) => (
                  <li key={key} className="flex items-center justify-between gap-2">
                    <span>{labelOf(SUBMISSION_STATUS, key).label}</span>
                    <span className="font-medium tabular-nums text-foreground">{n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing submitted yet.</p>
            )}
          </SectionCard>
          <Callout tone="neutral" title="Consent and fair recruitment">
            Submit only people who agreed to be put forward for this requirement. Candidates are never charged for being submitted, interviewed or placed.
          </Callout>
        </aside>
      </div>
    </div>
  );
}
