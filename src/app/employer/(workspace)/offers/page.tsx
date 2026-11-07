import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, FileSignature } from "lucide-react";

import { labelFor, PLACEMENT_STATUS_LABELS, placementStatusTone } from "@/components/employer-talent/labels";
import { ConfirmJoinedButton, RequestReplacementButton } from "@/components/employer-talent/offer-actions";
import { OfferCard } from "@/components/employer-talent/offer-card";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { Stepper } from "@/components/shared/stepper";
import { parsePage, type SearchParams } from "@/lib/http";
import { orgCan, requireOrgMember, type OrgContext } from "@/modules/identity/authz";
import { OFFER_STATUS_LABELS, OFFER_STATUS_OPTIONS } from "@/modules/recruitment/constants";
import { MOBILISATION_PATH, MOBILISATION_STATUS_LABELS } from "@/modules/recruitment/mobilisation-rules";
import { listOffersForEmployer, listPlacementsForEmployer } from "@/modules/recruitment/queries";
import type { PlacementView } from "@/modules/recruitment/types";

import { accessibleFileSummaries, loadOfferFormOptions, viewerTimeZone } from "../pipeline/_lib/shared";

export const metadata: Metadata = { title: "Offers and placements" };

const PLACEMENT_FILTER = Object.entries(PLACEMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }));
type PlacementStatus = PlacementView["status"];
type OfferStatus = (typeof OFFER_STATUS_OPTIONS)[number];

function MobilisationProgress({ placement }: { placement: PlacementView }) {
  const status = placement.mobilisationStatus;
  if (!status) return null;
  if (status === "on_hold" || status === "cancelled") {
    return (
      <p className="text-sm">
        Mobilisation: <StatusBadge tone="warning" size="sm">{MOBILISATION_STATUS_LABELS[status]}</StatusBadge>
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Overseas mobilisation (managed by Venkat Sai)</p>
      <Stepper label={`Mobilisation progress for ${placement.candidateName}`} steps={MOBILISATION_PATH.map((s) => ({ id: s, label: MOBILISATION_STATUS_LABELS[s] }))} current={status} completed={status === "completed" ? [...MOBILISATION_PATH] : undefined} />
    </div>
  );
}

export default async function OffersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("employer", ["employer.offers.manage", "employer.pipeline.view"], "any");
  const sp = await searchParams;
  const canOffers = orgCan(ctx, "employer.offers.manage");
  const tab = sp.tab === "placements" || !canOffers ? "placements" : "offers";
  const page = parsePage(sp, { defaultSize: 20, maxSize: 50 });
  const tz = viewerTimeZone(ctx);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offers and placements"
        description="Offers you have drafted or sent, and the people who accepted them. Candidates are never charged for an offer, visa processing or joining."
        breadcrumbs={[{ label: "Employer", href: "/employer" }, { label: "Offers and placements" }]}
      />
      <LinkTabs
        label="Offers and placements"
        items={[...(canOffers ? [{ href: "/employer/offers", label: "Offers", match: "exact" as const }] : []), { href: "/employer/offers?tab=placements", label: "Placements" }]}
        activeHref={tab === "placements" ? "/employer/offers?tab=placements" : "/employer/offers"}
      />
      {tab === "offers" ? <OffersTab sp={sp} page={page} tz={tz} ctxOrg={ctx} /> : <PlacementsTab sp={sp} page={page} tz={tz} ctxOrg={ctx} />}
    </div>
  );
}

type TabProps = { sp: SearchParams; page: ReturnType<typeof parsePage>; tz: string; ctxOrg: OrgContext<"employer"> };

async function OffersTab({ sp, page, tz, ctxOrg }: TabProps) {
  const status = OFFER_STATUS_OPTIONS.includes(sp.status as OfferStatus) ? (sp.status as OfferStatus) : undefined;
  const [result, options] = await Promise.all([listOffersForEmployer(ctxOrg, { status }, page), loadOfferFormOptions()]);
  const files = await accessibleFileSummaries(result.items.map((o) => o.offerFileId));
  return (
    <div className="space-y-4">
      <FilterBar paramKeys={["status"]}>
        <FilterSelect param="status" label="Offer status" options={OFFER_STATUS_OPTIONS.map((s) => ({ value: s, label: OFFER_STATUS_LABELS[s] }))} allLabel="All offers" />
      </FilterBar>
      {result.items.length === 0 ? (
        <EmptyState
          icon={<FileSignature aria-hidden />}
          title={status ? "No offers with this status" : "No offers yet"}
          description="Make an offer from a candidate's application in the pipeline. Drafts stay private until you issue them."
          primaryAction={{ label: "Open the pipeline", href: "/employer/pipeline" }}
        />
      ) : (
        <>
          <ul className="grid gap-4 xl:grid-cols-2" aria-label="Offers">
            {result.items.map((o) => (
              <li key={o.id}>
                <OfferCard offer={o} offerFile={o.offerFileId ? (files[o.offerFileId] ?? null) : null} options={options} canManage showCandidate timeZone={tz} />
              </li>
            ))}
          </ul>
          <Pagination pathname="/employer/offers" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="offers" />
        </>
      )}
    </div>
  );
}

async function PlacementsTab({ sp, page, tz, ctxOrg }: TabProps) {
  const status = PLACEMENT_FILTER.some((o) => o.value === sp.status) ? (sp.status as PlacementStatus) : undefined;
  const result = await listPlacementsForEmployer(ctxOrg, { status }, page);
  const canManage = orgCan(ctxOrg, "employer.offers.manage");
  return (
    <div className="space-y-4">
      <FilterBar paramKeys={["status"]}>
        <FilterSelect param="status" label="Placement status" options={PLACEMENT_FILTER} allLabel="All placements" />
      </FilterBar>
      {result.items.length === 0 ? (
        <EmptyState icon={<BadgeCheck aria-hidden />} title={status ? "No placements with this status" : "No placements yet"} description="When a candidate accepts an offer, their placement and joining progress appear here." />
      ) : (
        <>
          <ul className="space-y-4" aria-label="Placements">
            {result.items.map((p) => (
              <li key={p.id} className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-heading text-sm font-semibold">
                      <Link href={`/employer/pipeline/${p.jobId}?application=${p.applicationId}`} className="text-teal-strong underline-offset-4 hover:underline">
                        {p.candidateName}
                      </Link>{" "}
                      <span className="font-normal text-muted-foreground">· {p.jobTitle}</span>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {p.code} · placed <DateText value={p.placedOn} dateOnly timeZone={tz} />
                      {p.joinedOn ? (
                        <>
                          {" "}
                          · joined <DateText value={p.joinedOn} dateOnly />
                        </>
                      ) : null}
                      {p.workLocation || p.countryCode ? ` · ${[p.workLocation, p.countryCode].filter(Boolean).join(", ")}` : ""}
                    </p>
                    {p.salaryMinor !== null && p.salaryCurrency ? (
                      <p className="text-sm">
                        Salary <MoneyText amountMinor={p.salaryMinor} currency={p.salaryCurrency} /> {p.salaryPeriod ? `per ${p.salaryPeriod}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge tone={placementStatusTone(p.status)} size="sm">
                    {labelFor(PLACEMENT_STATUS_LABELS, p.status)}
                  </StatusBadge>
                </div>
                <MobilisationProgress placement={p} />
                {p.replacementDeadline ? (
                  <p className="text-xs text-muted-foreground">
                    Replacement period ends <DateText value={p.replacementDeadline} dateOnly />
                  </p>
                ) : null}
                {canManage && (p.status === "pending_joining" || p.status === "mobilising" || p.status === "joined") ? (
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    {p.status !== "joined" ? <ConfirmJoinedButton placementId={p.id} /> : null}
                    {p.status === "joined" ? <RequestReplacementButton placementId={p.id} /> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <Pagination pathname="/employer/offers" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="placements" />
        </>
      )}
    </div>
  );
}
