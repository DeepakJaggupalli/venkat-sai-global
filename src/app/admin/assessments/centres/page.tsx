import { MapPin } from "lucide-react";
import type { Metadata } from "next";

import { ActionButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { listAssessmentCentres } from "@/modules/training/centres";
import type { AssessmentCentreRow } from "@/modules/training/types";
import { createAssessmentCentreAction, deleteAssessmentCentreAction, setAssessmentCentreActiveAction, updateAssessmentCentreAction } from "@/modules/training/staff-actions";
import { countryOptions } from "@/modules/taxonomy/queries";

import type { StaffFieldSpec } from "../../pipeline/_shared/staff-form";
import { StaffForm } from "../../pipeline/_shared/staff-form";
import { EditCentreDialog } from "./edit-centre-dialog";

export const metadata: Metadata = { title: "Centres · Assessment centre" };

function centreFields(countries: { value: string; label: string }[], c?: AssessmentCentreRow): StaffFieldSpec[] {
  return [
    { name: "name", label: "Centre name", required: true, defaultValue: c?.name, maxLength: 160, wide: true },
    { name: "countryCode", label: "Country", kind: "search-select", required: true, options: countries, defaultValue: c?.countryCode },
    { name: "stateRegion", label: "State or region", optional: true, defaultValue: c?.stateRegion },
    { name: "city", label: "City", required: true, defaultValue: c?.city },
    { name: "postalCode", label: "Postal code", optional: true, defaultValue: c?.postalCode },
    { name: "addressLine1", label: "Address line 1", optional: true, defaultValue: c?.addressLine1 },
    { name: "addressLine2", label: "Address line 2", optional: true, defaultValue: c?.addressLine2 },
    { name: "timezone", label: "Time zone", optional: true, defaultValue: c?.timezone, hint: "IANA name used to show assessment times, e.g. Asia/Kolkata." },
    { name: "contactPhone", label: "Contact phone", kind: "tel", optional: true, defaultValue: c?.contactPhone },
    { name: "contactEmail", label: "Contact email", kind: "email", optional: true, defaultValue: c?.contactEmail },
    { name: "capabilities", label: "Capabilities", kind: "tags", optional: true, defaultTags: c?.capabilities ?? [], hint: "Processes and tests the centre can run, e.g. SMAW, GTAW, 6G, bend test.", wide: true },
    { name: "candidateInstructions", label: "Instructions for candidates", kind: "textarea", optional: true, rows: 3, defaultValue: c?.candidateInstructions, hint: "What to bring and how to reach the centre. Included in scheduling notifications." },
  ];
}

export default async function AssessmentCentresPage() {
  const staff = await requireStaff(["training.view", "training.manage", "recruitment.assessments"], "any");
  const canManage = staffCan(staff, "training.manage");
  const [centres, countries] = await Promise.all([listAssessmentCentres(staff, { includeInactive: true }), canManage ? countryOptions() : Promise.resolve([])]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assessment centres"
        description="Where Venkat Sai trade and practical assessments take place. Active centres are listed publicly."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Assessment centre", href: "/admin/assessments" }, { label: "Centres" }]}
      />
      <LinkTabs
        label="Assessment centre sections"
        items={[
          { href: "/admin/assessments", label: "Assessments", match: "exact" },
          { href: "/admin/assessments/centres", label: "Centres", match: "prefix" },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {centres.length ? (
            <ul className="grid gap-4 sm:grid-cols-2" aria-label="Assessment centres">
              {centres.map((c) => (
                <li key={c.id} className="flex flex-col rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-heading text-base font-semibold">{c.name}</h2>
                    <StatusBadge tone={c.isActive ? "success" : "neutral"} size="sm">
                      {c.isActive ? "Active" : "Inactive"}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {[c.addressLine1, c.city, c.stateRegion, c.countryCode].filter(Boolean).join(", ")}
                  </p>
                  {c.capabilities.length ? (
                    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`Capabilities of ${c.name}`}>
                      {c.capabilities.map((cap) => (
                        <li key={cap} className="rounded-md bg-surface-subtle px-2 py-0.5 text-xs">
                          {cap}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {canManage ? (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                      <EditCentreDialog name={c.name} action={updateAssessmentCentreAction} centreId={c.id} fields={centreFields(countries, c)} />
                      <ActionButton action={setAssessmentCentreActiveAction.bind(null, { centreId: c.id, isActive: !c.isActive })}>{c.isActive ? "Deactivate" : "Activate"}</ActionButton>
                      <ActionButton
                        variant="ghost"
                        action={deleteAssessmentCentreAction.bind(null, { centreId: c.id })}
                        confirm={{ title: `Delete ${c.name}?`, description: "Centres with assessments cannot be deleted; deactivate them instead.", confirmLabel: "Delete", destructive: true }}
                      >
                        Delete
                      </ActionButton>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No assessment centres yet" description={canManage ? "Add the first centre with the form on this page." : "Centres added by the training team will appear here."} />
          )}
        </div>
        {canManage ? (
          <SectionCard title="Add a centre">
            <StaffForm action={createAssessmentCentreAction} fields={centreFields(countries)} submitLabel="Add centre" resetOnSuccess testId="centre-form" />
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
