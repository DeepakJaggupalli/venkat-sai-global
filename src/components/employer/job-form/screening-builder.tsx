"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { SimpleSelect } from "@/components/shared/selects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { screeningTypeOptions } from "../labels";
import { anyOfFromLabels, draftOptions, knockoutLabels, serializeQuestions, type KnockoutRule, type ScreeningDraft, type ScreeningType } from "./screening";

const MAX_QUESTIONS = 15;
let seq = 0;
const newKey = () => `q${Date.now().toString(36)}${(seq++).toString(36)}`;

function QuestionEditor({
  draft,
  index,
  total,
  error,
  onChange,
  onRemove,
  onMove,
}: {
  draft: ScreeningDraft;
  index: number;
  total: number;
  error?: string;
  onChange: (next: ScreeningDraft) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const uid = useId();
  const isChoice = draft.type === "single_choice" || draft.type === "multi_choice";
  const set = (patch: Partial<ScreeningDraft>) => onChange({ ...draft, ...patch });
  const selectedFlagLabels = knockoutLabels(draft.knockout, draftOptions(draft.optionLabels));

  function setType(type: ScreeningType) {
    set({ type, knockout: null, optionLabels: type === "single_choice" || type === "multi_choice" ? (draft.optionLabels.length ? draft.optionLabels : ["", ""]) : [] });
  }
  function setLabels(labels: string[]) {
    const keep = selectedFlagLabels.filter((l) => labels.includes(l));
    set({ optionLabels: labels, knockout: anyOfFromLabels(keep, labels) });
  }
  function toggleFlag(label: string, on: boolean) {
    const next = on ? [...selectedFlagLabels, label] : selectedFlagLabels.filter((l) => l !== label);
    set({ knockout: anyOfFromLabels(next, draft.optionLabels) });
  }

  const numberRule = draft.knockout && (draft.knockout.kind === "below" || draft.knockout.kind === "above") ? draft.knockout : null;

  return (
    <li className="space-y-4 rounded-lg border border-border bg-background p-4" aria-labelledby={`${uid}-title`} data-testid="screening-question">
      <div className="flex items-center justify-between gap-2">
        <p id={`${uid}-title`} className="text-sm font-semibold text-foreground">
          Question {index + 1}
        </p>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move question ${index + 1} up`}>
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`Move question ${index + 1} down`}>
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove question ${index + 1}`}>
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      {error ? (
        <p className="text-sm font-medium text-danger-strong" role="alert">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-q`}>Question</Label>
          <Input id={`${uid}-q`} value={draft.question} onChange={(e) => set({ question: e.target.value })} maxLength={300} aria-invalid={error ? true : undefined} />
        </div>
        <div className="space-y-1.5">
          <Label id={`${uid}-type-label`}>Answer type</Label>
          <SimpleSelect options={screeningTypeOptions} value={draft.type} onValueChange={(v) => setType(v as ScreeningType)} aria-label="Answer type" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-help`}>
          Help text <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id={`${uid}-help`} value={draft.helpText} onChange={(e) => set({ helpText: e.target.value })} maxLength={500} />
      </div>

      {isChoice ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Choices</legend>
          {draft.optionLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={label}
                onChange={(e) => setLabels(draft.optionLabels.map((l, j) => (j === i ? e.target.value : l)))}
                maxLength={120}
                aria-label={`Choice ${i + 1}`}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => setLabels(draft.optionLabels.filter((_, j) => j !== i))} aria-label={`Remove choice ${i + 1}`} disabled={draft.optionLabels.length <= 2}>
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setLabels([...draft.optionLabels, ""])} disabled={draft.optionLabels.length >= 20}>
            <Plus aria-hidden="true" /> Add choice
          </Button>
        </fieldset>
      ) : null}

      <div className="flex items-start gap-2">
        <input
          id={`${uid}-req`}
          type="checkbox"
          checked={draft.isRequired}
          onChange={(e) => set({ isRequired: e.target.checked })}
          className="mt-1 size-4 accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <Label htmlFor={`${uid}-req`} className="font-normal">
          Candidates must answer this question
        </Label>
      </div>

      {draft.type !== "text" ? (
        <fieldset className="space-y-2 rounded-md bg-surface-subtle p-3">
          <legend className="sr-only">Review rule</legend>
          <p className="text-sm font-medium text-foreground">Flag for review (optional)</p>
          <p className="text-xs text-muted-foreground">Flagged applications are highlighted for your team. They are never rejected automatically.</p>
          {draft.type === "yes_no" ? (
            <SimpleSelect
              aria-label="Flag when the answer is"
              options={[
                { value: "yes", label: "Flag when the answer is Yes" },
                { value: "no", label: "Flag when the answer is No" },
              ]}
              value={draft.knockout?.kind === "equals" ? (draft.knockout.value === true ? "yes" : "no") : ""}
              onValueChange={(v) => set({ knockout: v ? { kind: "equals", value: v === "yes" } : null })}
              allowClear
              clearLabel="Do not flag"
              placeholder="Do not flag"
            />
          ) : null}
          {draft.type === "number" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <SimpleSelect
                aria-label="Flag when the number is"
                options={[
                  { value: "below", label: "Flag when below" },
                  { value: "above", label: "Flag when above" },
                ]}
                value={numberRule?.kind ?? ""}
                onValueChange={(v) => set({ knockout: v ? ({ kind: v as "below" | "above", value: numberRule?.value ?? 0 } satisfies KnockoutRule) : null })}
                allowClear
                clearLabel="Do not flag"
                placeholder="Do not flag"
              />
              {numberRule ? (
                <Input
                  type="number"
                  inputMode="decimal"
                  aria-label="Threshold"
                  value={String(numberRule.value)}
                  onChange={(e) => set({ knockout: { kind: numberRule.kind, value: Number(e.target.value) || 0 } })}
                />
              ) : null}
            </div>
          ) : null}
          {isChoice ? (
            <ul className="space-y-1">
              {draft.optionLabels
                .filter((l) => l.trim())
                .map((label) => {
                  const id = `${uid}-flag-${label}`;
                  return (
                    <li key={label} className="flex items-center gap-2">
                      <input
                        id={id}
                        type="checkbox"
                        checked={selectedFlagLabels.includes(label)}
                        onChange={(e) => toggleFlag(label, e.target.checked)}
                        className="size-4 accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      />
                      <Label htmlFor={id} className="font-normal">
                        Flag when “{label}” is chosen
                      </Label>
                    </li>
                  );
                })}
            </ul>
          ) : null}
        </fieldset>
      ) : null}
    </li>
  );
}

/** Screening questions builder; posts `screeningQuestions:json` and `screeningRequired`. */
export function ScreeningBuilder({
  defaultQuestions,
  defaultRequired,
  errors,
}: {
  defaultQuestions: ScreeningDraft[];
  defaultRequired: boolean;
  errors: { index: number | null; message: string }[];
}) {
  const [questions, setQuestions] = useState<ScreeningDraft[]>(defaultQuestions);
  const [required, setRequired] = useState(defaultRequired);
  const listError = errors.find((e) => e.index === null)?.message;

  const update = (i: number, next: ScreeningDraft) => setQuestions((qs) => qs.map((q, j) => (j === i ? next : q)));
  const move = (i: number, delta: -1 | 1) =>
    setQuestions((qs) => {
      const j = i + delta;
      if (j < 0 || j >= qs.length) return qs;
      const copy = [...qs];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });

  return (
    <div className="space-y-4">
      <input type="hidden" name="screeningQuestions:json" value={JSON.stringify(serializeQuestions(questions))} />
      <div className="flex items-start gap-2">
        <input
          id="screeningRequired"
          type="checkbox"
          name="screeningRequired"
          value="true"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
          className="mt-1 size-4 accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <Label htmlFor="screeningRequired" className="font-normal">
          Ask these questions when candidates apply
        </Label>
      </div>
      {listError ? (
        <p className="text-sm font-medium text-danger-strong" role="alert">
          {listError}
        </p>
      ) : null}
      {questions.length ? (
        <ol className="space-y-3">
          {questions.map((q, i) => (
            <QuestionEditor
              key={q.key}
              draft={q}
              index={i}
              total={questions.length}
              error={errors.find((e) => e.index === i)?.message}
              onChange={(next) => update(i, next)}
              onRemove={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
              onMove={(d) => move(i, d)}
            />
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No screening questions. Add questions to understand each applicant&apos;s fit before you review them.</p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={questions.length >= MAX_QUESTIONS}
        onClick={() => {
          setQuestions((qs) => [...qs, { key: newKey(), question: "", helpText: "", type: "yes_no", optionLabels: [], isRequired: true, knockout: null }]);
          setRequired(true);
        }}
      >
        <Plus aria-hidden="true" /> Add question
      </Button>
      <p className="sr-only" aria-live="polite">
        {questions.length} screening question{questions.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}
