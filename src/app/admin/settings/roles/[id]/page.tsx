import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";

import { ActionButton } from "@/components/admin/action-button";
import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { PERMISSIONS_BY_SCOPE } from "@/config/permissions";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { SETTINGS_CRUMB } from "../../_components/settings-nav";
import { deleteRoleAction, updateRoleAction } from "../actions";
import { PermissionEditor } from "../_components/permission-editor";
import { getRoleTemplate, isProtectedRole } from "../_lib/roles";
import { SCOPE_LABELS } from "../_lib/scopes";

type Params = { id: string };

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const ctx = await requireStaff("settings.view");
  const role = ctx && isUuid(id) ? await getRoleTemplate(id) : null;
  return { title: role ? `Role: ${role.name}` : "Role" };
}

export default async function RolePage({ params }: { params: Promise<Params> }) {
  const ctx = await requireStaff("settings.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const role = await getRoleTemplate(id);
  if (!role) notFound();

  const canEdit = staffCan(ctx, "settings.roles");
  const protectedRole = isProtectedRole(role);
  const readOnly = !canEdit || protectedRole;
  const scopeHref = role.scope === "platform" ? "/admin/settings/roles" : `/admin/settings/roles?scope=${role.scope}`;
  const permissions = PERMISSIONS_BY_SCOPE[role.scope].map((p) => ({
    key: p.key,
    label: p.label,
    group: p.group,
    sensitive: Boolean(p.sensitive),
    grantable: role.scope !== "platform" || ctx.isSuperAdmin || ctx.permissions.has(p.key),
  }));
  const canDelete = canEdit && !role.isSystem && !protectedRole;

  return (
    <div className="space-y-6">
      <PageHeader
        title={role.name}
        eyebrow={SCOPE_LABELS[role.scope]}
        description={role.description ?? undefined}
        status={protectedRole ? <StatusBadge tone="gold">Protected</StatusBadge> : role.isSystem ? <StatusBadge tone="neutral">Built-in</StatusBadge> : <StatusBadge tone="info">Custom</StatusBadge>}
        meta={
          <span className="text-sm text-muted-foreground">
            Key <code>{role.key}</code> · {role.memberCount} {role.scope === "platform" ? "staff member" : "organisation member"}
            {role.memberCount === 1 ? "" : "s"}
          </span>
        }
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, SETTINGS_CRUMB, { label: "Roles", href: scopeHref }, { label: role.name }]}
        actions={
          canDelete ? (
            <ActionButton
              action={deleteRoleAction.bind(null, { id: role.id, scope: role.scope })}
              variant="outline"
              icon={<Trash2 aria-hidden className="size-4" />}
              confirm={{ title: `Delete the ${role.name} role?`, description: role.memberCount ? "This role is still assigned and cannot be deleted until everyone is moved to another role." : "This cannot be undone.", confirmLabel: "Delete role", destructive: true }}
              testId="delete-role"
            >
              Delete role
            </ActionButton>
          ) : null
        }
      />

      {protectedRole ? (
        <Callout tone="info" title="Super Admin is protected">
          Super Admin always holds every platform permission, including new ones added in future releases. It cannot be edited or deleted. Grant it sparingly from the user account page.
        </Callout>
      ) : role.scope !== "platform" ? (
        <Callout tone="neutral" title="Organisation role template">
          Changes apply to every member holding this role in every {SCOPE_LABELS[role.scope].replace(" members", "").toLowerCase()} organisation.
        </Callout>
      ) : !canEdit ? (
        <p className="text-sm text-muted-foreground">You can view this role. Editing needs the “Edit roles and permissions” permission.</p>
      ) : null}

      <PermissionEditor
        action={updateRoleAction}
        roleId={role.id}
        name={role.name}
        description={role.description}
        permissions={permissions}
        selected={protectedRole ? permissions.map((p) => p.key) : role.permissions}
        readOnly={readOnly}
      />
    </div>
  );
}
