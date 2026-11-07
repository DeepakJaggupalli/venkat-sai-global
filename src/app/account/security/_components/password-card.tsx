"use client";

import { fieldErrors, FormAlert, PasswordField, SubmitButton, useFormAction, useOnSuccess } from "@/app/(auth)/_components/form-kit";
import { useT } from "@/i18n/client";
import { changePasswordAction } from "@/modules/identity/actions";

/** Change the password (current one required) or set a first password. */
export function PasswordCard({ hasPassword, minPasswordLength }: { hasPassword: boolean; minPasswordLength: number }) {
  const t = useT("auth");
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(changePasswordAction);
  useOnSuccess(state, () => formRef.current?.reset());

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert state={state} />
      {hasPassword ? (
        <PasswordField
          id="password-current"
          name="currentPassword"
          label={t("fields.currentPassword")}
          autoComplete="current-password"
          required
          errors={fieldErrors(state, "currentPassword")}
        />
      ) : null}
      <PasswordField
        id="password-new"
        name="newPassword"
        label={t("fields.newPassword")}
        hint={t("fields.newPasswordHint", { min: minPasswordLength })}
        autoComplete="new-password"
        required
        errors={fieldErrors(state, "newPassword")}
      />
      <PasswordField
        id="password-confirm"
        name="confirmPassword"
        label={t("fields.confirmPassword")}
        autoComplete="new-password"
        required
        errors={fieldErrors(state, "confirmPassword")}
      />
      <p className="text-xs text-muted-foreground">{t("security.password.othersNote")}</p>
      <SubmitButton pending={pending} className="w-full sm:w-auto">
        {hasPassword ? t("security.password.change") : t("security.password.set")}
      </SubmitButton>
    </form>
  );
}
