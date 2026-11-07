"use client";

import { fieldErrors, FormAlert, SelectField, SubmitButton, TextField, useFormAction } from "@/app/(auth)/_components/form-kit";
import { LOCALE_LABELS, LOCALES } from "@/i18n/config";
import { useT } from "@/i18n/client";
import { updateAccountBasicsAction } from "@/modules/identity/actions";

/** /account: name, language and time zone. */
export function ProfileForm({
  displayName,
  locale,
  timezone,
  timezones,
  defaultTimezone,
}: {
  displayName: string;
  locale: string;
  timezone: string | null;
  timezones: string[];
  defaultTimezone: string;
}) {
  const t = useT("auth");
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(updateAccountBasicsAction);
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert state={state} />
      <TextField
        id="profile-name"
        name="displayName"
        label={t("fields.displayName")}
        hint={t("account.profile.nameHint")}
        defaultValue={displayName}
        autoComplete="name"
        required
        errors={fieldErrors(state, "displayName")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="profile-locale"
          name="locale"
          label={t("account.profile.language")}
          defaultValue={locale}
          errors={fieldErrors(state, "locale")}
          options={LOCALES.map((value) => ({
            value,
            lang: value,
            label: value === "en" ? LOCALE_LABELS[value].label : `${LOCALE_LABELS[value].label} (${LOCALE_LABELS[value].english})`,
          }))}
        />
        <SelectField
          id="profile-timezone"
          name="timezone"
          label={t("account.profile.timezone")}
          hint={t("account.profile.timezoneHint")}
          defaultValue={timezone ?? ""}
          errors={fieldErrors(state, "timezone")}
          options={[
            { value: "", label: t("account.profile.timezoneDefault", { zone: defaultTimezone.replace(/_/g, " ") }) },
            ...timezones.map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") })),
          ]}
        />
      </div>
      <SubmitButton pending={pending} className="w-full sm:w-auto">
        {t("account.profile.save")}
      </SubmitButton>
    </form>
  );
}
