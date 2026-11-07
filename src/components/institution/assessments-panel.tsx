"use client";

import { Calculator, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SimpleSelect } from "@/components/shared/selects";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  computeBatchResultsAction,
  createCourseAssessmentAction,
  deleteCourseAssessmentAction,
  publishAssessmentResultsAction,
  recordAssessmentScoresAction,
  setEnrolmentResultAction,
  updateCourseAssessmentAction,
} from "@/modules/training/actions";

import { ASSESSMENT_TYPE_LABELS, isoToLocalInput, localInputToIso, pct, resultStatus, toOptions } from "./labels";
import { eitherFormAction, useInstitutionForm } from "./use-form-action";

export type AssessmentItem = {
  id: string;
  title: string;
  type: string;
  maxScore: number;
  passScore: number | null;
  weightPercent: number | null;
  scheduledAt: string | null;
  published: boolean;
};
export type ScoreItem = { assessmentId: string; enrolmentId: string; score: number | null; isAbsent: boolean; remarks: string | null };
export type GradedLearner = { enrolmentId: string; name: string; resultStatus: string; finalScore: number | null };

function AssessmentForm({ batchId, assessment, onDone }: { batchId: string; assessment?: AssessmentItem; onDone: () => void }) {
  const router = useRouter();
  const { state, pending, onSubmit } = useInstitutionForm(eitherFormAction(updateCourseAssessmentAction, createCourseAssessmentAction, Boolean(assessment)));
  const [when, setWhen] = useState(isoToLocalInput(assessment?.scheduledAt));
  useActionToast(state);
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {assessment ? <input type="hidden" name="assessmentId" value={assessment.id} /> : <input type="hidden" name="batchId" value={batchId} />}
      <input type="hidden" name="scheduledAt" value={localInputToIso(when)} />
      <FormErrorAlert state={state} fieldLabels={{ title: "Title", type: "Type", maxScore: "Maximum score", passScore: "Pass mark", weightPercent: "Weight", scheduledAt: "Date and time" }} />
      <FormField label="Title" name="title" required state={state}>
        <Input maxLength={200} defaultValue={assessment?.title} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Type" name="type" required state={state}>
          <SimpleSelect options={toOptions(ASSESSMENT_TYPE_LABELS)} defaultValue={assessment?.type ?? "practical"} />
        </FormField>
        <FormField label="Date and time" name="scheduledAtLocal" optional state={state} errors={state?.ok === false ? state.fieldErrors?.scheduledAt : undefined} hint="Your local time.">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </FormField>
        <FormField label="Maximum score" name="maxScore" required state={state}>
          <Input type="number" inputMode="decimal" min={0.01} step="0.01" defaultValue={assessment?.maxScore ?? 100} />
        </FormField>
        <FormField label="Pass mark" name="passScore" optional state={state} hint="Leave empty if this assessment has no pass mark.">
          <Input type="number" inputMode="decimal" min={0} step="0.01" defaultValue={assessment?.passScore ?? undefined} />
        </FormField>
        <FormField label="Weight (%)" name="weightPercent" optional state={state} hint="Share of the final score. Assessments without a weight share the remainder.">
          <Input type="number" inputMode="decimal" min={0} max={100} step="0.01" defaultValue={assessment?.weightPercent ?? undefined} />
        </FormField>
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {assessment ? "Save assessment" : "Add assessment"}
        </SubmitButton>
      </div>
    </form>
  );
}

type Draft = { score: string; isAbsent: boolean; remarks: string };

/** Score sheet for one assessment: number inputs per learner, absent toggle, learner-visible remarks. */
function ScoreSheet({ assessment, learners, scores, onDone }: { assessment: AssessmentItem; learners: GradedLearner[]; scores: ScoreItem[]; onDone: () => void }) {
  const router = useRouter();
  const [saving, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      learners.map((l) => {
        const s = scores.find((x) => x.enrolmentId === l.enrolmentId);
        return [l.enrolmentId, { score: s?.score === null || s?.score === undefined ? "" : String(s.score), isAbsent: s?.isAbsent ?? false, remarks: s?.remarks ?? "" }];
      }),
    ),
  );
  const set = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id]!, ...patch } }));

  function save() {
    const list = Object.entries(drafts)
      .filter(([, d]) => d.isAbsent || d.score !== "" || d.remarks)
      .map(([enrolmentId, d]) => ({ enrolmentId, score: d.isAbsent || d.score === "" ? null : Number(d.score), isAbsent: d.isAbsent, remarks: d.remarks || undefined }));
    const invalid = list.find((s) => s.score !== null && (Number.isNaN(s.score) || s.score < 0 || s.score > assessment.maxScore));
    if (invalid) {
      setError(`Scores must be between 0 and ${assessment.maxScore}.`);
      return;
    }
    if (!list.length) {
      setError("Enter at least one score or mark a learner absent.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("via", "institution");
    fd.set("assessmentId", assessment.id);
    fd.set("scores:json", JSON.stringify(list));
    start(async () => {
      const result = await recordAssessmentScoresAction(null, fd);
      if (result.ok) {
        toast.success(result.message ?? "Scores saved.");
        router.refresh();
        onDone();
      } else setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Out of {assessment.maxScore}
        {assessment.passScore !== null ? `, pass mark ${assessment.passScore}` : ", no pass mark"}. Learners see scores and remarks only after you publish the results.
      </p>
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm font-medium text-danger-strong">
          {error}
        </p>
      ) : null}
      <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {learners.map((l) => {
          const d = drafts[l.enrolmentId]!;
          return (
            <li key={l.enrolmentId} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-center" data-testid="score-row">
              <p className="font-medium text-foreground" id={`sc-${l.enrolmentId}`}>
                {l.name}
              </p>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={assessment.maxScore}
                step="0.01"
                value={d.score}
                disabled={d.isAbsent}
                onChange={(e) => set(l.enrolmentId, { score: e.target.value })}
                aria-label={`Score for ${l.name}`}
              />
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={d.isAbsent} onChange={(e) => set(l.enrolmentId, { isAbsent: e.target.checked })} className="size-4 accent-[var(--color-navy)]" />
                Absent
              </label>
              <Input
                className="sm:col-span-3"
                value={d.remarks}
                maxLength={1000}
                onChange={(e) => set(l.enrolmentId, { remarks: e.target.value })}
                placeholder="Remark for the learner (optional)"
                aria-label={`Remark for ${l.name}`}
              />
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} aria-disabled={saving}>
          {saving ? "Saving…" : "Save scores"}
        </Button>
      </div>
    </div>
  );
}

function ResultOverride({ learner, onDone }: { learner: GradedLearner; onDone: () => void }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => (o ? null : onDone())}
      title={`Set ${learner.name}'s result`}
      description="Override the calculated result, for example after a re-assessment. The learner sees the result."
      confirmLabel="Save result"
      onConfirm={async (fd) => {
        const raw = String(fd.get("finalScore") ?? "");
        const result = await setEnrolmentResultAction({
          via: "institution",
          enrolmentId: learner.enrolmentId,
          resultStatus: String(fd.get("resultStatus") ?? "pending") as "pending",
          finalScore: raw === "" ? undefined : Number(raw),
        });
        if (result.ok) {
          router.refresh();
          onDone();
        }
        return result;
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="override-result" className="text-sm font-medium">
            Result
          </label>
          <SimpleSelect
            id="override-result"
            name="resultStatus"
            defaultValue={learner.resultStatus}
            options={[
              { value: "pending", label: "Pending" },
              { value: "passed", label: "Passed" },
              { value: "failed", label: "Not passed" },
              { value: "not_applicable", label: "No graded result" },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="override-score" className="text-sm font-medium">
            Final score (%)
          </label>
          <Input id="override-score" name="finalScore" type="number" min={0} max={100} step="0.01" defaultValue={learner.finalScore ?? undefined} />
        </div>
      </div>
    </ConfirmDialog>
  );
}

export function AssessmentsPanel({
  batchId,
  assessments,
  scores,
  learners,
  canResults,
}: {
  batchId: string;
  assessments: AssessmentItem[];
  scores: ScoreItem[];
  learners: GradedLearner[];
  canResults: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ kind: "add" } | { kind: "edit"; a: AssessmentItem } | { kind: "scores"; a: AssessmentItem } | null>(null);
  const [override, setOverride] = useState<GradedLearner | null>(null);
  const [computing, startCompute] = useTransition();
  const close = () => setDialog(null);

  function compute() {
    startCompute(async () => {
      const result = await computeBatchResultsAction({ via: "institution", batchId });
      if (result.ok) {
        toast.success(result.message ?? "Results calculated.");
        router.refresh();
      } else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-base font-semibold text-foreground">Assessments</h3>
          <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "add" })}>
            <Plus aria-hidden="true" /> Add assessment
          </Button>
        </div>
        {assessments.length ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {assessments.map((a) => {
              const marked = scores.filter((s) => s.assessmentId === a.id && (s.score !== null || s.isAbsent)).length;
              return (
                <li key={a.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between" data-testid="assessment-row">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                      {a.title}
                      <StatusBadge tone={a.published ? "success" : "neutral"} size="sm">
                        {a.published ? "Results published" : "Not published"}
                      </StatusBadge>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {ASSESSMENT_TYPE_LABELS[a.type] ?? a.type} · out of {a.maxScore}
                      {a.passScore !== null ? ` · pass ${a.passScore}` : ""}
                      {a.weightPercent !== null ? ` · weight ${a.weightPercent}%` : ""} · {marked} of {learners.length} marked
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setDialog({ kind: "scores", a })} disabled={!learners.length}>
                      Enter scores
                    </Button>
                    {!a.published ? (
                      <ConfirmDialog
                        trigger={
                          <Button size="sm" variant="outline">
                            Publish results
                          </Button>
                        }
                        title={`Publish results of ${a.title}?`}
                        description="Learners can see their scores and remarks. Make sure every learner is marked."
                        confirmLabel="Publish results"
                        onConfirm={async () => {
                          const result = await publishAssessmentResultsAction({ via: "institution", assessmentId: a.id });
                          if (result.ok) router.refresh();
                          return result;
                        }}
                      />
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "edit", a })}>
                      Edit
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="ghost">
                          Delete
                        </Button>
                      }
                      title={`Delete ${a.title}?`}
                      description="Its scores are deleted too."
                      confirmLabel="Delete assessment"
                      variant="destructive"
                      onConfirm={async () => {
                        const result = await deleteCourseAssessmentAction({ via: "institution", assessmentId: a.id });
                        if (result.ok) router.refresh();
                        return result;
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState size="sm" variant="plain" title="No assessments yet" description="Add the theory tests, practicals, vivas or projects that decide the result." />
        )}
      </div>

      {canResults ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading text-base font-semibold text-foreground">Results</h3>
            <Button variant="outline" size="sm" onClick={compute} disabled={computing || !assessments.length} aria-disabled={computing}>
              <Calculator aria-hidden="true" /> {computing ? "Calculating…" : "Calculate results"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Final score is the weighted average of each assessment&apos;s percentage. A learner passes when every assessment with a pass mark is passed; results stay
            pending while marks are missing or no assessment has a pass mark.
          </p>
          {learners.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {learners.map((l) => (
                <li key={l.enrolmentId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span className="font-medium text-foreground">{l.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{pct(l.finalScore)}</span>
                    <StatusBadge tone={resultStatus(l.resultStatus).tone} size="sm">
                      {resultStatus(l.resultStatus).label}
                    </StatusBadge>
                    <Button variant="ghost" size="sm" onClick={() => setOverride(l)}>
                      Set result<span className="sr-only"> for {l.name}</span>
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <ResponsiveDialog open={dialog?.kind === "add" || dialog?.kind === "edit"} onOpenChange={(o) => (o ? null : close())} title={dialog?.kind === "edit" ? `Edit ${dialog.a.title}` : "Add an assessment"}>
        {dialog?.kind === "add" || dialog?.kind === "edit" ? <AssessmentForm batchId={batchId} assessment={dialog.kind === "edit" ? dialog.a : undefined} onDone={close} /> : null}
      </ResponsiveDialog>
      <ResponsiveDialog open={dialog?.kind === "scores"} onOpenChange={(o) => (o ? null : close())} title={dialog?.kind === "scores" ? `Scores: ${dialog.a.title}` : "Scores"} size="lg">
        {dialog?.kind === "scores" ? <ScoreSheet assessment={dialog.a} learners={learners} scores={scores.filter((s) => s.assessmentId === dialog.a.id)} onDone={close} /> : null}
      </ResponsiveDialog>
      {override ? <ResultOverride learner={override} onDone={() => setOverride(null)} /> : null}
    </div>
  );
}
