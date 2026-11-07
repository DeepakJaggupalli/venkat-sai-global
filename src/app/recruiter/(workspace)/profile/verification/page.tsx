import type { Metadata } from "next";
import { CheckCircle2, Circle } from "lucide-react";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FileList } from "@/components/shared/file-list";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Timeline, type TimelineItem } from "@/components/shared/timeline";
import { env } from "@/lib/env";
import { requireOrgMember } from "@/modules/identity/authz";
import { ORG_DOCUMENT_TYPE_LABELS, ORG_DOCUMENT_TYPES } from "@/modules/organizations/constants";
import { getOrganizationOverview, listOrganizationDocuments, listVerificationHistory } from "@/modules/organizations/queries";

import { DocumentUploadForm } from "../_components/document-upload-form";
import { RemoveDocumentButton, SubmitVerificationButton } from "../_components/verification-actions";

export const metadata: Metadata = { title: "Agency verification" };

const PARTNER_DOCUMENT_TYPES = ORG_DOCUMENT_TYPES.filter((t) => !["accreditation", "affiliation"].includes(t));
const DOC_REVIEW_LABELS: Record<string, string> = { pending: "Awaiting review", accepted: "Accepted", rejected: "Rejected" };
const DECISION_LABELS: Record<string, string> = {
  submitted: "Submitted for verification",
  under_review: "Review started",
  approved: "Verification approved",
  rejected: "Verification rejected",
  changes_requested: "Changes requested",
  withdrawn: "Submission withdrawn",
};

export default async function RecruiterVerificationPage() {
  const ctx = await requireOrgMember("recruitment_partner", "partner.profile.manage");
  const orgId = ctx.organization.id;
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const [overview, documents, history] = await Promise.all([getOrganizationOverview(ctx, orgId), listOrganizationDocuments(ctx, orgId), listVerificationHistory(ctx, orgId)]);
  const org = overview.organization;
  const readiness = overview.readiness;
  const inReview = org.status === "pending" || org.status === "under_review";
  const latest = history[0] ?? null;
  const renewalOpen = org.status === "verified" && latest?.status !== "submitted" && latest?.status !== "under_review";
  const canSubmit = readiness.ready && !inReview && org.status !== "suspended" && (org.status !== "verified" || renewalOpen);
  const resubmit = org.status === "rejected" || (org.status === "draft" && history.length > 0);

  const timeline: TimelineItem[] = [];
  for (const h of history) {
    timeline.push({ id: `${h.id}-submitted`, title: DECISION_LABELS.submitted, at: h.submittedAt, actor: h.submittedByName ? { name: h.submittedByName } : null, tone: "info" });
    if (h.reviewedAt && h.status !== "submitted") {
      timeline.push({
        id: `${h.id}-decision`,
        title: DECISION_LABELS[h.status] ?? h.status,
        at: h.reviewedAt,
        actor: { name: "Venkat Sai", role: "Verification team" },
        note: h.decisionNotes ? <span><span className="font-medium">Reviewer feedback:</span> {h.decisionNotes}</span> : undefined,
        tone: h.status === "approved" ? "success" : h.status === "rejected" ? "danger" : "warning",
      });
    }
  }
  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="space-y-8">
      <PortalBreadcrumb items={[{ label: "Agency profile", href: "/recruiter/profile" }, { label: "Verification" }]} />
      <PageHeader
        title="Agency verification"
        description="Venkat Sai checks your registration and recruitment licences before you can receive requirements and submit candidates."
        backLink={{ href: "/recruiter/profile", label: "Back to agency profile" }}
        status={<StatusBadge status={org.status} domain="organization" />}
      />

      {org.status === "rejected" || (org.status === "draft" && org.statusReason) ? (
        <Callout tone="warning" title={org.status === "rejected" ? "Verification was not approved" : "Venkat Sai asked for changes"}>
          {org.statusReason ?? "Review the feedback below, update your details or documents and resubmit."}
        </Callout>
      ) : null}
      {inReview ? (
        <Callout tone="info" title="Your verification is being reviewed">
          We will email you when the review is complete. Identity details are locked until then.
        </Callout>
      ) : null}
      {org.status === "suspended" ? (
        <Callout tone="danger" title="Your agency is suspended" action={{ label: "Contact support", href: "/recruiter/support" }}>
          {org.statusReason ?? "Contact Venkat Sai support to resolve the suspension."}
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard title="Status">
            <KeyValueList
              columns={2}
              items={[
                { label: "Current status", value: <StatusBadge status={org.status} domain="organization" size="sm" /> },
                { label: "Verified on", value: org.verifiedAt ? <DateText value={org.verifiedAt} timeZone={timeZone} /> : null },
                { label: "Valid until", value: org.verificationExpiresAt ? <DateText value={org.verificationExpiresAt} timeZone={timeZone} /> : null, hint: overview.verificationDaysLeft !== null ? `${overview.verificationDaysLeft} days left` : undefined },
                { label: "Last submission", value: latest ? <DateText value={latest.submittedAt} timeZone={timeZone} /> : null },
              ]}
              emptyText="Not yet"
            />
          </SectionCard>

          <SectionCard title="Documents" description="Upload clear, current copies. Expired or rejected documents do not count." flush>
            {documents.length ? (
              <ul className="divide-y divide-border">
                {documents.map((doc) => {
                  const label = doc.title ?? ORG_DOCUMENT_TYPE_LABELS[doc.documentType];
                  return (
                    <li key={doc.id} className="space-y-2 px-5 py-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{ORG_DOCUMENT_TYPE_LABELS[doc.documentType]}</p>
                          <p className="text-sm text-muted-foreground">
                            {[doc.title, doc.documentNumber ? `No. ${doc.documentNumber}` : null, doc.issuedBy].filter(Boolean).join(" · ") || "No details added"}
                          </p>
                          {doc.expiresAt ? (
                            <p className="text-sm text-muted-foreground">
                              Valid through <DateText value={doc.expiresAt} dateOnly />
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusBadge status={doc.reviewStatus === "accepted" ? "approved" : doc.reviewStatus} domain="verification" size="sm">
                            {DOC_REVIEW_LABELS[doc.reviewStatus]}
                          </StatusBadge>
                          {!doc.verificationId || doc.reviewStatus === "rejected" ? <RemoveDocumentButton documentId={doc.id} label={label} /> : null}
                        </div>
                      </div>
                      {doc.file ? (
                        <FileList label={`File for ${label}`} files={[{ id: doc.file.id, name: doc.file.name, size: doc.file.size, mimeType: doc.file.mimeType, href: doc.file.url }]} />
                      ) : (
                        <p className="text-sm text-muted-foreground">The file is no longer available. Upload a replacement.</p>
                      )}
                      {doc.reviewNotes ? (
                        <Callout tone={doc.reviewStatus === "rejected" ? "warning" : "neutral"} title="Reviewer feedback">
                          {doc.reviewNotes}
                        </Callout>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState size="sm" variant="plain" title="No documents yet" description="Start with your registration certificate or trade licence." />
              </div>
            )}
          </SectionCard>

          {!inReview && org.status !== "suspended" ? (
            <SectionCard title="Add a document">
              <DocumentUploadForm
                organizationId={orgId}
                defaultType={documents.length ? undefined : "registration_certificate"}
                typeOptions={PARTNER_DOCUMENT_TYPES.map((value) => ({ value, label: ORG_DOCUMENT_TYPE_LABELS[value] }))}
              />
            </SectionCard>
          ) : null}
        </div>

        <div className="min-w-0 space-y-6">
          <Callout tone="brand" title="Recruitment licences" action={{ label: "Manage licences", href: "/recruiter/profile#licences" }}>
            If you recruit workers for jobs outside your home country, an active recruitment licence must be on record. Agencies based in or sourcing from India need a
            Recruiting Agent registration under the Emigration Act 1983 (eMigrate). Venkat Sai verifies each licence before approving your agency.
          </Callout>
          <SectionCard title="Before you submit">
            <ul className="space-y-3 text-sm">
              {readiness.documentRequirements.map((req) => (
                <li key={req.id} className="flex gap-2">
                  {req.met ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  <span>
                    {req.label}
                    <span className="sr-only">{req.met ? " (done)" : " (to do)"}</span>
                  </span>
                </li>
              ))}
              {readiness.issues.map((issue) => (
                <li key={issue.code} className="flex gap-2">
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>
                    {issue.message}
                    <span className="sr-only"> (to do)</span>
                  </span>
                </li>
              ))}
              {readiness.ready ? <li className="font-medium text-success-strong">Everything needed is in place.</li> : null}
            </ul>
            <div className="mt-5 space-y-2">
              <SubmitVerificationButton disabled={!canSubmit} renewal={org.status === "verified"} resubmit={resubmit} />
              {!canSubmit && !inReview && org.status !== "verified" ? <p className="text-sm text-muted-foreground">Complete the items above to submit.</p> : null}
            </div>
          </SectionCard>

          <SectionCard title="History">
            <Timeline items={timeline} timeZone={timeZone} label="Verification history" emptyTitle="No submissions yet" emptyDescription="Your submissions and Venkat Sai's decisions appear here." />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
