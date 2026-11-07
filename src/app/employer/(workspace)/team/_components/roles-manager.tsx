"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useEmployerForm } from "@/components/employer/use-form-action";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { deleteTeamRoleAction, saveTeamRoleAction } from "../actions";

export type RoleItem = { id: string; key: string; name: string; description: string | null; permissions: string[]; isTemplate: boolean; memberCount: number };
export type PermissionGroup = { group: string; items: { key: string; label: string; sensitive: boolean }[] };

function RoleForm({ role, groups, grantable, onDone }: { role?: RoleItem; groups: PermissionGroup[]; grantable: string[]; onDone: () => void }) {
  const { state, pending, onSubmit } = useEmployerForm(saveTeamRoleAction);
  useActionToast(state);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const permissionError = state?.ok === false ? state.fieldErrors?.permissions?.[0] : undefined;
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {role ? <input type="hidden" name="roleId" value={role.id} /> : null}
      <FormErrorAlert state={state} fieldLabels={{ name: "Role name", description: "Description", permissions: "Permissions" }} />
      <FormField label="Role name" name="name" required state={state}>
        <Input defaultValue={role?.name} maxLength={80} />
      </FormField>
      <FormField label="Description" name="description" optional state={state}>
        <Input defaultValue={role?.description ?? undefined} maxLength={300} />
      </FormField>
      <fieldset className="space-y-4" aria-describedby={permissionError ? "role-permissions-error" : "role-permissions-hint"}>
        <legend className="text-sm font-semibold text-foreground">Permissions</legend>
        <p id="role-permissions-hint" className="text-sm text-muted-foreground">
          You can only include permissions your own role has.
        </p>
        {permissionError ? (
          <p id="role-permissions-error" className="text-sm font-medium text-danger-strong">
            {permissionError}
          </p>
        ) : null}
        {groups.map((g) => (
          <div key={g.group} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.group}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {g.items.map((p) => {
                const id = `perm-${role?.id ?? "new"}-${p.key}`;
                const allowed = grantable.includes(p.key);
                return (
                  <li key={p.key} className="flex items-start gap-2">
                    <input
                      id={id}
                      type="checkbox"
                      name="permissions[]"
                      value={p.key}
                      defaultChecked={role?.permissions.includes(p.key)}
                      disabled={!allowed}
                      className="mt-1 size-4 shrink-0 accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                    />
                    <label htmlFor={id} className="text-sm leading-6 text-foreground">
                      {p.label}
                      {p.sensitive ? <span className="text-muted-foreground"> (sensitive)</span> : null}
                      {!allowed ? <span className="text-muted-foreground"> (not in your role)</span> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </fieldset>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {role ? "Save role" : "Create role"}
        </SubmitButton>
      </div>
    </form>
  );
}

function RoleDialog({ role, groups, grantable, trigger }: { role?: RoleItem; groups: PermissionGroup[]; grantable: string[]; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen} trigger={trigger} title={role ? `Edit ${role.name}` : "Create a custom role"} description="Custom roles use the Employer Portal permission catalogue." size="lg">
      <RoleForm role={role} groups={groups} grantable={grantable} onDone={close} />
    </ResponsiveDialog>
  );
}

export function RolesManager({ roles, groups, grantable, labels }: { roles: RoleItem[]; groups: PermissionGroup[]; grantable: string[]; labels: Record<string, string> }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <RoleDialog
          groups={groups}
          grantable={grantable}
          trigger={
            <Button variant="outline" size="sm">
              <Plus aria-hidden="true" /> Custom role
            </Button>
          }
        />
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {roles.map((r) => (
          <li key={r.id} className="space-y-2 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{r.name}</p>
                  <StatusBadge tone={r.isTemplate ? "neutral" : "info"} size="sm">
                    {r.isTemplate ? "Standard" : "Custom"}
                  </StatusBadge>
                  <span className="text-sm text-muted-foreground">
                    {r.memberCount} member{r.memberCount === 1 ? "" : "s"}
                  </span>
                </div>
                {r.description ? <p className="text-sm text-muted-foreground">{r.description}</p> : null}
              </div>
              {!r.isTemplate ? (
                <div className="flex gap-2">
                  <RoleDialog
                    role={r}
                    groups={groups}
                    grantable={grantable}
                    trigger={
                      <Button variant="outline" size="sm" aria-label={`Edit ${r.name}`}>
                        Edit
                      </Button>
                    }
                  />
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm" disabled={r.memberCount > 0} aria-label={`Delete ${r.name}`}>
                        Delete
                      </Button>
                    }
                    title={`Delete the ${r.name} role?`}
                    description="This cannot be undone."
                    confirmLabel="Delete role"
                    variant="destructive"
                    onConfirm={() => deleteTeamRoleAction({ roleId: r.id })}
                  />
                </div>
              ) : null}
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground underline-offset-4 hover:underline">
                {r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {r.permissions.map((p) => (
                  <li key={p}>{labels[p] ?? p}</li>
                ))}
              </ul>
            </details>
            {!r.isTemplate && r.memberCount > 0 ? <p className="text-xs text-muted-foreground">Move its members to another role before deleting it.</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
