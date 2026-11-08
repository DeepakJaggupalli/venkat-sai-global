"use client";

import { CheckCircle2, Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";

import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { CountrySelect, SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { track } from "@/modules/analytics/client";
import { submitRequirementAction } from "@/modules/operations/actions";

import { ContactButtons } from "../requirements/contact-buttons";
import { ConsentCheckbox, Honeypot } from "./form-parts";
import { RequirementLineFields } from "./requirement-line-fields";
import { buildRequirementPayload, emptyLine, lineErrors, MAX_REQUIREMENT_LINES, type RequirementLineDraft } from "./requirement-lines";

export type RequirementFormOptions = {
  countries: SelectOption[];
  industries: SelectOption[];
  currencies: SelectOption[];
  kinds: SelectOption[];
  urgencies: SelectOption[];
  interviewMethods: SelectOption[];
};

const FIELD_LABELS: Record<string, string> = {
  title: "Requirement title",
  kind: "Type of requirement",
  lines: "Roles",
  organizationName: "Company name",
  contactName: "Contact person",
  contactEmail: "Email",
  contactPhone: "Phone",
  consentToContact: "Consent to contact",
  description: "Description",
  joiningBy: "Joining by",
  contractDurationMonths: "Contract duration",
};

function Group({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-border pt-8 first:border-t-0 first:pt-0">
      <h2 id={id} className="font-heading text-xl font-semibold text-navy">
        {title}
      </h2>
      {description ? <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Check({ name, label, checked, onChange, defaultChecked }: { name: string; label: string; checked?: boolean; onChange?: (v: boolean) => void; defaultChecked?: boolean }) {
  const id = `req-${name}`;
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="checkbox"
        name={name}
        value="true"
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
        className="size-5 shrink-0 rounded border-input accent-[var(--brand-navy)] focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      <label htmlFor={id} className="text-sm text-foreground">
        {label}
      </label>
    </div>
  );
}

/**
 * The complete public bulk workforce requirement form (spec 9.3) → operations `submitRequirementAction`
 * (honeypot, rate limits, consent, approval centre, acknowledgement). Role lines are sent as `lines:json`.
 * The `requirement_submitted` conversion is recorded server-side; the form records `employer_enquiry_opened`
 * when a visitor starts filling it in.
 */
export function RequirementForm({ options, utm, sourcePage = "/employers/request" }: { options: RequirementFormOptions; utm?: Record<string, string> | null; sourcePage?: string }) {
  const [state, formAction] = useActionState(submitRequirementAction, null);
  const [pending, startTransition] = useTransition();
  const counter = useRef(1);
  const opened = useRef(false);
  const [lines, setLines] = useState<RequirementLineDraft[]>(() => [emptyLine("l0")]);
  const [assessment, setAssessment] = useState(false);
  const successRef = useRef<HTMLDivElement>(null);
  useActionToast(state);

  const payload = useMemo(() => JSON.stringify(buildRequirementPayload(lines)), [lines]);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const linesError = fieldErrors?.lines?.[0];

  useEffect(() => {
    if (state?.ok) successRef.current?.focus();
  }, [state]);

  const updateLine = (key: string, patch: Partial<RequirementLineDraft>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => {
    setLines((prev) => (prev.length >= MAX_REQUIREMENT_LINES ? prev : [...prev, emptyLine(`l${counter.current++}`)]));
  };
  const removeLine = (key: string) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));

  const onFirstInput = () => {
    if (opened.current) return;
    opened.current = true;
    track("employer_enquiry_opened", { formId: "workforce_requirement" });
  };

  // Submit without React's automatic form reset so visitors keep their entries when a field needs correcting.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };

  if (state?.ok) {
    const code = (state.data as { code?: string | null } | undefined)?.code;
    return (
      <div ref={successRef} tabIndex={-1} role="status" aria-live="polite" className="rounded-2xl border border-success/30 bg-success-soft p-6 focus:outline-none sm:p-10" data-testid="requirement-success">
        <CheckCircle2 aria-hidden="true" className="size-10 text-success-strong" />
        <h2 className="mt-4 font-heading text-2xl font-bold text-navy">Thank you. Your workforce requirement has been received.</h2>
        {code ? (
          <p className="mt-3 text-base text-foreground">
            Your requirement reference is{" "}
            <strong className="font-heading text-lg font-bold tabular-nums text-navy" data-testid="requirement-code">
              {code}
            </strong>
            . Please quote it when you contact us.
          </p>
        ) : (
          <p className="mt-3 text-base text-foreground">We will be in touch using the contact details you provided.</p>
        )}
        <h3 className="mt-8 font-heading text-lg font-semibold text-navy">What happens next</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground">
          <li>We send an acknowledgement to the email or phone number you gave us.</li>
          <li>Our team reviews the requirement and contacts you to confirm roles, terms and timelines.</li>
          <li>Once agreed, we start sourcing, screening and, where needed, trade testing candidates.</li>
        </ol>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/sign-up?intent=employer" className="inline-flex min-h-11 items-center rounded-lg bg-navy px-5 text-sm font-semibold text-white hover:bg-navy-deep">
            Create an employer account to track it
          </Link>
          <Link href="/services" className="inline-flex min-h-11 items-center rounded-lg border border-navy/20 bg-white px-5 text-sm font-semibold text-navy hover:bg-surface-subtle">
            Explore our services
          </Link>
        </div>
        <ContactButtons className="mt-6" message={code ? `Hello Venkat Sai, my requirement reference is ${code}.` : undefined} emailSubject={code ? `Requirement ${code}` : undefined} />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} onInput={onFirstInput} noValidate className="relative space-y-10 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-8 lg:p-10" data-testid="requirement-form">
      <FormErrorAlert state={state} fieldLabels={FIELD_LABELS} />
      <input type="hidden" name="sourcePage" value={sourcePage} />
      <input type="hidden" name="locale" value="en" />
      <input type="hidden" name="lines:json" value={payload} />
      {utm && Object.keys(utm).length ? <input type="hidden" name="utm:json" value={JSON.stringify(utm)} /> : null}
      <Honeypot />

      <Group id="req-about" title="About the requirement" description="The basics of what you need. You can add as many roles as you like below.">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Requirement title" name="title" required state={state} className="sm:col-span-2" hint="For example: Welders and fitters for a refinery shutdown in Qatar">
            <Input maxLength={200} />
          </FormField>
          <FormField label="Type of requirement" name="kind" required state={state}>
            {(field) => <SimpleSelect {...field} options={options.kinds} defaultValue="bulk" />}
          </FormField>
          <FormField label="Urgency" name="urgency" state={state}>
            {(field) => <SimpleSelect {...field} options={options.urgencies} defaultValue="normal" />}
          </FormField>
          <FormField label="Industry" name="industryId" optional state={state}>
            {(field) => <SearchableSelect {...field} options={options.industries} allowClear placeholder="Choose an industry" searchPlaceholder="Search industries" emptyText="No matching industry" />}
          </FormField>
          <FormField label="Work location country" name="countryCode" optional state={state}>
            {(field) => <CountrySelect {...field} options={options.countries} allowClear placeholder="Choose a country" />}
          </FormField>
          <FormField label="Work locations" name="locations" optional state={state} className="sm:col-span-2" hint="Cities, sites or projects.">
            <Input maxLength={500} />
          </FormField>
          <FormField label="Contract duration (months)" name="contractDurationMonths" optional state={state}>
            <Input type="number" inputMode="numeric" min={1} max={600} />
          </FormField>
          <FormField label="Needed by" name="joiningBy" optional state={state}>
            <Input type="date" />
          </FormField>
          <FormField label="Working hours" name="workingHours" optional state={state} className="sm:col-span-2">
            <Input maxLength={300} placeholder="For example: 10 hours a day, 6 days a week" />
          </FormField>
          <FormField label="Description" name="description" optional state={state} className="sm:col-span-2" hint="Project background, site conditions or anything else candidates should know.">
            <Textarea rows={5} maxLength={10000} />
          </FormField>
        </div>
      </Group>

      <Group id="req-roles" title="Roles and positions" description="Add one line per role or trade. Salaries are optional; when you give one, choose its currency and period.">
        <div className="space-y-4">
          {lines.map((line, index) => (
            <RequirementLineFields
              key={line.key}
              line={line}
              index={index}
              total={lines.length}
              errors={lineErrors(fieldErrors, lines, line.key)}
              currencies={options.currencies}
              onChange={(patch) => updateLine(line.key, patch)}
              onRemove={() => removeLine(line.key)}
            />
          ))}
        </div>
        {linesError ? (
          <p className="mt-3 text-sm font-medium text-danger-strong" role="alert" data-field-name="lines">
            {linesError}
          </p>
        ) : null}
        <Button type="button" variant="outline" onClick={addLine} disabled={lines.length >= MAX_REQUIREMENT_LINES} className="mt-4">
          <Plus aria-hidden="true" />
          Add another role
        </Button>
        <p className="sr-only" aria-live="polite">
          {lines.length} {lines.length === 1 ? "role" : "roles"} in this requirement
        </p>
      </Group>

      <Group id="req-selection" title="Selection and documentation">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Interview method" name="interviewMethod" optional state={state}>
            {(field) => <SimpleSelect {...field} options={options.interviewMethods} allowClear placeholder="Choose a method" />}
          </FormField>
          <FormField label="Language requirements" name="languageRequirements" optional state={state}>
            <Input maxLength={500} placeholder="For example: basic English" />
          </FormField>
          <FormField label="Interview details" name="interviewDetails" optional state={state} className="sm:col-span-2">
            <Textarea rows={2} maxLength={2000} />
          </FormField>
          <div className="sm:col-span-2">
            <Check name="assessmentRequired" label="Candidates need a trade test or skill assessment" checked={assessment} onChange={setAssessment} />
            <p className="mt-1.5 pl-8 text-xs text-muted-foreground">Trade tests linked to a requirement are paid by the employer or Venkat Sai — never by candidates.</p>
          </div>
          {assessment ? (
            <FormField label="Assessment details" name="assessmentDetails" optional state={state} className="sm:col-span-2">
              <Textarea rows={2} maxLength={2000} placeholder="Test standard, position, material or location" />
            </FormField>
          ) : null}
          <FormField label="Documentation requirements" name="documentationRequirements" optional state={state} className="sm:col-span-2">
            <Textarea rows={2} maxLength={2000} placeholder="For example: passport validity, experience certificates" />
          </FormField>
        </div>
      </Group>

      <Group id="req-benefits" title="Benefits">
        <fieldset>
          <legend className="sr-only">Facilities provided</legend>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Check name="accommodationProvided" label="Accommodation provided" />
            <Check name="foodProvided" label="Food provided" />
            <Check name="transportProvided" label="Transport provided" />
          </div>
        </fieldset>
        <FormField label="Other benefits" name="benefits" optional state={state} className="mt-5" hint="Press Enter after each benefit, for example: annual leave ticket, medical insurance.">
          {(field) => <TagInput {...field} name="benefits" maxTags={20} maxLength={80} placeholder="Type a benefit and press Enter" />}
        </FormField>
      </Group>

      <Group id="req-contact" title="Contact person" description="We use these details only to discuss this requirement. Give an email address, a phone number or both.">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Company name" name="organizationName" required state={state} className="sm:col-span-2">
            <Input autoComplete="organization" maxLength={200} />
          </FormField>
          <FormField label="Contact person" name="contactName" required state={state}>
            <Input autoComplete="name" maxLength={120} />
          </FormField>
          <FormField label="Designation" name="contactDesignation" optional state={state}>
            <Input autoComplete="organization-title" maxLength={120} />
          </FormField>
          <FormField label="Email" name="contactEmail" state={state}>
            <Input type="email" autoComplete="email" inputMode="email" maxLength={254} />
          </FormField>
          <FormField label="Phone" name="contactPhone" state={state} hint="Include the country code.">
            <Input type="tel" autoComplete="tel" inputMode="tel" maxLength={20} />
          </FormField>
        </div>
      </Group>

      <div className="border-t border-border pt-8">
        <ConsentCheckbox state={state} label="I agree that Venkat Sai may contact me about this requirement." />
        <SubmitButton pending={pending} pendingLabel="Submitting…" className="mt-6 w-full sm:w-auto" data-testid="requirement-submit">
          Submit requirement
        </SubmitButton>
      </div>
    </form>
  );
}
