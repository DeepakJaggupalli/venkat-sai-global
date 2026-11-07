import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { AssignSelect } from "@/components/admin/assign-select";
import { InternalNotesPanel } from "@/components/admin/internal-notes";
import { PRIORITY_OPTIONS } from "@/components/admin/priority-badge";
import { listOrganizationOptions, listStaffOptions } from "@/components/admin/queries";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { humanize } from "@/lib/format";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { assignLeadAction, changeLeadStatusAction, createStaffTaskAction, recordLeadFollowUpAction, updateLeadAction } from "@/modules/operations/admin-actions";
import { ENQUIRY_STATUS_LABELS, LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS, LEAD_TRANSITIONS, LEAD_TYPE_LABELS, REQUIREMENT_STATUS_LABELS } from "@/modules/operations/constants";
import { getLead } from "@/modules/operations/queries";

import { convertLeadFormAction } from "../actions";
import { LEAD_STATUS_TONE } from "../_lib/tones";

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORG_TYPE_FOR_LEAD = { employer: "employer", partner: "recruitment_partner", institution: "institution" } as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Lead" };
  const ctx = await requireStaff("leads.view");
  const lead = await getLead(ctx, id);
  return { title: lead ? `${lead.lead.code} · ${lead.lead.organizationName ?? lead.lead.name}` : "Lead" };
}

export default async function LeadDetailPage({ params }: { params: Params }) {
  const ctx = await requireStaff("leads.view");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await getLead(ctx, id);
  if (!detail) notFound();
  const { lead } = detail;
  const canManage = staffCan(ctx, "leads.manage");
  const orgType = lead.type in ORG_TYPE_FOR_LEAD ? ORG_TYPE_FOR_LEAD[lead.type as keyof typeof ORG_TYPE_FOR_LEAD] : null;
  const [staff, orgOptions] = await Promise.all([
    listStaffOptions({ permission: "leads.view" }),
    canManage && orgType && !lead.organizationId && staffCan(ctx, "orgs.view") ? listOrganizationOptions(orgType) : Promise.resolve([]),
  ]);
  const transitions = LEAD_TRANSITIONS[lead.status].map((s) => ({ value: s, label: LEAD_STATUS_LABELS[s] }));

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Leads & enquiries", href: "/admin/leads" }, { label: lead.code }]} />
      <PageHeader
        eyebrow={`${lead.code} · ${LEAD_TYPE_LABELS[lead.type]} lead`}
        title={lead.organizationName ?? lead.name}
        description={lead.organizationName ? `${lead.name}${lead.designation ? `, ${lead.designation}` : ""}` : (lead.designation ?? undefined)}
        status={<StatusBadge tone={LEAD_STATUS_TONE[lead.status]}>{LEAD_STATUS_LABELS[lead.status]}</StatusBadge>}
        backLink={{ href: "/admin/leads", label: "Back to leads" }}
      />

      {lead.status === "lost" && lead.lostReason ? (
        <Callout tone="neutral" title="Lost">
          {lead.lostReason}
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <SectionCard title="Lead details">
            <KeyValueList
              columns={2}
              items={[
                { label: "Contact", value: lead.name },
                { label: "Email", value: lead.email ? <a className="text-teal-strong underline underline-offset-4" href={`mailto:${lead.email}`}>{lead.email}</a> : null },
                { label: "Phone", value: lead.phone ? <a className="text-teal-strong underline underline-offset-4" href={`tel:${lead.phone}`}>{lead.phone}</a> : null },
                { label: "Location", value: [lead.city, lead.countryCode].filter(Boolean).join(", ") || null },
                { label: "Source", value: `${LEAD_SOURCE_LABELS[lead.source]}${lead.sourceDetail ? ` · ${lead.sourceDetail}` : ""}` },
                { label: "Consent to contact", value: lead.consentToContact ? "Given" : "Not recorded" },
                {
                  label: "Estimated value",
                  value: lead.estimatedValueMinor != null && lead.estimatedValueCurrency ? <MoneyText amountMinor={lead.estimatedValueMinor} currency={lead.estimatedValueCurrency} /> : null,
                },
                { label: "Last contacted", value: lead.lastContactedAt ? <DateText value={lead.lastContactedAt} mode="datetime" /> : null },
                { label: "Next follow-up", value: lead.nextFollowUpAt ? <DateText value={lead.nextFollowUpAt} mode="datetime" /> : null },
                { label: "Created", value: <>{<DateText value={lead.createdAt} />}{detail.createdByName ? ` by ${detail.createdByName}` : ""}</> },
                { label: "What they need", value: lead.interest, fullWidth: true },
              ]}
            />
          </SectionCard>

          {canManage ? (
            <SectionCard title="Record a follow-up" description="Logs the contact on the lead. A new lead moves to Contacted.">
              <ActionForm
                action={recordLeadFollowUpAction}
                hidden={{ id: lead.id }}
                columns={2}
                fields={[
                  { name: "note", label: "What was discussed", kind: "textarea", optional: true },
                  { name: "contactedAt", label: "Contacted at", kind: "datetime-local", optional: true, hint: "Leave empty for now" },
                  { name: "nextFollowUpAt", label: "Next follow-up", kind: "datetime-local", optional: true, hint: "You get a reminder" },
                ]}
                submitLabel="Save follow-up"
                resetOnSuccess
              />
            </SectionCard>
          ) : null}

          <SectionCard title="Linked records">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="font-heading text-sm font-semibold">Enquiries</h3>
                {detail.enquiries.length ? (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {detail.enquiries.map((e) => (
                      <li key={e.id}>
                        <Link className="text-teal-strong underline underline-offset-4" href={`/admin/leads/enquiries/${e.id}`}>
                          {e.code}
                        </Link>{" "}
                        {e.subject ?? humanize(e.type)} · {ENQUIRY_STATUS_LABELS[e.status as keyof typeof ENQUIRY_STATUS_LABELS] ?? humanize(e.status)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No enquiries linked.</p>
                )}
              </div>
              <div>
                <h3 className="font-heading text-sm font-semibold">Requirements</h3>
                {detail.requirements.length ? (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {detail.requirements.map((r) => (
                      <li key={r.id}>
                        <Link className="text-teal-strong underline underline-offset-4" href={`/admin/requirements/${r.id}`}>
                          {r.code}
                        </Link>{" "}
                        {r.title} · {r.totalPositions} positions · {REQUIREMENT_STATUS_LABELS[r.status as keyof typeof REQUIREMENT_STATUS_LABELS] ?? humanize(r.status)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No requirements linked.</p>
                )}
              </div>
            </div>
          </SectionCard>

          {canManage ? (
            <SectionCard title="Edit lead">
              <ActionForm
                action={updateLeadAction}
                hidden={{ id: lead.id }}
                columns={2}
                fields={[
                  { name: "name", label: "Contact name", required: true, defaultValue: lead.name },
                  { name: "designation", label: "Designation", optional: true, defaultValue: lead.designation },
                  { name: "organizationName", label: "Organisation", optional: true, defaultValue: lead.organizationName },
                  { name: "email", label: "Email", kind: "email", optional: true, defaultValue: lead.email },
                  { name: "phone", label: "Phone", kind: "tel", optional: true, defaultValue: lead.phone },
                  { name: "city", label: "City", optional: true, defaultValue: lead.city },
                  { name: "interest", label: "What they need", kind: "textarea", optional: true, defaultValue: lead.interest },
                  { name: "consentToContact", label: "The contact agreed to be contacted by Venkat Sai", kind: "checkbox", defaultValue: lead.consentToContact, wide: true },
                ]}
                submitLabel="Save changes"
                submitVariant="outline"
              />
            </SectionCard>
          ) : null}

          <InternalNotesPanel ctx={ctx} entityType="lead" entityId={lead.id} />
        </div>

        <aside className="space-y-6" aria-label="Lead actions">
          <SectionCard title="Owner and status">
            <div className="space-y-5">
              <AssignSelect action={assignLeadAction} recordId={lead.id} options={staff} current={lead.assignedToUserId} label="Owner" disabled={!canManage} />
              {canManage && transitions.length ? (
                <ActionForm
                  action={changeLeadStatusAction}
                  hidden={{ id: lead.id }}
                  fields={[
                    { name: "status", label: "Move to", kind: "select", required: true, options: transitions },
                    { name: "lostReason", label: "Reason (when lost)", kind: "textarea", optional: true, rows: 2 },
                  ]}
                  submitLabel="Update status"
                  submitVariant="outline"
                />
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Organisation">
            {detail.organization ? (
              <p className="text-sm">
                Converted to{" "}
                <Link className="font-medium text-teal-strong underline underline-offset-4" href={`/admin/organizations/${detail.organization.id}`}>
                  {detail.organization.name}
                </Link>{" "}
                ({humanize(detail.organization.status)}).
              </p>
            ) : orgType && canManage ? (
              orgOptions.length ? (
                <ActionForm
                  action={convertLeadFormAction}
                  hidden={{ id: lead.id }}
                  intro={<p className="text-sm text-muted-foreground">When the prospect has registered, link the lead to their organisation. The lead is marked won.</p>}
                  fields={[{ name: "organizationId", label: "Organisation", kind: "search-select", required: true, options: orgOptions }]}
                  submitLabel="Convert lead"
                  pendingLabel="Converting…"
                />
              ) : (
                <p className="text-sm text-muted-foreground">No {humanize(orgType).toLowerCase()} organisations are registered yet. Ask the prospect to sign up, then convert the lead.</p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">This lead type is not converted to an organisation.</p>
            )}
          </SectionCard>

          <SectionCard title="Add a task" description="Creates a reminder linked to this lead.">
            <ActionForm
              action={createStaffTaskAction}
              hidden={{ relatedType: "lead", relatedId: lead.id, organizationId: lead.organizationId }}
              fields={[
                { name: "title", label: "Task", required: true },
                { name: "dueAt", label: "Due", kind: "datetime-local", optional: true },
                { name: "priority", label: "Priority", kind: "select", options: PRIORITY_OPTIONS, defaultValue: "normal" },
                { name: "assignedToUserId", label: "Assign to", kind: "search-select", options: staff, defaultValue: lead.assignedToUserId ?? ctx.user.id, allowClear: true },
              ]}
              submitLabel="Create task"
              submitVariant="outline"
              resetOnSuccess
            />
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
