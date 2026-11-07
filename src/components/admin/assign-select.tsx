"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { SearchableSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/actions";

type AssignAction = (input: { id: string; assigneeUserId: string | null }) => Promise<ActionResult<unknown>>;

/**
 * Staff assignee picker that saves on change (approvals, leads, enquiries, requirements, tasks).
 * Pass the module's assign Server Action unbound; it re-authorises on the server.
 */
export function AssignSelect({
  action,
  recordId,
  options,
  current,
  label = "Assigned to",
  disabled,
}: {
  action: AssignAction;
  recordId: string;
  options: SelectOption[];
  current: string | null;
  label?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <SearchableSelect
        id={id}
        options={options}
        value={value}
        allowClear
        clearLabel="Unassigned"
        placeholder="Unassigned"
        disabled={disabled || pending}
        onValueChange={(next) => {
          const previous = value;
          setValue(next);
          start(async () => {
            const result = await action({ id: recordId, assigneeUserId: next || null });
            if (result.ok) {
              toast.success(result.message ?? "Saved");
              router.refresh();
            } else {
              setValue(previous);
              toast.error(result.error);
            }
          });
        }}
      />
      <p className="sr-only" aria-live="polite">
        {pending ? "Saving assignment" : ""}
      </p>
    </div>
  );
}
