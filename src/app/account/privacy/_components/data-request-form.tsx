"use client";

import { useActionState, useState } from "react";

import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { track } from "@/modules/analytics/client";
import { createMyDataRequestAction } from "@/modules/privacy/actions";

type Option = { value: string; label: string; description: string; disabledReason: string | null };

/** Raise an access / export / correction / deletion request. Deletion needs an explicit confirmation. */
export function DataRequestForm({ options, slaDays, defaultType }: { options: Option[]; slaDays: number; defaultType?: string }) {
  const firstEnabled = options.find((o) => !o.disabledReason)?.value ?? "";
  const [type, setType] = useState(defaultType && options.some((o) => o.value === defaultType && !o.disabledReason) ? defaultType : firstEnabled);
  const [state, formAction] = useActionState(createMyDataRequestAction, null);
  useActionToast(state, { onSuccess: () => track("form_submitted", { formId: "data_request", type }) });

  return (
    <form action={formAction} className="space-y-5" noValidate data-testid="data-request-form">
      <FormErrorAlert state={state} fieldLabels={{ type: "Request type", details: "Details", confirmDeletion: "Confirmation" }} />
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-foreground">What would you like us to do?</legend>
        <RadioGroup name="type" value={type} onValueChange={setType} className="grid gap-3 md:grid-cols-2">
          {options.map((o) => (
            <Label
              key={o.value}
              htmlFor={`dsr-${o.value}`}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 has-[[data-state=checked]]:border-teal has-[[data-state=checked]]:bg-teal-soft has-[[disabled]]:cursor-not-allowed has-[[disabled]]:opacity-70"
            >
              <RadioGroupItem id={`dsr-${o.value}`} value={o.value} disabled={Boolean(o.disabledReason)} className="mt-0.5" />
              <span className="space-y-1">
                <span className="block text-sm font-semibold text-foreground">{o.label}</span>
                <span className="block text-sm font-normal text-muted-foreground">{o.disabledReason ?? o.description}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </fieldset>
      <FormField
        label={type === "correction" ? "What needs correcting?" : "Anything we should know?"}
        name="details"
        required={type === "correction"}
        optional={type !== "correction"}
        state={state}
        hint={type === "correction" ? "Say which information is wrong and what it should be. Some details, such as your name on documents, may need proof." : undefined}
      >
        <Textarea rows={4} maxLength={4000} />
      </FormField>
      {type === "deletion" ? (
        <div className="space-y-2 rounded-xl border border-danger/30 bg-danger-soft p-4">
          <p className="text-sm text-danger-strong">
            Your account will be closed and you will be signed out. Your profile, documents and files are deleted or anonymised. We keep only records the law requires, for example invoices, placement records and the grievance register.
          </p>
          <div className="flex items-start gap-2">
            <Checkbox id="confirmDeletion" name="confirmDeletion" value="on" aria-describedby="confirmDeletion-error" />
            <Label htmlFor="confirmDeletion" className="text-sm font-normal text-foreground">
              I understand my account will be closed and this cannot be undone.
            </Label>
          </div>
          {state?.ok === false && state.fieldErrors?.confirmDeletion ? (
            <p id="confirmDeletion-error" className="text-sm text-danger-strong">
              {state.fieldErrors.confirmDeletion[0]}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">We respond within {slaDays} days. We may ask you to confirm your identity first.</p>
      <SubmitButton pendingLabel="Sending…" variant={type === "deletion" ? "destructive" : "default"} disabled={!type}>
        {type === "deletion" ? "Request account deletion" : "Send request"}
      </SubmitButton>
    </form>
  );
}
