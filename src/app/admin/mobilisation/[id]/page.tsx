import { CheckCircle2, CircleSlash } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton } from "@/components/admin/action-button";
import { InternalNotesPanel } from "@/components/admin/internal-notes";
import { listStaffOptions } from "@/components/admin/queries";
import { FileLink } from "@/components/files";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { getFiles, toFileSummary } from "@/modules/files";
import { reviewChecklistItemAction } from "@/modules/recruitment/actions";
import { CHECKLIST_CATEGORY_OPTIONS, EMIGRATION_CLEARANCE_OPTIONS, MEDICAL_STATUS_OPTIONS, MOBILISATION_STATUS_OPTIONS, RESPONSIBLE_PARTY_OPTIONS, VISA_STATUS_OPTIONS } from "@/modules/recruitment/constants";
import { MOBILISATION_STATUS_LABELS } from "@/modules/recruitment/mobilisation-rules";
import { getMobilisationForStaff } from "@/modules/recruitment/queries";
import { utcToZonedLocal } from "@/modules/recruitment/timezone";
import { countryOptions } from "@/modules/taxonomy/queries";

import { isUuid, optionsFrom, orNotFound, staffTimeZone } from "../../pipeline/_shared/server";
import { ReasonDialog } from "../../pipeline/_shared/reason-dialog";
import { StaffForm } from "../../pipeline/_shared/staff-form";
import { humanize, statusTone } from "../../pipeline/_shared/status";
import { addChecklistItemFormAction, reviewChecklistItemFormAction, submitChecklistItemFormAction, updateMobilisationFormAction } from "../actions";

export const metadata: Metadata = { title: "Mobilisation record" };

const EMIGRATION_LABELS: Partial<Record<(typeof EMIGRATION_CLEARANCE_OPTIONS)[number], string>> = {
  not_assessed: "Not assessed",
  not_required: "Not required (ECNR / non-Indian passport)",
  granted: "Granted",
};

export default async function MobilisationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["recruitment.mobilisation", "recruitment.view"], "any");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const m = await orNotFound(getMobilisationForStaff(staff, id));
  const tz = staffTimeZone(staff);
  const canEdit = staffCan(staff, "recruitment.mobilisation");
  const fileIds = m.checklist.map((c) => c.fileId).filter((v): v is string => !!v);
  const [files, coordinators, countries] = await Promise.all([fileIds.length ? getFiles(fileIds) : Promise.resolve([]), canEdit ? listStaffOptions({ permission: "recruitment.mobilisation" }) : Promise.resolve([]), countryOptions()]);
  const fileById = new Map(files.map((f) => [f.id, toFileSummary(f)]));
  const destination = countries.find((c) => c.value === m.destinationCountryCode)?.label ?? m.destinationCountryCode;
  const openRequired = m.checklist.filter((c) => c.isRequired && c.status !== "verified" && c.status !== "not_applicable").length;
  const base = { mobilisationId: m.id };
  const finished = m.status === "completed" || m.status === "cancelled";

  return (
    <div className="space-y-6">
      <PageHeader
        title={m.candidateName}
        eyebrow={<span className="font-mono">{m.code}</span>}
        status={<StatusBadge tone={statusTone(m.status)}>{MOBILISATION_STATUS_LABELS[m.status]}</StatusBadge>}
        description={`${m.jobTitle} · Destination: ${destination}`}
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Mobilisation", href: "/admin/mobilisation" }, { label: m.code }]}
        actions={[{ label: "Open application", href: `/admin/pipeline/${m.applicationId}`, variant: "outline" }]}
      />

      {m.statusReason ? <Callout tone={m.status === "on_hold" || m.status === "cancelled" ? "warning" : "info"} title="Status note">{m.statusReason}</Callout> : null}
      <Callout tone={openRequired ? "warning" : "success"} title={openRequired ? `${openRequired} required checklist item${openRequired === 1 ? "" : "s"} open` : "Required checklist items are complete"}>
        Booking travel needs emigration clearance (granted or not required), an approved or issued visa (or not required) and a fit medical. Departure needs every required item verified or marked not applicable.
      </Callout>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <SectionCard title="Checklist and secure documents" description="Documents are private; opening them is logged." flush>
            {m.checklist.length ? (
              <ul className="divide-y divide-border">
                {m.checklist.map((item) => {
                  const file = item.fileId ? fileById.get(item.fileId) : undefined;
                  return (
                    <li key={item.id} className="space-y-2 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {item.item}
                            {item.isRequired ? <span className="ml-2 text-xs font-normal text-muted-foreground">Required</span> : null}
                            {!item.isCandidateVisible ? <span className="ml-2 text-xs font-normal text-muted-foreground">Staff only</span> : null}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {humanize(item.category)} · Responsible: {humanize(item.responsibleParty)}
                            {item.dueDate ? <> · Due <DateText value={item.dueDate} dateOnly /></> : null}
                          </p>
                          {item.description ? <p className="mt-1 text-sm text-muted-foreground">{item.description}</p> : null}
                          {item.rejectionReason ? <p className="mt-1 text-sm text-danger-strong">Returned: {item.rejectionReason}</p> : null}
                          {item.notes ? <p className="mt-1 text-xs text-muted-foreground">Staff note: {item.notes}</p> : null}
                        </div>
                        <StatusBadge tone={statusTone(item.status)} size="sm">{humanize(item.status)}</StatusBadge>
                      </div>
                      {file ? <FileLink file={file} showMeta /> : null}
                      {canEdit && !finished ? (
                        <div className="flex flex-wrap gap-2">
                          {item.status !== "verified" ? (
                            <ActionButton icon={<CheckCircle2 aria-hidden="true" />} action={reviewChecklistItemAction.bind(null, { itemId: item.id, decision: "verified" })}>
                              Verify
                            </ActionButton>
                          ) : null}
                          {item.status !== "rejected" ? (
                            <ReasonDialog action={reviewChecklistItemFormAction} hidden={{ itemId: item.id, decision: "rejected" }} reasonName="rejectionReason" reasonLabel="What needs to change" triggerLabel="Return" title={`Return “${item.item}”?`} description="The reason is shown to the candidate." confirmLabel="Return item" variant="ghost" />
                          ) : null}
                          {item.status !== "not_applicable" ? (
                            <ActionButton variant="ghost" icon={<CircleSlash aria-hidden="true" />} action={reviewChecklistItemAction.bind(null, { itemId: item.id, decision: "not_applicable" })}>
                              Not applicable
                            </ActionButton>
                          ) : null}
                          {item.status === "pending" || item.status === "rejected" ? (
                            <details className="w-full">
                              <summary className="cursor-pointer text-sm text-teal-strong">Upload on the candidate&apos;s behalf</summary>
                              <div className="mt-3">
                                <StaffForm action={submitChecklistItemFormAction} hidden={{ itemId: item.id }} submitLabel="Submit document" fields={[{ name: "fileId", label: "Document", kind: "file", purpose: "mobilisation_document" }, { name: "note", label: "Note", optional: true, maxLength: 1000 }]} />
                              </div>
                            </details>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-4">
                <EmptyState size="sm" variant="plain" title="No checklist items" description="Add the documents and steps this placement needs." />
              </div>
            )}
            {canEdit && !finished ? (
              <div className="border-t border-border p-4">
                <h3 className="mb-3 font-heading text-sm font-semibold">Add a checklist item</h3>
                <StaffForm
                  action={addChecklistItemFormAction}
                  hidden={base}
                  resetOnSuccess
                  columns={2}
                  submitLabel="Add item"
                  fields={[
                    { name: "item", label: "Item", required: true, maxLength: 200 },
                    { name: "category", label: "Category", kind: "select", required: true, options: optionsFrom(CHECKLIST_CATEGORY_OPTIONS), defaultValue: "document" },
                    { name: "responsibleParty", label: "Responsible", kind: "select", required: true, options: optionsFrom(RESPONSIBLE_PARTY_OPTIONS, { venkat_sai: "Venkat Sai" }), defaultValue: "venkat_sai" },
                    { name: "dueDate", label: "Due date", kind: "date", optional: true },
                    { name: "description", label: "Description", kind: "textarea", optional: true, rows: 2 },
                    { name: "isRequired", label: "Required before departure", kind: "checkbox", defaultValue: true },
                    { name: "isCandidateVisible", label: "Visible to the candidate", kind: "checkbox", defaultValue: true },
                  ]}
                />
              </div>
            ) : null}
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Visa">
              {canEdit ? (
                <StaffForm
                  action={updateMobilisationFormAction}
                  hidden={base}
                  submitLabel="Save visa"
                  fields={[
                    { name: "visaStatus", label: "Visa status", kind: "select", options: optionsFrom(VISA_STATUS_OPTIONS), defaultValue: m.visaStatus },
                    { name: "visaType", label: "Visa type", optional: true, defaultValue: m.visaType, maxLength: 120 },
                    { name: "visaNumber", label: "Visa number", optional: true, hint: m.visaNumberLast4 ? `Stored encrypted, ending ${m.visaNumberLast4}. Leave blank to keep it.` : "Stored encrypted; only the last 4 characters are shown.", maxLength: 40 },
                    { name: "visaIssuedOn", label: "Issued on", kind: "date", optional: true, defaultValue: m.visaIssuedOn },
                    { name: "visaExpiresOn", label: "Expires on", kind: "date", optional: true, defaultValue: m.visaExpiresOn },
                  ]}
                />
              ) : (
                <p className="text-sm">{humanize(m.visaStatus)}{m.visaNumberLast4 ? ` · ending ${m.visaNumberLast4}` : ""}</p>
              )}
            </SectionCard>
            <SectionCard title="Medical">
              {canEdit ? (
                <StaffForm
                  action={updateMobilisationFormAction}
                  hidden={base}
                  submitLabel="Save medical"
                  fields={[
                    { name: "medicalStatus", label: "Medical status", kind: "select", options: optionsFrom(MEDICAL_STATUS_OPTIONS), defaultValue: m.medicalStatus },
                    { name: "medicalCompletedOn", label: "Completed on", kind: "date", optional: true, defaultValue: m.medicalCompletedOn },
                    { name: "medicalValidUntil", label: "Valid until", kind: "date", optional: true, defaultValue: m.medicalValidUntil },
                  ]}
                />
              ) : (
                <p className="text-sm">{humanize(m.medicalStatus)}</p>
              )}
            </SectionCard>
            <SectionCard title="Emigration clearance" description="eMigrate clearance for ECR passport holders.">
              {canEdit ? (
                <StaffForm
                  action={updateMobilisationFormAction}
                  hidden={base}
                  submitLabel="Save clearance"
                  fields={[
                    { name: "emigrationClearanceStatus", label: "Clearance status", kind: "select", options: optionsFrom(EMIGRATION_CLEARANCE_OPTIONS, EMIGRATION_LABELS), defaultValue: m.emigrationClearanceStatus },
                    { name: "emigrationClearanceReference", label: "Reference", optional: true, defaultValue: m.emigrationClearanceReference, maxLength: 120 },
                    { name: "emigrationClearedOn", label: "Cleared on", kind: "date", optional: true, defaultValue: m.emigrationClearedOn },
                  ]}
                />
              ) : (
                <p className="text-sm">{humanize(m.emigrationClearanceStatus)}</p>
              )}
            </SectionCard>
            <SectionCard title="PDOT (Pre-Departure Orientation Training)">
              {canEdit ? (
                <StaffForm
                  action={updateMobilisationFormAction}
                  hidden={{ ...base, pdosSection: "1" }}
                  submitLabel="Save PDOT"
                  fields={[
                    { name: "pdosCompleted", label: "PDOT completed", kind: "checkbox", defaultValue: m.pdosCompleted },
                    { name: "pdosCompletedOn", label: "Completed on", kind: "date", optional: true, defaultValue: m.pdosCompletedOn },
                  ]}
                />
              ) : (
                <p className="text-sm">{m.pdosCompleted ? "Completed" : "Not completed"}</p>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Travel and arrival">
            {canEdit ? (
              <StaffForm
                action={updateMobilisationFormAction}
                hidden={base}
                sendTimeZone
                columns={2}
                submitLabel="Save travel"
                fields={[
                  { name: "travelDate", label: "Travel date", kind: "date", optional: true, defaultValue: m.travelDate },
                  { name: "timezone", label: "Time zone for the times below", optional: true, defaultValue: tz },
                  { name: "departedAt", label: "Departed at", kind: "datetime-local", optional: true, defaultValue: m.departedAt ? utcToZonedLocal(m.departedAt, tz).slice(0, 16) : null },
                  { name: "arrivedAt", label: "Arrived at", kind: "datetime-local", optional: true, defaultValue: m.arrivedAt ? utcToZonedLocal(m.arrivedAt, tz).slice(0, 16) : null },
                  { name: "flightDetails", label: "Flight details", kind: "textarea", optional: true, rows: 2, defaultValue: m.flightDetails },
                  { name: "accommodationDetails", label: "Accommodation", kind: "textarea", optional: true, rows: 2, defaultValue: m.accommodationDetails },
                ]}
              />
            ) : (
              <p className="text-sm">{m.travelDate ?? "Travel not booked"}</p>
            )}
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-6">
          {canEdit ? (
            <SectionCard title="Status and coordinator" description="Status changes are checked against the gates and notify the candidate.">
              <StaffForm
                action={updateMobilisationFormAction}
                hidden={base}
                submitLabel="Save"
                testId="mobilisation-status-form"
                fields={[
                  { name: "status", label: "Status", kind: "select", options: optionsFrom(MOBILISATION_STATUS_OPTIONS, MOBILISATION_STATUS_LABELS), defaultValue: m.status },
                  { name: "statusReason", label: "Status note", kind: "textarea", optional: true, rows: 2, defaultValue: m.statusReason },
                  { name: "coordinatorUserId", label: "Coordinator", kind: "search-select", optional: true, options: coordinators, defaultValue: m.coordinatorUserId, allowClear: true },
                ]}
              />
            </SectionCard>
          ) : (
            <SectionCard title="Coordinator">
              <p className="text-sm">{m.coordinatorName ?? "Not assigned"}</p>
            </SectionCard>
          )}
          {canEdit ? (
            <SectionCard title="Instructions and notes">
              <StaffForm
                action={updateMobilisationFormAction}
                hidden={base}
                submitLabel="Save"
                fields={[
                  { name: "candidateInstructions", label: "Instructions for the candidate", kind: "textarea", optional: true, rows: 4, defaultValue: m.candidateInstructions, hint: "Shown to the candidate in the People Portal." },
                  { name: "notes", label: "Internal notes", kind: "textarea", optional: true, rows: 4, defaultValue: m.notes, hint: "Staff only. Never shown to candidates, employers or partners." },
                ]}
              />
            </SectionCard>
          ) : null}
          <SectionCard title="Placement">
            <p className="text-sm">
              Placement <span className="font-mono">{m.placementCode}</span>
            </p>
            <p className="mt-2 text-sm">
              <Link href={`/admin/pipeline/${m.applicationId}`} className="text-teal-strong underline-offset-4 hover:underline">
                View application and offer
              </Link>
            </p>
          </SectionCard>
          <InternalNotesPanel ctx={staff} entityType="placement" entityId={m.placementId} title="Team notes" />
        </div>
      </div>
    </div>
  );
}
