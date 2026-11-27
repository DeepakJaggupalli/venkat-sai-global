"use client";

import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions";

import { requestDocumentAction } from "./actions";

export type RequestChoice = { value: string; label: string; kinds: { value: string; label: string }[] };

/** "Ask for a document": choose the course or internship, then the document, plus an optional note. */
export function RequestDocumentForm({
  choices,
  labels,
}: {
  choices: RequestChoice[];
  labels: { forLabel: string; kind: string; note: string; submit: string; done: string };
}) {
  const [state, action, pending] = useActionState(requestDocumentAction, null as ActionState<undefined>);
  const [option, setOption] = useState(choices[0]?.value ?? "");
  const kinds = useMemo(() => choices.find((c) => c.value === option)?.kinds ?? [], [choices, option]);
  const field = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal";

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" data-testid="request-document-form">
      <label className="grid gap-1.5 text-sm font-medium">
        {labels.forLabel}
        <select name="option" value={option} onChange={(e) => setOption(e.target.value)} className={field}>
          {choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        {labels.kind}
        <select name="kind" key={option} defaultValue={kinds[0]?.value} className={field}>
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
        {labels.note}
        <textarea name="note" rows={2} maxLength={500} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal" />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending || !kinds.length}>
          {labels.submit}
        </Button>
        <p role="status" aria-live="polite" className={state && !state.ok ? "text-sm text-danger-strong" : "text-sm text-success-strong"}>
          {state ? (state.ok ? labels.done : state.error) : null}
        </p>
      </div>
    </form>
  );
}
