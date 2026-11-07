"use client";

import { useActionState, useId } from "react";

import { saveAnalyticsSettingsAction } from "@/app/admin/analytics/actions";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AnalyticsSettingsValues = {
  retentionEvents: number;
  retentionSessions: number;
  retentionHeatmaps: number;
  clarityProjectId: string;
  ga4MeasurementId: string;
  firstParty: boolean;
  heatmaps: boolean;
  clarity: boolean;
  ga4: boolean;
};

const FIELD_LABELS = {
  retentionEvents: "Keep raw events",
  retentionSessions: "Keep sessions",
  retentionHeatmaps: "Keep heatmap points",
  clarityProjectId: "Clarity project ID",
  ga4MeasurementId: "GA4 measurement ID",
  heatmaps: "Heatmaps",
};

/** Retention periods, optional third-party services and analytics switches (analytics.configure). */
export function AnalyticsSettingsForm({ values, canEdit }: { values: AnalyticsSettingsValues; canEdit: boolean }) {
  const id = useId();
  const [state, formAction] = useActionState(saveAnalyticsSettingsAction, null);
  useActionToast(state);
  const flagError = (name: string) => (state && !state.ok ? state.fieldErrors?.[name] : undefined);

  const toggles = [
    {
      name: "firstParty",
      label: "First-party analytics",
      description: "Page views, events, sources and conversions, recorded only after a visitor accepts analytics cookies.",
      checked: values.firstParty,
    },
    {
      name: "heatmaps",
      label: "Click and scroll heatmaps",
      description: "Click positions and scroll depth on public pages, under the same analytics consent. Element text is never captured.",
      checked: values.heatmaps,
    },
    {
      name: "clarity",
      label: "Microsoft Clarity session insights",
      description: "Loads Clarity only for visitors who separately accept session insights; whole pages are masked in signed-in areas. Set masking to Strict in Clarity.",
      checked: values.clarity,
    },
    {
      name: "ga4",
      label: "Google Analytics 4",
      description: "Loads GA4 only after analytics consent, in Consent Mode with advertising signals off and paths normalised.",
      checked: values.ga4,
    },
  ] as const;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <FormErrorAlert state={state} fieldLabels={FIELD_LABELS} />
      <fieldset disabled={!canEdit} className="space-y-6">
        <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby={`${id}-retention`}>
          <div>
            <h2 id={`${id}-retention`} className="font-heading text-lg font-semibold">
              Retention
            </h2>
            <p className="text-sm text-muted-foreground">
              Raw records older than this are deleted every day. Daily roll-ups and consent receipts are kept, so long-term trends survive.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Keep raw events (days)" name="retentionEvents" required state={state} hint="30 to 3650">
              <Input type="number" min={30} max={3650} defaultValue={values.retentionEvents} />
            </FormField>
            <FormField label="Keep sessions (days)" name="retentionSessions" required state={state} hint="30 to 3650">
              <Input type="number" min={30} max={3650} defaultValue={values.retentionSessions} />
            </FormField>
            <FormField label="Keep heatmap points (days)" name="retentionHeatmaps" required state={state} hint="7 to 3650">
              <Input type="number" min={7} max={3650} defaultValue={values.retentionHeatmaps} />
            </FormField>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby={`${id}-switches`}>
          <div>
            <h2 id={`${id}-switches`} className="font-heading text-lg font-semibold">
              What is collected
            </h2>
            <p className="text-sm text-muted-foreground">
              Every option depends on the visitor&apos;s choice in the cookie banner. Nothing loads before consent, Global Privacy Control is honoured,
              and staff and under-18 users are never tracked.
            </p>
          </div>
          <ul className="space-y-4">
            {toggles.map((t) => {
              const err = flagError(t.name);
              return (
                <li key={t.name} className="flex gap-3">
                  <Checkbox
                    id={`${id}-${t.name}`}
                    name={t.name}
                    defaultChecked={t.checked}
                    aria-describedby={`${id}-${t.name}-desc`}
                    aria-invalid={err ? true : undefined}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor={`${id}-${t.name}`}>{t.label}</Label>
                    <p id={`${id}-${t.name}-desc`} className="text-sm text-muted-foreground">
                      {t.description}
                    </p>
                    {err ? <p className="text-sm text-destructive">{err.join(" ")}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby={`${id}-ids`}>
          <div>
            <h2 id={`${id}-ids`} className="font-heading text-lg font-semibold">
              Optional services
            </h2>
            <p className="text-sm text-muted-foreground">
              When a service is switched on, the cookie banner names it so visitors know who receives the data. Leave an ID empty to stop using a service.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Microsoft Clarity project ID" name="clarityProjectId" optional state={state} hint="From the Clarity project settings">
              <Input defaultValue={values.clarityProjectId} autoComplete="off" spellCheck={false} maxLength={20} />
            </FormField>
            <FormField label="Google Analytics 4 measurement ID" name="ga4MeasurementId" optional state={state} hint="Starts with G-">
              <Input defaultValue={values.ga4MeasurementId} autoComplete="off" spellCheck={false} maxLength={24} placeholder="G-" />
            </FormField>
          </div>
        </section>
      </fieldset>
      {canEdit ? (
        <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
      ) : (
        <p className="text-sm text-muted-foreground">You can view these settings. Changing them needs the analytics configuration permission.</p>
      )}
    </form>
  );
}
