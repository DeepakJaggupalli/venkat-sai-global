"use client";

import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { keepFormValues } from "@/components/shared/form/keep-values";
import { SimpleSelect } from "@/components/shared/selects";
import { Input } from "@/components/ui/input";
import type { ActionResult, ActionState } from "@/lib/actions";

import { CheckboxField } from "../fields";
import { useTalentForm, useTalentMessages } from "../use-talent-action";

type FormAction = (prev: ActionState<undefined>, formData: FormData) => Promise<ActionResult<undefined>>;

/** Step 0: date of birth (DPDP Rules 2025 age confirmation). */
export function DateOfBirthForm({ action, defaultValue, maxDate }: { action: FormAction; defaultValue?: string | null; maxDate: string }) {
  const { t } = useTalentMessages();
  const [state, formAction] = useTalentForm(action);
  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-5" noValidate data-testid="onboarding-dob-form">
      <FormErrorAlert state={state} />
      <FormField label={t("onboarding.age.dobLabel")} name="dateOfBirth" required state={state} hint={t("onboarding.age.dobHint")}>
        <Input type="date" max={maxDate} min="1900-01-01" defaultValue={defaultValue ?? undefined} autoComplete="bday" className="max-w-xs" />
      </FormField>
      <SubmitButton pendingLabel={t("form.saving")}>{t("onboarding.age.continue")}</SubmitButton>
    </form>
  );
}

/** Guardian consent for a candidate under 18 (recorded as consent purpose guardian_consent). */
export function GuardianConsentForm({ action }: { action: FormAction }) {
  const { t } = useTalentMessages();
  const [raw, formAction] = useTalentForm(action);
  // The action reports two rule failures by code word; show them in the candidate's language.
  const state: ActionState<undefined> =
    raw && !raw.ok && raw.fieldErrors
      ? {
          ...raw,
          fieldErrors: Object.fromEntries(
            Object.entries(raw.fieldErrors).map(([key, messages]) => [
              key,
              messages.map((m) => (m === "guardian_contact_required" ? t("onboarding.guardian.contactRequired") : m === "guardian_consent_required" ? t("onboarding.guardian.consentRequired") : m)),
            ]),
          ),
        }
      : raw;
  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-5" noValidate data-testid="onboarding-guardian-form">
      <FormErrorAlert state={state} />
      <FormField label={t("onboarding.guardian.name")} name="guardianName" required state={state}>
        <Input autoComplete="off" maxLength={150} />
      </FormField>
      <FormField label={t("onboarding.guardian.relationship")} name="relationship" required state={state}>
        {(field) => (
          <SimpleSelect
            {...field}
            placeholder={t("form.select")}
            options={[
              { value: "parent", label: t("onboarding.guardian.parent") },
              { value: "legal_guardian", label: t("onboarding.guardian.legalGuardian") },
            ]}
          />
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("onboarding.guardian.email")} name="guardianEmail" state={state} hint={t("onboarding.guardian.contactHint")}>
          <Input type="email" autoComplete="off" inputMode="email" />
        </FormField>
        <FormField label={t("onboarding.guardian.phone")} name="guardianPhone" state={state} hint={t("onboarding.guardian.phoneHint")}>
          <Input type="tel" autoComplete="off" inputMode="tel" />
        </FormField>
      </div>
      <div className="rounded-lg border bg-surface-subtle p-4">
        <CheckboxField name="consent" required state={state} label={t("onboarding.guardian.statement")} />
      </div>
      <SubmitButton pendingLabel={t("form.saving")}>{t("onboarding.guardian.submit")}</SubmitButton>
    </form>
  );
}
