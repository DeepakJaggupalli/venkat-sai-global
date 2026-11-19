"use client";

import { useState } from "react";

import { useEmployerForm } from "@/components/employer/use-form-action";
import { FormErrorAlert, SubmitButton, useActionToast } from "@/components/shared/form";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { EmployerKind } from "@/db/schema/_constants";

import { setEmployerKindAction } from "../actions";

const OPTIONS: { value: EmployerKind; title: string; text: string }[] = [
  { value: "direct_company", title: "Company / HR team", text: "You hire for your own company or projects. Uses the Company Portal." },
  {
    value: "travel_agency",
    title: "Travel agency",
    text: "You receive manpower requirements from employers abroad and source workers through Venkat Sai. Uses the Travel Agency Portal.",
  },
];

/** Owner-only switch between direct company and travel agency (moves the workspace to the matching portal). */
export function EmployerKindForm({ current }: { current: EmployerKind }) {
  const [value, setValue] = useState<EmployerKind>(current);
  const { state, pending, onSubmit } = useEmployerForm(setEmployerKindAction);
  useActionToast(state);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormErrorAlert state={state} fieldLabels={{ employerKind: "Business type" }} />
      <fieldset className="space-y-3">
        <legend className="sr-only">Business type</legend>
        <RadioGroup name="employerKind" value={value} onValueChange={(next) => setValue(next === "travel_agency" ? "travel_agency" : "direct_company")} className="grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((option) => (
            <Label
              key={option.value}
              htmlFor={`employer-kind-${option.value}`}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 font-normal has-data-checked:border-primary has-data-checked:bg-primary/5"
            >
              <RadioGroupItem id={`employer-kind-${option.value}`} value={option.value} className="mt-0.5" />
              <span className="space-y-1">
                <span className="block text-sm font-semibold text-foreground">{option.title}</span>
                <span className="block text-sm text-muted-foreground">{option.text}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="flex justify-end border-t border-border pt-4">
        <SubmitButton pending={pending} pendingLabel="Saving…" disabled={value === current}>
          Save business type
        </SubmitButton>
      </div>
    </form>
  );
}
