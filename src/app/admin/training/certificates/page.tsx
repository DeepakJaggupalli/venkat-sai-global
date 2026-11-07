import type { Metadata } from "next";
import Link from "next/link";

import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterPendingRegion, FilterScope, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage, sp, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { revokeCertificateAction } from "@/modules/training/actions";
import { listCertificates } from "@/modules/training/certificates";
import { CERTIFICATE_ISSUER_TYPES, CERTIFICATE_STATUSES } from "@/modules/training/constants";

import { optionsFrom, pickEnum, staffTimeZone } from "../../pipeline/_shared/server";
import { ReasonDialog } from "../../pipeline/_shared/reason-dialog";
import { humanize, statusTone } from "../../pipeline/_shared/status";
import { TrainingTabs } from "../_components/training-tabs";

export const metadata: Metadata = { title: "Certificates · Training" };

const ISSUER_SHORT: Record<(typeof CERTIFICATE_ISSUER_TYPES)[number], string> = {
  venkat_sai: "Venkat Sai assessment / training",
  accredited_external: "Accredited (external body)",
  institution_completion: "Institution completion",
};

export default async function CertificateRegistryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff(["training.view", "training.certificates"], "any");
  const params = await searchParams;
  const page = parsePage(params);
  const status = pickEnum(sp(params, "status"), CERTIFICATE_STATUSES);
  const issuerType = pickEnum(sp(params, "issuer"), CERTIFICATE_ISSUER_TYPES);
  const result = await listCertificates(staff, { status, issuerType }, page);
  const tz = staffTimeZone(staff);
  const canRevoke = staffCan(staff, "training.certificates");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificate registry"
        description="Every certificate issued through the platform. Revoking marks the linked credential as rejected and notifies the holder."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Training", href: "/admin/training" }, { label: "Certificates" }]}
      />
      <TrainingTabs />
      <Callout tone="info" title="Honest credentials">
        Venkat Sai certificates record a Venkat Sai assessment or training result and are never presented as accredited qualifications. Anyone can check a certificate at{" "}
        <Link href="/verify-certificate" className="font-medium underline underline-offset-4">
          /verify-certificate
        </Link>
        .
      </Callout>
      <FilterScope>
        <FilterBar paramKeys={["status", "issuer"]}>
          <FilterSelect param="status" label="Status" allLabel="All statuses" options={optionsFrom(CERTIFICATE_STATUSES)} />
          <FilterSelect param="issuer" label="Issuer" allLabel="All issuers" options={optionsFrom(CERTIFICATE_ISSUER_TYPES, ISSUER_SHORT)} />
        </FilterBar>
        <FilterPendingRegion>
          <DataTable
            caption="Certificates"
            rows={result.items}
            getRowId={(c) => c.id}
            columns={[
              {
                id: "title",
                header: "Certificate",
                primary: true,
                cell: (c) => (
                  <div>
                    <p className="font-medium">{c.title}</p>
                    <p className="font-mono text-xs text-muted-foreground">{c.code}</p>
                  </div>
                ),
              },
              {
                id: "holder",
                header: "Holder",
                cell: (c) => (
                  <Link href={`/admin/candidates/${c.candidateId}`} className="underline-offset-4 hover:underline">
                    {c.candidateName}
                  </Link>
                ),
              },
              { id: "issuer", header: "Issuer", hideOnMobile: true, cell: (c) => (<div><p>{c.issuerName}</p><p className="text-xs text-muted-foreground">{ISSUER_SHORT[c.issuerType]}</p></div>) },
              { id: "issued", header: "Issued", cell: (c) => <DateText value={c.issuedAt} timeZone={tz} /> },
              { id: "expires", header: "Expires", hideOnMobile: true, cell: (c) => (c.expiresAt ? <DateText value={c.expiresAt} dateOnly /> : "No expiry") },
              {
                id: "status",
                header: "Status",
                cell: (c) => (
                  <div>
                    <StatusBadge tone={statusTone(c.status)} size="sm">{humanize(c.status)}</StatusBadge>
                    {c.revokedReason ? <p className="mt-1 text-xs text-muted-foreground">{c.revokedReason}</p> : null}
                  </div>
                ),
              },
              {
                id: "actions",
                header: "Actions",
                cell: (c) =>
                  canRevoke && c.status === "active" ? (
                    <ReasonDialog
                      action={revokeCertificateAction}
                      hidden={{ via: "admin", certificateId: c.id }}
                      triggerLabel="Revoke"
                      title={`Revoke certificate ${c.code}?`}
                      description="The certificate stops verifying publicly and the holder is notified with the reason."
                      confirmLabel="Revoke certificate"
                      destructive
                      variant="ghost"
                    />
                  ) : null,
              },
            ]}
            empty={<EmptyState title="No certificates found" description={status || issuerType ? "Try different filters." : "Certificates appear here once they are issued for completed training or passed assessments."} />}
            footer={<Pagination pathname="/admin/training/certificates" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="certificates" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
