import type { Metadata } from "next";
import { Users } from "lucide-react";

import { ATTRIBUTION_STATUS, CONSENT_STATE, daysUntil, labelOf } from "@/components/recruiter/labels";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { MaskedValue } from "@/components/shared/masked-value";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";
import { getSetting } from "@/modules/settings";
import { countryOptions } from "@/modules/taxonomy/queries";

import { sp } from "../_lib/page-utils";
import { listPartnerCandidates, type CandidatePoolFilters } from "../_lib/queries";
import { revealSourcedContactAction } from "./actions";

export const metadata: Metadata = { title: "My candidates" };

const SHOW_OPTIONS = [
  { value: "attributed", label: "Currently attributed to you" },
  { value: "sourced", label: "Profiles you created" },
];

export default async function RecruiterCandidatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgMember("recruitment_partner", "partner.candidates.submit");
  const params = await searchParams;
  const q = sp(params, "q")?.slice(0, 100);
  const rawShow = sp(params, "show");
  const show = rawShow === "attributed" || rawShow === "sourced" ? (rawShow as CandidatePoolFilters["show"]) : undefined;
  const page = parsePage(params, { defaultSize: 25 });
  const [result, countries, attributionDays] = await Promise.all([listPartnerCandidates(ctx, { q, show }, page), countryOptions(), getSetting("recruitment.partner_attribution_days")]);
  const countryName = new Map(countries.map((c) => [c.value, c.label]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="My candidates"
        description={`People your agency sourced or submitted. A person is attributed to the first partner who validly submits them, for ${attributionDays} days. Contact details are shown only for profiles you created, and every reveal is logged.`}
        actions={[{ label: "Submit to a requirement", href: "/recruiter/requirements" }]}
      />

      <FilterBar paramKeys={["q", "show"]} search={<SearchInput label="Search by name" placeholder="Search by name" minLength={2} />} label="Filter candidates">
        <FilterSelect param="show" label="Show" allLabel="All candidates" options={SHOW_OPTIONS} />
      </FilterBar>

      <DataTable
        caption="Candidates your agency sourced or submitted"
        rows={result.items}
        getRowId={(c) => c.id}
        columns={[
          {
            id: "name",
            header: "Candidate",
            primary: true,
            cell: (c) => (
              <div className="min-w-0">
                <p className="font-medium text-foreground">{c.displayName}</p>
                <p className="text-xs text-muted-foreground">{[c.headline, c.city, c.countryCode ? (countryName.get(c.countryCode) ?? c.countryCode) : null].filter(Boolean).join(" · ") || "No details yet"}</p>
              </div>
            ),
          },
          {
            id: "contact",
            header: "Contact",
            cell: (c) =>
              c.sourcedByUs && (c.maskedEmail || c.maskedPhone) ? (
                <div className="space-y-1">
                  {c.maskedEmail ? <MaskedValue masked={c.maskedEmail} label="email address" kind="email" onReveal={revealSourcedContactAction.bind(null, { candidateId: c.id, field: "email" })} notice="" /> : null}
                  {c.maskedPhone ? <MaskedValue masked={c.maskedPhone} label="phone number" kind="phone" onReveal={revealSourcedContactAction.bind(null, { candidateId: c.id, field: "phone" })} notice="" /> : null}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">{c.sourcedByUs ? "Not provided" : "Managed by Venkat Sai"}</span>
              ),
          },
          {
            id: "consent",
            header: "Consent",
            cell: (c) => {
              const s = labelOf(CONSENT_STATE, c.consent.state);
              return (
                <div className="space-y-0.5">
                  <StatusBadge tone={s.tone} size="sm">
                    {s.label}
                  </StatusBadge>
                  {c.consent.recordedAt && c.consent.state === "recorded" ? (
                    <p className="text-xs text-muted-foreground">
                      Last recorded <DateText value={c.consent.recordedAt} />
                    </p>
                  ) : null}
                </div>
              );
            },
          },
          {
            id: "attribution",
            header: "Attribution",
            cell: (c) => {
              if (!c.attribution) return <span className="text-sm text-muted-foreground">None</span>;
              const s = labelOf(ATTRIBUTION_STATUS, c.attribution.status);
              const days = c.attribution.status === "active" ? daysUntil(c.attribution.expiresAt) : null;
              return (
                <div className="space-y-0.5">
                  <StatusBadge tone={s.tone} size="sm">
                    {s.label}
                  </StatusBadge>
                  {c.attribution.status === "active" && c.attribution.expiresAt ? (
                    <p className="text-xs text-muted-foreground">
                      Until <DateText value={c.attribution.expiresAt} />
                      {days !== null && days <= 14 ? ` (${Math.max(days, 0)} days left)` : ""}
                    </p>
                  ) : null}
                </div>
              );
            },
          },
          { id: "submissions", header: "Submissions", align: "right", cell: (c) => c.submissions, hideOnMobile: true },
          { id: "last", header: "Last submitted", cell: (c) => (c.lastSubmittedAt ? <DateText value={c.lastSubmittedAt} /> : "—"), hideOnMobile: true },
        ]}
        empty={
          <EmptyState
            icon={<Users aria-hidden="true" />}
            title={q || show ? "No candidates match" : "No candidates yet"}
            description="People you submit to a requirement are added to your pool. You can submit them again to other requirements while their consent stays in place."
            primaryAction={{ label: "View requirements", href: "/recruiter/requirements" }}
          />
        }
        footer={
          result.pageCount > 1 ? (
            <Pagination pathname="/recruiter/candidates" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="candidates" />
          ) : null
        }
      />
      <p className="text-sm text-muted-foreground">
        If a candidate withdraws consent or turns off partner submissions, do not submit them again. Venkat Sai never shares other partners&apos; candidates with you.
      </p>
    </div>
  );
}
