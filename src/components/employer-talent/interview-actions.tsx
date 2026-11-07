"use client";

import { ClipboardCheck, MessageSquareText, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelInterviewAction, completeInterviewAction, submitInterviewFeedbackAction } from "@/modules/recruitment/actions";
import { RECOMMENDATION_LABELS, RECOMMENDATION_OPTIONS } from "@/modules/recruitment/constants";

import { INTERVIEW_OUTCOME_LABELS } from "./labels";
import { intOf, textOf, useRunAction } from "./use-run-action";

type Recommendation = (typeof RECOMMENDATION_OPTIONS)[number];
type Outcome = "pending" | "passed" | "failed" | "on_hold";

const OUTCOMES: SelectOption[] = (["passed", "failed", "on_hold", "pending"] as const).map((o) => ({ value: o, label: INTERVIEW_OUTCOME_LABELS[o] ?? o }));
const RATINGS: SelectOption[] = [1, 2, 3, 4, 5].map((r) => ({ value: String(r), label: `${r} of 5` }));

export function CancelInterviewButton({ interviewId }: { interviewId: string }) {
  const id = useId();
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          Cancel
        </Button>
      }
      title="Cancel this interview?"
      description="The candidate and panel are told it is cancelled."
      confirmLabel="Cancel interview"
      cancelLabel="Keep interview"
      variant="destructive"
      onSuccess={() => router.refresh()}
      onConfirm={(form) => cancelInterviewAction({ portal: "employer", interviewId, reason: String(form.get("reason") ?? "") })}
    >
      <div className="space-y-1.5">
        <Label htmlFor={id}>Reason (shared with the candidate)</Label>
        <Textarea id={id} name="reason" rows={3} maxLength={1000} required />
      </div>
    </ConfirmDialog>
  );
}

export function CompleteInterviewDialog({ interviewId }: { interviewId: string }) {
  const [open, setOpen] = useState(false);
  const complete = useRunAction(completeInterviewAction, { onSuccess: () => setOpen(false) });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void complete.run({
      portal: "employer",
      interviewId,
      status: form.get("status") === "no_show" ? "no_show" : "completed",
      outcome: (textOf(form, "outcome") ?? "pending") as Outcome,
    });
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) complete.reset();
      }}
      trigger={
        <Button type="button" variant="outline" size="sm">
          <ClipboardCheck aria-hidden className="size-4" />
          Record outcome
        </Button>
      }
      title="Record the interview outcome"
      description="Outcomes are internal. The candidate is told about decisions through the application status."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormErrorAlert state={complete.state} />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Did the interview take place?</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="status" value="completed" defaultChecked className="size-4" /> Yes, it took place
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="status" value="no_show" className="size-4" /> The candidate did not attend
          </label>
        </fieldset>
        <FormField label="Outcome" name="outcome" state={complete.state}>
          <SimpleSelect options={OUTCOMES} defaultValue="pending" />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton pending={complete.pending} pendingLabel="Saving…">
            Save outcome
          </SubmitButton>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

type ScoreRow = { key: number; criterion: string; score: string; maxScore: string };

export type FeedbackDefaults = {
  rating: number | null;
  recommendation: string;
  strengths: string | null;
  concerns: string | null;
  notes: string | null;
  scorecard: { criterion: string; score: number; maxScore: number }[];
};

/** Interview feedback with a recommendation (one per author; saving again updates it). Internal only. */
export function FeedbackDialog({ interviewId, existing }: { interviewId: string; existing?: FeedbackDefaults | null }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ScoreRow[]>(() => (existing?.scorecard ?? []).map((s, i) => ({ key: i + 1, criterion: s.criterion, score: String(s.score), maxScore: String(s.maxScore) })));
  const save = useRunAction(submitInterviewFeedbackAction, { onSuccess: () => setOpen(false) });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void save.run({
      portal: "employer",
      interviewId,
      recommendation: (textOf(form, "recommendation") ?? "") as Recommendation,
      rating: intOf(form, "rating") ?? null,
      strengths: textOf(form, "strengths") ?? null,
      concerns: textOf(form, "concerns") ?? null,
      notes: textOf(form, "notes") ?? null,
      scorecard: rows
        .filter((r) => r.criterion.trim())
        .map((r) => ({ criterion: r.criterion.trim(), score: Number(r.score) || 0, maxScore: Number(r.maxScore) || 5 })),
    });
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) save.reset();
      }}
      size="lg"
      trigger={
        <Button type="button" variant="outline" size="sm">
          <MessageSquareText aria-hidden className="size-4" />
          {existing ? "Edit feedback" : "Add feedback"}
        </Button>
      }
      title="Interview feedback"
      description="Visible to your organisation and the Venkat Sai team. Never shown to the candidate."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormErrorAlert state={save.state} />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Recommendation <span aria-hidden className="text-destructive">*</span>
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RECOMMENDATION_OPTIONS.map((r) => (
              <label key={r} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-navy has-[:checked]:bg-surface-subtle">
                <input type="radio" name="recommendation" value={r} defaultChecked={existing?.recommendation === r} required className="size-4" />
                {RECOMMENDATION_LABELS[r]}
              </label>
            ))}
          </div>
          {save.state && !save.state.ok && save.state.fieldErrors?.recommendation ? <p className="text-sm text-destructive">Choose a recommendation.</p> : null}
        </fieldset>
        <FormField label="Overall rating" name="rating" optional state={save.state}>
          <SimpleSelect options={RATINGS} defaultValue={existing?.rating ? String(existing.rating) : undefined} placeholder="No rating" allowClear clearLabel="No rating" />
        </FormField>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Scorecard (optional)</legend>
          {rows.map((r, i) => (
            <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_auto] items-end gap-2">
              <Input aria-label={`Criterion ${i + 1}`} placeholder="e.g. Weld quality" value={r.criterion} maxLength={120} onChange={(e) => setRows((list) => list.map((x) => (x.key === r.key ? { ...x, criterion: e.target.value } : x)))} />
              <Input aria-label={`Score for criterion ${i + 1}`} type="number" min={0} max={100} value={r.score} onChange={(e) => setRows((list) => list.map((x) => (x.key === r.key ? { ...x, score: e.target.value } : x)))} />
              <Input aria-label={`Out of, criterion ${i + 1}`} type="number" min={1} max={100} value={r.maxScore} onChange={(e) => setRows((list) => list.map((x) => (x.key === r.key ? { ...x, maxScore: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove criterion ${i + 1}`} onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}>
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </div>
          ))}
          {rows.length < 30 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setRows((list) => [...list, { key: Date.now(), criterion: "", score: "", maxScore: "5" }])}>
              <Plus aria-hidden className="size-4" />
              Add criterion
            </Button>
          ) : null}
        </fieldset>
        <FormField label="Strengths" name="strengths" optional state={save.state}>
          <Textarea rows={3} maxLength={4000} defaultValue={existing?.strengths ?? undefined} />
        </FormField>
        <FormField label="Concerns" name="concerns" optional state={save.state}>
          <Textarea rows={3} maxLength={4000} defaultValue={existing?.concerns ?? undefined} />
        </FormField>
        <FormField label="Other notes" name="notes" optional state={save.state}>
          <Textarea rows={2} maxLength={4000} defaultValue={existing?.notes ?? undefined} />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton pending={save.pending} pendingLabel="Saving…">
            Save feedback
          </SubmitButton>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
