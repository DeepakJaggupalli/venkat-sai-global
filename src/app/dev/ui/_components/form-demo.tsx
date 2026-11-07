"use client";

import { useActionState, useState } from "react";

import { FormErrorAlert } from "@/components/shared/form/form-error-alert";
import { FormField } from "@/components/shared/form/form-field";
import { SubmitButton } from "@/components/shared/form/submit-button";
import { useActionToast } from "@/components/shared/form/use-action-toast";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import { RichTextEditor } from "@/components/shared/rich-text/rich-text-editor";
import { CountrySelect, CurrencySelect, LanguageSelect, SimpleSelect } from "@/components/shared/selects";
import { SkillPicker } from "@/components/shared/skill-picker";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/actions";

const EMPLOYMENT: SelectOption[] = [
  { value: "full_time", label: "Full time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
];
const COUNTRIES: SelectOption[] = [
  { value: "IN", label: "India" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "QA", label: "Qatar" },
  { value: "SA", label: "Saudi Arabia" },
  { value: "OM", label: "Oman" },
  { value: "DE", label: "Germany" },
];
const CURRENCIES: SelectOption[] = [
  { value: "INR", label: "INR — Indian Rupee" },
  { value: "AED", label: "AED — UAE Dirham" },
  { value: "QAR", label: "QAR — Qatari Riyal" },
  { value: "USD", label: "USD — US Dollar" },
];
const LANGUAGES: SelectOption[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi", description: "हिन्दी" },
  { value: "te", label: "Telugu", description: "తెలుగు" },
  { value: "ar", label: "Arabic", description: "العربية" },
];
const SAMPLE_TRADES: SelectOption[] = [
  { value: "smaw", label: "Sample trade: SMAW", description: "Sample option" },
  { value: "gtaw", label: "Sample trade: GTAW", description: "Sample option" },
  { value: "fcaw", label: "Sample trade: FCAW", description: "Sample option" },
  { value: "fitter", label: "Sample trade: Pipe fitter", description: "Sample option" },
];

type DemoResult = ActionState<{ submitted: Record<string, string | string[]> }>;

/** Client-only stand-in for a Server Action: validates and echoes the form (nothing is stored). */
async function demoAction(_prev: DemoResult, formData: FormData): Promise<NonNullable<DemoResult>> {
  await new Promise((r) => setTimeout(r, 700));
  const title = String(formData.get("title") ?? "").trim();
  const fieldErrors: Record<string, string[]> = {};
  if (!title) fieldErrors.title = ["Job title is required"];
  if (!formData.get("employmentType")) fieldErrors.employmentType = ["Choose an employment type"];
  if (Object.keys(fieldErrors).length > 0) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors };
  const submitted: Record<string, string | string[]> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || key.startsWith("$ACTION")) continue;
    const k = key.replace(/\[\]$/, "");
    const prev = submitted[k];
    submitted[k] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  }
  return { ok: true, data: { submitted }, message: "Sample form submitted (nothing was saved)" };
}

export function FormDemo() {
  const [state, formAction] = useActionState(demoAction, null);
  const [lastSubmitted, setLastSubmitted] = useState<Record<string, string | string[]> | null>(null);
  useActionToast(state, { onSuccess: (r) => setLastSubmitted(r.data?.submitted ?? null) });

  return (
    <form action={formAction} noValidate className="grid gap-5">
      <FormErrorAlert state={state} fieldLabels={{ title: "Job title", employmentType: "Employment type" }} />
      <div className="grid gap-5 md:grid-cols-2">
        <FormField label="Job title" name="title" required state={state} hint="Shown to candidates. Example: Sample Welder (TIG)">
          <Input autoComplete="off" />
        </FormField>
        <FormField label="Employment type" name="employmentType" required state={state}>
          {(field) => <SimpleSelect {...field} options={EMPLOYMENT} placeholder="Select a type" />}
        </FormField>
        <FormField label="Country" name="countryCode" optional state={state}>
          {(field) => <CountrySelect {...field} options={COUNTRIES} allowClear />}
        </FormField>
        <FormField label="Salary currency" name="salaryCurrency" optional state={state} hint="Always the record's own currency — never assumed.">
          {(field) => <CurrencySelect {...field} options={CURRENCIES} />}
        </FormField>
        <FormField label="Language" name="language" optional state={state}>
          {(field) => <LanguageSelect {...field} options={LANGUAGES} />}
        </FormField>
        <FormField label="Keywords" name="keywords" optional state={state} hint="Press Enter or comma after each keyword.">
          {(field) => <TagInput {...field} maxTags={8} lowercase />}
        </FormField>
        <FormField label="Sample trades (static options)" name="trades" optional state={state}>
          {(field) => <MultiCombobox {...field} options={SAMPLE_TRADES} maxSelected={3} placeholder="Select trades" />}
        </FormField>
        <FormField label="Skills (live typeahead)" name="skillIds" optional state={state} hint="Searches GET /api/v1/taxonomy/skills — needs a seeded database.">
          {(field) => <SkillPicker {...field} maxSelected={10} />}
        </FormField>
      </div>
      <FormField label="Summary" name="summary" optional state={state}>
        <Textarea rows={3} placeholder="Sample summary text" />
      </FormField>
      <FormField label="Description" name="descriptionHtml" optional state={state} hint="Rich text is sanitised on the server before it is stored.">
        <RichTextEditor name="descriptionHtml" placeholder="Describe the sample role…" maxLength={2000} />
      </FormField>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Submitting…">Submit sample form</SubmitButton>
        <p className="text-xs text-muted-foreground">Leave the title empty to see validation errors.</p>
      </div>
      {lastSubmitted ? (
        <pre className="max-h-64 overflow-auto rounded-lg bg-navy p-3 text-xs text-white" aria-label="Submitted sample values">
          {JSON.stringify(lastSubmitted, null, 2)}
        </pre>
      ) : null}
    </form>
  );
}
