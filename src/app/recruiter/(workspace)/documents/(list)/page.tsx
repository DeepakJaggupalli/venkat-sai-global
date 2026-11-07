import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireOrgMember } from "@/modules/identity/authz";
import { MOBILISATION_STATUS_LABELS } from "@/modules/recruitment/mobilisation-rules";
import { countryOptions } from "@/modules/taxonomy/queries";

import { listPartnerMobilisations } from "../../_lib/queries";

export const metadata: Metadata = { title: "Documents" };

export default async function RecruiterDocumentsPage() {
  const ctx = await requireOrgMember("recruitment_partner", "partner.documents.manage");
  const [rows, countries] = await Promise.all([listPartnerMobilisations(ctx), countryOptions()]);
  const countryName = new Map(countries.map((c) => [c.value, c.label]));
  const open = rows.filter((r) => r.openItems > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description={
          open
            ? `${open} ${open === 1 ? "candidate needs" : "candidates need"} documents. Venkat Sai requests documents for candidates you placed (passport, certificates, medical reports) and checks every upload.`
            : "Venkat Sai requests documents for candidates you placed (passport, certificates, medical reports) and checks every upload."
        }
      />
      <DataTable
        caption="Candidates with document requests"
        rows={rows}
        getRowId={(r) => r.id}
        rowLink={(r) => ({ href: `/recruiter/documents/${r.placementId}`, label: `Open documents for ${r.candidateName}` })}
        columns={[
          {
            id: "candidate",
            header: "Candidate",
            primary: true,
            cell: (r) => (
              <div className="min-w-0">
                <p className="font-medium text-foreground">{r.candidateName}</p>
                <p className="text-xs text-muted-foreground">{r.jobTitle}</p>
              </div>
            ),
          },
          { id: "destination", header: "Destination", cell: (r) => countryName.get(r.destinationCountryCode) ?? r.destinationCountryCode },
          { id: "travel", header: "Travel date", cell: (r) => (r.travelDate ? <DateText value={r.travelDate} dateOnly /> : "Not set"), hideOnMobile: true },
          { id: "stage", header: "Stage", cell: (r) => MOBILISATION_STATUS_LABELS[r.status] ?? r.status },
          {
            id: "open",
            header: "Requested",
            cell: (r) =>
              r.openItems ? (
                <StatusBadge tone={r.rejectedItems ? "danger" : "warning"} size="sm">
                  {r.openItems} {r.openItems === 1 ? "item" : "items"} needed
                </StatusBadge>
              ) : (
                <StatusBadge tone="success" size="sm">
                  Nothing needed
                </StatusBadge>
              ),
          },
        ]}
        empty={
          <EmptyState
            icon={<FileText aria-hidden="true" />}
            title="No document requests"
            description="When a candidate you placed starts mobilisation, Venkat Sai lists the documents needed here."
            primaryAction={{ label: "View submissions", href: "/recruiter/submissions" }}
          />
        }
      />
    </div>
  );
}
