"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";

import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult, ActionState } from "@/lib/actions";

export type PermissionItem = { key: string; label: string; group: string; sensitive: boolean; grantable: boolean };

/**
 * Grouped permission checklist for one role. Sensitive permissions carry a visible marker (icon + text,
 * not colour alone). Permissions the editor cannot grant are disabled unless the role already holds them.
 */
export function PermissionEditor({
  action,
  roleId,
  name,
  description,
  permissions,
  selected,
  readOnly,
}: {
  action: (prev: ActionState<undefined>, formData: FormData) => Promise<ActionResult<undefined>>;
  roleId: string;
  name: string;
  description: string | null;
  permissions: PermissionItem[];
  selected: string[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, null);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(selected));
  useActionToast(state, { onSuccess: () => router.refresh() });

  const groups = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    for (const p of permissions) map.set(p.group, [...(map.get(p.group) ?? []), p]);
    return [...map.entries()];
  }, [permissions]);

  const toggle = (key: string, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const original = new Set(selected);
  const canChange = (p: PermissionItem) => !readOnly && (p.grantable || original.has(p.key));

  return (
    <form action={formAction} className="space-y-6" data-testid="role-form">
      <input type="hidden" name="id" value={roleId} />
      <FormErrorAlert state={state} fieldLabels={{ name: "Role name", permissions: "Permissions" }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Role name" name="name" required state={state}>
          <Input defaultValue={name} disabled={readOnly} maxLength={80} />
        </FormField>
        <FormField label="Description" name="description" optional state={state}>
          <Textarea defaultValue={description ?? ""} disabled={readOnly} rows={2} maxLength={300} />
        </FormField>
      </div>

      <fieldset className="space-y-4" aria-describedby="perm-count">
        <legend className="font-heading text-base font-semibold text-foreground">Permissions</legend>
        <p id="perm-count" className="text-sm text-muted-foreground" aria-live="polite">
          {chosen.size} of {permissions.length} selected
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map(([group, items]) => {
            const changeable = items.filter(canChange);
            const allOn = changeable.length > 0 && changeable.every((p) => chosen.has(p.key));
            return (
              <div key={group} className="rounded-xl border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="font-heading text-sm font-semibold text-foreground">{group}</h3>
                  {changeable.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-teal-strong underline-offset-4 hover:underline"
                      onClick={() => changeable.forEach((p) => toggle(p.key, !allOn))}
                    >
                      {allOn ? "Clear group" : "Select group"}
                      <span className="sr-only"> {group}</span>
                    </button>
                  ) : null}
                </div>
                <ul className="space-y-2.5">
                  {items.map((p) => {
                    const id = `perm-${p.key}`;
                    const disabled = !canChange(p);
                    return (
                      <li key={p.key} className="flex items-start gap-2.5">
                        <Checkbox id={id} name="permissions[]" value={p.key} checked={chosen.has(p.key)} disabled={disabled} onCheckedChange={(v) => toggle(p.key, v === true)} />
                        {disabled && chosen.has(p.key) ? <input type="hidden" name="permissions[]" value={p.key} /> : null}
                        <div className="grid gap-0.5">
                          <Label htmlFor={id} className="font-normal leading-snug">
                            {p.label}
                          </Label>
                          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <code>{p.key}</code>
                            {p.sensitive ? (
                              <span className="inline-flex items-center gap-0.5 font-medium text-warning-strong">
                                <ShieldAlert aria-hidden className="size-3" /> Sensitive
                              </span>
                            ) : null}
                            {!p.grantable && !readOnly ? <span>(you do not hold this)</span> : null}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </fieldset>
      {!readOnly ? <SubmitButton pendingLabel="Saving…">Save role</SubmitButton> : null}
    </form>
  );
}
