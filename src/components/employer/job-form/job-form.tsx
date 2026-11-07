"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Callout } from "@/components/shared/callout";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { RichTextEditor } from "@/components/shared/rich-text/rich-text-editor";
import { CountrySelect, CurrencySelect, SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { track } from "@/modules/analytics/client";
import { saveEmployerJobAction, submitJobAction } from "@/modules/jobs/actions";

import { employmentTypeOptions, experienceLevelOptions, salaryPeriodOptions, triStateOptions, visaOptions, workModeOptions } from "../labels";
import { useEmployerForm } from "../use-form-action";
import { LocationsEditor, SkillsEditor, type LocationDraft, type SkillDraft } from "./list-editors";
import { listErrors, type ScreeningDraft } from "./screening";
import { ScreeningBuilder } from "./screening-builder";

export type JobFormDefaults = {
  title?: string;
  summary?: string;
  descriptionHtml?: string;
  responsibilities?: string;
  qualificationsText?: string;
  jobCategoryId?: string;
  industryId?: string;
  employmentType?: string;
  workMode?: string;
  experienceLevel?: string;
  experienceMinYears?: string;
  experienceMaxYears?: string;
  minEducationLevelId?: string;
  openings?: string;
  salaryMin?: string;
  salaryMax?: string;
  salaryCurrency?: string;
  salaryPeriod?: string;
  salaryVisible?: boolean;
  benefits?: string[];
  countryCode?: string;
  stateRegion?: string;
  city?: string;
  visaSponsorship?: string;
  sponsorshipDetails?: string;
  accommodationProvided?: string;
  foodProvided?: string;
  transportProvided?: string;
  contractDurationMonths?: string;
  workingHours?: string;
  recruitmentProcess?: string;
  applicationDeadline?: string;
  expiresAt?: string;
  startDate?: string;
  applyMode?: string;
  externalApplyUrl?: string;
  screeningRequired?: boolean;
  isConfidential?: boolean;
  confidentialEmployerName?: string;
  employerReference?: string;
  skills?: SkillDraft[];
  locations?: LocationDraft[];
  screeningQuestions?: ScreeningDraft[];
};

export type JobFormSubmitGate = {
  /** Status allows submitting for review (draft / changes requested / rejected / new). */
  statusAllowsSubmit: boolean;
  /** Organisation verified and posting enabled. */
  allowed: boolean;
  /** Why submitting is blocked (verification, posting disabled). */
  blockReason?: string | null;
  /** Plan limit reached: upgrade prompt text. */
  upgradeReason?: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Job title",
  summary: "Summary",
  descriptionHtml: "Description",
  employmentType: "Employment type",
  workMode: "Work mode",
  experienceMaxYears: "Maximum experience",
  openings: "Openings",
  salaryMin: "Minimum salary",
  salaryMax: "Maximum salary",
  salaryCurrency: "Salary currency",
  salaryPeriod: "Pay period",
  countryCode: "Country",
  sponsorshipDetails: "Sponsorship details",
  applicationDeadline: "Application deadline",
  expiresAt: "Listing end date",
  startDate: "Start date",
  externalApplyUrl: "Application link",
  confidentialEmployerName: "Employer description",
  skills: "Skills",
  locations: "Additional locations",
  screeningQuestions: "Screening questions",
};

function Section({ title, description, children, id }: { title: string; description?: string; children: React.ReactNode; id?: string }) {
  return (
    <fieldset id={id} className="space-y-4 rounded-xl border border-border bg-background p-5 sm:p-6">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden="true">
        <p className="font-heading text-lg font-semibold text-navy">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </fieldset>
  );
}

export function JobForm({
  jobId,
  isLive = false,
  defaults,
  options,
  gate,
  homeCountryCode,
}: {
  jobId?: string;
  isLive?: boolean;
  defaults: JobFormDefaults;
  options: { countries: SelectOption[]; currencies: SelectOption[]; categories: SelectOption[]; industries: SelectOption[]; educationLevels: SelectOption[] };
  gate: JobFormSubmitGate;
  homeCountryCode: string;
}) {
  const router = useRouter();
  const { state, pending, onSubmit } = useEmployerForm(saveEmployerJobAction);
  const intent = useRef<"draft" | "submit">("draft");
  const handled = useRef(state);
  const started = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clicked, setClicked] = useState<"draft" | "submit">("draft");
  const [workMode, setWorkMode] = useState(defaults.workMode ?? "on_site");
  const [countryCode, setCountryCode] = useState(defaults.countryCode ?? "");
  const [visa, setVisa] = useState(defaults.visaSponsorship ?? "not_applicable");
  const [applyMode, setApplyMode] = useState(defaults.applyMode ?? "platform");
  const [confidential, setConfidential] = useState(Boolean(defaults.isConfidential));
  useActionToast(state);

  const canSubmit = gate.statusAllowsSubmit && gate.allowed && !gate.upgradeReason;
  const fe = state?.ok === false ? state.fieldErrors : undefined;
  const isOverseas = Boolean(countryCode) && countryCode !== homeCountryCode;

  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (!state?.ok) return;
    const id = (state.data as { id?: string } | undefined)?.id ?? jobId;
    if (!id) return;
    track("form_submitted", { formId: "employer_job" });
    if (intent.current === "submit" && canSubmit) {
      setSubmitting(true);
      void submitJobAction({ id, portal: "employer" }).then((result) => {
        setSubmitting(false);
        if (result.ok) {
          toast.success(result.message ?? "Sent for review");
          router.push(`/employer/jobs/${id}`);
        } else {
          setSubmitError(result.error);
          toast.error(result.error);
          if (!jobId) router.push(`/employer/jobs/${id}`);
        }
      });
      return;
    }
    if (!jobId) router.push(`/employer/jobs/${id}`);
    else router.refresh();
  }, [state, jobId, canSubmit, router]);

  return (
    <form
      onSubmit={onSubmit}
      onFocus={() => {
        if (started.current) return;
        started.current = true;
        track("form_started", { formId: "employer_job" });
      }}
      noValidate
      className="space-y-6"
    >
      {jobId ? <input type="hidden" name="id" value={jobId} /> : null}
      <FormErrorAlert state={state} fieldLabels={FIELD_LABELS} />
      {submitError ? (
        <Callout tone="danger" title="The job was saved but could not be sent for review" live="assertive">
          {submitError}
        </Callout>
      ) : null}
      {isLive ? (
        <Callout tone="info" title="This job is live">
          Changes to what candidates read (title, description, salary, location, skills or questions) send it back to Venkat Sai for review, and it is hidden until approved.
          Openings, deadline and start date change immediately.
        </Callout>
      ) : null}

      <Section title="Basics" description="What the role is and who it suits">
        <FormField label="Job title" name="title" required state={state} hint="For example Pipe welder (6G, TIG/ARC).">
          <Input defaultValue={defaults.title} maxLength={150} />
        </FormField>
        <FormField label="Summary" name="summary" optional state={state} hint="One or two lines shown on job cards (up to 300 characters).">
          <Textarea defaultValue={defaults.summary} maxLength={300} rows={2} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Job category" name="jobCategoryId" optional state={state}>
            <SearchableSelect options={options.categories} defaultValue={defaults.jobCategoryId} placeholder="Choose a category" allowClear />
          </FormField>
          <FormField label="Industry" name="industryId" optional state={state}>
            <SearchableSelect options={options.industries} defaultValue={defaults.industryId} placeholder="Choose an industry" allowClear />
          </FormField>
          <FormField label="Employment type" name="employmentType" required state={state}>
            <SimpleSelect options={employmentTypeOptions} defaultValue={defaults.employmentType ?? "full_time"} />
          </FormField>
          <FormField label="Work mode" name="workMode" required state={state}>
            <SimpleSelect options={workModeOptions} value={workMode} onValueChange={setWorkMode} />
          </FormField>
          <FormField label="Experience level" name="experienceLevel" optional state={state}>
            <SimpleSelect options={experienceLevelOptions} defaultValue={defaults.experienceLevel} placeholder="Choose a level" allowClear />
          </FormField>
          <FormField label="Minimum education" name="minEducationLevelId" optional state={state}>
            <SimpleSelect options={options.educationLevels} defaultValue={defaults.minEducationLevelId} placeholder="No requirement" allowClear clearLabel="No requirement" />
          </FormField>
          <FormField label="Minimum experience (years)" name="experienceMinYears" optional state={state}>
            <Input type="number" inputMode="numeric" min={0} max={50} defaultValue={defaults.experienceMinYears} />
          </FormField>
          <FormField label="Maximum experience (years)" name="experienceMaxYears" optional state={state}>
            <Input type="number" inputMode="numeric" min={0} max={50} defaultValue={defaults.experienceMaxYears} />
          </FormField>
          <FormField label="Openings" name="openings" required state={state}>
            <Input type="number" inputMode="numeric" min={1} defaultValue={defaults.openings ?? "1"} />
          </FormField>
          <FormField label="Your reference" name="employerReference" optional state={state} hint="Internal code, not shown to candidates.">
            <Input defaultValue={defaults.employerReference} maxLength={80} />
          </FormField>
        </div>
      </Section>

      <Section title="Description" description="Write it for the candidate: the work, the site and what success looks like">
        <FormField label="Job description" name="descriptionHtml" state={state} hint="Required before you submit, unless you wrote a summary.">
          {(field) => <RichTextEditor {...field} name="descriptionHtml" defaultValue={defaults.descriptionHtml ?? ""} maxLength={20000} toolbarLabel="Job description formatting" />}
        </FormField>
        <FormField label="Responsibilities" name="responsibilities" optional state={state}>
          <Textarea defaultValue={defaults.responsibilities} rows={4} maxLength={5000} />
        </FormField>
        <FormField label="Qualifications and certifications" name="qualificationsText" optional state={state}>
          <Textarea defaultValue={defaults.qualificationsText} rows={3} maxLength={5000} />
        </FormField>
        <FormField label="Recruitment process" name="recruitmentProcess" optional state={state} hint="For example screening call, trade test, client interview. Candidates are never charged for any step.">
          <Textarea defaultValue={defaults.recruitmentProcess} rows={3} maxLength={3000} />
        </FormField>
      </Section>

      <Section title="Skills" description="Choose from the skills list so candidates and search can match them">
        <p id="job-skills-label" className="sr-only">
          Skills
        </p>
        <SkillsEditor defaultSkills={defaults.skills ?? []} errors={listErrors(fe, "skills").map((e) => e.message)} labelledBy="job-skills-label" />
      </Section>

      <Section title="Location" description={workMode === "remote" ? "Remote jobs may leave the country empty" : "Where the work happens"}>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Country" name="countryCode" required={workMode !== "remote"} state={state}>
            {(field) => <CountrySelect {...field} options={options.countries} value={countryCode} onValueChange={setCountryCode} placeholder="Choose a country" allowClear={workMode === "remote"} />}
          </FormField>
          <FormField label="State / region" name="stateRegion" optional state={state}>
            <Input defaultValue={defaults.stateRegion} maxLength={120} />
          </FormField>
          <FormField label="City" name="city" optional state={state}>
            <Input defaultValue={defaults.city} maxLength={120} />
          </FormField>
        </div>
        {isOverseas ? (
          <Callout tone="info" title="Overseas job">
            Jobs outside {homeCountryCode} are marked overseas. Venkat Sai checks overseas jobs before they go live and shows the recruiting agent&apos;s registration where it
            applies. Candidates under 18 are never matched to overseas jobs.
          </Callout>
        ) : null}
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Additional locations</p>
          <LocationsEditor defaultLocations={defaults.locations ?? []} countries={options.countries} errors={listErrors(fe, "locations").map((e) => e.message)} />
        </div>
      </Section>

      <Section title="Salary and benefits" description="Jobs with a visible salary get more relevant applications">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Minimum salary" name="salaryMin" optional state={state}>
            <Input type="number" inputMode="decimal" min={0} step="0.01" defaultValue={defaults.salaryMin} />
          </FormField>
          <FormField label="Maximum salary" name="salaryMax" optional state={state}>
            <Input type="number" inputMode="decimal" min={0} step="0.01" defaultValue={defaults.salaryMax} />
          </FormField>
          <FormField label="Currency" name="salaryCurrency" optional state={state}>
            {(field) => <CurrencySelect {...field} options={options.currencies} defaultValue={defaults.salaryCurrency} placeholder="Choose" allowClear />}
          </FormField>
          <FormField label="Pay period" name="salaryPeriod" optional state={state}>
            <SimpleSelect options={salaryPeriodOptions} defaultValue={defaults.salaryPeriod} placeholder="Choose" allowClear />
          </FormField>
        </div>
        <div className="flex items-start gap-2">
          <input
            id="salaryVisible"
            type="checkbox"
            name="salaryVisible"
            value="true"
            defaultChecked={defaults.salaryVisible ?? true}
            className="mt-1 size-4 accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <label htmlFor="salaryVisible" className="text-sm leading-6">
            Show the salary to candidates
          </label>
        </div>
        <FormField label="Benefits" name="benefits" optional state={state} hint="Only list what you provide, for example Air ticket, Medical insurance. Press Enter after each.">
          {(field) => <TagInput {...field} name="benefits" defaultValue={defaults.benefits ?? []} maxTags={20} maxLength={100} placeholder="Add a benefit" />}
        </FormField>
      </Section>

      <Section title="Visa, contract and living conditions" description="Be explicit. Leave a field as “Not stated” rather than guessing">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Visa sponsorship" name="visaSponsorship" state={state}>
            <SimpleSelect options={visaOptions} value={visa} onValueChange={setVisa} />
          </FormField>
          <FormField label="Contract duration (months)" name="contractDurationMonths" optional state={state}>
            <Input type="number" inputMode="numeric" min={1} max={120} defaultValue={defaults.contractDurationMonths} />
          </FormField>
        </div>
        {visa === "provided" ? (
          <FormField label="Sponsorship details" name="sponsorshipDetails" optional state={state} hint="Visa type, who pays and what is covered. Candidates must never pay for a visa as a condition of the job.">
            <Textarea defaultValue={defaults.sponsorshipDetails} rows={3} maxLength={1000} />
          </FormField>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["accommodationProvided", "Accommodation provided"],
              ["foodProvided", "Food provided"],
              ["transportProvided", "Transport provided"],
            ] as const
          ).map(([name, label]) => (
            <FormField key={name} label={label} name={name} optional state={state}>
              <SimpleSelect options={triStateOptions} defaultValue={defaults[name] || undefined} placeholder="Not stated" allowClear clearLabel="Not stated" />
            </FormField>
          ))}
        </div>
        <FormField label="Working hours" name="workingHours" optional state={state} hint="For example 8 hours a day, 6 days a week, overtime as per local law.">
          <Input defaultValue={defaults.workingHours} maxLength={200} />
        </FormField>
      </Section>

      <Section title="Dates" description="Deadlines mean the end of that day">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Application deadline" name="applicationDeadline" optional state={state}>
            <Input type="date" defaultValue={defaults.applicationDeadline} />
          </FormField>
          <FormField label="Listing end date" name="expiresAt" optional state={state} hint="Leave empty to use the standard listing period.">
            <Input type="date" defaultValue={defaults.expiresAt} />
          </FormField>
          <FormField label="Expected start date" name="startDate" optional state={state}>
            <Input type="date" defaultValue={defaults.startDate} />
          </FormField>
        </div>
      </Section>

      <Section title="How candidates apply" description="Applying is always free for candidates">
        <FormField label="Application method" name="applyMode" state={state}>
          <SimpleSelect
            options={[
              { value: "platform", label: "Apply on Venkat Sai Global (recommended)" },
              { value: "external_url", label: "Apply on our own website" },
            ]}
            value={applyMode}
            onValueChange={setApplyMode}
          />
        </FormField>
        {applyMode === "external_url" ? (
          <FormField label="Application link" name="externalApplyUrl" required state={state} hint="An https:// link. Screening questions and the pipeline only work for applications on Venkat Sai Global.">
            <Input type="url" inputMode="url" placeholder="https://" defaultValue={defaults.externalApplyUrl} maxLength={500} />
          </FormField>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Screening questions</p>
            <ScreeningBuilder defaultQuestions={defaults.screeningQuestions ?? []} defaultRequired={defaults.screeningRequired ?? false} errors={listErrors(fe, "screeningQuestions")} />
          </div>
        )}
      </Section>

      <Section title="Confidential posting" description="Hide your company name from candidates while hiring">
        <div className="flex items-start gap-2">
          <input
            id="isConfidential"
            type="checkbox"
            name="isConfidential"
            value="true"
            checked={confidential}
            onChange={(e) => setConfidential(e.target.checked)}
            className="mt-1 size-4 accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <label htmlFor="isConfidential" className="text-sm leading-6">
            Post confidentially (your name, logo and page are hidden from candidates)
          </label>
        </div>
        {confidential ? (
          <FormField label="Employer description shown instead" name="confidentialEmployerName" required state={state} hint="Describe without naming, for example “EPC contractor, Qatar”.">
            <Input defaultValue={defaults.confidentialEmployerName} maxLength={150} />
          </FormField>
        ) : null}
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-xl sm:border">
        {gate.statusAllowsSubmit && !canSubmit ? (
          <p className="mb-3 text-sm text-muted-foreground" id="submit-blocked-reason">
            {gate.blockReason ?? gate.upgradeReason}
            {!gate.blockReason && gate.upgradeReason ? (
              <>
                {" "}
                <a href="/employer/billing" className="font-medium text-teal-strong underline underline-offset-4">
                  View plans
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <SubmitButton
            variant="outline"
            pending={pending && clicked === "draft"}
            pendingLabel="Saving…"
            onClick={() => {
              intent.current = "draft";
              setClicked("draft");
            }}
            name="intent"
            value="draft"
          >
            {isLive ? "Save changes" : "Save draft"}
          </SubmitButton>
          {gate.statusAllowsSubmit ? (
            <SubmitButton
              pending={(pending && clicked === "submit") || submitting}
              pendingLabel="Submitting…"
              onClick={() => {
                intent.current = "submit";
                setClicked("submit");
              }}
              name="intent"
              value="submit"
              disabled={!canSubmit}
              aria-describedby={!canSubmit ? "submit-blocked-reason" : undefined}
            >
              Save and submit for review
            </SubmitButton>
          ) : null}
        </div>
      </div>
    </form>
  );
}
