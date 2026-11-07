"use client";

import { useActionState, useId, useState } from "react";

import { FileUpload } from "@/components/files";
import { Callout } from "@/components/shared/callout";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { ContentConsentStatus } from "@/db/schema";
import type { ActionResult, ActionState } from "@/lib/actions";

import type { ConsentState } from "./types";


const STATUS_OPTIONS: { value: ContentConsentStatus; label: string; hint: string }[] = [
  { value: "obtained", label: "Obtained", hint: "Signed release, written permission or recorded email on file." },
  { value: "pending", label: "Requested, not yet received", hint: "Keeps the item off the website until it arrives." },
  { value: "withdrawn", label: "Withdrawn", hint: "Takes the item off the website straight away." },
  { value: "not_required", label: "Not required", hint: "No identifiable person or organisation is featured." },
];

/**
 * Consent evidence for an entry (testimonials, case studies, team members) or a media item showing
 * people. "Obtained" needs a date and evidence (a file or a note saying where the signed copy is kept).
 * Evidence files are stored privately.
 */
export function ConsentForm<T>({
  action,
  id,
  current,
  subject,
  allowNotRequired = true,
  disabled = false,
}: {
  action: (prev: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;
  id: string;
  current: ConsentState;
  /** "the person quoted", "the people shown"… */
  subject: string;
  allowNotRequired?: boolean;
  disabled?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [state, formAction] = useActionState<ActionState<T>, FormData>(action, null);
  const [status, setStatus] = useState<ContentConsentStatus>(current.status === "not_required" && !allowNotRequired ? "pending" : current.status);
  useActionToast(state);
  const options = STATUS_OPTIONS.filter((o) => allowNotRequired || o.value !== "not_required");

  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <FormErrorAlert state={state} />
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium">Consent of {subject}</legend>
        <RadioGroup name="consentStatus" value={status} onValueChange={(v) => setStatus(v as ContentConsentStatus)} className="space-y-2">
          {options.map((o) => (
            <div key={o.value} className="flex items-start gap-2">
              <RadioGroupItem value={o.value} id={`${uid}-${o.value}`} className="mt-0.5" aria-describedby={`${uid}-${o.value}-hint`} />
              <div>
                <Label htmlFor={`${uid}-${o.value}`} className="font-normal">
                  {o.label}
                </Label>
                <p id={`${uid}-${o.value}-hint`} className="text-xs text-muted-foreground">
                  {o.hint}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      {status === "obtained" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Date obtained" name="consentObtainedAt" required state={state}>
            <Input type="date" defaultValue={current.obtainedAt ?? ""} disabled={disabled} />
          </FormField>
          <FormField label="Expires" name="consentExpiresAt" optional state={state} hint="For time-limited releases. The item goes offline automatically.">
            <Input type="date" defaultValue={current.expiresAt ?? ""} disabled={disabled} />
          </FormField>
        </div>
      )}

      {status !== "not_required" && (
        <>
          <FormField label="Evidence file" name="consentFileId" optional state={state}>
            {(control) => (
              <FileUpload
                purpose="cms_media"
                visibility="private"
                name="consentFileId"
                id={control.id}
                errorId={control["aria-describedby"]}
                invalid={Boolean(control["aria-invalid"])}
                defaultFiles={current.file ? [current.file] : []}
                description="Signed release or written permission (PDF or image). Stored privately; only staff can open it."
                disabled={disabled}
              />
            )}
          </FormField>
          <FormField label="Notes" name="consentNotes" optional state={state} hint="What the consent covers and where the original is kept, for example “Signed release, website and brochures, filed in HR folder 2026”.">
            <Textarea rows={3} maxLength={1000} defaultValue={current.notes ?? ""} disabled={disabled} />
          </FormField>
        </>
      )}

      {status === "withdrawn" && (
        <Callout tone="warning" title="Withdrawal takes effect immediately">
          Saving takes the item off the website at once. It cannot be published again unless new consent is recorded.
        </Callout>
      )}
      {!disabled && <SubmitButton pendingLabel="Saving…">Save consent</SubmitButton>}
    </form>
  );
}
