import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { AssignSelect } from "@/components/admin/assign-select";
import { InternalNotesPanel } from "@/components/admin/internal-notes";
import { listStaffOptions } from "@/components/admin/queries";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { humanize } from "@/lib/format";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import {
  assignEnquiryAction,
  convertEnquiryToTicketAction,
  linkEnquiryToLeadAction,
  markEnquirySpamAction,
  respondToEnquiryAction,
  setEnquiryStatusAction,
} from "@/modules/operations/admin-actions";
import { ENQUIRY_STATUS_LABELS, ENQUIRY_TRANSITIONS, ENQUIRY_TYPE_LABELS } from "@/modules/operations/constants";
import { getEnquiry } from "@/modules/operations/queries";

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Enquiry" };
  const ctx = await requireStaff("leads.view");
  const detail = await getEnquiry(ctx, id);
  return { title: detail ? `${detail.enquiry.code} · Enquiry` : "Enquiry" };
}

export default async function EnquiryDetailPage({ params }: { params: Params }) {
  const ctx = await requireStaff("leads.view");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await getEnquiry(ctx, id);
  if (!detail) notFound();
  const { enquiry } = detail;
  const canManage = staffCan(ctx, "leads.manage");
  const canTicket = canManage && staffCan(ctx, "support.manage");
  const staff = await listStaffOptions({ permission: "leads.view" });
  const transitions = ENQUIRY_TRANSITIONS[enquiry.status].filter((s) => s !== "spam").map((s) => ({ value: s, label: ENQUIRY_STATUS_LABELS[s] }));
  const isOpen = enquiry.status !== "closed" && enquiry.status !== "spam";

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Leads & enquiries", href: "/admin/leads?tab=enquiries" }, { label: enquiry.code }]} />
      <PageHeader
        eyebrow={`${enquiry.code} · ${ENQUIRY_TYPE_LABELS[enquiry.type]}`}
        title={enquiry.subject ?? `${ENQUIRY_TYPE_LABELS[enquiry.type]} enquiry from ${enquiry.name}`}
        status={<StatusBadge status={enquiry.status}>{ENQUIRY_STATUS_LABELS[enquiry.status]}</StatusBadge>}
        backLink={{ href: "/admin/leads?tab=enquiries", label: "Back to enquiries" }}
      />

      {enquiry.type === "grievance" ? (
        <Callout tone="warning" title="Grievance">
          Grievances are handled through the support desk with the statutory timelines set in settings.
          {detail.ticket ? (
            <>
              {" "}
              <Link className="underline underline-offset-4" href={`/admin/support/${detail.ticket.id}`}>
                Open {detail.ticket.grievanceCode ?? detail.ticket.code}
              </Link>
            </>
          ) : null}
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <SectionCard title="Message">
            <p className="text-sm whitespace-pre-line text-foreground">{enquiry.message}</p>
            <div className="mt-5 border-t border-border pt-4">
              <KeyValueList
                columns={2}
                dense
                items={[
                  { label: "From", value: enquiry.name },
                  { label: "Organisation", value: enquiry.organizationName },
                  { label: "Email", value: enquiry.email ? <a className="text-teal-strong underline underline-offset-4" href={`mailto:${enquiry.email}`}>{enquiry.email}</a> : null },
                  { label: "Phone", value: enquiry.phone ? <a className="text-teal-strong underline underline-offset-4" href={`tel:${enquiry.phone}`}>{enquiry.phone}</a> : null },
                  { label: "Received", value: <DateText value={enquiry.createdAt} mode="datetime" /> },
                  { label: "Consent to contact", value: enquiry.consentToContact ? `Given (privacy notice ${enquiry.privacyNoticeVersion ?? "version not recorded"})` : "Not given" },
                  { label: "Sent from", value: enquiry.sourcePage },
                  { label: "Responded", value: enquiry.respondedAt ? <DateText value={enquiry.respondedAt} mode="datetime" /> : null },
                ]}
              />
            </div>
          </SectionCard>

          {canManage && isOpen ? (
            <SectionCard title="Record your response" description="Reply by email or phone, then record what you said here. The enquiry moves to Responded.">
              <ActionForm
                action={respondToEnquiryAction}
                hidden={{ id: enquiry.id }}
                fields={[{ name: "note", label: "Response summary", kind: "textarea", required: true, rows: 4 }]}
                submitLabel="Record response"
                resetOnSuccess
              />
            </SectionCard>
          ) : null}

          <InternalNotesPanel ctx={ctx} entityType="enquiry" entityId={enquiry.id} />
        </div>

        <aside className="space-y-6" aria-label="Enquiry actions">
          <SectionCard title="Owner and status">
            <div className="space-y-5">
              <AssignSelect action={assignEnquiryAction} recordId={enquiry.id} options={staff} current={enquiry.assignedToUserId} label="Owner" disabled={!canManage} />
              {canManage && transitions.length ? (
                <ActionForm
                  action={setEnquiryStatusAction}
                  hidden={{ id: enquiry.id }}
                  fields={[
                    { name: "status", label: "Move to", kind: "select", required: true, options: transitions },
                    { name: "note", label: "Note", kind: "textarea", optional: true, rows: 2 },
                  ]}
                  submitLabel="Update status"
                  submitVariant="outline"
                />
              ) : null}
              {canManage && enquiry.status !== "spam" ? (
                <ActionButton
                  action={markEnquirySpamAction.bind(null, { id: enquiry.id })}
                  confirm={{ title: "Mark as spam?", description: "The enquiry is closed and hidden from the open list. You can restore it later.", confirmLabel: "Mark as spam", destructive: true }}
                >
                  Mark as spam
                </ActionButton>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Lead">
            {detail.lead ? (
              <p className="text-sm">
                Linked to{" "}
                <Link className="font-medium text-teal-strong underline underline-offset-4" href={`/admin/leads/${detail.lead.id}`}>
                  {detail.lead.code}
                </Link>{" "}
                {detail.lead.name} ({humanize(detail.lead.status)}).
              </p>
            ) : canManage ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Turn this enquiry into a sales lead to track follow-ups and conversion.</p>
                <ActionButton action={linkEnquiryToLeadAction.bind(null, { id: enquiry.id, leadId: null })} variant="default">
                  Create a lead from this enquiry
                </ActionButton>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not linked to a lead.</p>
            )}
          </SectionCard>

          <SectionCard title="Support request">
            {detail.ticket ? (
              <p className="text-sm">
                <Link className="font-medium text-teal-strong underline underline-offset-4" href={`/admin/support/${detail.ticket.id}`}>
                  {detail.ticket.code}
                </Link>{" "}
                ({humanize(detail.ticket.status)})
              </p>
            ) : canTicket && isOpen ? (
              <ActionButton
                action={convertEnquiryToTicketAction.bind(null, { id: enquiry.id })}
                confirm={{ title: "Open a support request?", description: "The message moves to the support desk with its own response deadlines.", confirmLabel: "Create support request" }}
              >
                Convert to support request
              </ActionButton>
            ) : (
              <p className="text-sm text-muted-foreground">No support request.</p>
            )}
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
