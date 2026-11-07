"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useId, useState, useTransition, type ReactNode } from "react";

import { previewFunnelAction } from "@/app/admin/analytics/actions";
import { Callout } from "@/components/shared/callout";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveFunnelAction } from "@/modules/analytics/actions";
import type { AnalyticsFunnelStep, FunnelResult } from "@/modules/analytics/types";

import { FunnelChart } from "./funnel-chart";
import { draftKey, moveStep, toDraft, toPayload, type DraftStep } from "./funnel-steps";

export type FunnelBuilderInitial = {
  id: string;
  name: string;
  description: string | null;
  windowDays: number;
  isActive: boolean;
  steps: AnalyticsFunnelStep[];
  isDefault: boolean;
};

const MAX_STEPS = 20;
const emptyStep = (): DraftStep => ({ key: draftKey(), label: "", event: "", path: "", props: "" });

/**
 * Funnel builder: ordered steps matched by event and/or path (+ optional property filters), a completion
 * window, a live preview against the selected reporting period, and save (analytics.configure).
 */
export function FunnelBuilder({
  initial,
  eventOptions,
  range,
  canSave,
}: {
  initial?: FunnelBuilderInitial;
  eventOptions: SelectOption[];
  range: { range: string; from?: string; to?: string };
  canSave: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [steps, setSteps] = useState<DraftStep[]>(() => (initial?.steps.length ? initial.steps.map(toDraft) : [emptyStep(), emptyStep()]));
  const [windowDays, setWindowDays] = useState(String(initial?.windowDays ?? 7));
  const [groupBy, setGroupBy] = useState<"visitor" | "session">("visitor");
  const [preview, setPreview] = useState<FunnelResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const [state, formAction] = useActionState(saveFunnelAction, null);

  useActionToast(state, {
    onSuccess: (s) => {
      const savedId = s.ok ? s.data?.id : undefined;
      router.push(savedId ? `/admin/analytics/funnels?funnel=${savedId}` : "/admin/analytics/funnels");
    },
  });

  const stepErrors = (i: number, field: string) => (state && !state.ok ? state.fieldErrors?.[`steps.${i}.${field}`] : undefined);
  const update = (key: string, patch: Partial<DraftStep>) => setSteps((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const payload = steps.map(toPayload);

  function runPreview() {
    setPreviewError(null);
    startPreview(async () => {
      const result = await previewFunnelAction({ steps: payload, windowDays: Number(windowDays) || 7, groupBy, ...range } as Parameters<typeof previewFunnelAction>[0]);
      if (result.ok && result.data) setPreview(result.data);
      else {
        setPreview(null);
        setPreviewError(result.ok ? "The preview could not be calculated." : result.error);
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <form action={formAction} className="space-y-6" noValidate>
        <FormErrorAlert state={state} fieldLabels={{ name: "Name", windowDays: "Completion window", steps: "Steps" }} />
        {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
        <input type="hidden" name="steps:json" value={JSON.stringify(payload)} />

        <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-6">
          <FormField label="Name" name="name" required state={state}>
            <Input defaultValue={initial?.name ?? ""} maxLength={120} />
          </FormField>
          <FormField label="Completion window (days)" name="windowDays" required state={state} hint="Each step must happen within this many days of the first">
            <Input type="number" min={1} max={366} value={windowDays} onChange={(e) => setWindowDays(e.target.value)} />
          </FormField>
          <FormField label="Description" name="description" optional state={state} className="sm:col-span-2">
            <Textarea defaultValue={initial?.description ?? ""} rows={2} maxLength={500} />
          </FormField>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch id={`${id}-active`} name="isActive" defaultChecked={initial?.isActive ?? true} />
            <Label htmlFor={`${id}-active`}>Active (shown in the funnel list)</Label>
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="font-heading text-lg font-semibold">Steps, in order</legend>
          <p className="text-sm text-muted-foreground">
            Match an event, a path or both. Paths are exact (<code>/jobs</code>) or a prefix ending in * (<code>/jobs/*</code>). Property filters are
            optional, written as <code>key=value</code> pairs separated by commas.
          </p>
          {state && !state.ok && state.fieldErrors?.steps ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {state.fieldErrors.steps.join(" ")}
            </p>
          ) : null}
          <ol className="space-y-3">
            {steps.map((step, i) => {
              const base = `${id}-step-${step.key}`;
              const labelErr = stepErrors(i, "label");
              const eventErr = stepErrors(i, "event");
              const pathErr = stepErrors(i, "path");
              return (
                <li key={step.key} className="rounded-xl border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="font-medium">Step {i + 1}</p>
                    <div className="flex gap-1">
                      <Button type="button" variant="ghost" size="icon" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => setSteps((l) => moveStep(l, i, i - 1))}>
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Move step ${i + 1} down`}
                        disabled={i === steps.length - 1}
                        onClick={() => setSteps((l) => moveStep(l, i, i + 1))}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove step ${i + 1}`}
                        disabled={steps.length <= 2}
                        onClick={() => setSteps((l) => l.filter((s) => s.key !== step.key))}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StepField id={`${base}-label`} label="Step name" errors={labelErr}>
                      <Input id={`${base}-label`} value={step.label} maxLength={80} aria-invalid={labelErr ? true : undefined} aria-describedby={labelErr ? `${base}-label-err` : undefined} onChange={(e) => update(step.key, { label: e.target.value })} />
                    </StepField>
                    <StepField id={`${base}-event`} label="Event" errors={eventErr}>
                      <SimpleSelect
                        id={`${base}-event`}
                        options={eventOptions}
                        value={step.event || undefined}
                        onValueChange={(v) => update(step.key, { event: v })}
                        placeholder="Any event"
                        allowClear
                        clearLabel="Any event"
                        aria-invalid={eventErr ? true : undefined}
                        aria-describedby={eventErr ? `${base}-event-err` : undefined}
                      />
                    </StepField>
                    <StepField id={`${base}-path`} label="Path (optional)" errors={pathErr}>
                      <Input id={`${base}-path`} value={step.path} placeholder="/jobs/*" maxLength={300} aria-invalid={pathErr ? true : undefined} aria-describedby={pathErr ? `${base}-path-err` : undefined} onChange={(e) => update(step.key, { path: e.target.value })} />
                    </StepField>
                    <StepField id={`${base}-props`} label="Property filters (optional)">
                      <Input id={`${base}-props`} value={step.props} placeholder="intent=employer" maxLength={300} onChange={(e) => update(step.key, { props: e.target.value })} />
                    </StepField>
                  </div>
                </li>
              );
            })}
          </ol>
          <Button type="button" variant="outline" disabled={steps.length >= MAX_STEPS} onClick={() => setSteps((l) => [...l, emptyStep()])}>
            <Plus aria-hidden="true" />
            Add step
          </Button>
        </fieldset>

        {initial?.isDefault ? (
          <Callout tone="info" title="Default funnel">
            This is one of the standard funnels. You can change its steps or deactivate it, but it cannot be deleted.
          </Callout>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {canSave ? (
            <SubmitButton pendingLabel="Saving…">{initial ? "Save funnel" : "Create funnel"}</SubmitButton>
          ) : (
            <p className="text-sm text-muted-foreground">You can preview funnels. Saving needs the analytics configuration permission.</p>
          )}
          <Button type="button" variant="outline" onClick={runPreview} disabled={previewing}>
            {previewing ? "Calculating…" : "Preview"}
          </Button>
        </div>
      </form>

      <section aria-labelledby={`${id}-preview`} className="space-y-3 xl:sticky xl:top-20 xl:self-start">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id={`${id}-preview`} className="font-heading text-lg font-semibold">
            Preview
          </h2>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-group`}>Count by</Label>
            <SimpleSelect
              id={`${id}-group`}
              className="w-40"
              value={groupBy}
              onValueChange={(v) => setGroupBy(v === "session" ? "session" : "visitor")}
              options={[
                { value: "visitor", label: "Visitors" },
                { value: "session", label: "Sessions" },
              ]}
            />
          </div>
        </div>
        <div aria-live="polite" aria-busy={previewing}>
          {previewError ? (
            <Callout tone="danger" title="Preview failed">
              {previewError}
            </Callout>
          ) : preview ? (
            <FunnelChart result={preview} />
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Choose “Preview” to see how many people completed these steps in the selected period.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function StepField({ id, label, errors, children }: { id: string; label: string; errors?: string[]; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {errors?.length ? (
        <p id={`${id}-err`} className="text-sm text-destructive">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
