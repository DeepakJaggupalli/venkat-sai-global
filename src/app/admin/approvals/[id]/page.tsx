import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { ActionForm } from "@/components/admin/action-form";
import { AssignSelect } from "@/components/admin/assign-select";
import { PriorityBadge } from "@/components/admin/priority-badge";
import { listStaffOptions, userNames } from "@/components/admin/queries";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Timeline, type TimelineItem } from "@/components/shared/timeline";
import { humanize } from "@/lib/format";
import { APPROVAL_TYPE_LABEL, APPROVAL_TYPE_PERMISSION } from "@/modules/approvals/registry";
import { getApprovalWithEvents } from "@/modules/approvals/service";
import { canAccessFile, getCurrentFileViewer, getFiles, toFileSummary, type FileSummary } from "@/modules/files";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { assignApprovalAction, commentApprovalAction, decideApprovalAction, escalateApprovalAction } from "../actions";
import { approvalOrganization, DECIDABLE_APPROVAL_STATUSES } from "../_lib/queries";
import { collectFileIds } from "../_lib/payload";
import { PayloadView } from "./payload-view";

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Approval request" };
  await requireStaff("approvals.view");
  const data = await getApprovalWithEvents(id);
  return { title: data ? `${data.request.code} · ${data.request.title}` : "Approval request" };
}

const EVENT_LABEL: Record<string, string> = {
  submitted: "Submitted for review",
  resubmitted: "Resubmitted with changes",
  assigned: "Assignment changed",
  escalated: "Escalated",
  commented: "Comment",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes requested",
  cancelled: "Cancelled",
};
const EVENT_TONE = { approved: "success", rejected: "danger", changes_requested: "warning", escalated: "warning", cancelled: "neutral" } as const;

type EventMeta = { assigneeUserId?: string | null; escalateToUserId?: string | null };

export default async function ApprovalDetailPage({ params }: { params: Params }) {
  const ctx = await requireStaff("approvals.view");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const data = await getApprovalWithEvents(id);
  if (!data) notFound();
  const { request, events, adminHref } = data;

  const fileIds = [...collectFileIds(request.payload)];
  const targetIds = events.map((e) => {
    const meta = (e.event.metadata ?? {}) as EventMeta;
    return meta.assigneeUserId ?? meta.escalateToUserId ?? null;
  });
  const [organization, staff, names, viewer, fileRows] = await Promise.all([
    approvalOrganization(request.organizationId),
    listStaffOptions({ permission: "approvals.view" }),
    userNames([request.submittedByUserId, request.assignedToUserId, request.decidedByUserId, ...targetIds]),
    getCurrentFileViewer(),
    fileIds.length ? getFiles(fileIds) : Promise.resolve([]),
  ]);
  const files = new Map<string, FileSummary>();
  for (const f of fileRows) if (await canAccessFile(viewer, f)) files.set(f.id, toFileSummary(f));

  const decidable = (DECIDABLE_APPROVAL_STATUSES as readonly string[]).includes(request.status);
  const open = decidable || request.status === "changes_requested";
  const canDecide = staffCan(ctx, ["approvals.decide", APPROVAL_TYPE_PERMISSION[request.type]]);
  const canEscalate = staffCan(ctx, "approvals.escalate");
  const typeLabel = APPROVAL_TYPE_LABEL[request.type];

  const timeline: TimelineItem[] = events.map(({ event, actorName }) => {
    const meta = (event.metadata ?? {}) as EventMeta;
    const target = meta.assigneeUserId ?? meta.escalateToUserId ?? null;
    let title = EVENT_LABEL[event.action] ?? humanize(event.action);
    if (event.action === "assigned") title = target ? `Assigned to ${names.get(target) ?? "a staff member"}` : "Unassigned";
    else if (event.action === "escalated" && target) title = `Escalated to ${names.get(target) ?? "a staff member"}`;
    return {
      id: event.id,
      title,
      at: event.createdAt,
      actor: actorName ? { name: actorName } : null,
      note: event.note ?? undefined,
      tone: EVENT_TONE[event.action as keyof typeof EVENT_TONE],
    };
  });

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Approval centre", href: "/admin/approvals" }, { label: request.code }]} />
      <PageHeader
        eyebrow={`${request.code} · ${typeLabel}`}
        title={request.title}
        description={request.summary ?? undefined}
        status={
          <span className="flex flex-wrap gap-2">
            <StatusBadge status={request.status} domain="approval" />
            <PriorityBadge priority={request.priority} size="md" />
          </span>
        }
        backLink={{ href: "/admin/approvals", label: "Back to approval centre" }}
        actions={adminHref ? [{ label: "Open the record", href: adminHref, icon: <ExternalLink />, variant: "outline" }] : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {request.decisionReason && !open ? (
            <Callout tone={request.status === "approved" ? "success" : request.status === "rejected" ? "danger" : "info"} title={`Decision: ${humanize(request.status)}`}>
              {request.decisionReason}
            </Callout>
          ) : null}
          <SectionCard title="Submitted snapshot" description="What the submitter sent for review, frozen at submission time.">
            <PayloadView payload={(request.payload ?? {}) as Record<string, unknown>} files={files} />
          </SectionCard>
          <SectionCard title="History">
            <Timeline items={timeline} label="Approval history" timeFormat="absolute" />
            <div className="mt-6 border-t border-border pt-4">
              <ActionForm
                action={commentApprovalAction}
                hidden={{ requestId: request.id }}
                fields={[
                  { name: "note", label: "Add a comment for the team", kind: "textarea", required: true, rows: 2, hint: "Comments are internal and never sent to the submitter." },
                ]}
                submitLabel="Add comment"
                pendingLabel="Adding…"
                submitVariant="outline"
                resetOnSuccess
              />
            </div>
          </SectionCard>
        </div>

        <aside className="space-y-6" aria-label="Request details and decision">
          {decidable ? (
            <SectionCard title="Decision">
              {canDecide ? (
                <ActionForm
                  action={decideApprovalAction}
                  hidden={{ requestId: request.id }}
                  testId="approval-decision-form"
                  fields={[
                    {
                      name: "decision",
                      label: "Decision",
                      kind: "select",
                      required: true,
                      options: [
                        { value: "approved", label: "Approve" },
                        { value: "changes_requested", label: "Request changes" },
                        { value: "rejected", label: "Reject" },
                      ],
                    },
                    {
                      name: "reason",
                      label: "Reason",
                      kind: "textarea",
                      rows: 4,
                      hint: "Required to reject or request changes. The submitter sees this reason, so say what they should do next.",
                    },
                  ]}
                  submitLabel="Record decision"
                  pendingLabel="Recording…"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  You can review this request, but deciding a {typeLabel.toLowerCase()} needs a permission your role does not include.
                </p>
              )}
            </SectionCard>
          ) : request.status === "changes_requested" ? (
            <Callout tone="info" title="Waiting for the submitter">
              Changes were requested. The request reopens automatically when they resubmit.
            </Callout>
          ) : null}

          <SectionCard title="Details">
            <KeyValueList
              columns={1}
              dense
              items={[
                { label: "Type", value: typeLabel },
                {
                  label: "Organisation",
                  value: organization ? (
                    <Link className="text-teal-strong underline underline-offset-4" href={`/admin/organizations/${organization.id}`}>
                      {organization.name}
                    </Link>
                  ) : null,
                },
                { label: "Submitted by", value: request.submittedByUserId ? (names.get(request.submittedByUserId) ?? "Unknown user") : "System" },
                { label: "Submitted", value: <DateText value={request.createdAt} mode="datetime" /> },
                { label: "Due", value: request.dueAt ? <DateText value={request.dueAt} mode="datetime" /> : null },
                { label: "Decided by", value: request.decidedByUserId ? (names.get(request.decidedByUserId) ?? "Former staff member") : null },
                { label: "Decided", value: request.decidedAt ? <DateText value={request.decidedAt} mode="datetime" /> : null },
              ]}
            />
            {open ? (
              <div className="mt-4 border-t border-border pt-4">
                <AssignSelect action={assignApprovalAction} recordId={request.id} options={staff} current={request.assignedToUserId} />
              </div>
            ) : null}
          </SectionCard>

          {decidable && canEscalate ? (
            <SectionCard title="Escalate" description="Raises the priority and, optionally, hands the request to a senior reviewer.">
              <ActionForm
                action={escalateApprovalAction}
                hidden={{ requestId: request.id }}
                fields={[
                  { name: "escalateToUserId", label: "Escalate to", kind: "search-select", options: staff, optional: true, allowClear: true },
                  { name: "note", label: "Reason", kind: "textarea", required: true, rows: 2 },
                ]}
                submitLabel="Escalate"
                pendingLabel="Escalating…"
                submitVariant="outline"
                resetOnSuccess
              />
            </SectionCard>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
