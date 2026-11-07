import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DRIVE_MODE_LABELS, driveStatus } from "@/components/institution/labels";
import { DriveStatusActions, EditDriveButton, RegistrationStatusSelect } from "@/components/institution/placement-forms";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireOrgMember } from "@/modules/identity/authz";
import { countryOptions } from "@/modules/taxonomy/queries";
import { listDriveRegistrations } from "@/modules/training/campus";

import { orNotFound } from "../../../_lib/load";
import { uuidParam } from "../../../_lib/params";
import { getInstitutionDrive } from "../../../_lib/queries";

export const metadata: Metadata = { title: "Campus drive" };

export default async function CampusDrivePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgMember("institution", "institution.placements.manage");
  const id = uuidParam((await params).id);
  if (!id) notFound();
  // Scoped to the caller's institution; listDriveRegistrations re-checks access through the training module.
  const drive = await getInstitutionDrive(ctx, id);
  if (!drive) notFound();
  const [registrations, countries] = await Promise.all([orNotFound(listDriveRegistrations(ctx, drive.id)), countryOptions()]);
  const status = driveStatus(drive.status);
  const editable = drive.status === "planned" || drive.status === "open";
  const active = registrations.filter((r) => r.status !== "withdrawn").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={drive.code}
        title={drive.title}
        description={drive.employerName ?? undefined}
        status={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
        breadcrumbs={[{ label: "Institution", href: "/institution" }, { label: "Placements", href: "/institution/placements" }, { label: drive.title }]}
      />
      {drive.status === "cancelled" ? (
        <Callout tone="danger" title="This drive was cancelled">
          {drive.cancellationReason ?? "Registered learners can see that it was cancelled."}
        </Callout>
      ) : null}

      <SectionCard title="Status">
        <div className="flex flex-wrap items-center gap-2">
          <DriveStatusActions driveId={drive.id} status={drive.status} />
          {editable ? (
            <EditDriveButton
              driveId={drive.id}
              countries={countries}
              defaults={{
                title: drive.title,
                description: drive.description,
                employerName: drive.employerName,
                driveDate: drive.driveDate,
                driveEndDate: drive.driveEndDate,
                registrationDeadline: drive.registrationDeadline,
                mode: drive.mode,
                venue: drive.venue,
                countryCode: drive.countryCode,
                city: drive.city,
                eligibility: drive.eligibility,
                openings: drive.openings,
                capacity: drive.capacity,
                isPublic: drive.isPublic,
              }}
            />
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Details">
        <KeyValueList
          columns={2}
          items={[
            {
              label: "Date",
              value: drive.driveDate ? (
                <span>
                  <DateText value={drive.driveDate} dateOnly />
                  {drive.driveEndDate ? (
                    <>
                      {" to "}
                      <DateText value={drive.driveEndDate} dateOnly />
                    </>
                  ) : null}
                </span>
              ) : null,
            },
            { label: "Registration closes", value: drive.registrationDeadline ? <DateText value={drive.registrationDeadline} dateOnly /> : null },
            { label: "Mode", value: DRIVE_MODE_LABELS[drive.mode] },
            { label: "Venue", value: [drive.venue, drive.city, drive.countryCode].filter(Boolean).join(", ") || null },
            { label: "Openings", value: drive.openings },
            { label: "Registrations", value: drive.capacity ? `${active} of ${drive.capacity}` : active },
            { label: "Listing", value: drive.isPublic ? "Public events page" : "Your own learners only" },
            { label: "Eligibility", value: drive.eligibility, fullWidth: true },
            { label: "Description", value: drive.description, fullWidth: true },
          ]}
        />
      </SectionCard>

      <SectionCard
        title="Registrations"
        description="Registering shares the learner's name, email and phone with you, and their profile with the participating employer only with their consent."
        flush
      >
        <DataTable
          caption={`Registrations for ${drive.title}`}
          rows={registrations}
          getRowId={(r) => r.id}
          columns={[
            {
              id: "name",
              header: "Learner",
              primary: true,
              cell: (r) => (
                <span className="block min-w-0">
                  <span className="block font-medium text-foreground">{r.candidateName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[r.email, r.phone].filter(Boolean).join(" · ")}</span>
                </span>
              ),
            },
            { id: "consent", header: "Profile sharing", hideOnMobile: true, cell: (r) => (r.consentToShareAt ? "Consent given" : "Not given") },
            { id: "status", header: "Status", cell: (r) => <RegistrationStatusSelect registrationId={r.id} status={r.status} name={r.candidateName} /> },
          ]}
          empty={
            <div className="p-5">
              <EmptyState size="sm" variant="plain" title="No registrations yet" description={drive.status === "planned" ? "Open registration so learners can sign up." : "Registrations appear here as learners sign up."} />
            </div>
          }
        />
      </SectionCard>
    </div>
  );
}
