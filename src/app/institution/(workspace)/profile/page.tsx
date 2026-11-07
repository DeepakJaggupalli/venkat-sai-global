import type { Metadata } from "next";
import { CheckCircle2, Circle } from "lucide-react";

import { InstitutionBranding, InstitutionDetailsForm, InstitutionDocumentForm, InstitutionProfileForm, RemoveDocumentButton, SubmitVerificationButton } from "@/components/institution/profile-forms";
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
import { getFiles, toFileSummary } from "@/modules/files";
import { requireOrgMember } from "@/modules/identity/authz";
import { INSTITUTION_KIND_LABELS, INSTITUTION_KINDS, ORG_DOCUMENT_TYPE_LABELS } from "@/modules/organizations/constants";
import { isAuthorisedIssuerNow } from "@/modules/organizations/institution";
import { getOrganizationOverview, listOrganizationDocuments, listVerificationHistory } from "@/modules/organizations/queries";
import { countryOptions, industryOptions } from "@/modules/taxonomy/queries";

export const metadata: Metadata = { title: "Institution profile" };

const INSTITUTION_DOCUMENT_TYPES = ["registration_certificate", "accreditation", "affiliation", "tax_registration", "authorisation_letter", "address_proof", "other"] as const;
const DOC_REVIEW: Record<string, { label: string; tone: "warning" | "success" | "danger" }> = {
  pending: { label: "Awaiting review", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};
const DECISION_LABELS: Record<string, string> = {
  submitted: "Submitted for verification",
  under_review: "Review started",
  approved: "Verification approved",
  rejected: "Verification rejected",
  changes_requested: "Changes requested",
  withdrawn: "Submission withdrawn",
};

export default async function InstitutionProfilePage() {
  const ctx = await requireOrgMember("institution", "institution.profile.manage");
  const orgId = ctx.organization.id;
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const [overview, documents, history, countries, industries] = await Promise.all([
    getOrganizationOverview(ctx, orgId),
    listOrganizationDocuments(ctx, orgId),
    listVerificationHistory(ctx, orgId),
    countryOptions(),
    industryOptions(),
  ]);
  const org = overview.organization;
  const profile = overview.profile.type === "institution" ? overview.profile.data : null;
  const fileIds = [org.logoFileId, profile?.coverFileId].filter((id): id is string => Boolean(id));
  const fileRows = fileIds.length ? await getFiles(fileIds) : [];
  const summary = (id: string | null | undefined) => {
    const row = id ? fileRows.find((f) => f.id === id) : undefined;
    return row ? toFileSummary(row) : null;
  };

  const readiness = overview.readiness;
  const inReview = org.status === "pending" || org.status === "under_review";
  const latest = history[0] ?? null;
  const renewal = org.status === "verified";
  const renewalOpen = renewal && latest?.status !== "submitted" && latest?.status !== "under_review";
  const canSubmit = readiness.ready && !inReview && org.status !== "suspended" && (!renewal || renewalOpen);
  const identityLocked = ["pending", "under_review", "verified", "suspended"].includes(org.status);
  const authorised = isAuthorisedIssuerNow(profile, new Date());

  const timeline: TimelineItem[] = [];
  for (const h of history) {
    timeline.push({ id: `${h.id}-submitted`, title: DECISION_LABELS.submitted, at: h.submittedAt, actor: h.submittedByName ? { name: h.submittedByName } : null, tone: "info" });
    if (h.reviewedAt && h.status !== "submitted") {
      timeline.push({
        id: `${h.id}-decision`,
        title: DECISION_LABELS[h.status] ?? h.status,
        at: h.reviewedAt,
        actor: { name: "Venkat Sai", role: "Verification team" },
        note: h.decisionNotes ? `Reviewer feedback: ${h.decisionNotes}` : undefined,
        tone: h.status === "approved" ? "success" : h.status === "rejected" ? "danger" : "warning",
      });
    }
  }
  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const kindOptions = INSTITUTION_KINDS.map((k) => ({ value: k, label: INSTITUTION_KIND_LABELS[k] }));
  const typeOptions = INSTITUTION_DOCUMENT_TYPES.map((t) => ({ value: t, label: ORG_DOCUMENT_TYPE_LABELS[t] }));
  const missingType = readiness.documentRequirements.find((d) => !d.met)?.id;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Institution profile"
        description="Your details, documents and verification. Verified details build trust with learners and employers."
        status={<StatusBadge status={org.status} domain="organization" />}
        breadcrumbs={[{ label: "Institution", href: "/institution" }, { label: "Profile" }]}
      />

      {org.status === "suspended" ? (
        <Callout tone="danger" title="Your institution is suspended">
          {org.statusReason ?? "Contact Venkat Sai support to find out what is needed."}
        </Callout>
      ) : org.status === "rejected" || (org.status === "draft" && latest?.status === "changes_requested") ? (
        <Callout tone="warning" title={org.status === "rejected" ? "Verification was not approved" : "Changes were requested"}>
          {org.statusReason ?? latest?.decisionNotes ?? "Review the feedback below, update your details or documents and submit again."}
        </Callout>
      ) : null}

      <SectionCard id="verification" title="Verification" description="Venkat Sai checks your registration and your accreditation or affiliation before you can publish courses and issue certificates.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Required documents</h3>
            <ul className="space-y-2">
              {readiness.documentRequirements.map((d) => (
                <li key={d.id} className="flex items-start gap-2 text-sm">
                  {d.met ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  <span>
                    {d.label}
                    <span className="sr-only">{d.met ? " (provided)" : " (missing)"}</span>
                  </span>
                </li>
              ))}
            </ul>
            {readiness.issues.length ? (
              <div>
                <h3 className="text-sm font-semibold text-foreground">Still needed before you can submit</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {readiness.issues.map((issue) => (
                    <li key={issue.code}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <SubmitVerificationButton renewal={renewal} disabled={!canSubmit} />
              {inReview ? <p className="text-sm text-muted-foreground">Your submission is being reviewed.</p> : null}
              {org.verificationExpiresAt ? (
                <p className="text-sm text-muted-foreground">
                  Valid until <DateText value={org.verificationExpiresAt} timeZone={timeZone} />
                </p>
              ) : null}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">History</h3>
            <Timeline items={timeline} timeZone={timeZone} label="Verification history" emptyTitle="Not submitted yet" emptyDescription="Your submissions and Venkat Sai's decisions appear here." />
          </div>
        </div>
      </SectionCard>

      <SectionCard id="documents" title="Documents" description="Registration certificate plus an accreditation or affiliation certificate are required. Documents are private to Venkat Sai's verification team.">
        <div className="space-y-6">
          {documents.length ? (
            <FileList
              label="Uploaded documents"
              timeZone={timeZone}
              files={documents.map((d) => ({
                id: d.id,
                name: d.title || ORG_DOCUMENT_TYPE_LABELS[d.documentType],
                size: d.file?.size,
                mimeType: d.file?.mimeType,
                href: d.file?.url,
                uploadedAt: d.createdAt,
                description: [ORG_DOCUMENT_TYPE_LABELS[d.documentType], d.documentNumber, d.reviewStatus === "rejected" && d.reviewNotes ? `Feedback: ${d.reviewNotes}` : null]
                  .filter(Boolean)
                  .join(" · "),
                status: (
                  <StatusBadge tone={DOC_REVIEW[d.reviewStatus]?.tone ?? "neutral"} size="sm">
                    {DOC_REVIEW[d.reviewStatus]?.label ?? d.reviewStatus}
                  </StatusBadge>
                ),
                actions: d.verificationId ? undefined : <RemoveDocumentButton documentId={d.id} title={d.title || ORG_DOCUMENT_TYPE_LABELS[d.documentType]} />,
              }))}
            />
          ) : (
            <EmptyState size="sm" title="No documents yet" description="Upload your registration certificate and your accreditation or affiliation certificate to get verified." />
          )}
          <div className="rounded-lg border border-border p-4 sm:p-5">
            <h3 className="mb-4 font-heading text-base font-semibold text-foreground">Add a document</h3>
            <InstitutionDocumentForm organizationId={orgId} typeOptions={typeOptions} defaultType={missingType && typeOptions.some((t) => t.value === missingType) ? missingType : undefined} />
          </div>
        </div>
      </SectionCard>

      <SectionCard id="issuer" title="Certificate-issuer authorisation" description="Set by Venkat Sai after checking your accreditation. You cannot change it here.">
        <KeyValueList
          columns={2}
          items={[
            {
              label: "Accredited certificates",
              value: (
                <StatusBadge tone={authorised ? "success" : "neutral"} size="sm">
                  {authorised ? "Authorised" : "Not authorised"}
                </StatusBadge>
              ),
            },
            { label: "Scope", value: authorised ? profile?.authorisedIssuerScope : null },
            { label: "Authorised on", value: authorised && profile?.authorisedAt ? <DateText value={profile.authorisedAt} timeZone={timeZone} /> : null },
            { label: "Valid until", value: authorised ? (profile?.authorisedUntil ? <DateText value={profile.authorisedUntil} dateOnly /> : "Until withdrawn") : null },
          ]}
        />
        <p className="mt-4 text-sm text-muted-foreground">
          Without this authorisation you can still issue certificates of completion for your own courses once verified. Venkat Sai assessment certificates are
          issued only by Venkat Sai.
        </p>
      </SectionCard>

      <SectionCard title="Organisation details" description="Identity, address and official contact.">
        <InstitutionDetailsForm
          identityLocked={identityLocked}
          countries={countries}
          industries={industries}
          defaults={{
            name: org.name,
            legalName: org.legalName,
            description: org.description,
            websiteUrl: org.websiteUrl,
            email: org.email,
            phone: org.phone,
            industryId: org.industryId,
            countryCode: org.countryCode,
            stateRegion: org.stateRegion,
            city: org.city,
            addressLine1: org.addressLine1,
            addressLine2: org.addressLine2,
            postalCode: org.postalCode,
            registrationNumber: org.registrationNumber,
            taxId: org.taxId,
          }}
        />
      </SectionCard>

      <SectionCard title="Institution profile" description="Kind, recognition, public page content and placement contact.">
        <InstitutionProfileForm
          organizationId={orgId}
          kindOptions={kindOptions}
          defaults={{
            institutionKind: profile?.institutionKind ?? null,
            accreditationBodies: profile?.accreditationBodies ?? [],
            affiliation: profile?.affiliation ?? null,
            establishedYear: profile?.establishedYear ?? null,
            studentCapacity: profile?.studentCapacity ?? null,
            campusAddress: profile?.campusAddress ?? null,
            aboutHtml: profile?.aboutHtml ?? null,
            cover: summary(profile?.coverFileId),
            placementOfficerName: profile?.placementOfficerName ?? null,
            placementOfficerEmail: profile?.placementOfficerEmail ?? null,
            placementOfficerPhone: profile?.placementOfficerPhone ?? null,
          }}
        />
      </SectionCard>

      <SectionCard title="Logo and public page">
        <InstitutionBranding organizationId={orgId} logo={summary(org.logoFileId)} isPublic={org.isPublic} />
      </SectionCard>
    </div>
  );
}
