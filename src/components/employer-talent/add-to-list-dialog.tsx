"use client";

import { ListPlus } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition, type FormEvent, type ReactElement } from "react";
import { toast } from "sonner";

import { FormErrorAlert } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/actions";
import { addCandidatesToListAction, createTalentListAction } from "@/modules/recruitment/actions";

export type ListChoice = { id: string; name: string; itemCount: number };

/**
 * Adds one or more candidates to an existing talent list or to a new one. The recruitment module
 * only adds candidates the organisation may see (others are reported back).
 */
export function AddToListDialog({ candidateIds, lists, trigger, onDone }: { candidateIds: string[]; lists: ListChoice[]; trigger?: ReactElement; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string>(lists[0]?.id ?? "new");
  const [state, setState] = useState<ActionState<unknown>>(null);
  const [pending, startTransition] = useTransition();
  const ids = { name: useId(), note: useId(), shared: useId() };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const note = String(form.get("note") ?? "").trim() || null;
    startTransition(async () => {
      let listId = choice;
      if (choice === "new") {
        const created = await createTalentListAction({
          portal: "employer",
          name: String(form.get("name") ?? ""),
          kind: "shortlist",
          isShared: form.get("isShared") === "true",
        });
        if (!created.ok || !created.data) {
          setState(created.ok ? { ok: false, error: "The list could not be created." } : created);
          return;
        }
        listId = created.data.id;
      }
      const result = await addCandidatesToListAction({ portal: "employer", listId, candidateIds, note });
      setState(result);
      if (result.ok) {
        const skipped = (result.data ?? []).filter((r) => !r.ok).length;
        toast.success(result.message ?? "Added to the list.", skipped ? { description: `${skipped} could not be added (no longer available or already on the list).` } : undefined);
        setOpen(false);
        setState(null);
        onDone?.();
      }
    });
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setState(null);
      }}
      trigger={
        trigger ?? (
          <Button type="button" variant="outline" size="sm">
            <ListPlus aria-hidden className="size-4" />
            Add to list
          </Button>
        )
      }
      title={candidateIds.length > 1 ? `Add ${candidateIds.length} candidates to a list` : "Add to a talent list"}
      description="Talent lists keep candidates together for a role or project. Notes on lists are visible only to your organisation."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormErrorAlert state={state} />
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">List</legend>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
            {lists.map((l) => (
              <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <input type="radio" name="listId" value={l.id} checked={choice === l.id} onChange={() => setChoice(l.id)} className="size-4" />
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <span className="text-xs text-muted-foreground">{l.itemCount} {l.itemCount === 1 ? "candidate" : "candidates"}</span>
              </label>
            ))}
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              <input type="radio" name="listId" value="new" checked={choice === "new"} onChange={() => setChoice("new")} className="size-4" />
              Create a new list
            </label>
          </div>
        </fieldset>
        {choice === "new" ? (
          <div className="space-y-3 rounded-lg bg-surface-subtle p-3">
            <div className="space-y-1.5">
              <Label htmlFor={ids.name}>List name</Label>
              <Input id={ids.name} name="name" required maxLength={120} aria-invalid={Boolean(state && !state.ok && state.fieldErrors?.name)} />
              {state && !state.ok && state.fieldErrors?.name ? <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p> : null}
            </div>
            <label htmlFor={ids.shared} className="flex items-center gap-2 text-sm">
              <input id={ids.shared} type="checkbox" name="isShared" value="true" className="size-4" />
              Share with my team
            </label>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor={ids.note}>
            Note <span className="font-normal text-muted-foreground">(optional, internal)</span>
          </Label>
          <Textarea id={ids.note} name="note" rows={2} maxLength={2000} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/employer/lists" className="text-sm text-teal-strong underline-offset-4 hover:underline">
            Manage lists
          </Link>
          <Button type="submit" disabled={pending} aria-disabled={pending}>
            {pending ? "Adding…" : "Add to list"}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
