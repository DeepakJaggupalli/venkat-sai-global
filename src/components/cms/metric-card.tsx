"use client";

import { CheckCircle2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useId, useState } from "react";

import { FileUpload } from "@/components/files";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DateText } from "@/components/shared/date-text";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PublicMetricMode } from "@/db/schema";
import { approveManualMetricValueAction, deleteCustomMetricAction, setManualMetricValueAction, updatePublicMetricAction } from "@/modules/content/actions";
import type { FileSummary } from "@/modules/files/types";

export type MetricCardData = {
  key: string;
  label: string;
  mode: PublicMetricMode;
  isVisible: boolean;
  definition: string | null;
  isStandard: boolean;
  liveValue: number | null;
  liveValueComputedAt: string | null;
  manualValue: number | null;
  asOfDate: string | null;
  approvedValue: number | null;
  approvedAsOfDate: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  manualApprovalCurrent: boolean;
  evidenceNote: string | null;
  evidenceFile: FileSummary | null;
  minDisplayValue: number | null;
  sortOrder: number;
  publicValue: number | null;
};

const fmt = (n: number | null) => (n === null ? "—" : new Intl.NumberFormat("en-IN").format(n));
const MODE_LABEL: Record<PublicMetricMode, string> = { live: "Live count", manual: "Approved figure", hidden: "Hidden" };

/** One public statistic: display settings, the manual figure with evidence, and its approval. */
export function MetricCard({ metric, today }: { metric: MetricCardData; today: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const router = useRouter();
  const [settings, settingsAction] = useActionState(updatePublicMetricAction, null);
  const [manual, manualAction] = useActionState(setManualMetricValueAction, null);
  const [mode, setMode] = useState<PublicMetricMode>(metric.mode);
  const [visible, setVisible] = useState(metric.isVisible);
  useActionToast(settings, { onSuccess: () => router.refresh() });
  useActionToast(manual, { onSuccess: () => router.refresh() });
  const needsApproval = metric.manualValue !== null && !metric.manualApprovalCurrent;

  return (
    <article className="rounded-xl border bg-card" aria-labelledby={`${uid}-title`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div className="min-w-0">
          <h3 id={`${uid}-title`} className="font-heading text-base font-semibold">
            {metric.label}
          </h3>
          <p className="text-xs text-muted-foreground">
            {metric.isStandard ? "Standard counter" : "Custom figure"} · <code className="font-mono">{metric.key}</code>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Website shows now</p>
          <p className="font-heading text-2xl font-semibold tabular-nums">{metric.publicValue === null ? "Nothing" : fmt(metric.publicValue)}</p>
          <StatusBadge tone={metric.publicValue === null ? "neutral" : "success"} size="sm">
            {metric.publicValue === null ? "Not shown" : MODE_LABEL[metric.mode]}
          </StatusBadge>
        </div>
      </header>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <form action={settingsAction} noValidate className="space-y-4">
          <input type="hidden" name="key" value={metric.key} />
          <input type="hidden" name="isVisible" value={visible ? "true" : "false"} />
          <FormErrorAlert state={settings} />
          <FormField label="Label on the website" name="label" required state={settings}>
            <Input defaultValue={metric.label} maxLength={80} />
          </FormField>
          <FormField label="Definition" name="definition" optional state={settings} hint="Shown next to the number, for example “Candidates with an active account”.">
            <Textarea rows={2} defaultValue={metric.definition ?? ""} maxLength={600} />
          </FormField>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Source</legend>
            <RadioGroup name="mode" value={mode} onValueChange={(v) => setMode(v as PublicMetricMode)} className="space-y-1.5">
              {(metric.isStandard ? (["live", "manual", "hidden"] as const) : (["manual", "hidden"] as const)).map((m) => (
                <div key={m} className="flex items-center gap-2">
                  <RadioGroupItem value={m} id={`${uid}-m-${m}`} />
                  <Label htmlFor={`${uid}-m-${m}`} className="font-normal">
                    {m === "live" ? "Live count from platform records" : m === "manual" ? "Approved figure with an as-of date" : "Hidden"}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          {metric.isStandard && (
            <p className="text-sm">
              Live value now: <span className="font-semibold tabular-nums">{fmt(metric.liveValue)}</span>
              {metric.liveValueComputedAt && <span className="text-muted-foreground"> (calculated <DateText value={metric.liveValueComputedAt} mode="datetime" />)</span>}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Show only from" name="minDisplayValue" optional state={settings} hint="Hide the number until it reaches this value.">
              <Input type="number" min={0} step={1} inputMode="numeric" defaultValue={metric.minDisplayValue ?? ""} />
            </FormField>
            <FormField label="Order" name="sortOrder" optional state={settings} hint="Lower numbers appear first.">
              <Input type="number" step={1} inputMode="numeric" defaultValue={metric.sortOrder} />
            </FormField>
          </div>
          <div className="flex items-center gap-3">
            <Switch id={`${uid}-vis`} checked={visible} onCheckedChange={setVisible} />
            <Label htmlFor={`${uid}-vis`} className="font-normal">
              Show on the website
            </Label>
          </div>
          <SubmitButton pendingLabel="Saving…" variant="outline">
            Save display settings
          </SubmitButton>
        </form>

        <div className="space-y-4">
          <form action={manualAction} noValidate className="space-y-4 rounded-lg border bg-surface-subtle/60 p-4">
            <input type="hidden" name="key" value={metric.key} />
            <p className="text-sm font-medium">Manual figure</p>
            <FormErrorAlert state={manual} />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Value" name="manualValue" required state={manual}>
                <Input type="number" min={0} step={1} inputMode="numeric" defaultValue={metric.manualValue ?? ""} />
              </FormField>
              <FormField label="As of" name="asOfDate" required state={manual} hint="The date the figure was true.">
                <Input type="date" max={today} defaultValue={metric.asOfDate ?? ""} />
              </FormField>
            </div>
            <FormField label="How it was verified" name="evidenceNote" state={manual} hint="Source records and who checked them. A note or an evidence file is required.">
              <Textarea rows={3} maxLength={1000} defaultValue={metric.evidenceNote ?? ""} />
            </FormField>
            <FormField label="Evidence file" name="evidenceFileId" optional state={manual}>
              {(control) => (
                <FileUpload
                  purpose="cms_media"
                  visibility="private"
                  name="evidenceFileId"
                  id={control.id}
                  errorId={control["aria-describedby"]}
                  defaultFiles={metric.evidenceFile ? [metric.evidenceFile] : []}
                  description="Report or export that proves the figure. Stored privately."
                />
              )}
            </FormField>
            <SubmitButton pendingLabel="Saving…" variant="outline">
              Save figure
            </SubmitButton>
          </form>

          {metric.manualValue !== null && (
            <div className="space-y-2 rounded-lg border p-4 text-sm" aria-live="polite">
              {metric.manualApprovalCurrent ? (
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  <span>
                    Approved: {fmt(metric.approvedValue)} as of {metric.approvedAsOfDate}
                    {metric.approvedByName ? ` by ${metric.approvedByName}` : ""}.
                  </span>
                </p>
              ) : (
                <>
                  <p className="font-medium text-warning-strong">
                    {fmt(metric.manualValue)} as of {metric.asOfDate} is not approved, so it is not shown.
                  </p>
                  <p className="text-muted-foreground">Ask a colleague who did not enter the figure to check the evidence and approve it.</p>
                  <ConfirmDialog
                    trigger={
                      <Button type="button" size="sm">
                        Approve figure
                      </Button>
                    }
                    title={`Approve ${fmt(metric.manualValue)} for “${metric.label}”?`}
                    description="Confirm that you checked the evidence and that the figure was true on the as-of date. Your name is recorded with the approval."
                    confirmLabel="Approve"
                    onConfirm={() => approveManualMetricValueAction({ key: metric.key })}
                    onSuccess={() => router.refresh()}
                  />
                </>
              )}
            </div>
          )}
          {needsApproval && mode === "manual" && visible && <p className="text-xs text-muted-foreground">Until it is approved the website shows nothing for this statistic.</p>}

          {!metric.isStandard && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost" size="sm" className="text-danger-strong hover:text-danger-strong">
                  <Trash2 aria-hidden />
                  Delete this figure
                </Button>
              }
              title={`Delete “${metric.label}”?`}
              description="It is removed from the website and from this list."
              confirmLabel="Delete"
              variant="destructive"
              onConfirm={() => deleteCustomMetricAction({ key: metric.key })}
              onSuccess={() => router.refresh()}
            />
          )}
        </div>
      </div>
    </article>
  );
}
