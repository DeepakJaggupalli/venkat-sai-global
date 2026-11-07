import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, ExternalLink, MessageSquare } from "lucide-react";

import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, type AdminFieldSpec } from "@/components/admin/action-form";
import { AssignSelect } from "@/components/admin/assign-select";
import { InternalNotesPanel } from "@/components/admin/internal-notes";
import { listStaffOptions } from "@/components/admin/queries";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText, SalaryRangeText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { SALARY_PERIODS } from "@/db/schema/_constants";
import { fromMinorUnits, humanize } from "@/lib/format";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import {
  assignRequirementOwnerAction,
  changeRequirementStatusAction,
  removeRequirementLineAction,
  setRequirementInternalNotesAction,
  setRequirementQuotationAction,
} from "@/modules/operations/admin-actions";
import {
  REQUIREMENT_INTERVIEW_METHOD_LABELS,
  REQUIREMENT_KIND_LABELS,
  REQUIREMENT_SOURCE_LABELS,
  REQUIREMENT_STAFF_TRANSITIONS,
  REQUIREMENT_STATUS_LABELS,
  REQUIREMENT_URGENCY_LABELS,
} from "@/modules/operations/constants";
import { getRequirement, listThreadsForContext } from "@/modules/operations/queries";
import type { RequirementLineView } from "@/modules/operations/types";
import { listAssignmentsForStaff } from "@/modules/recruitment/partner-queries";
import { currencyOptions } from "@/modules/taxonomy/queries";

import { assignPartnerFormAction, linkLineJobFormAction, saveRequirementLineFormAction, setLineFilledFormAction, startRequirementThreadAction } from "../actions";
import { listJobOptionsForRequirement, listVerifiedPartnerOptions } from "../_lib/queries";
import { URGENCY_TONE } from "../_lib/tones";

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const periodOptions = SALARY_PERIODS.map((p) => ({ value: p, label: `Per ${p}` }));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Requirement" };
  const ctx = await requireStaff("requirements.view");
  const detail = await getRequirement(ctx, id);
  return { title: detail ? `${detail.requirement.code} · ${detail.requirement.title}` : "Requirement" };
}

function lineFields(line: RequirementLineView | null, currencies: { value: string; label: string }[]): AdminFieldSpec[] {
  const money = (v: number | null | undefined) => (v != null && line?.salaryCurrency ? String(fromMinorUnits(v, line.salaryCurrency)) : null);
  return [
    { name: "roleTitle", label: "Role", required: true, defaultValue: line?.roleTitle ?? null, wide: true },
    { name: "positions", label: "Positions", kind: "number", required: true, min: 1, defaultValue: line?.positions ?? 1 },
    { name: "qualification", label: "Qualification", optional: true, defaultValue: line?.qualification ?? null },
    { name: "experienceMinYears", label: "Minimum experience (years)", kind: "number", optional: true, min: 0, defaultValue: line?.experienceMinYears ?? null },
    { name: "experienceMaxYears", label: "Maximum experience (years)", kind: "number", optional: true, min: 0, defaultValue: line?.experienceMaxYears ?? null },
    { name: "salaryMin", label: "Salary from", kind: "number", optional: true, min: 0, step: "0.01", defaultValue: money(line?.salaryMinMinor) },
    { name: "salaryMax", label: "Salary to", kind: "number", optional: true, min: 0, step: "0.01", defaultValue: money(line?.salaryMaxMinor) },
    { name: "salaryCurrency", label: "Salary currency", kind: "search-select", options: currencies, optional: true, allowClear: true, defaultValue: line?.salaryCurrency ?? null },
    { name: "salaryPeriod", label: "Pay period", kind: "select", options: periodOptions, optional: true, allowClear: true, defaultValue: line?.salaryPeriod ?? null },
    { name: "requiredSkills", label: "Skills", optional: true, hint: "Separate with commas", defaultValue: line?.requiredSkills?.join(", ") ?? null, wide: true },
    { name: "notes", label: "Notes", kind: "textarea", optional: true, defaultValue: line?.notes ?? null },
  ];
}

export default async function RequirementDetailPage({ params }: { params: Params }) {
  const ctx = await requireStaff("requirements.view");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await getRequirement(ctx, id);
  if (!detail) notFound();
  const { requirement: r, lines } = detail;
  const canManage = staffCan(ctx, "requirements.manage");
  const canJobs = canManage && staffCan(ctx, "jobs.view");
  const canCreateJob = staffCan(ctx, "jobs.manage");
  const canAssignPartner = staffCan(ctx, "partners.assign");
  const canSeeAssignments = staffCan(ctx, ["partners.view", "partners.assign"], "any");
  const delivering = ["approved", "sourcing", "in_progress", "partially_filled"].includes(r.status);

  const [staff, currencies, jobOptions, partners, assignments, threads] = await Promise.all([
    listStaffOptions({ permission: "requirements.manage" }),
    canManage ? currencyOptions() : Promise.resolve([]),
    canJobs ? listJobOptionsForRequirement(r.id, r.organizationId) : Promise.resolve([]),
    canAssignPartner && delivering ? listVerifiedPartnerOptions() : Promise.resolve([]),
    canSeeAssignments ? listAssignmentsForStaff(ctx, { requirementId: r.id }, { page: 1, pageSize: 20, offset: 0 }).then((p) => p.items) : Promise.resolve([]),
    listThreadsForContext({ kind: "staff", ctx }, "requirement", r.id).catch(() => []),
  ]);
  const transitions = REQUIREMENT_STAFF_TRANSITIONS[r.status].map((s) => ({ value: s, label: REQUIREMENT_STATUS_LABELS[s] }));
  const filled = lines.reduce((a, l) => a + l.filledCount, 0);

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Requirements", href: "/admin/requirements" }, { label: r.code }]} />
      <PageHeader
        eyebrow={`${r.code} · ${REQUIREMENT_KIND_LABELS[r.kind]} · ${REQUIREMENT_SOURCE_LABELS[r.source]}`}
        title={r.title}
        description={detail.organization ? detail.organization.name : (r.organizationName ?? undefined)}
        status={
          <span className="flex flex-wrap gap-2">
            <StatusBadge status={r.status}>{REQUIREMENT_STATUS_LABELS[r.status]}</StatusBadge>
            <StatusBadge tone={URGENCY_TONE[r.urgency]}>{REQUIREMENT_URGENCY_LABELS[r.urgency]} urgency</StatusBadge>
          </span>
        }
        backLink={{ href: "/admin/requirements", label: "Back to requirements" }}
        actions={detail.approval ? [{ label: `Approval ${detail.approval.code}`, href: `/admin/approvals/${detail.approval.id}`, icon: <ExternalLink />, variant: "outline" }] : undefined}
      />

      {r.statusReason && ["cancelled", "on_hold", "draft"].includes(r.status) ? (
        <Callout tone={r.status === "cancelled" ? "danger" : "info"} title={REQUIREMENT_STATUS_LABELS[r.status]}>
          {r.statusReason}
        </Callout>
      ) : null}
      {["submitted", "under_review"].includes(r.status) && detail.approval ? (
        <Callout tone="info" title="Waiting for approval" action={{ label: "Review in the approval centre", href: `/admin/approvals/${detail.approval.id}` }}>
          Delivery starts once the request is approved in the approval centre.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <SectionCard
            title={`Roles (${lines.length})`}
            description={`${filled} of ${r.totalPositions} positions filled`}
            flush
            action={
              canManage ? (
                <ResponsiveDialog title="Add a role" size="lg" trigger={<Button size="sm" variant="outline">Add role</Button>}>
                  <ActionForm action={saveRequirementLineFormAction} hidden={{ requirementId: r.id }} columns={2} fields={lineFields(null, currencies)} submitLabel="Add role" resetOnSuccess />
                </ResponsiveDialog>
              ) : undefined
            }
          >
            <DataTable
              caption="Requirement roles"
              rows={lines}
              getRowId={(l) => l.id}
              bordered={false}
              columns={[
                {
                  id: "role",
                  header: "Role",
                  primary: true,
                  cell: (l) => (
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{l.roleTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {[l.experienceMinYears != null || l.experienceMaxYears != null ? `${l.experienceMinYears ?? 0}–${l.experienceMaxYears ?? "+"} yrs` : null, l.qualification, l.requiredSkills.slice(0, 4).join(", ")]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  ),
                },
                { id: "positions", header: "Filled", align: "right", nowrap: true, cell: (l) => `${l.filledCount} / ${l.positions}` },
                {
                  id: "salary",
                  header: "Salary",
                  hideOnMobile: true,
                  cell: (l) => (l.salaryCurrency ? <SalaryRangeText minMinor={l.salaryMinMinor} maxMinor={l.salaryMaxMinor} currency={l.salaryCurrency} period={l.salaryPeriod ?? undefined} /> : <span className="text-muted-foreground">Not given</span>),
                },
                {
                  id: "job",
                  header: "Job",
                  cell: (l) =>
                    l.jobId ? (
                      <Link className="text-teal-strong underline underline-offset-4" href={`/admin/jobs/${l.jobId}`}>
                        {l.jobCode ?? "Job"}
                        {l.jobStatus ? ` (${humanize(l.jobStatus)})` : ""}
                      </Link>
                    ) : canCreateJob && delivering ? (
                      <Link className="inline-flex items-center gap-1 text-teal-strong underline underline-offset-4" href={`/admin/jobs/new?requirement=${r.id}&line=${l.id}`}>
                        <Briefcase aria-hidden="true" className="size-3.5" />
                        Create job
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Not linked</span>
                    ),
                },
                {
                  id: "actions",
                  header: <span className="sr-only">Actions</span>,
                  align: "right",
                  cell: (l) =>
                    canManage ? (
                      <ResponsiveDialog
                        title={`Manage role: ${l.roleTitle}`}
                        size="lg"
                        trigger={
                          <Button size="sm" variant="ghost">
                            Manage<span className="sr-only"> {l.roleTitle}</span>
                          </Button>
                        }
                      >
                        <div className="space-y-6">
                          <ActionForm
                            action={setLineFilledFormAction}
                            hidden={{ requirementId: r.id, lineId: l.id }}
                            fields={[{ name: "filledCount", label: "Positions filled", kind: "number", min: 0, max: l.positions, required: true, defaultValue: l.filledCount }]}
                            submitLabel="Update filled"
                            submitVariant="outline"
                          />
                          {canJobs ? (
                            <ActionForm
                              action={linkLineJobFormAction}
                              hidden={{ requirementId: r.id, lineId: l.id }}
                              fields={[{ name: "jobId", label: "Linked job", kind: "search-select", options: jobOptions, allowClear: true, defaultValue: l.jobId, hint: "Leave empty to remove the link" }]}
                              submitLabel="Save job link"
                              submitVariant="outline"
                            />
                          ) : null}
                          <details className="rounded-lg border border-border p-3">
                            <summary className="cursor-pointer text-sm font-medium">Edit role details</summary>
                            <div className="mt-3">
                              <ActionForm action={saveRequirementLineFormAction} hidden={{ requirementId: r.id, lineId: l.id }} columns={2} fields={lineFields(l, currencies)} submitLabel="Save role" />
                            </div>
                          </details>
                          {lines.length > 1 ? (
                            <ActionButton
                              action={removeRequirementLineAction.bind(null, { lineId: l.id, requirementId: r.id })}
                              variant="destructive"
                              confirm={{ title: `Remove ${l.roleTitle}?`, description: "The role is removed from this requirement.", confirmLabel: "Remove role", destructive: true }}
                            >
                              Remove role
                            </ActionButton>
                          ) : null}
                        </div>
                      </ResponsiveDialog>
                    ) : null,
                },
              ]}
              empty={<EmptyState size="sm" title="No roles yet" description="Add the roles and headcount the client needs." />}
            />
          </SectionCard>

          <SectionCard title="Details">
            <KeyValueList
              columns={2}
              items={[
                { label: "Country", value: r.countryCode },
                { label: "Locations", value: r.locations },
                { label: "Joining by", value: r.joiningBy ? <DateText value={r.joiningBy} dateOnly /> : null },
                { label: "Contract", value: r.contractDurationMonths ? `${r.contractDurationMonths} months` : null },
                { label: "Working hours", value: r.workingHours },
                { label: "Interview", value: r.interviewMethod ? `${REQUIREMENT_INTERVIEW_METHOD_LABELS[r.interviewMethod]}${r.interviewDetails ? ` · ${r.interviewDetails}` : ""}` : null },
                { label: "Trade test / assessment", value: r.assessmentRequired ? (r.assessmentDetails ?? "Required") : "Not required" },
                { label: "Languages", value: r.languageRequirements },
                {
                  label: "Provided",
                  value: [r.accommodationProvided && "Accommodation", r.foodProvided && "Food", r.transportProvided && "Transport", ...r.benefits].filter(Boolean).join(", ") || null,
                },
                { label: "Documentation", value: r.documentationRequirements, fullWidth: true },
                { label: "Description", value: r.description ? <span className="whitespace-pre-line">{r.description}</span> : null, fullWidth: true },
              ]}
            />
          </SectionCard>

          <SectionCard title="Contact" description="Use these details only for this requirement.">
            <KeyValueList
              columns={2}
              dense
              items={[
                { label: "Company", value: detail.organization ? <Link className="text-teal-strong underline underline-offset-4" href={`/admin/organizations/${detail.organization.id}`}>{detail.organization.name}</Link> : r.organizationName },
                { label: "Contact person", value: [r.contactName, r.contactDesignation].filter(Boolean).join(", ") || null },
                { label: "Email", value: r.contactEmail },
                { label: "Phone", value: r.contactPhone },
                { label: "Submitted by", value: detail.submittedByName },
                { label: "Submitted", value: r.submittedAt ? <DateText value={r.submittedAt} mode="datetime" /> : null },
                { label: "Lead", value: detail.lead ? <Link className="text-teal-strong underline underline-offset-4" href={`/admin/leads/${detail.lead.id}`}>{detail.lead.code} · {detail.lead.name}</Link> : null },
              ]}
            />
          </SectionCard>

          <SectionCard title="Messages" description="Conversations with the employer about this requirement.">
            <div className="space-y-4">
              {threads.length ? (
                <ul className="divide-y divide-border">
                  {threads.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                      <Link href={`/admin/messages/${t.id}`} className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-teal-strong underline-offset-4 hover:underline">
                        <MessageSquare aria-hidden="true" className="size-4 shrink-0" />
                        <span className="truncate">{t.subject}</span>
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t.unreadCount ? `${t.unreadCount} unread · ` : ""}
                        <RelativeTime value={t.lastMessageAt ?? t.createdAt} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No conversations yet.</p>
              )}
              {detail.organization ? (
                <details className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Start a conversation with {detail.organization.name}</summary>
                  <div className="mt-3">
                    <ActionForm
                      action={startRequirementThreadAction}
                      hidden={{ requirementId: r.id, organizationId: detail.organization.id }}
                      fields={[
                        { name: "subject", label: "Subject", required: true, defaultValue: `${r.code}: ${r.title}` },
                        { name: "message", label: "Message", kind: "textarea", required: true, rows: 4 },
                      ]}
                      submitLabel="Send message"
                      pendingLabel="Sending…"
                      resetOnSuccess
                    />
                  </div>
                </details>
              ) : (
                <p className="text-xs text-muted-foreground">This request came from the public form; reply by email or phone.</p>
              )}
            </div>
          </SectionCard>

          <InternalNotesPanel ctx={ctx} entityType="requirement" entityId={r.id} organizationId={r.organizationId} />
        </div>

        <aside className="space-y-6" aria-label="Requirement actions">
          <SectionCard title="Owner and status">
            <div className="space-y-5">
              <AssignSelect action={assignRequirementOwnerAction} recordId={r.id} options={staff} current={r.assignedToUserId} label="Owner" disabled={!canManage} />
              {canManage && transitions.length ? (
                <ActionForm
                  action={changeRequirementStatusAction}
                  hidden={{ id: r.id }}
                  fields={[
                    { name: "status", label: "Move to", kind: "select", required: true, options: transitions },
                    { name: "reason", label: "Reason", kind: "textarea", optional: true, rows: 2, hint: "Shared with the employer for holds and cancellations" },
                  ]}
                  submitLabel="Update status"
                  submitVariant="outline"
                />
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Quotation" description="Fee quoted to the client for this requirement.">
            <div className="space-y-4">
              <p className="text-sm">
                {r.quotedFeeMinor != null && r.quotedFeeCurrency ? (
                  <>
                    Current quote: <MoneyText amountMinor={r.quotedFeeMinor} currency={r.quotedFeeCurrency} />
                  </>
                ) : (
                  <span className="text-muted-foreground">No quotation recorded.</span>
                )}
              </p>
              {canManage ? (
                <ActionForm
                  action={setRequirementQuotationAction}
                  hidden={{ id: r.id }}
                  fields={[
                    { name: "amount", label: "Amount", kind: "number", optional: true, min: 0, step: "0.01", defaultValue: r.quotedFeeMinor != null && r.quotedFeeCurrency ? fromMinorUnits(r.quotedFeeMinor, r.quotedFeeCurrency) : null },
                    { name: "currency", label: "Currency", kind: "search-select", options: currencies, optional: true, allowClear: true, defaultValue: r.quotedFeeCurrency, hint: "Leave both empty to clear the quote" },
                  ]}
                  submitLabel="Save quotation"
                  submitVariant="outline"
                />
              ) : null}
            </div>
          </SectionCard>

          {canSeeAssignments || canAssignPartner ? (
            <SectionCard title="Partner assignments" description="Recruitment partners sourcing for this requirement.">
              <div className="space-y-4">
                {assignments.length ? (
                  <ul className="space-y-2 text-sm">
                    {assignments.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                        <Link className="font-medium text-teal-strong underline underline-offset-4" href={`/admin/partners/${a.id}`}>
                          {a.partnerName}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {humanize(a.status)} · {a.submissionsUsed} submitted
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No partners assigned.</p>
                )}
                {canAssignPartner && delivering ? (
                  partners.length ? (
                    <details className="rounded-lg border border-border p-3">
                      <summary className="cursor-pointer text-sm font-medium">Assign a partner</summary>
                      <div className="mt-3">
                        <ActionForm
                          action={assignPartnerFormAction}
                          hidden={{ requirementId: r.id }}
                          fields={[
                            { name: "partnerOrganizationId", label: "Verified partner", kind: "search-select", options: partners, required: true },
                            { name: "positionsTarget", label: "Positions target", kind: "number", optional: true, min: 1 },
                            { name: "dueDate", label: "Due date", kind: "date", optional: true },
                            { name: "instructions", label: "Instructions for the partner", kind: "textarea", optional: true },
                          ]}
                          submitLabel="Assign partner"
                          resetOnSuccess
                        />
                        <p className="mt-2 text-xs text-muted-foreground">Set commission terms on the assignment page afterwards.</p>
                      </div>
                    </details>
                  ) : (
                    <p className="text-xs text-muted-foreground">No verified recruitment partners yet.</p>
                  )
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          {canManage ? (
            <SectionCard title="Internal summary" description="A running brief for the delivery team. Never shown to the employer.">
              <ActionForm
                action={setRequirementInternalNotesAction}
                hidden={{ id: r.id }}
                fields={[{ name: "internalNotes", label: "Summary", kind: "textarea", optional: true, rows: 5, defaultValue: r.internalNotes }]}
                submitLabel="Save summary"
                submitVariant="outline"
              />
            </SectionCard>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
