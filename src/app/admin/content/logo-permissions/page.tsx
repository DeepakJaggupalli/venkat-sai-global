import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterPendingRegion, FilterScope, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import type { LogoPermissionStatus } from "@/db/schema";
import { parsePage } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { LOGO_PERMISSION_STATUS_LABELS, LOGO_PERMISSION_STATUS_VALUES, LOGO_RELATIONSHIP_LABELS } from "@/modules/content/constants";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";
import { listLogoPermissions } from "@/modules/content/queries";

export const metadata: Metadata = { title: "Logo permissions" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const TONE = { pending: "warning", approved: "success", expired: "neutral", revoked: "danger" } as const;

export default async function LogoPermissionsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireStaff(["content.view", "content.edit"], "any");
  const sp = await searchParams;
  const statusRaw = one(sp.status);
  const status = (LOGO_PERMISSION_STATUS_VALUES as readonly string[]).includes(statusRaw ?? "") ? (statusRaw as LogoPermissionStatus) : undefined;
  const q = one(sp.q)?.slice(0, 100);
  const page = parsePage(sp, { defaultSize: 25 });
  const result = await listLogoPermissions(ctx, { status, q }, page);
  const base = CONTENT_ADMIN_PATHS.logoPermissions;
  const canEdit = staffCan(ctx, "content.edit");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logo permissions"
        description="A client, partner or institution logo appears on the website only with written permission that is approved, unexpired and covers the page."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Content", href: CONTENT_ADMIN_PATHS.content }, { label: "Logo permissions" }]}
        actions={canEdit ? [{ label: "Record a permission", href: `${base}/new`, icon: <Plus aria-hidden /> }] : undefined}
      />
      <LinkTabs
        label="Permission status"
        items={[{ href: base, label: "All" }, ...LOGO_PERMISSION_STATUS_VALUES.map((s) => ({ href: `${base}?status=${s}`, label: LOGO_PERMISSION_STATUS_LABELS[s] }))]}
      />
      <FilterScope>
        <FilterBar paramKeys={["q"]} search={<SearchInput label="Search by organisation" />}>
          {null}
        </FilterBar>
        <FilterPendingRegion>
          <DataTable
            caption="Logo permissions"
            rows={result.items}
            getRowId={(r) => r.id}
            rowLink={(r) => ({ href: CONTENT_ADMIN_PATHS.logoPermission(r.id), label: `Open permission for ${r.organizationName}` })}
            columns={[
              {
                id: "org",
                header: "Organisation",
                primary: true,
                cell: (r) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.organizationName}</p>
                    <p className="text-xs text-muted-foreground">{LOGO_RELATIONSHIP_LABELS[r.relationship]}</p>
                  </div>
                ),
              },
              { id: "status", header: "Status", cell: (r) => <StatusBadge tone={TONE[r.status]} size="sm">{LOGO_PERMISSION_STATUS_LABELS[r.status]}</StatusBadge> },
              { id: "expires", header: "Expires", nowrap: true, cell: (r) => (r.expiresAt ? <DateText value={r.expiresAt} dateOnly /> : "No end date") },
              { id: "logos", header: "Logos linked", align: "right", cell: (r) => r.linkedLogoCount },
            ]}
            empty={
              q || status ? (
                <EmptyState title="No permissions match" primaryAction={{ label: "Show all", href: base, variant: "outline" }} />
              ) : (
                <EmptyState
                  title="No logo permissions recorded"
                  description="Ask the organisation for written permission (a signed letter, contract clause or email) before showing its logo, then record it here."
                  primaryAction={canEdit ? { label: "Record a permission", href: `${base}/new` } : undefined}
                />
              )
            }
            footer={result.pageCount > 1 ? <Pagination pathname={base} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="permissions" /> : undefined}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
