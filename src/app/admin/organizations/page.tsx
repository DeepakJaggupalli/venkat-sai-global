import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { z } from "zod";

import { OrgAvatar } from "@/components/shared/avatars";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { ORG_STATUSES, ORG_TYPES, type OrgType } from "@/db/schema/_constants";
import { humanize } from "@/lib/format";
import { parsePage } from "@/lib/http";
import { requireStaff } from "@/modules/identity/authz";
import { ORG_TYPE_LABELS } from "@/modules/organizations/constants";
import { countOrganizationsByStatus, listOrganizations } from "@/modules/organizations/queries";
import { countryOptions } from "@/modules/taxonomy/queries";

type SP = Record<string, string | string[] | undefined>;

const PLURAL: Record<OrgType, string> = { employer: "Employers", recruitment_partner: "Recruitment partners", institution: "Institutions" };

const filtersSchema = z.object({
  type: z.enum(ORG_TYPES).optional().catch(undefined),
  status: z.enum(ORG_STATUSES).optional().catch(undefined),
  country: z.string().regex(/^[A-Z]{2}$/).optional().catch(undefined),
  expiring: z.enum(["30", "60", "90"]).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const type = filtersSchema.shape.type.parse(sp.type);
  return { title: type ? PLURAL[type] : "Organisations" };
}

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requireStaff("orgs.view");
  const sp = await searchParams;
  const f = filtersSchema.parse({ type: sp.type, status: sp.status, country: sp.country, expiring: sp.expiring, q: sp.q });
  const page = parsePage(sp, { defaultSize: 25 });
  const [result, counts, countries] = await Promise.all([
    listOrganizations(staff, { type: f.type, status: f.status, q: f.q, countryCode: f.country, expiringWithinDays: f.expiring ? Number(f.expiring) : undefined }, page),
    countOrganizationsByStatus(staff),
    countryOptions(),
  ]);
  const scoped = counts.filter((c) => !f.type || c.type === f.type);
  const pending = scoped.filter((c) => c.status === "pending" || c.status === "under_review").reduce((a, c) => a + c.count, 0);
  const verified = scoped.filter((c) => c.status === "verified").reduce((a, c) => a + c.count, 0);
  const statusOptions = ORG_STATUSES.map((s) => ({ value: s, label: humanize(s) }));
  const title = f.type ? PLURAL[f.type] : "Organisations";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description="Verification, membership, documents and account ownership for every employer, recruitment partner and institution."
        meta={
          <span className="text-sm text-muted-foreground">
            {verified} verified · {pending} awaiting verification
          </span>
        }
      />
      <LinkTabs
        label="Organisation types"
        items={[
          { href: "/admin/organizations", label: "All", match: "exact" },
          ...ORG_TYPES.map((t) => ({ href: `/admin/organizations?type=${t}`, label: PLURAL[t] })),
        ]}
      />
      <FilterScope>
        <FilterBar paramKeys={["q", "status", "country", "expiring"]} search={<SearchInput label="Search by name, registration or tax number" />}>
          <FilterSelect param="status" label="Status" allLabel="Any status" options={statusOptions} />
          <FilterSelect param="country" label="Country" allLabel="All countries" options={countries} />
          <FilterSelect
            param="expiring"
            label="Verification expiry"
            allLabel="Any time"
            options={[
              { value: "30", label: "Expires within 30 days" },
              { value: "60", label: "Expires within 60 days" },
              { value: "90", label: "Expires within 90 days" },
            ]}
          />
        </FilterBar>
        <FilterChips
          filters={[
            { param: "status", label: "Status", options: statusOptions },
            { param: "country", label: "Country", options: countries },
            { param: "expiring", label: "Expiring", options: [{ value: "30", label: "30 days" }, { value: "60", label: "60 days" }, { value: "90", label: "90 days" }] },
          ]}
        />
        <FilterPendingRegion>
          <DataTable
            caption={title}
            rows={result.items}
            getRowId={(o) => o.id}
            rowLink={(o) => ({ href: `/admin/organizations/${o.id}`, label: `Open ${o.name}` })}
            columns={[
              {
                id: "name",
                header: "Organisation",
                primary: true,
                cell: (o) => (
                  <div className="flex min-w-0 items-center gap-3">
                    <OrgAvatar name={o.name} size="sm" verified={o.status === "verified"} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{o.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ORG_TYPE_LABELS[o.type]}
                        {o.city || o.countryCode ? ` · ${[o.city, o.countryCode].filter(Boolean).join(", ")}` : ""}
                      </p>
                    </div>
                  </div>
                ),
              },
              { id: "status", header: "Status", cell: (o) => <StatusBadge status={o.status} domain="organization" size="sm" /> },
              { id: "members", header: "Members", align: "right", hideOnMobile: true, cell: (o) => o.memberCount },
              { id: "manager", header: "Account manager", hideOnMobile: true, cell: (o) => o.accountManagerName ?? <span className="text-muted-foreground">Not assigned</span> },
              {
                id: "expires",
                header: "Verification valid until",
                hideOnMobile: true,
                cell: (o) => (o.verificationExpiresAt ? <DateText value={o.verificationExpiresAt} /> : <span className="text-muted-foreground">—</span>),
              },
              { id: "created", header: "Joined", nowrap: true, cell: (o) => <DateText value={o.createdAt} /> },
            ]}
            empty={<EmptyState icon={<Building2 />} title="No organisations match" description="Organisations appear here when they register through their portal." />}
            footer={<Pagination pathname="/admin/organizations" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="organisations" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
