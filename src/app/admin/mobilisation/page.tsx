import type { Metadata } from "next";

import { listStaffOptions, userNames } from "@/components/admin/queries";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterPendingRegion, FilterScope, FilterSelect } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage, sp, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { MOBILISATION_STATUS_OPTIONS } from "@/modules/recruitment/constants";
import { MOBILISATION_STATUS_LABELS } from "@/modules/recruitment/mobilisation-rules";
import { listMobilisationsForStaff } from "@/modules/recruitment/queries";
import { countryOptions } from "@/modules/taxonomy/queries";

import { isUuid, optionsFrom, pickEnum } from "../pipeline/_shared/server";
import { statusTone } from "../pipeline/_shared/status";
import { moveMobilisationAction } from "./actions";
import { MobilisationBoard, type MobilisationCard } from "./_components/mobilisation-board";

export const metadata: Metadata = { title: "Mobilisation" };

export default async function MobilisationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff(["recruitment.mobilisation", "recruitment.view"], "any");
  const params = await searchParams;
  const view = sp(params, "view") === "table" ? "table" : "board";
  const status = pickEnum(sp(params, "status"), MOBILISATION_STATUS_OPTIONS);
  const coordinatorParam = sp(params, "coordinator");
  const coordinatorUserId = isUuid(coordinatorParam) ? coordinatorParam : undefined;
  const destination = sp(params, "destination")?.toUpperCase().slice(0, 2);
  const page = view === "board" ? { page: 1, pageSize: 200, offset: 0 } : parsePage(params);
  const [result, coordinators, countries] = await Promise.all([
    listMobilisationsForStaff(staff, { status: view === "table" ? status : undefined, coordinatorUserId, destinationCountryCode: destination }, page),
    listStaffOptions({ permission: "recruitment.mobilisation" }),
    countryOptions(),
  ]);
  const names = await userNames(result.items.map((m) => m.coordinatorUserId));
  const countryName = new Map(countries.map((c) => [c.value, c.label]));
  const canMove = staffCan(staff, "recruitment.mobilisation");
  const statusOptions = optionsFrom(MOBILISATION_STATUS_OPTIONS, MOBILISATION_STATUS_LABELS);
  const viewHref = (v: "board" | "table") => {
    const usp = new URLSearchParams();
    if (coordinatorUserId) usp.set("coordinator", coordinatorUserId);
    if (destination) usp.set("destination", destination);
    if (v === "table") usp.set("view", "table");
    const q = usp.toString();
    return `/admin/mobilisation${q ? `?${q}` : ""}`;
  };

  const cards: MobilisationCard[] = result.items.map((m) => ({
    id: m.id,
    columnId: m.status,
    code: m.code,
    candidateName: m.candidateName,
    jobTitle: m.jobTitle,
    destination: countryName.get(m.destinationCountryCode) ?? m.destinationCountryCode,
    travelDate: m.travelDate,
    openRequiredItems: m.openRequiredItems,
    coordinatorName: m.coordinatorUserId ? (names.get(m.coordinatorUserId) ?? null) : null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mobilisation"
        description="Overseas joining: documents, medical, visa, emigration clearance, PDOT (Pre-Departure Orientation Training) and travel."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Mobilisation" }]}
      />
      <LinkTabs
        label="View"
        activeHref={viewHref(view)}
        items={[
          { href: viewHref("board"), label: "Board" },
          { href: viewHref("table"), label: "Table" },
        ]}
      />
      <FilterScope>
        <FilterBar paramKeys={view === "table" ? ["status", "coordinator", "destination"] : ["coordinator", "destination"]}>
          {view === "table" ? <FilterSelect param="status" label="Status" allLabel="All statuses" options={statusOptions} /> : null}
          <FilterSelect param="coordinator" label="Coordinator" allLabel="Any coordinator" options={coordinators} />
          <FilterSelect param="destination" label="Destination" allLabel="All destinations" options={countries} />
        </FilterBar>
        <FilterPendingRegion>
          {result.total === 0 ? (
            <EmptyState
              title="No mobilisation records"
              description="A record starts automatically when a candidate accepts an offer for an overseas job, or from the application page."
              primaryAction={{ label: "Open pipeline", href: "/admin/pipeline?stage=offer_accepted" }}
            />
          ) : view === "board" ? (
            <>
              {result.total > result.items.length ? (
                <Callout tone="info" title="Showing the first 200 records">
                  Use the filters or the table view to see the rest.
                </Callout>
              ) : null}
              {canMove ? (
                <MobilisationBoard columns={MOBILISATION_STATUS_OPTIONS.map((s) => ({ id: s, title: MOBILISATION_STATUS_LABELS[s], tone: statusTone(s) }))} items={cards} moveAction={moveMobilisationAction} />
              ) : (
                <p className="text-sm text-muted-foreground">Board moves need the mobilisation permission. Use the table view to browse.</p>
              )}
            </>
          ) : (
            <DataTable
              caption="Mobilisation records"
              rows={result.items}
              getRowId={(m) => m.id}
              rowLink={(m) => ({ href: `/admin/mobilisation/${m.id}`, label: `Open mobilisation for ${m.candidateName}` })}
              columns={[
                { id: "candidate", header: "Candidate", primary: true, cell: (m) => (<div><p className="font-medium">{m.candidateName}</p><p className="font-mono text-xs text-muted-foreground">{m.code}</p></div>) },
                { id: "job", header: "Job", cell: (m) => m.jobTitle },
                { id: "destination", header: "Destination", cell: (m) => countryName.get(m.destinationCountryCode) ?? m.destinationCountryCode },
                { id: "travel", header: "Travel", hideOnMobile: true, cell: (m) => m.travelDate ?? "—" },
                { id: "open", header: "Open required items", align: "right", cell: (m) => m.openRequiredItems },
                { id: "status", header: "Status", cell: (m) => <StatusBadge tone={statusTone(m.status)} size="sm">{MOBILISATION_STATUS_LABELS[m.status]}</StatusBadge> },
              ]}
              footer={<Pagination pathname="/admin/mobilisation" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="records" />}
            />
          )}
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
