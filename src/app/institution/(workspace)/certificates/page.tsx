import type { Metadata } from "next";
import { Award } from "lucide-react";

import { IssueCertificateButton, RevokeCertificateButton } from "@/components/institution/certificate-controls";
import { certificateStatus, ISSUER_TYPE_SHORT } from "@/components/institution/labels";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";
import { getInstitutionProfile, isAuthorisedIssuerNow } from "@/modules/organizations/institution";
import { CERTIFICATE_STATUSES } from "@/modules/training/constants";
import { listCertificates } from "@/modules/training/certificates";

import { oneOf, param, type SearchParams } from "../_lib/params";
import { listIssuableEnrolments } from "../_lib/queries";

export const metadata: Metadata = { title: "Certificates" };

/** Crockford verification codes are stored without separators and shown as XXXX-XXXX-XXXX. */
const formatCode = (code: string) => code.replace(/[^0-9A-Z]/gi, "").replace(/(.{4})(?=.)/g, "$1-");

export default async function InstitutionCertificatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("institution", "institution.certificates.issue");
  const sp = await searchParams;
  const status = oneOf(param(sp, "status"), CERTIFICATE_STATUSES);
  const [result, issuable, profile] = await Promise.all([listCertificates(ctx, { status }, parsePage(sp)), listIssuableEnrolments(ctx), getInstitutionProfile(ctx, ctx.organization.id)]);
  const authorised = isAuthorisedIssuerNow(profile);
  const verified = ctx.organization.status === "verified";
  const timeZone = ctx.user.timezone ?? undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificates"
        description="Issue certificates to learners who completed your courses, and revoke them if they were issued in error."
        breadcrumbs={[{ label: "Institution", href: "/institution" }, { label: "Certificates" }]}
      />

      <SectionCard title="Issue a certificate" description={`${issuable.length} completed enrolment${issuable.length === 1 ? "" : "s"} waiting for a certificate.`}>
        <div className="space-y-4">
          <IssueCertificateButton
            organizationId={ctx.organization.id}
            verified={verified}
            authorisedIssuer={authorised}
            options={issuable.map((e) => ({
              enrolmentId: e.enrolmentId,
              label: `${e.candidateName} · ${e.courseTitle} (${e.batchCode})${e.resultStatus === "passed" ? " · passed" : ""}`,
              certificationType: e.certificationType,
              accreditationBody: e.accreditationBody,
              passed: e.resultStatus === "passed",
            }))}
          />
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Certificates of completion state that your institution issued them, for completed enrolments in your own courses.</li>
            <li>
              Accredited certificates under an external awarding body need a current certificate-issuer authorisation from Venkat Sai
              {authorised ? " (you have one)" : " (you do not have one yet)"}, and only go to learners who passed.
            </li>
            <li>Venkat Sai assessment certificates are issued by Venkat Sai only. Each certificate can be checked at /verify-certificate with its code.</li>
          </ul>
        </div>
      </SectionCard>

      <LinkTabs
        label="Certificate status"
        items={[
          { href: "/institution/certificates", label: "All" },
          { href: "/institution/certificates?status=active", label: "Active" },
          { href: "/institution/certificates?status=revoked", label: "Revoked" },
          { href: "/institution/certificates?status=expired", label: "Expired" },
        ]}
      />
      <DataTable
        caption="Issued certificates"
        rows={result.items}
        getRowId={(c) => c.id}
        columns={[
          {
            id: "holder",
            header: "Learner",
            primary: true,
            cell: (c) => (
              <span className="block min-w-0">
                <span className="block font-medium text-foreground">{c.candidateName}</span>
                <span className="block text-xs text-muted-foreground">{c.title}</span>
              </span>
            ),
          },
          { id: "type", header: "Type", hideOnMobile: true, cell: (c) => ISSUER_TYPE_SHORT[c.issuerType] ?? c.issuerType },
          {
            id: "code",
            header: "Verification code",
            cell: (c) => (
              <span className="block">
                <span className="font-mono text-sm">{formatCode(c.verificationCode)}</span>
                <span className="block text-xs text-muted-foreground">{c.code}</span>
              </span>
            ),
          },
          { id: "issued", header: "Issued", hideOnMobile: true, cell: (c) => <DateText value={c.issuedAt} timeZone={timeZone} /> },
          {
            id: "status",
            header: "Status",
            cell: (c) => (
              <span className="block">
                <StatusBadge tone={certificateStatus(c.status).tone} size="sm">
                  {certificateStatus(c.status).label}
                </StatusBadge>
                {c.status === "revoked" && c.revokedReason ? <span className="mt-1 block text-xs text-muted-foreground">{c.revokedReason}</span> : null}
              </span>
            ),
          },
          { id: "actions", header: <span className="sr-only">Actions</span>, align: "right", cell: (c) => (c.status === "active" ? <RevokeCertificateButton certificateId={c.id} label={`${c.title} for ${c.candidateName}`} /> : null) },
        ]}
        empty={<EmptyState icon={<Award aria-hidden="true" />} title={status ? "No certificates in this view" : "No certificates issued yet"} description="Certificates you issue appear here with their verification codes." />}
        footer={<Pagination pathname="/institution/certificates" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="certificates" />}
      />
    </div>
  );
}
