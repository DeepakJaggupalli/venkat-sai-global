"use client";

import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteTalentListAction, removeCandidateFromListAction, updateTalentListAction, updateTalentListItemAction } from "@/modules/recruitment/actions";

import { useRunAction } from "./use-run-action";

/** Archive / restore and delete for a talent list. */
export function ListManageButtons({ listId, archived, canDelete }: { listId: string; archived: boolean; canDelete: boolean }) {
  const router = useRouter();
  const archive = useRunAction(updateTalentListAction, { toastErrors: true, onSuccess: () => router.refresh() });
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={archive.pending} onClick={() => void archive.run({ portal: "employer", listId, archived: !archived })}>
        {archived ? <ArchiveRestore aria-hidden className="size-4" /> : <Archive aria-hidden className="size-4" />}
        {archived ? "Restore list" : "Archive list"}
      </Button>
      {canDelete ? (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline" size="sm">
              <Trash2 aria-hidden className="size-4" />
              Delete
            </Button>
          }
          title="Delete this list?"
          description="The list and its notes are removed. Candidates and their applications are not affected."
          confirmLabel="Delete list"
          variant="destructive"
          onConfirm={async () => {
            const result = await deleteTalentListAction({ portal: "employer", listId });
            if (result.ok) router.push("/employer/lists");
            return result;
          }}
        />
      ) : null}
    </div>
  );
}

/** Edit the internal note / status of one list member, or remove them. */
export function ListItemActions({ listId, candidateId, name, note, stage }: { listId: string; candidateId: string; name: string; note: string | null; stage: string | null }) {
  const [open, setOpen] = useState(false);
  const save = useRunAction(updateTalentListItemAction, { onSuccess: () => setOpen(false) });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void save.run({ portal: "employer", listId, candidateId, note: String(form.get("note") ?? "").trim() || null, stage: String(form.get("stage") ?? "").trim() || null });
  };

  return (
    <div className="relative z-10 flex flex-wrap gap-2">
      <ResponsiveDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) save.reset();
        }}
        trigger={
          <Button type="button" variant="ghost" size="sm">
            <Pencil aria-hidden className="size-4" />
            Note<span className="sr-only"> for {name}</span>
          </Button>
        }
        title={`Note for ${name}`}
        description="Internal to your organisation. Never shown to the candidate."
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormErrorAlert state={save.state} />
          <FormField label="Status on this list" name="stage" optional state={save.state} hint="For example: To call, Interview booked, On hold.">
            <Input defaultValue={stage ?? undefined} maxLength={80} />
          </FormField>
          <FormField label="Note" name="note" optional state={save.state}>
            <Textarea rows={4} maxLength={2000} defaultValue={note ?? undefined} />
          </FormField>
          <div className="flex justify-end">
            <SubmitButton pending={save.pending} pendingLabel="Saving…">
              Save
            </SubmitButton>
          </div>
        </form>
      </ResponsiveDialog>
      <ConfirmDialog
        trigger={
          <Button type="button" variant="ghost" size="sm">
            <Trash2 aria-hidden className="size-4" />
            Remove<span className="sr-only"> {name}</span>
          </Button>
        }
        title={`Remove ${name} from this list?`}
        description="Their profile and any applications stay as they are."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => removeCandidateFromListAction({ portal: "employer", listId, candidateId })}
      />
    </div>
  );
}
