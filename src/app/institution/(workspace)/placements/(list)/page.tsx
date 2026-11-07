import type { Metadata } from "next";
import { Briefcase, CalendarDays, GraduationCap } from "lucide-react";

import { driveStatus, internshipStatus, OUTCOME_SOURCE_LABELS, STIPEND_TYPE_LABELS } from "@/components/institution/labels";
import { DeleteOutcomeButton, EditInternshipButton, InternshipStatusActions, NewDriveButton, NewInternshipButton, RecordOutcomeButton } from "@/components/institution/placement-forms";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { VerificationBadge } from "@/components/shared/verification-badge";
import { fromMinorUnits } from "@/lib/format";
import { parsePage } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";
import { countryOptions, currencyOptions } from "@/modules/taxonomy/queries";
import { listCampusDrives } from "@/modules/training/campus";
import { listInternships } from "@/modules/training/internships";
import { listPlacementOutcomes } from "@/modules/training/outcomes";

import { oneOf, param, type SearchParams } from "../../_lib/params";
import { listLearnerOptions } from "../../_lib/queries";

export const metadata: Metadata = { title: "Placements" };

const TABS = ["drives", "internships", "outcomes"] as const;

export default async function InstitutionPlacementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("institution", "institution.placements.manage");
  const sp = await searchParams;
  const tab = oneOf(param(sp, "tab"), TABS) ?? "drives";
  const page = parsePage(sp);
  const timeZone = ctx.user.timezone ?? undefined;
  const countries = await countryOptions();

  const tabs = [
    { href: "/institution/placements", label: "Campus drives" },
    { href: "/institution/placements?tab=internships", label: "Internship programmes" },
    { href: "/institution/placements?tab=outcomes", label: "Placement outcomes" },
  ];

  let content;
  if (tab === "internships") {
    const [result, currencies] = await Promise.all([listInternships(ctx, {}, page), currencyOptions()]);
    content = (
      <div className="space-y-4">
        <div className="flex justify-end">
          <NewInternshipButton countries={countries} currencies={currencies} />
        </div>
        <DataTable
          caption="Internship programmes"
          rows={result.items}
          getRowId={(i) => i.id}
          columns={[
            {
              id: "title",
              header: "Programme",
              primary: true,
              cell: (i) => (
                <span className="block min-w-0">
                  <span className="block font-medium text-foreground">{i.title}</span>
                  <span className="block text-xs text-muted-foreground">{[i.hostEmployerName, i.city].filter(Boolean).join(" · ") || "Host not set"}</span>
                </span>
              ),
            },
            { id: "starts", header: "Starts", hideOnMobile: true, cell: (i) => (i.startsOn ? <DateText value={i.startsOn} dateOnly /> : "Not set") },
            {
              id: "stipend",
              header: "Stipend",
              cell: (i) => (i.stipendType === "fixed" ? <MoneyText amountMinor={i.stipendMinor} currency={i.stipendCurrency} /> : STIPEND_TYPE_LABELS[i.stipendType]),
            },
            {
              id: "status",
              header: "Status",
              cell: (i) => (
                <StatusBadge tone={internshipStatus(i.status).tone} size="sm">
                  {internshipStatus(i.status).label}
                </StatusBadge>
              ),
            },
            {
              id: "actions",
              header: <span className="sr-only">Actions</span>,
              align: "right",
              cell: (i) => (
                <div className="flex flex-wrap justify-end gap-2">
                  {["draft", "open", "closed"].includes(i.status) ? (
                    <EditInternshipButton
                      internshipId={i.id}
                      countries={countries}
                      currencies={currencies}
                      defaults={{
                        title: i.title,
                        description: i.description,
                        eligibility: i.eligibility,
                        durationWeeks: i.durationWeeks,
                        startsOn: i.startsOn,
                        applicationDeadline: i.applicationDeadline,
                        workMode: i.workMode,
                        countryCode: i.countryCode,
                        city: i.city,
                        stipendType: i.stipendType,
                        stipendAmount: i.stipendMinor !== null && i.stipendCurrency ? fromMinorUnits(i.stipendMinor, i.stipendCurrency) : null,
                        stipendCurrency: i.stipendCurrency,
                        stipendPeriod: i.stipendPeriod,
                        seats: i.seats,
                        hostEmployerName: i.hostEmployerName,
                      }}
                    />
                  ) : null}
                  <InternshipStatusActions internshipId={i.id} status={i.status} title={i.title} />
                </div>
              ),
            },
          ]}
          empty={<EmptyState icon={<GraduationCap aria-hidden="true" />} title="No internship programmes yet" description="Create a programme with a host employer, dates and stipend, then open it for applications." />}
          footer={<Pagination pathname="/institution/placements" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="programmes" />}
        />
      </div>
    );
  } else if (tab === "outcomes") {
    const [result, learners, currencies, drives] = await Promise.all([
      listPlacementOutcomes(ctx, {}, page),
      listLearnerOptions(ctx),
      currencyOptions(),
      listCampusDrives(ctx, {}, { page: 1, pageSize: 100, offset: 0 }),
    ]);
    content = (
      <div className="space-y-4">
        <div className="flex justify-end">
          <RecordOutcomeButton
            organizationId={ctx.organization.id}
            learners={learners}
            drives={drives.items.map((d) => ({ value: d.id, label: `${d.title} (${d.code})` }))}
            countries={countries}
            currencies={currencies}
          />
        </div>
        <DataTable
          caption="Placement outcomes"
          rows={result.items}
          getRowId={(o) => o.id}
          columns={[
            {
              id: "learner",
              header: "Learner",
              primary: true,
              cell: (o) => (
                <span className="block min-w-0">
                  <span className="block font-medium text-foreground">{o.candidateName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {o.jobTitle} at {o.employerName}
                  </span>
                </span>
              ),
            },
            { id: "placed", header: "Placed", cell: (o) => <DateText value={o.placedOn} dateOnly /> },
            { id: "source", header: "Source", hideOnMobile: true, cell: (o) => OUTCOME_SOURCE_LABELS[o.sourceType] ?? o.sourceType },
            { id: "evidence", header: "Evidence", hideOnMobile: true, cell: (o) => (o.evidenceFileId ? "Attached" : "Missing") },
            {
              id: "verified",
              header: "Verification",
              cell: (o) => (
                <VerificationBadge
                  state={o.verified ? "verified" : "self_declared"}
                  verifiedAt={o.verifiedAt ?? undefined}
                  label={o.verified ? "Verified by Venkat Sai" : "Self-reported"}
                  timeZone={timeZone}
                />
              ),
            },
            {
              id: "actions",
              header: <span className="sr-only">Actions</span>,
              align: "right",
              cell: (o) => (o.verified ? null : <DeleteOutcomeButton outcomeId={o.id} label={`outcome for ${o.candidateName}`} />),
            },
          ]}
          empty={
            <EmptyState
              icon={<Briefcase aria-hidden="true" />}
              title="No placement outcomes yet"
              description="Record where your learners were placed, with an offer or appointment letter as evidence. Venkat Sai verifies outcomes before they count publicly."
            />
          }
          footer={<Pagination pathname="/institution/placements" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="outcomes" />}
        />
      </div>
    );
  } else {
    const result = await listCampusDrives(ctx, {}, page);
    content = (
      <div className="space-y-4">
        <div className="flex justify-end">
          <NewDriveButton countries={countries} />
        </div>
        <DataTable
          caption="Campus drives"
          rows={result.items}
          getRowId={(d) => d.id}
          rowLink={(d) => ({ href: `/institution/placements/drives/${d.id}`, label: `Open drive ${d.title}` })}
          columns={[
            {
              id: "title",
              header: "Drive",
              primary: true,
              cell: (d) => (
                <span className="block min-w-0">
                  <span className="block font-medium text-foreground">{d.title}</span>
                  <span className="block text-xs text-muted-foreground">{[d.employerName, d.code].filter(Boolean).join(" · ")}</span>
                </span>
              ),
            },
            { id: "date", header: "Date", cell: (d) => (d.driveDate ? <DateText value={d.driveDate} dateOnly /> : "Not set") },
            { id: "registrations", header: "Registrations", align: "right", cell: (d) => (d.capacity ? `${d.registrationCount} / ${d.capacity}` : d.registrationCount) },
            { id: "visibility", header: "Listing", hideOnMobile: true, cell: (d) => (d.isPublic ? "Public" : "Own learners only") },
            {
              id: "status",
              header: "Status",
              cell: (d) => (
                <StatusBadge tone={driveStatus(d.status).tone} size="sm">
                  {driveStatus(d.status).label}
                </StatusBadge>
              ),
            },
          ]}
          empty={<EmptyState icon={<CalendarDays aria-hidden="true" />} title="No campus drives yet" description="Plan a recruitment drive with an employer, open registration and track who attends and is selected." />}
          footer={<Pagination pathname="/institution/placements" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="drives" />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Placements"
        description="Campus drives, internship programmes and where your learners were placed. Learners are never charged to register or be placed."
        breadcrumbs={[{ label: "Institution", href: "/institution" }, { label: "Placements" }]}
      />
      <LinkTabs label="Placement sections" items={tabs} />
      {content}
    </div>
  );
}
