import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { TicketReplyForm } from "@/components/support/ticket-reply-form";
import { TicketThread } from "@/components/support/ticket-thread";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { env } from "@/lib/env";
import { maskEmail, maskPhone } from "@/lib/format";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { GRIEVANCE_TYPE_LABELS, TICKET_CATEGORY_LABELS, TICKET_CHANNEL_LABELS, TICKET_PRIORITY_LABELS, TICKET_STAFF_TRANSITIONS, TICKET_STATUS_LABELS } from "@/modules/operations/constants";
import { getTicket } from "@/modules/operations/queries";

import { SlaBadge } from "../_components/sla-badge";
import { MarkGrievanceForm, TicketEscalateForm, TicketQuickFields, TicketStatusForm, TicketTagsForm } from "../_components/ticket-manage";
import { staffOptionsWithPermission } from "../_lib/staff";

export const metadata: Metadata = { title: "Support request" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PORTAL_LABELS: Record<string, string> = { public: "Public website", talent: "People Portal", employer: "Employer Portal", recruiter: "Partner Portal", institution: "Institution Portal", admin: "Command Centre" };

export default async function StaffTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff("support.view");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await getTicket(ctx, id);
  if (!detail) notFound();
  const { ticket, sla, requester, organization } = detail;
  const canManage = staffCan(ctx, "support.manage") && (!ticket.isGrievance || staffCan(ctx, "support.grievances"));
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const staffOptions = canManage ? await staffOptionsWithPermission("support.manage") : [];
  const statusOptions = TICKET_STAFF_TRANSITIONS[ticket.status].map((s) => ({ value: s, label: TICKET_STATUS_LABELS[s] }));
  const open = ticket.status !== "resolved" && ticket.status !== "closed";
  // Contact details are shown to staff who can act on the request; others see them masked.
  const email = requester?.email ?? ticket.requesterEmail;
  const phone = requester?.phone ?? ticket.requesterPhone;

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Support desk", href: "/admin/support" }, { label: ticket.code }]} />
      <PageHeader
        eyebrow={ticket.grievanceCode ? `${ticket.code} · Grievance ${ticket.grievanceCode}` : ticket.code}
        title={ticket.subject}
        status={<StatusBadge status={ticket.status} domain="ticket" overrides={{ pending_requester: { tone: "info", label: "Awaiting requester" } }} />}
        backLink={{ href: "/admin/support", label: "Back to support desk" }}
      />
      {ticket.escalationLevel > 0 ? (
        <Callout tone="warning" title={`Escalated (level ${ticket.escalationLevel})`}>
          {ticket.escalatedAt ? (
            <>
              Escalated <DateText value={ticket.escalatedAt} mode="datetime" timeZone={timeZone} />. See the internal notes for the reason.
            </>
          ) : (
            "See the internal notes for the reason."
          )}
        </Callout>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {ticket.resolution ? (
            <Callout tone="success" title="Resolution sent to the requester">
              <p className="whitespace-pre-wrap">{ticket.resolution}</p>
            </Callout>
          ) : null}
          <SectionCard title="Conversation" description="Internal notes are marked and never shown to the requester." headingLevel="h2">
            <TicketThread messages={detail.messages} timeZone={timeZone} viewer="staff" />
          </SectionCard>
          {canManage ? (
            <SectionCard title="Reply or add an internal note" headingLevel="h2">
              {ticket.status === "closed" ? (
                <Callout tone="neutral">This request is closed. Reopen it (status “Awaiting support”) to reply.</Callout>
              ) : !requester && !ticket.requesterEmail && !ticket.requesterPhone ? (
                <Callout tone="warning">This requester has no account or contact details; public replies cannot reach them.</Callout>
              ) : null}
              {ticket.status !== "closed" ? <TicketReplyForm ticketId={ticket.id} mode="staff" statusOptions={statusOptions} /> : null}
            </SectionCard>
          ) : null}
        </div>
        <div className="space-y-6">
          <SectionCard title="Deadlines" headingLevel="h2">
            <KeyValueList
              columns={1}
              dense
              items={[
                {
                  label: "First reply",
                  value: (
                    <span className="flex flex-wrap items-center gap-2">
                      <SlaBadge state={sla.firstResponse} />
                      {ticket.firstResponseDueAt ? <DateText value={ticket.firstResponseDueAt} mode="datetime" timeZone={timeZone} /> : null}
                    </span>
                  ),
                },
                {
                  label: "Resolution",
                  value: ticket.resolutionDueAt ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <SlaBadge state={sla.resolution} />
                      <DateText value={ticket.resolutionDueAt} mode="datetime" timeZone={timeZone} />
                    </span>
                  ) : (
                    "No resolution deadline (regular request)"
                  ),
                },
                ...(ticket.slaBreachedAt ? [{ label: "Deadline missed", value: <DateText value={ticket.slaBreachedAt} mode="datetime" timeZone={timeZone} /> }] : []),
              ]}
            />
          </SectionCard>
          {canManage ? (
            <SectionCard title="Handling" headingLevel="h2">
              <div className="space-y-6">
                <TicketQuickFields
                  ticketId={ticket.id}
                  assigneeId={ticket.assignedToUserId}
                  priority={ticket.priority}
                  staffOptions={staffOptions}
                  priorityOptions={Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => ({ value, label }))}
                />
                {statusOptions.length ? <TicketStatusForm ticketId={ticket.id} status={ticket.status} statusOptions={statusOptions} /> : null}
              </div>
            </SectionCard>
          ) : (
            <Callout tone="neutral">You can view this request. Handling it needs the “support.manage” permission{ticket.isGrievance ? " and access to grievances" : ""}.</Callout>
          )}
          <SectionCard title="Requester" headingLevel="h2">
            <KeyValueList
              columns={1}
              dense
              items={[
                { label: "Name", value: requester?.displayName ?? ticket.requesterName ?? "Not provided" },
                { label: "Email", value: email ? (canManage ? email : maskEmail(email)) : "Not provided" },
                { label: "Phone", value: phone ? (canManage ? phone : maskPhone(phone)) : "Not provided" },
                { label: "Account", value: requester ? (requester.status === "active" ? "Has an account" : `Account ${requester.status.replace(/_/g, " ")}`) : "Guest (answered by email)" },
                ...(organization
                  ? [
                      {
                        label: "Organisation",
                        value: (
                          <Link className="font-medium text-teal-strong underline underline-offset-4" href={`/admin/organizations/${organization.id}`}>
                            {organization.name}
                          </Link>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </SectionCard>
          <SectionCard title="Details" headingLevel="h2">
            <KeyValueList
              columns={1}
              dense
              items={[
                { label: "Category", value: TICKET_CATEGORY_LABELS[ticket.category] },
                ...(ticket.isGrievance && ticket.grievanceType ? [{ label: "Grievance type", value: GRIEVANCE_TYPE_LABELS[ticket.grievanceType] }] : []),
                { label: "Source", value: `${PORTAL_LABELS[ticket.portal] ?? ticket.portal} · ${TICKET_CHANNEL_LABELS[ticket.channel]}` },
                { label: "Assignee", value: detail.assigneeName ?? "Unassigned" },
                { label: "Raised", value: <DateText value={ticket.createdAt} mode="datetime" timeZone={timeZone} /> },
                ...(ticket.satisfactionRating ? [{ label: "Satisfaction", value: `${ticket.satisfactionRating} of 5${ticket.satisfactionComment ? ` – “${ticket.satisfactionComment}”` : ""}` }] : []),
                ...(detail.enquiry ? [{ label: "From enquiry", value: <Link className="font-medium text-teal-strong underline underline-offset-4" href={`/admin/leads/enquiries/${detail.enquiry.id}`}>{detail.enquiry.code}</Link> }] : []),
                ...(ticket.dataRequestId ? [{ label: "Data request", value: <Link className="font-medium text-teal-strong underline underline-offset-4" href={`/admin/privacy/${ticket.dataRequestId}`}>Open data request</Link> }] : []),
              ]}
            />
          </SectionCard>
          {canManage && open ? (
            <SectionCard title="Escalate" headingLevel="h2">
              <TicketEscalateForm ticketId={ticket.id} staffOptions={staffOptions} />
            </SectionCard>
          ) : null}
          {canManage && !ticket.isGrievance && staffCan(ctx, "support.grievances") ? (
            <SectionCard title="Formal grievance" description="Adds a grievance register code and the statutory timeline." headingLevel="h2">
              <MarkGrievanceForm ticketId={ticket.id} grievanceOptions={Object.entries(GRIEVANCE_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
            </SectionCard>
          ) : null}
          {canManage ? (
            <SectionCard title="Tags" headingLevel="h2">
              <TicketTagsForm ticketId={ticket.id} tags={ticket.tags} />
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
