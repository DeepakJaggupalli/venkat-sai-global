import type { Metadata } from "next";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterPendingRegion, FilterScope, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage, sp, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { issuePartnerAgreementToPartnersAction, terminatePartnerAgreementAction } from "@/modules/organizations/partner-actions";

import { partnerOptions } from "../../pipeline/_shared/options";
import { staffTimeZone } from "../../pipeline/_shared/server";
import { ReasonDialog } from "../../pipeline/_shared/reason-dialog";
import { StaffForm } from "../../pipeline/_shared/staff-form";
import { humanize, statusTone } from "../../pipeline/_shared/status";
import { PartnerTabs } from "../_components/partner-tabs";
import { agreementVersionSummary, listAgreementsForStaff } from "../_lib/queries";

export const metadata: Metadata = { title: "Agreements · Partners" };

const STATUSES = ["pending", "active", "superseded", "expired", "terminated"] as const;

export default async function PartnerAgreementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff(["partners.view", "partners.manage"], "any");
  const params = await searchParams;
  const page = parsePage(params, { defaultSize: 50 });
  const version = sp(params, "version")?.slice(0, 40);
  const status = STATUSES.find((s) => s === sp(params, "status"));
  const canManage = staffCan(staff, "partners.manage");
  const [versions, rows, partners] = await Promise.all([agreementVersionSummary(), listAgreementsForStaff({ version, status }, page), canManage ? partnerOptions({ verifiedOnly: true }) : Promise.resolve([])]);
  const tz = staffTimeZone(staff);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner agreements"
        description="Publish versioned agreements to partners and see who has accepted. Each acceptance records the person, time and a hashed network address as evidence."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Partners", href: "/admin/partners" }, { label: "Agreements" }]}
      />
      <PartnerTabs />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <SectionCard title="Versions" flush>
            <DataTable
              caption="Agreement versions"
              rows={versions}
              getRowId={(v) => v.version}
              rowLink={(v) => ({ href: `/admin/partners/agreements?version=${encodeURIComponent(v.version)}`, label: `Show partners for version ${v.version}` })}
              columns={[
                { id: "version", header: "Version", primary: true, cell: (v) => (<div><p className="font-medium">{v.version}</p><p className="text-xs text-muted-foreground">{v.title}</p></div>) },
                { id: "issued", header: "Issued to", align: "right", cell: (v) => v.issued },
                { id: "accepted", header: "Accepted", align: "right", cell: (v) => v.accepted },
                { id: "pending", header: "Awaiting acceptance", align: "right", cell: (v) => v.pending },
                { id: "last", header: "Last issued", hideOnMobile: true, cell: (v) => <DateText value={v.lastIssuedAt} timeZone={tz} /> },
              ]}
              empty={<EmptyState size="sm" variant="plain" title="No agreements published" description={canManage ? "Publish the first version with the form on this page." : "Agreements published by the partnerships team appear here."} />}
            />
          </SectionCard>

          <SectionCard title={version ? `Acceptances for version ${version}` : "All agreements"} flush>
            <div className="p-4 pb-0">
              <FilterScope>
                <FilterBar paramKeys={["status", "version"]}>
                  <FilterSelect param="status" label="Status" allLabel="All statuses" options={STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
                  <FilterSelect param="version" label="Version" allLabel="All versions" options={versions.map((v) => ({ value: v.version, label: v.version }))} />
                </FilterBar>
              </FilterScope>
            </div>
            <FilterPendingRegion>
              <DataTable
                caption="Partner agreements"
                rows={rows}
                getRowId={(r) => r.id}
                columns={[
                  { id: "partner", header: "Partner", primary: true, cell: (r) => (<div><p className="font-medium">{r.partnerName}</p><p className="text-xs text-muted-foreground">Version {r.version}</p></div>) },
                  { id: "status", header: "Status", cell: (r) => <StatusBadge tone={statusTone(r.status)} size="sm">{humanize(r.status)}</StatusBadge> },
                  { id: "issued", header: "Issued", hideOnMobile: true, cell: (r) => <DateText value={r.issuedAt} timeZone={tz} /> },
                  { id: "accepted", header: "Accepted", cell: (r) => (r.acceptedAt ? <span><DateText value={r.acceptedAt} mode="datetime" timeZone={tz} /><span className="block text-xs text-muted-foreground">by {r.acceptedByName ?? "—"}</span></span> : "Not yet") },
                  { id: "effective", header: "Effective", hideOnMobile: true, cell: (r) => (r.effectiveFrom ? <span><DateText value={r.effectiveFrom} dateOnly />{r.effectiveUntil ? <> – <DateText value={r.effectiveUntil} dateOnly /></> : null}</span> : "—") },
                  {
                    id: "actions",
                    header: "Actions",
                    cell: (r) =>
                      canManage && (r.status === "active" || r.status === "pending") ? (
                        <ReasonDialog action={terminatePartnerAgreementAction} hidden={{ agreementId: r.id }} triggerLabel="Terminate" title={`Terminate the agreement with ${r.partnerName}?`} confirmLabel="Terminate" destructive variant="ghost" />
                      ) : r.terminationReason ? (
                        <span className="text-xs text-muted-foreground">{r.terminationReason}</span>
                      ) : null,
                  },
                ]}
                empty={<EmptyState size="sm" variant="plain" title="No agreements match" description="Try a different version or status." />}
              />
            </FilterPendingRegion>
          </SectionCard>
        </div>

        {canManage ? (
          <SectionCard title="Publish a version" description="Issued to every verified partner unless you choose specific partners. Partners with this version already are skipped; an older pending offer is superseded.">
            <StaffForm
              action={issuePartnerAgreementToPartnersAction}
              submitLabel="Publish agreement"
              resetOnSuccess
              testId="agreement-form"
              fields={[
                { name: "version", label: "Version", required: true, placeholder: "e.g. 2026.1", maxLength: 40 },
                { name: "title", label: "Title", required: true, maxLength: 200 },
                { name: "termsHtml", label: "Agreement text", kind: "richtext", required: true, maxLength: 200000 },
                { name: "effectiveFrom", label: "Effective from", kind: "date", optional: true },
                { name: "effectiveUntil", label: "Effective until", kind: "date", optional: true },
                { name: "organizationIds", label: "Only these partners", kind: "search-select", optional: true, options: partners, allowClear: true, hint: "Leave empty to issue to all verified partners." },
              ]}
            />
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
