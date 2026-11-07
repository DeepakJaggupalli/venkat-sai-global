import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, CircleAlert, ExternalLink } from "lucide-react";

import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { AssignSelect } from "@/components/admin/assign-select";
import { InternalNotesPanel } from "@/components/admin/internal-notes";
import { listStaffOptions } from "@/components/admin/queries";
import { FileLink } from "@/components/files";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { OrgAvatar } from "@/components/shared/avatars";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Timeline } from "@/components/shared/timeline";
import { humanize, maskEmail } from "@/lib/format";
import { getOpenApprovalForEntity } from "@/modules/approvals/service";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { expireOrganizationVerificationAction, reactivateOrganizationAction, suspendOrganizationAction } from "@/modules/organizations/actions";
import {
  ORG_DOCUMENT_TYPE_LABELS,
  ORG_TYPE_LABELS,
  PARTNER_LICENCE_TYPE_LABELS,
  PARTNER_LICENCE_VERIFICATION_METHOD_LABELS,
  PARTNER_LICENCE_VERIFICATION_METHODS,
} from "@/modules/organizations/constants";
import { staffSetMemberStatusAction } from "@/modules/organizations/member-actions";
import { listMembers } from "@/modules/organizations/members";
import { expirePartnerLicenceAction, rejectPartnerLicenceAction } from "@/modules/organizations/partner-actions";
import { listPartnerLicences } from "@/modules/organizations/partner";
import { getOrganizationOverview, listOrganizationDocuments, listVerificationHistory } from "@/modules/organizations/queries";
import { VERIFICATION_APPROVAL_TYPE } from "@/modules/organizations/verification-decisions";

import { assignAccountManagerAction, reviewDocumentFormAction, verifyLicenceFormAction } from "../actions";

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string) {
  const staff = await requireStaff("orgs.view");
  if (!UUID.test(id)) return { staff, overview: null };
  const overview = await getOrganizationOverview(staff, id).catch(() => null);
  return { staff, overview };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { overview } = await load((await params).id);
  return { title: overview?.organization.name ?? "Organisation" };
}

export default async function OrganizationDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const { staff, overview } = await load(id);
  if (!overview) notFound();
  const org = overview.organization;
  const isPartner = org.type === "recruitment_partner";
  const canManage = staffCan(staff, "orgs.manage");
  const canVerify = staffCan(staff, "orgs.verify");

  const [members, documents, history, licences, openApproval, managers] = await Promise.all([
    listMembers(staff, org.id).catch(() => []),
    listOrganizationDocuments(staff, org.id),
    listVerificationHistory(staff, org.id),
    isPartner ? listPartnerLicences(staff, org.id) : Promise.resolve([]),
    getOpenApprovalForEntity(VERIFICATION_APPROVAL_TYPE[org.type], org.id),
    listStaffOptions({ permission: "orgs.view" }),
  ]);
  const typeParam = `?type=${org.type}`;
  const listLabel = org.type === "employer" ? "Employers" : isPartner ? "Recruitment partners" : "Institutions";

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: listLabel, href: `/admin/organizations${typeParam}` }, { label: org.name }]} />
      <PageHeader
        eyebrow={ORG_TYPE_LABELS[org.type]}
        title={
          <span className="flex items-center gap-3">
            <OrgAvatar name={org.name} src={overview.logo?.thumbnailUrl ?? overview.logo?.url ?? undefined} size="md" verified={org.status === "verified"} />
            <span className="min-w-0">{org.name}</span>
          </span>
        }
        description={org.legalName && org.legalName !== org.name ? `Legal name: ${org.legalName}` : undefined}
        status={<StatusBadge status={org.status} domain="organization" />}
        backLink={{ href: `/admin/organizations${typeParam}`, label: `Back to ${listLabel.toLowerCase()}` }}
        actions={[
          ...(openApproval ? [{ label: "Review verification", href: `/admin/approvals/${openApproval.id}` }] : []),
          ...(org.type === "employer" && staffCan(staff, "jobs.view") ? [{ label: "Jobs", href: `/admin/jobs?organizationId=${org.id}`, variant: "outline" as const }] : []),
        ]}
      />

      {org.status === "suspended" ? (
        <Callout tone="danger" title="Suspended">
          {org.statusReason ?? "No reason recorded."}
          {org.suspendedAt ? (
            <>
              {" "}
              Since <DateText value={org.suspendedAt} />.
            </>
          ) : null}
        </Callout>
      ) : org.status === "rejected" && org.statusReason ? (
        <Callout tone="warning" title="Verification rejected">
          {org.statusReason}
        </Callout>
      ) : null}
      {overview.verificationDaysLeft != null && overview.verificationDaysLeft <= 30 ? (
        <Callout tone="warning" title="Verification expiring">
          Verification lapses in {overview.verificationDaysLeft} {overview.verificationDaysLeft === 1 ? "day" : "days"}. The organisation has been reminded to renew.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <SectionCard title="Profile">
            <KeyValueList
              columns={2}
              items={[
                { label: "Email", value: org.email },
                { label: "Phone", value: org.phone },
                {
                  label: "Website",
                  value: org.websiteUrl ? (
                    <a href={org.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-teal-strong underline underline-offset-4">
                      {org.websiteUrl}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : null,
                },
                { label: "Location", value: [org.addressLine1, org.city, org.stateRegion, org.postalCode, org.countryCode].filter(Boolean).join(", ") || null },
                { label: "Registration number", value: org.registrationNumber },
                { label: "Tax ID", value: org.taxId },
                { label: "Public page", value: org.isPublic ? "Enabled" : "Off" },
                { label: "Joined", value: <DateText value={org.createdAt} /> },
                { label: "Verified", value: org.verifiedAt ? <DateText value={org.verifiedAt} /> : null },
                { label: "Valid until", value: org.verificationExpiresAt ? <DateText value={org.verificationExpiresAt} /> : null },
                { label: "Members", value: `${overview.memberCount} active · ${overview.pendingInvitationCount} invited` },
                { label: "About", value: org.description, fullWidth: true },
              ]}
            />
          </SectionCard>

          <SectionCard title="Verification readiness" description="What the organisation needs before it can be verified.">
            <ul className="space-y-2">
              {overview.readiness.documentRequirements.map((req) => (
                <li key={req.id} className="flex items-start gap-2 text-sm">
                  {req.met ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 text-success-strong" /> : <CircleAlert aria-hidden="true" className="mt-0.5 size-4 text-warning-strong" />}
                  <span>
                    {req.label}
                    <span className="sr-only">{req.met ? " (provided)" : " (missing)"}</span>
                  </span>
                </li>
              ))}
              {overview.readiness.issues.map((issue) => (
                <li key={issue.code} className="flex items-start gap-2 text-sm text-warning-strong">
                  <CircleAlert aria-hidden="true" className="mt-0.5 size-4" />
                  {issue.message}
                </li>
              ))}
            </ul>
            {overview.readiness.ready ? <p className="mt-3 text-sm text-success-strong">Ready for verification.</p> : null}
          </SectionCard>

          <SectionCard title={`Documents (${documents.length})`} flush>
            <DataTable
              caption="Organisation documents"
              rows={documents}
              getRowId={(d) => d.id}
              bordered={false}
              columns={[
                {
                  id: "doc",
                  header: "Document",
                  primary: true,
                  cell: (d) => (
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-foreground">{d.title ?? ORG_DOCUMENT_TYPE_LABELS[d.documentType]}</p>
                      <p className="text-xs text-muted-foreground">
                        {ORG_DOCUMENT_TYPE_LABELS[d.documentType]}
                        {d.documentNumber ? ` · ${d.documentNumber}` : ""}
                      </p>
                      {d.file ? <FileLink file={d.file} /> : <span className="text-xs text-muted-foreground">File unavailable</span>}
                    </div>
                  ),
                },
                { id: "expires", header: "Expires", hideOnMobile: true, cell: (d) => (d.expiresAt ? <DateText value={d.expiresAt} dateOnly /> : <span className="text-muted-foreground">No expiry</span>) },
                { id: "review", header: "Review", cell: (d) => <StatusBadge status={d.reviewStatus} domain="verification" size="sm" /> },
                {
                  id: "actions",
                  header: <span className="sr-only">Actions</span>,
                  align: "right",
                  cell: (d) =>
                    canVerify && d.reviewStatus === "pending" ? (
                      <details className="text-left">
                        <summary className="cursor-pointer text-sm font-medium text-teal-strong">Review</summary>
                        <div className="mt-2 w-64">
                          <ActionForm
                            action={reviewDocumentFormAction}
                            hidden={{ documentId: d.id }}
                            fields={[
                              { name: "reviewStatus", label: "Decision", kind: "select", required: true, options: [{ value: "accepted", label: "Accept" }, { value: "rejected", label: "Reject" }] },
                              { name: "reviewNotes", label: "Notes", kind: "textarea", optional: true, rows: 2, hint: "Required when rejecting; the organisation sees it" },
                            ]}
                            submitLabel="Save review"
                          />
                        </div>
                      </details>
                    ) : d.reviewNotes ? (
                      <span className="text-xs text-muted-foreground">{d.reviewNotes}</span>
                    ) : null,
                },
              ]}
              empty={<EmptyState size="sm" title="No documents uploaded" description="The organisation uploads documents from its portal." />}
            />
          </SectionCard>

          {isPartner ? (
            <SectionCard title="Recruitment licences" description="Overseas recruitment needs a verified licence (eMigrate registration for India).">
              {licences.length ? (
                <ul className="space-y-4">
                  {licences.map((l) => (
                    <li key={l.id} className="rounded-lg border border-border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{PARTNER_LICENCE_TYPE_LABELS[l.licenceType]}</p>
                          <p className="text-sm text-muted-foreground">
                            {l.licenceNumber} · {l.issuingAuthority ?? "Issuer not given"}
                            {l.issuingCountryCode ? ` · ${l.issuingCountryCode}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Valid {l.validFrom ? <DateText value={l.validFrom} dateOnly /> : "—"} to {l.validUntil ? <DateText value={l.validUntil} dateOnly /> : "—"}
                            {l.verificationMethod ? ` · ${PARTNER_LICENCE_VERIFICATION_METHOD_LABELS[l.verificationMethod]}` : ""}
                          </p>
                          {l.rejectionReason ? <p className="mt-1 text-sm text-danger-strong">{l.rejectionReason}</p> : null}
                        </div>
                        <StatusBadge status={l.verificationStatus} domain="verification" size="sm" />
                      </div>
                      {canVerify && l.verificationStatus === "pending" ? (
                        <div className="mt-3 grid gap-4 border-t border-border pt-3 sm:grid-cols-2">
                          <ActionForm
                            action={verifyLicenceFormAction}
                            hidden={{ licenceId: l.id }}
                            fields={[
                              {
                                name: "method",
                                label: "How did you verify it?",
                                kind: "select",
                                required: true,
                                options: PARTNER_LICENCE_VERIFICATION_METHODS.map((m) => ({ value: m, label: PARTNER_LICENCE_VERIFICATION_METHOD_LABELS[m] })),
                              },
                              { name: "notes", label: "Notes", kind: "textarea", optional: true, rows: 2 },
                            ]}
                            submitLabel="Verify licence"
                          />
                          <ActionForm
                            action={rejectPartnerLicenceAction}
                            hidden={{ licenceId: l.id }}
                            fields={[{ name: "reason", label: "Reason for rejecting", kind: "textarea", required: true, rows: 2 }]}
                            submitLabel="Reject licence"
                            submitVariant="destructive"
                          />
                        </div>
                      ) : null}
                      {canVerify && l.verificationStatus === "verified" ? (
                        <div className="mt-3">
                          <ActionButton
                            action={expirePartnerLicenceAction.bind(null, { licenceId: l.id })}
                            confirm={{ title: "Mark this licence as expired?", description: "Overseas jobs will no longer show it, and the partner is asked to renew.", confirmLabel: "Mark expired", destructive: true }}
                          >
                            Mark expired
                          </ActionButton>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState size="sm" title="No licences recorded" description="The partner adds licences from the Partner Portal." />
              )}
            </SectionCard>
          ) : null}

          <SectionCard title={`Members (${members.length})`} flush>
            <DataTable
              caption="Organisation members"
              rows={members}
              getRowId={(m) => m.id}
              bordered={false}
              columns={[
                {
                  id: "name",
                  header: "Member",
                  primary: true,
                  cell: (m) => (
                    <div className="min-w-0">
                      <Link className="font-medium text-foreground hover:underline" href={`/admin/users/${m.userId}`}>
                        {m.displayName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {maskEmail(m.email)}
                        {m.jobTitle ? ` · ${m.jobTitle}` : ""}
                      </p>
                    </div>
                  ),
                },
                { id: "role", header: "Role", cell: (m) => m.roleName },
                { id: "status", header: "Status", cell: (m) => <StatusBadge status={m.status} size="sm" /> },
                { id: "active", header: "Last active", hideOnMobile: true, cell: (m) => (m.lastActiveAt ? <RelativeTime value={m.lastActiveAt} /> : <span className="text-muted-foreground">—</span>) },
                {
                  id: "actions",
                  header: <span className="sr-only">Actions</span>,
                  align: "right",
                  cell: (m) =>
                    canManage && !m.isOwner && m.status !== "invited" ? (
                      <ActionButton
                        action={staffSetMemberStatusAction.bind(null, { organizationId: org.id, memberId: m.id, status: m.status === "active" ? "disabled" : "active" })}
                        confirm={
                          m.status === "active"
                            ? { title: `Disable ${m.displayName}?`, description: "They lose access to this organisation's portal until re-enabled.", confirmLabel: "Disable", destructive: true }
                            : undefined
                        }
                      >
                        {m.status === "active" ? "Disable" : "Enable"}
                        <span className="sr-only"> {m.displayName}</span>
                      </ActionButton>
                    ) : null,
                },
              ]}
              empty={<EmptyState size="sm" title="No members" />}
            />
          </SectionCard>

          <SectionCard title="Verification history">
            <Timeline
              label="Verification history"
              timeFormat="absolute"
              items={history.map((h) => ({
                id: h.id,
                title: `${humanize(h.status)}${h.validUntil ? ` · valid until ${h.validUntil.toISOString().slice(0, 10)}` : ""}`,
                at: h.reviewedAt ?? h.submittedAt,
                actor: h.reviewedByName ? { name: h.reviewedByName, role: "Reviewer" } : h.submittedByName ? { name: h.submittedByName, role: "Submitted" } : null,
                note: h.decisionNotes ?? undefined,
                tone: h.status === "approved" ? "success" : h.status === "rejected" ? "danger" : h.status === "changes_requested" ? "warning" : "info",
              }))}
              emptyTitle="Never submitted for verification"
              emptyDescription="Submissions and decisions appear here."
            />
            {history.some((h) => h.approvalRequestId) ? (
              <ul className="mt-4 flex flex-wrap gap-3 text-sm">
                {history
                  .filter((h) => h.approvalRequestId)
                  .slice(0, 5)
                  .map((h) => (
                    <li key={h.id}>
                      <Link className="inline-flex items-center gap-1 text-teal-strong underline underline-offset-4" href={`/admin/approvals/${h.approvalRequestId}`}>
                        <ExternalLink aria-hidden="true" className="size-3.5" />
                        Approval of <DateText value={h.submittedAt} />
                      </Link>
                    </li>
                  ))}
              </ul>
            ) : null}
          </SectionCard>

          <InternalNotesPanel ctx={staff} entityType="organization" entityId={org.id} organizationId={org.id} />
        </div>

        <aside className="space-y-6" aria-label="Organisation actions">
          <SectionCard title="Account manager">
            <AssignSelect action={assignAccountManagerAction} recordId={org.id} options={managers} current={org.accountManagerUserId} label="Relationship owner" disabled={!canManage} />
          </SectionCard>

          {canManage ? (
            <SectionCard title="Account status">
              {org.status === "suspended" ? (
                <ActionForm
                  action={reactivateOrganizationAction}
                  hidden={{ organizationId: org.id }}
                  intro={<p className="text-sm text-muted-foreground">Restores access. The organisation returns to its verification status (or draft if it has lapsed).</p>}
                  fields={[{ name: "note", label: "Note", kind: "textarea", optional: true, rows: 2 }]}
                  submitLabel="Reactivate"
                />
              ) : (
                <div className="space-y-5">
                  <ActionForm
                    action={suspendOrganizationAction}
                    hidden={{ organizationId: org.id }}
                    intro={<p className="text-sm text-muted-foreground">Suspension hides its jobs and blocks portal actions. Members are notified with the reason.</p>}
                    fields={[{ name: "reason", label: "Reason for suspension", kind: "textarea", required: true, rows: 2 }]}
                    submitLabel="Suspend organisation"
                    submitVariant="destructive"
                  />
                  {org.status === "verified" && (canVerify || canManage) ? (
                    <details className="rounded-lg border border-border p-3">
                      <summary className="cursor-pointer text-sm font-medium">End verification early</summary>
                      <div className="mt-3">
                        <ActionForm
                          action={expireOrganizationVerificationAction}
                          hidden={{ organizationId: org.id }}
                          fields={[{ name: "reason", label: "Reason", kind: "textarea", required: true, rows: 2 }]}
                          submitLabel="Expire verification"
                          submitVariant="outline"
                        />
                      </div>
                    </details>
                  ) : null}
                </div>
              )}
            </SectionCard>
          ) : null}

          {openApproval ? (
            <Callout tone="info" title="Verification awaiting decision" action={{ label: "Open in approval centre", href: `/admin/approvals/${openApproval.id}` }}>
              {openApproval.code} was submitted <DateText value={openApproval.createdAt} />.
            </Callout>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
