"use client";

import { Pin, Star, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { RelativeTime } from "@/components/shared/relative-time";
import { SimpleSelect } from "@/components/shared/selects";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addApplicationNoteAction, deleteApplicationNoteAction, transitionApplicationAction, updateApplicationNoteAction, updateApplicationReviewAction } from "@/modules/recruitment/actions";
import type { ApplicationNoteView } from "@/modules/recruitment/types";

import { RejectDialog } from "./reject-dialog";
import { textOf, useRunAction } from "./use-run-action";

type Stage = { key: string; name: string; category: string };

/** "Move to" a specific stage (the employer's allowed targets) plus Reject with reasons. */
export function StageMoveForm({ applicationId, candidateName, allowed }: { applicationId: string; candidateName: string; allowed: Stage[] }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const move = useRunAction(transitionApplicationAction);
  const rejectStage = allowed.find((s) => s.category === "rejected");
  const targets = allowed.filter((s) => s.category !== "rejected");

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const key = textOf(form, "toStageKey");
    if (!key) return;
    void move.run({ portal: "employer", applicationId, toStageKey: key, internalNote: textOf(form, "internalNote") ?? null, candidateVisibleNote: textOf(form, "candidateVisibleNote") ?? null });
  };

  if (!allowed.length) return <p className="text-sm text-muted-foreground">No moves are available from this stage. Venkat Sai manages the next steps.</p>;

  return (
    <div className="space-y-3">
      {targets.length ? (
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <FormErrorAlert state={move.state} />
          <FormField label="Move to stage" name="toStageKey" required state={move.state}>
            <SimpleSelect options={targets.map((s) => ({ value: s.key, label: s.name }))} placeholder="Choose a stage" />
          </FormField>
          <FormField label="Internal note" name="internalNote" optional state={move.state} hint="Your team and Venkat Sai only.">
            <Textarea rows={2} maxLength={5000} />
          </FormField>
          <FormField label="Message to the candidate" name="candidateVisibleNote" optional state={move.state} hint="Shown with the status update. Leave empty for the standard update.">
            <Textarea rows={2} maxLength={2000} />
          </FormField>
          <SubmitButton pending={move.pending} pendingLabel="Moving…" size="sm">
            Move
          </SubmitButton>
        </form>
      ) : null}
      {rejectStage ? (
        <>
          <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => setRejectOpen(true)}>
            Reject
          </Button>
          <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} applicationId={applicationId} candidateName={candidateName} rejectStageKey={rejectStage.key} />
        </>
      ) : null}
    </div>
  );
}

/** Star rating and shortlist flag (internal review aids). */
export function ReviewControls({ applicationId, rating, isShortlisted, canManage }: { applicationId: string; rating: number | null; isShortlisted: boolean; canManage: boolean }) {
  const review = useRunAction(updateApplicationReviewAction, { toastErrors: true });
  const groupId = useId();
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div role="group" aria-labelledby={groupId} className="flex items-center gap-1">
        <span id={groupId} className="mr-1 text-sm text-muted-foreground">
          Rating
        </span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={!canManage || review.pending}
            aria-pressed={rating !== null && n <= rating}
            aria-label={`${n} of 5${rating === n ? " (selected, select again to clear)" : ""}`}
            onClick={() => void review.run({ portal: "employer", applicationId, rating: rating === n ? null : n })}
            className="rounded p-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed"
          >
            <Star aria-hidden className={rating !== null && n <= rating ? "size-5 fill-gold text-gold" : "size-5 text-muted-foreground"} />
          </button>
        ))}
      </div>
      <Button type="button" size="sm" variant={isShortlisted ? "secondary" : "outline"} disabled={!canManage || review.pending} aria-pressed={isShortlisted} onClick={() => void review.run({ portal: "employer", applicationId, isShortlisted: !isShortlisted })}>
        {isShortlisted ? "Shortlisted" : "Mark as shortlisted"}
      </Button>
    </div>
  );
}

const VISIBILITY_TEXT: Record<string, string> = {
  staff_only: "Venkat Sai team only",
  staff_and_employer: "Your team and Venkat Sai",
  staff_and_partner: "Venkat Sai and the sourcing partner",
};

/** Internal notes on the application. Employer notes are visible to the employer's team and Venkat Sai — never to candidates or partners. */
export function NotesPanel({ applicationId, notes, canWrite }: { applicationId: string; notes: ApplicationNoteView[]; canWrite: boolean }) {
  const [formKey, setFormKey] = useState(0);
  const add = useRunAction(addApplicationNoteAction, { onSuccess: () => setFormKey((k) => k + 1) });
  const pin = useRunAction(updateApplicationNoteAction, { toastErrors: true });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void add.run({ portal: "employer", applicationId, body: String(form.get("body") ?? ""), visibility: "staff_and_employer" });
  };

  return (
    <div className="space-y-4">
      {canWrite ? (
        <form key={formKey} onSubmit={onSubmit} className="space-y-2" noValidate>
          <FormErrorAlert state={add.state} />
          <FormField label="Add a note" name="body" required state={add.state} hint="Visible to your team and Venkat Sai. Never shown to the candidate or recruitment partners.">
            <Textarea rows={3} maxLength={5000} />
          </FormField>
          <SubmitButton pending={add.pending} pendingLabel="Saving…" size="sm">
            Add note
          </SubmitButton>
        </form>
      ) : null}
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {[...notes]
            .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((n) => (
              <li key={n.id} className="space-y-1.5 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{n.authorParty === "venkat_sai" ? "Venkat Sai" : (n.authorName ?? "Team member")}</span>
                  <RelativeTime value={n.createdAt} />
                  <StatusBadge tone="neutral" size="sm" srPrefix="Visible to">
                    {VISIBILITY_TEXT[n.visibility] ?? n.visibility}
                  </StatusBadge>
                  {n.isPinned ? (
                    <StatusBadge tone="gold" size="sm">
                      Pinned
                    </StatusBadge>
                  ) : null}
                </div>
                <p className="text-sm whitespace-pre-line">{n.body}</p>
                {n.canEdit ? (
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" disabled={pin.pending} onClick={() => void pin.run({ portal: "employer", noteId: n.id, isPinned: !n.isPinned })}>
                      <Pin aria-hidden className="size-4" />
                      {n.isPinned ? "Unpin" : "Pin"}
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button type="button" variant="ghost" size="sm">
                          <Trash2 aria-hidden className="size-4" />
                          Delete
                        </Button>
                      }
                      title="Delete this note?"
                      confirmLabel="Delete note"
                      variant="destructive"
                      onConfirm={() => deleteApplicationNoteAction({ portal: "employer", noteId: n.id })}
                    />
                  </div>
                ) : null}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
