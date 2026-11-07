"use client";

/** Partner announcement requests for institutions (reviewed by Venkat Sai before they appear). */
import { useCallback, useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { SimpleSelect } from "@/components/shared/selects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { savePartnerAnnouncementAction, withdrawPartnerAnnouncementAction } from "@/modules/content/actions";
import { ANNOUNCEMENT_AUDIENCE_LABELS, ANNOUNCEMENT_PLACEMENT_LABELS, PARTNER_ANNOUNCEMENT_AUDIENCES, PARTNER_ANNOUNCEMENT_PLACEMENTS } from "@/modules/content/constants";

import { isoToLocalInput } from "./labels";
import { useInstitutionForm } from "./use-form-action";

export type AnnouncementDefaults = {
  id?: string;
  title?: string;
  body?: string | null;
  linkUrl?: string | null;
  linkLabel?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  audience?: string[];
  placements?: string[];
  priority?: string;
};

/** Local date-time input that posts an ISO timestamp with offset (what the content module expects). */
function DateTimeField({ name, label, hint, defaultValue, errors }: { name: string; label: string; hint?: string; defaultValue?: string | null; errors?: string[] }) {
  const [local, setLocal] = useState(isoToLocalInput(defaultValue));
  const iso = local ? new Date(local).toISOString() : "";
  const id = `announcement-${name}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} <span className="font-normal text-muted-foreground">(optional)</span>
      </Label>
      <Input id={id} type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} aria-describedby={`${id}-hint${errors?.length ? ` ${id}-error` : ""}`} aria-invalid={errors?.length ? true : undefined} />
      <input type="hidden" name={name} value={iso} />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint ?? "Your local time."}
      </p>
      {errors?.length ? (
        <p id={`${id}-error`} className="text-sm font-medium text-danger-strong">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

function Checks({ name, legend, values, labels, defaults, errors }: { name: string; legend: string; values: readonly string[]; labels: Record<string, string>; defaults: string[]; errors?: string[] }) {
  return (
    <fieldset className="space-y-2" aria-describedby={errors?.length ? `${name}-error` : undefined}>
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      {values.map((v) => (
        <div key={v} className="flex items-center gap-2">
          <input
            id={`${name}-${v}`}
            type="checkbox"
            name={`${name}[]`}
            value={v}
            defaultChecked={defaults.includes(v)}
            className="size-4 accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <Label htmlFor={`${name}-${v}`} className="font-normal">
            {labels[v] ?? v}
          </Label>
        </div>
      ))}
      {errors?.length ? (
        <p id={`${name}-error`} className="text-sm font-medium text-danger-strong">
          {errors[0]}
        </p>
      ) : null}
    </fieldset>
  );
}

export function AnnouncementForm({ defaults = {}, onSaved }: { defaults?: AnnouncementDefaults; onSaved?: () => void }) {
  const { state, pending, onSubmit } = useInstitutionForm(savePartnerAnnouncementAction);
  const [formKey, setFormKey] = useState(0);
  const last = useRef(state);
  useActionToast(state);
  const isNew = !defaults.id;
  useEffect(() => {
    if (state !== last.current && state?.ok && isNew) setFormKey((k) => k + 1);
    if (state !== last.current && state?.ok) onSaved?.();
    last.current = state;
  }, [state, isNew, onSaved]);
  const fe = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate className="space-y-5">
      <input type="hidden" name="orgType" value="institution" />
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <FormErrorAlert state={state} fieldLabels={{ title: "Title", body: "Message", linkUrl: "Link", linkLabel: "Link text", startsAt: "Start", endsAt: "End", audience: "Audience", placements: "Placement" }} />
      <FormField label="Title" name="title" required state={state} hint="Short and factual, for example “Admissions open for the January welding batch”.">
        <Input defaultValue={defaults.title} maxLength={160} />
      </FormField>
      <FormField label="Message" name="body" optional state={state} hint="Plain text, up to 600 characters.">
        <Textarea defaultValue={defaults.body ?? undefined} rows={3} maxLength={600} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Link" name="linkUrl" optional state={state} hint="A course on Venkat Sai Global (/training/…) or an https:// page.">
          <Input defaultValue={defaults.linkUrl ?? undefined} maxLength={500} />
        </FormField>
        <FormField label="Link text" name="linkLabel" optional state={state}>
          <Input defaultValue={defaults.linkLabel ?? undefined} maxLength={60} placeholder="View the course" />
        </FormField>
        <DateTimeField name="startsAt" label="Show from" defaultValue={defaults.startsAt} errors={fe?.startsAt} hint="Your local time. Leave empty to show it once approved." />
        <DateTimeField name="endsAt" label="Show until" defaultValue={defaults.endsAt} errors={fe?.endsAt} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Checks name="audience" legend="Who sees it" values={PARTNER_ANNOUNCEMENT_AUDIENCES} labels={ANNOUNCEMENT_AUDIENCE_LABELS} defaults={defaults.audience ?? ["talent"]} errors={fe?.audience} />
        <Checks name="placements" legend="Where it appears" values={PARTNER_ANNOUNCEMENT_PLACEMENTS} labels={ANNOUNCEMENT_PLACEMENT_LABELS} defaults={defaults.placements ?? ["notification_centre"]} errors={fe?.placements} />
        <FormField label="Priority" name="priority" state={state}>
          <SimpleSelect
            options={[
              { value: "normal", label: "Normal" },
              { value: "low", label: "Low" },
            ]}
            defaultValue={defaults.priority ?? "normal"}
          />
        </FormField>
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Sending…">
          {defaults.id ? "Save and send for review" : "Send to Venkat Sai for review"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function AnnouncementRowActions({ announcement, editable, withdrawable }: { announcement: AnnouncementDefaults & { id: string; title: string }; editable: boolean; withdrawable: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="flex flex-wrap gap-2">
      {editable ? (
        <ResponsiveDialog
          open={open}
          onOpenChange={setOpen}
          size="lg"
          title={`Edit “${announcement.title}”`}
          trigger={
            <Button variant="outline" size="sm">
              Edit
            </Button>
          }
        >
          <AnnouncementForm defaults={announcement} onSaved={close} />
        </ResponsiveDialog>
      ) : null}
      {withdrawable ? (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm">
              Withdraw
            </Button>
          }
          title="Withdraw this announcement?"
          description="It is removed from review or taken down if it is live."
          confirmLabel="Withdraw"
          variant="destructive"
          onConfirm={() => withdrawPartnerAnnouncementAction({ id: announcement.id, orgType: "institution" })}
        />
      ) : null}
    </div>
  );
}
