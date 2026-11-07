import type { Metadata } from "next";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { ChecklistUpload } from "@/components/recruiter/checklist-upload";
import { CHECKLIST_STATUS, labelOf, RESPONSIBLE_PARTY_LABELS } from "@/components/recruiter/labels";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireOrgMember } from "@/modules/identity/authz";
import { MOBILISATION_STATUS_LABELS } from "@/modules/recruitment/mobilisation-rules";
import { getMobilisationForPartner } from "@/modules/recruitment/queries";
import { countryOptions } from "@/modules/taxonomy/queries";

import { loadOr404 } from "../../_lib/page-utils";

export const metadata: Metadata = { title: "Candidate documents" };

type Params = { placementId: string };

const UPLOADABLE_PARTIES = new Set(["partner", "candidate"]);

export default async function RecruiterDocumentDetailPage({ params }: { params: Promise<Params> }) {
  const ctx = await requireOrgMember("recruitment_partner", "partner.documents.manage");
  const { placementId } = await params;
  const [m, countries] = await Promise.all([loadOr404(getMobilisationForPartner(ctx, placementId)), countryOptions()]);
  const closed = m.status === "completed" || m.status === "cancelled";
  const requested = m.checklist.filter((i) => UPLOADABLE_PARTIES.has(i.responsibleParty));
  const others = m.checklist.filter((i) => !UPLOADABLE_PARTIES.has(i.responsibleParty));
  const destination = countries.find((c) => c.value === m.destinationCountryCode)?.label ?? m.destinationCountryCode;

  return (
    <div className="space-y-8">
      <PortalBreadcrumb items={[{ label: "Documents", href: "/recruiter/documents" }, { label: m.candidateName }]} />
      <PageHeader
        eyebrow={m.code}
        title={m.candidateName}
        description={`${m.jobTitle} · ${destination}`}
        backLink={{ href: "/recruiter/documents", label: "Back to documents" }}
        status={<StatusBadge tone={closed ? "neutral" : "info"}>{MOBILISATION_STATUS_LABELS[m.status] ?? m.status}</StatusBadge>}
      />
      {closed ? (
        <Callout tone="neutral" title="Mobilisation closed">
          No more uploads are needed for this placement.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard title="Requested documents" description="Upload what is marked as needed. Venkat Sai checks each document and tells you if a new upload is required." flush>
            {requested.length ? (
              <ul className="divide-y divide-border">
                {requested.map((item) => {
                  const s = labelOf(CHECKLIST_STATUS, item.status);
                  const canUpload = !closed && (item.status === "pending" || item.status === "rejected");
                  return (
                    <li key={item.id} className="space-y-3 px-5 py-4" data-testid="checklist-item">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">
                            {item.item}
                            {item.isRequired ? null : <span className="font-normal text-muted-foreground"> (optional)</span>}
                          </p>
                          {item.description ? <p className="text-sm text-muted-foreground">{item.description}</p> : null}
                          <p className="text-xs text-muted-foreground">
                            Responsible: {RESPONSIBLE_PARTY_LABELS[item.responsibleParty] ?? item.responsibleParty}
                            {item.dueDate ? (
                              <>
                                {" "}
                                · due <DateText value={item.dueDate} dateOnly />
                              </>
                            ) : null}
                          </p>
                        </div>
                        <StatusBadge tone={s.tone} size="sm">
                          {s.label}
                        </StatusBadge>
                      </div>
                      {item.status === "rejected" && item.rejectionReason ? (
                        <Callout tone="warning" title="Why a new upload is needed">
                          {item.rejectionReason}
                        </Callout>
                      ) : null}
                      {canUpload ? <ChecklistUpload itemId={item.id} itemLabel={item.item} organizationId={ctx.organization.id} /> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState size="sm" variant="plain" title="Nothing requested from you" description="Venkat Sai has not asked your agency for any documents for this candidate." />
              </div>
            )}
          </SectionCard>
          {others.length ? (
            <SectionCard title="Handled by Venkat Sai or the employer" flush>
              <ul className="divide-y divide-border">
                {others.map((item) => {
                  const s = labelOf(CHECKLIST_STATUS, item.status);
                  return (
                    <li key={item.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm text-foreground">{item.item}</span>
                      <StatusBadge tone={s.tone} size="sm">
                        {s.label}
                      </StatusBadge>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          ) : null}
        </div>
        <aside className="min-w-0 space-y-6" aria-label="Mobilisation summary">
          <SectionCard title="Progress">
            <KeyValueList
              items={[
                { label: "Placement", value: m.placementCode },
                { label: "Visa", value: m.visaStatus.replace(/_/g, " ") },
                { label: "Medical", value: m.medicalStatus.replace(/_/g, " ") },
                { label: "Emigration clearance", value: m.emigrationClearanceStatus.replace(/_/g, " ") },
                { label: "PDOT (Pre-Departure Orientation Training)", value: m.pdosCompleted ? "Completed" : "Not yet" },
                { label: "Travel date", value: m.travelDate ? <DateText value={m.travelDate} dateOnly /> : null },
              ]}
              emptyText="Not set"
            />
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
