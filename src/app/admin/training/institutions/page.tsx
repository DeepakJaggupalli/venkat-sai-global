import type { Metadata } from "next";

import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { paginated, parsePage, sp, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { setCertificateIssuerAuthorisationAction } from "@/modules/organizations/institution-actions";

import { staffTimeZone } from "../../pipeline/_shared/server";
import { IssuerAuthorisationDialog } from "../_components/issuer-dialog";
import { humanize, statusTone } from "../../pipeline/_shared/status";
import { TrainingTabs } from "../_components/training-tabs";
import { listInstitutionsForTraining } from "../_lib/queries";

export const metadata: Metadata = { title: "Institutions · Training" };

export default async function TrainingInstitutionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff(["training.view", "orgs.view"], "any");
  const params = await searchParams;
  const page = parsePage(params);
  const q = sp(params, "q")?.slice(0, 100);
  const authorisedOnly = sp(params, "issuer") === "authorised";
  const { rows, total } = await listInstitutionsForTraining({ q, authorisedOnly }, page);
  const result = paginated(rows, total, page);
  const tz = staffTimeZone(staff);
  const canAuthorise = staffCan(staff, "orgs.verify");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Institutions"
        description="Training institutions and whether Venkat Sai has authorised them to issue accredited certificates through the platform."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Training", href: "/admin/training" }, { label: "Institutions" }]}
      />
      <TrainingTabs />
      <Callout tone="neutral" title="Authorised issuers">
        Only verified institutions can be authorised, after staff check their accreditation documents. Without a current authorisation an institution cannot issue accredited certificates; completion certificates are unaffected.
      </Callout>
      <FilterScope>
        <FilterBar paramKeys={["q", "issuer"]} search={<SearchInput label="Search institutions" />}>
          <FilterSelect param="issuer" label="Issuer authorisation" allLabel="All institutions" options={[{ value: "authorised", label: "Authorised issuers" }]} />
        </FilterBar>
        <FilterPendingRegion>
          <DataTable
            caption="Institutions"
            rows={result.items}
            getRowId={(r) => r.organizationId}
            columns={[
              { id: "name", header: "Institution", primary: true, cell: (r) => (<div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{[r.city, r.countryCode].filter(Boolean).join(", ") || "Location not provided"}</p></div>) },
              { id: "status", header: "Verification", cell: (r) => <StatusBadge tone={statusTone(r.status)} size="sm">{humanize(r.status)}</StatusBadge> },
              {
                id: "issuer",
                header: "Accredited issuer",
                cell: (r) =>
                  r.isAuthorisedCertificateIssuer ? (
                    <div>
                      <StatusBadge tone="success" size="sm">Authorised</StatusBadge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.authorisedUntil ? <>Until <DateText value={r.authorisedUntil} dateOnly /></> : "Until withdrawn"}
                        {r.authorisedAt ? <> · since <DateText value={r.authorisedAt} timeZone={tz} /></> : null}
                      </p>
                      {r.authorisedIssuerScope ? <p className="mt-1 max-w-xs text-xs text-muted-foreground">{r.authorisedIssuerScope}</p> : null}
                    </div>
                  ) : (
                    <StatusBadge tone="neutral" size="sm">Not authorised</StatusBadge>
                  ),
              },
              {
                id: "actions",
                header: "Actions",
                cell: (r) =>
                  canAuthorise && (r.status === "verified" || r.isAuthorisedCertificateIssuer) ? (
                    <IssuerAuthorisationDialog
                      action={setCertificateIssuerAuthorisationAction}
                      organizationId={r.organizationId}
                      name={r.name}
                      authorised={r.isAuthorisedCertificateIssuer}
                      scope={r.authorisedIssuerScope}
                      until={r.authorisedUntil}
                    />
                  ) : null,
              },
            ]}
            empty={<EmptyState title="No institutions found" description={q || authorisedOnly ? "Try different filters." : "Institutions appear here once they register."} />}
            footer={<Pagination pathname="/admin/training/institutions" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="institutions" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
