import type { Metadata } from "next";
import { KeyRound, Lock } from "lucide-react";
import { z } from "zod";

import { ActionForm } from "@/components/admin/action-form";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { PERMISSIONS_BY_SCOPE } from "@/config/permissions";
import { ROLE_SCOPES } from "@/db/schema/_constants";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { SETTINGS_CRUMB, SettingsNav } from "../_components/settings-nav";
import { createRoleAction } from "./actions";
import { countOrgCustomRoles, isProtectedRole, listRoleTemplates } from "./_lib/roles";
import { SCOPE_LABELS } from "./_lib/scopes";

export const metadata: Metadata = { title: "Roles and permissions" };


type SP = Record<string, string | string[] | undefined>;

export default async function RolesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireStaff("settings.view");
  const sp = await searchParams;
  const scope = z.enum(ROLE_SCOPES).catch("platform").parse(sp.scope);
  const canEdit = staffCan(ctx, "settings.roles");
  const [rows, customCounts] = await Promise.all([listRoleTemplates(scope), countOrgCustomRoles()]);
  const sensitiveKeys = new Set(PERMISSIONS_BY_SCOPE[scope].filter((p) => p.sensitive).map((p) => p.key));
  const total = PERMISSIONS_BY_SCOPE[scope].length;
  const customHere = customCounts[scope] ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles and permissions"
        description="Roles bundle permissions. Staff roles control the Command Centre; organisation templates are the roles every employer, partner and institution starts with."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, SETTINGS_CRUMB, { label: "Roles" }]}
        actions={
          canEdit ? (
            <ResponsiveDialog
              title={`New ${scope === "platform" ? "staff role" : "organisation role template"}`}
              description="Start empty or copy an existing role, then choose permissions on the next screen."
              trigger={<Button data-testid="new-role">New role</Button>}
            >
              <ActionForm
                action={createRoleAction}
                hidden={{ scope }}
                successHref="/admin/settings/roles/{id}"
                fields={[
                  { name: "name", label: "Role name", required: true },
                  { name: "description", label: "What this role is for", kind: "textarea", optional: true, rows: 2 },
                  { name: "copyFromId", label: "Copy permissions from", kind: "select", optional: true, allowClear: true, options: rows.filter((r) => !isProtectedRole(r)).map((r) => ({ value: r.id, label: r.name })) },
                ]}
                submitLabel="Create role"
                testId="new-role-form"
              />
            </ResponsiveDialog>
          ) : null
        }
      />
      <SettingsNav />
      <LinkTabs
        label="Role scope"
        items={ROLE_SCOPES.map((s) => ({ href: s === "platform" ? "/admin/settings/roles" : `/admin/settings/roles?scope=${s}`, label: SCOPE_LABELS[s], match: "exact" as const }))}
        activeHref={scope === "platform" ? "/admin/settings/roles" : `/admin/settings/roles?scope=${scope}`}
      />
      {scope !== "platform" ? (
        <p className="text-sm text-muted-foreground">
          Changing a template changes access for every organisation member who holds it.
          {customHere ? ` Organisations have also defined ${customHere} custom role${customHere === 1 ? "" : "s"} of their own, managed in their portals.` : ""}
        </p>
      ) : null}

      <DataTable
        caption={`${SCOPE_LABELS[scope]} roles`}
        rows={rows}
        getRowId={(r) => r.id}
        rowLink={(r) => ({ href: `/admin/settings/roles/${r.id}`, label: `Open role ${r.name}` })}
        columns={[
          {
            id: "name",
            header: "Role",
            primary: true,
            cell: (r) => (
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-medium text-foreground">
                  {isProtectedRole(r) ? <Lock aria-label="Protected" className="size-3.5 text-muted-foreground" /> : null}
                  {r.name}
                </p>
                {r.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{r.description}</p> : null}
              </div>
            ),
          },
          {
            id: "type",
            header: "Type",
            cell: (r) => (isProtectedRole(r) ? <StatusBadge tone="gold" size="sm">Protected</StatusBadge> : r.isSystem ? <StatusBadge tone="neutral" size="sm">Built-in</StatusBadge> : <StatusBadge tone="info" size="sm">Custom</StatusBadge>),
          },
          {
            id: "permissions",
            header: "Permissions",
            cell: (r) => {
              const sensitive = r.permissions.filter((p) => sensitiveKeys.has(p)).length;
              return (
                <span className="text-sm">
                  {isProtectedRole(r) ? "All" : `${r.permissions.length} of ${total}`}
                  {sensitive && !isProtectedRole(r) ? <span className="ml-1 text-xs text-warning-strong">({sensitive} sensitive)</span> : null}
                </span>
              );
            },
          },
          { id: "members", header: scope === "platform" ? "Staff" : "Members", align: "right", cell: (r) => r.memberCount },
        ]}
        empty={<EmptyState icon={<KeyRound />} title="No roles yet" description="Run the database seed to install the default roles, or create one." />}
      />
    </div>
  );
}
