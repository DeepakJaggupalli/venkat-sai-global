"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { FileUpload } from "@/components/files";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import { CountrySelect, CurrencySelect, SimpleSelect } from "@/components/shared/selects";
import { SkillPicker } from "@/components/shared/skill-picker";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Input } from "@/components/ui/input";
import type { ActionResult, ActionState } from "@/lib/actions";
import { track } from "@/modules/analytics/client";
import type { FileSummary } from "@/modules/files/types";

import { CheckboxField, CheckboxGroup, FieldGrid, RadioCards } from "../fields";
import { enumOptions } from "../labels";
import { useTalentForm, useTalentMessages } from "../use-talent-action";
import type { OnboardingGoal, OnboardingStep } from "./steps";

type FormAction = (prev: ActionState<undefined>, formData: FormData) => Promise<ActionResult<undefined>>;

/** Records one analytics event when rendered (never for children: pass enabled=false). */
export function TrackOnce({ enabled, event, form }: { enabled: boolean; event: "form_started" | "form_submitted" | "profile_completed"; form: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (!enabled || done.current) return;
    done.current = true;
    track(event, { form });
  }, [enabled, event, form]);
  return null;
}

function StepActions({ skip, children }: { skip?: ReactNode; children: ReactNode }) {
  return <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">{skip ?? <span />}{children}</div>;
}

/** "Skip for now" — a separate form so it never submits the step's fields. */
export function SkipStepButton({ action, step }: { action: FormAction; step: OnboardingStep }) {
  const { t } = useTalentMessages();
  const [state, formAction] = useTalentForm(action);
  return (
    <form action={formAction}>
      <input type="hidden" name="step" value={step} />
      <SubmitButton variant="ghost" pendingLabel={t("form.saving")}>
        {t("onboarding.skip")}
      </SubmitButton>
      {state && !state.ok ? (
        <p role="alert" className="mt-1 text-sm text-danger-strong">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function GoalsForm({ action, goals, allowed, minor, skip }: { action: FormAction; goals: OnboardingGoal[]; allowed: readonly OnboardingGoal[]; minor: boolean; skip: ReactNode }) {
  const { t } = useTalentMessages();
  const [state, formAction] = useTalentForm(action);
  return (
    <form action={formAction} className="space-y-6" noValidate data-testid="onboarding-goals">
      <FormErrorAlert state={state} />
      <CheckboxGroup
        name="goals"
        legend={t("onboarding.goals.legend")}
        hint={t("onboarding.goals.hint")}
        state={state}
        defaultValue={goals}
        options={allowed.map((goal) => ({ value: goal, label: t(`onboarding.goal.${goal}`), hint: t(`onboarding.goal.${goal}.hint`) }))}
      />
      {minor ? <p className="text-sm text-muted-foreground">{t("onboarding.goals.minorNote")}</p> : null}
      <StepActions skip={skip}>
        <SubmitButton pendingLabel={t("form.saving")}>{t("onboarding.saveContinue")}</SubmitButton>
      </StepActions>
    </form>
  );
}

export type BasicsDefaults = {
  currentCountryCode: string | null;
  stateRegion: string | null;
  city: string | null;
  experienceLevel: string | null;
  preferredCategories: SelectOption[];
  preferredRoles: string[];
};

export function BasicsForm({ action, defaults, countries, categories, skip }: { action: FormAction; defaults: BasicsDefaults; countries: SelectOption[]; categories: SelectOption[]; skip: ReactNode }) {
  const { t } = useTalentMessages();
  const [state, formAction] = useTalentForm(action);
  return (
    <form action={formAction} className="space-y-5" noValidate data-testid="onboarding-basics">
      <FormErrorAlert state={state} />
      <FieldGrid>
        <FormField label={t("field.country")} name="currentCountryCode" state={state}>
          {(field) => <CountrySelect {...field} options={countries} defaultValue={defaults.currentCountryCode ?? undefined} placeholder={t("form.selectCountry")} />}
        </FormField>
        <FormField label={t("field.state")} name="stateRegion" state={state}>
          <Input defaultValue={defaults.stateRegion ?? ""} maxLength={120} autoComplete="address-level1" />
        </FormField>
        <FormField label={t("field.city")} name="city" state={state}>
          <Input defaultValue={defaults.city ?? ""} maxLength={120} autoComplete="address-level2" />
        </FormField>
        <FormField label={t("field.experienceLevel")} name="experienceLevel" state={state}>
          {(field) => <SimpleSelect {...field} options={enumOptions(t, "experienceLevel")} defaultValue={defaults.experienceLevel ?? undefined} placeholder={t("form.select")} allowClear clearLabel={t("form.notSet")} />}
        </FormField>
      </FieldGrid>
      <FormField label={t("field.preferredCategories")} name="preferredCategoryIds" state={state} hint={t("field.preferredCategories.hint")}>
        {(field) => (
          <MultiCombobox
            {...field}
            options={categories}
            defaultValue={defaults.preferredCategories}
            maxSelected={10}
            placeholder={t("form.selectCategories")}
            searchPlaceholder={t("form.search")}
            emptyText={t("form.noMatches")}
          />
        )}
      </FormField>
      <FormField label={t("field.preferredRoles")} name="preferredRoles" state={state} hint={t("field.preferredRoles.hint")}>
        {(field) => <TagInput {...field} defaultValue={defaults.preferredRoles} maxTags={10} maxLength={80} placeholder={t("field.preferredRoles.placeholder")} />}
      </FormField>
      <StepActions skip={skip}>
        <SubmitButton pendingLabel={t("form.saving")}>{t("onboarding.saveContinue")}</SubmitButton>
      </StepActions>
    </form>
  );
}

export function SkillsStepForm({ action, skills, skip }: { action: FormAction; skills: SelectOption[]; skip: ReactNode }) {
  const { t } = useTalentMessages();
  const [state, formAction] = useTalentForm(action);
  return (
    <form action={formAction} className="space-y-5" noValidate data-testid="onboarding-skills">
      <FormErrorAlert state={state} />
      <FormField label={t("field.skills")} name="skillIds" state={state} hint={t("onboarding.skills.hint")}>
        {(field) => (
          <SkillPicker {...field} defaultValue={skills} maxSelected={50} placeholder={t("form.selectSkills")} searchPlaceholder={t("form.searchSkills")} emptyText={t("form.noMatches")} />
        )}
      </FormField>
      <p className="text-sm text-muted-foreground">{t("onboarding.skills.later")}</p>
      <StepActions skip={skip}>
        <SubmitButton pendingLabel={t("form.saving")}>{t("onboarding.saveContinue")}</SubmitButton>
      </StepActions>
    </form>
  );
}

export type AvailabilityDefaults = {
  availability: string | null;
  desiredEmploymentTypes: string[];
  preferredWorkModes: string[];
  willingToRelocate: boolean;
  openToOverseas: boolean;
  expectedSalaryAmount: number | null;
  expectedSalaryCurrency: string | null;
  expectedSalaryPeriod: string | null;
};

export function AvailabilityForm({
  action,
  defaults,
  currencies,
  minor,
  skip,
}: {
  action: FormAction;
  defaults: AvailabilityDefaults;
  currencies: SelectOption[];
  minor: boolean;
  skip: ReactNode;
}) {
  const { t } = useTalentMessages();
  const [state, formAction] = useTalentForm(action);
  return (
    <form action={formAction} className="space-y-6" noValidate data-testid="onboarding-availability">
      <FormErrorAlert state={state} />
      <FormField label={t("field.availability")} name="availability" state={state}>
        {(field) => <SimpleSelect {...field} options={enumOptions(t, "availability")} defaultValue={defaults.availability ?? undefined} placeholder={t("form.select")} allowClear clearLabel={t("form.notSet")} />}
      </FormField>
      <CheckboxGroup name="desiredEmploymentTypes" legend={t("field.employmentTypes")} options={enumOptions(t, "employmentType")} defaultValue={defaults.desiredEmploymentTypes} state={state} columns={3} />
      <CheckboxGroup name="preferredWorkModes" legend={t("field.workModes")} options={enumOptions(t, "workMode")} defaultValue={defaults.preferredWorkModes} state={state} columns={3} />
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("field.expectedSalary")}</legend>
        <p className="text-sm text-muted-foreground">{t("field.expectedSalary.hint")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={t("field.amount")} name="expectedSalaryAmount" state={state}>
            <Input type="number" inputMode="decimal" min={0} step="any" defaultValue={defaults.expectedSalaryAmount ?? undefined} />
          </FormField>
          <FormField label={t("field.currency")} name="expectedSalaryCurrency" state={state}>
            {(field) => <CurrencySelect {...field} options={currencies} defaultValue={defaults.expectedSalaryCurrency ?? undefined} placeholder={t("form.selectCurrency")} />}
          </FormField>
          <FormField label={t("field.period")} name="expectedSalaryPeriod" state={state}>
            {(field) => <SimpleSelect {...field} options={enumOptions(t, "salaryPeriod")} defaultValue={defaults.expectedSalaryPeriod ?? undefined} placeholder={t("form.select")} />}
          </FormField>
        </div>
      </fieldset>
      <div className="space-y-3">
        <CheckboxField name="willingToRelocate" defaultChecked={defaults.willingToRelocate} label={t("field.willingToRelocate")} />
        {minor ? (
          <p className="text-sm text-muted-foreground">{t("profile.overseasMinor")}</p>
        ) : (
          <CheckboxField name="openToOverseas" defaultChecked={defaults.openToOverseas} label={t("field.openToOverseas")} hint={t("field.openToOverseas.hint")} />
        )}
      </div>
      <StepActions skip={skip}>
        <SubmitButton pendingLabel={t("form.saving")}>{t("onboarding.saveContinue")}</SubmitButton>
      </StepActions>
    </form>
  );
}

export function ResumeStepForm({ action, resume, skip }: { action: FormAction; resume: FileSummary | null; skip: ReactNode }) {
  const { t } = useTalentMessages();
  const [state, formAction] = useTalentForm(action);
  return (
    <form action={formAction} className="space-y-5" noValidate data-testid="onboarding-resume">
      <FormErrorAlert state={state} />
      <FileUpload purpose="resume" name="fileId" label={t("field.resume")} description={t("onboarding.resume.hint")} defaultFiles={resume ? [resume] : []} />
      <p className="text-sm text-muted-foreground">{t("onboarding.resume.optional")}</p>
      <StepActions skip={skip}>
        <SubmitButton pendingLabel={t("form.saving")}>{t("onboarding.saveContinue")}</SubmitButton>
      </StepActions>
    </form>
  );
}

export function VisibilityStepForm({
  action,
  visibility,
  isOpenToWork,
  skip,
}: {
  action: FormAction;
  visibility: string;
  isOpenToWork: boolean;
  skip: ReactNode;
}) {
  const { t } = useTalentMessages();
  const [state, formAction] = useTalentForm(action);
  return (
    <form action={formAction} className="space-y-6" noValidate data-testid="onboarding-visibility">
      <FormErrorAlert state={state} />
      <RadioCards
        name="visibility"
        legend={t("field.visibility")}
        hint={t("onboarding.visibility.hint")}
        state={state}
        defaultValue={visibility}
        options={enumOptions(t, "visibility").map((o) => ({ ...o, hint: t(`enum.visibility.${o.value}.hint`) }))}
      />
      <CheckboxField name="isOpenToWork" defaultChecked={isOpenToWork} label={t("field.openToWork")} hint={t("field.openToWork.hint")} />
      <p className="text-sm text-muted-foreground">{t("onboarding.visibility.contactNote")}</p>
      <StepActions skip={skip}>
        <SubmitButton pendingLabel={t("form.saving")}>{t("onboarding.finish")}</SubmitButton>
      </StepActions>
    </form>
  );
}
