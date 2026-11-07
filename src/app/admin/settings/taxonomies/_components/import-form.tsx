"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";

import { Callout } from "@/components/shared/callout";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import type { ActionResult, ActionState } from "@/lib/actions";

type Summary = { created: number; updated: number; failed: number; errors: { row: number; message: string }[]; missingHeaders: string[] };

/** CSV import for one taxonomy list, with a per-row error report. */
export function ImportForm({ kind, action }: { kind: string; action: (prev: ActionState<Summary>, formData: FormData) => Promise<ActionResult<Summary>> }) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, null);
  useActionToast(state, { onSuccess: () => router.refresh() });
  const summary = state?.ok ? state.data : undefined;

  return (
    <form action={formAction} className="space-y-4" data-testid="taxonomy-import-form">
      <input type="hidden" name="kind" value={kind} />
      <FormErrorAlert state={state} />
      <FormField label="CSV file" name="file" required state={state} hint="Use the column headers from an export. Rows are matched to existing records by code, slug or key; others are added. 1 MB maximum.">
        <Input type="file" accept=".csv,text/csv" />
      </FormField>
      <SubmitButton pendingLabel="Importing…">Import</SubmitButton>
      {summary ? (
        <div aria-live="polite">
          <Callout tone={summary.failed ? "warning" : "success"} title={`${summary.created} added, ${summary.updated} updated, ${summary.failed} skipped`}>
            {summary.errors.length ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                {summary.errors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            ) : (
              "Every row was saved."
            )}
          </Callout>
        </div>
      ) : null}
    </form>
  );
}
