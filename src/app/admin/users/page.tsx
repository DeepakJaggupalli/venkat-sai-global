import type { Metadata } from "next";
import { UserCog } from "lucide-react";
import { z } from "zod";

import { ActionForm } from "@/components/admin/action-form";
import { UserAvatar } from "@/components/shared/avatars";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { RelativeTime } from "@/components/shared/relative-time";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { USER_STATUSES } from "@/db/schema/_constants";
import { humanize, maskEmail, maskPhone } from "@/lib/format";
import { parsePage } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { createStaffUserAction } from "./actions";
import { listPlatformRoles, listUsers } from "./_lib/user-admin";

export const metadata: Metadata = { title: "Users" };

type SP = Record<string, string | string[] | undefined>;

const filtersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(USER_STATUSES).optional().catch(undefined),
  kind: z.enum(["staff", "candidate", "organization"]).optional().catch(undefined),
});
const statusOptions = USER_STATUSES.map((s) => ({ value: s, label: humanize(s) }));
const kindOptions = [
  { value: "staff", label: "Venkat Sai staff" },
  { value: "candidate", label: "Candidates" },
  { value: "organization", label: "Organisation members" },
];

export default async function UsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireStaff("users.view");
  const sp = await searchParams;
  const f = filtersSchema.parse({ q: sp.q, status: sp.status, kind: sp.kind });
  const page = parsePage(sp, { defaultSize: 25 });
  const canRoles = staffCan(ctx, "users.roles");
  const [result, roles] = await Promise.all([listUsers(ctx, f, page), canRoles ? listPlatformRoles() : Promise.resolve([])]);
  const roleOptions = roles.filter((r) => ctx.isSuperAdmin || r.permissions.every((p) => ctx.permissions.has(p))).map((r) => ({ value: r.id, label: r.name, description: r.description ?? undefined }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Every account on Venkat Sai Global. Contact details are partly hidden in lists; open an account to manage access."
        actions={
          canRoles ? (
            <ResponsiveDialog title="Add a staff member" description="They receive an e-mail link to set a password. Two-factor authentication is required for staff." trigger={<Button data-testid="new-staff">Add staff member</Button>}>
              <ActionForm
                action={createStaffUserAction}
                successHref="/admin/users/{id}"
                testId="new-staff-form"
                fields={[
                  { name: "displayName", label: "Full name", required: true },
                  { name: "email", label: "Work e-mail", kind: "email", required: true },
                  { name: "roleIds", label: "Roles", kind: "multi", options: roleOptions, required: true, hint: "You can only grant roles whose permissions you hold" },
                ]}
                submitLabel="Create and send invite"
                pendingLabel="Creating…"
              />
            </ResponsiveDialog>
          ) : null
        }
      />
      <FilterScope>
        <FilterBar paramKeys={["q", "status", "kind"]} search={<SearchInput label="Search by name, e-mail or phone" />}>
          <FilterSelect param="kind" label="Account type" allLabel="Everyone" options={kindOptions} />
          <FilterSelect param="status" label="Status" allLabel="Any status" options={statusOptions} />
        </FilterBar>
        <FilterChips
          filters={[
            { param: "kind", label: "Type", options: kindOptions },
            { param: "status", label: "Status", options: statusOptions },
          ]}
        />
        <FilterPendingRegion>
          <DataTable
            caption="User accounts"
            rows={result.items}
            getRowId={(u) => u.id}
            rowLink={(u) => ({ href: `/admin/users/${u.id}`, label: `Open ${u.displayName}` })}
            columns={[
              {
                id: "name",
                header: "Person",
                primary: true,
                cell: (u) => (
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar name={u.displayName} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{u.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email ? maskEmail(u.email) : maskPhone(u.phone)}</p>
                    </div>
                  </div>
                ),
              },
              {
                id: "type",
                header: "Capacities",
                cell: (u) => (
                  <span className="flex flex-wrap gap-1">
                    {u.isStaff ? <StatusBadge tone="brand" size="sm">Staff</StatusBadge> : null}
                    {u.hasCandidate ? <StatusBadge tone="info" size="sm">Candidate</StatusBadge> : null}
                    {u.orgCount ? <StatusBadge tone="neutral" size="sm">{u.orgCount === 1 ? "1 organisation" : `${u.orgCount} organisations`}</StatusBadge> : null}
                  </span>
                ),
              },
              { id: "status", header: "Status", cell: (u) => <StatusBadge status={u.status} size="sm" /> },
              { id: "login", header: "Last sign-in", hideOnMobile: true, cell: (u) => (u.lastLoginAt ? <RelativeTime value={u.lastLoginAt} /> : <span className="text-muted-foreground">Never</span>) },
              { id: "created", header: "Joined", hideOnMobile: true, cell: (u) => <RelativeTime value={u.createdAt} /> },
            ]}
            empty={<EmptyState icon={<UserCog />} title="No accounts match" description="Try a different search or filter." />}
            footer={<Pagination pathname="/admin/users" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="accounts" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
