"use client";

import { useT } from "@/i18n/client";
import { forgotPasswordAction, resetPasswordWithCodeAction, resetPasswordWithTokenAction } from "@/modules/identity/actions";

import { ResendCodeButton } from "./code-forms";
import { fieldErrors, FormAlert, OtpField, PasswordField, SubmitButton, TextField, useFormAction } from "./form-kit";

/** /forgot-password: email (link) or phone (SMS code). */
export function ForgotPasswordForm({ phoneAllowed }: { phoneAllowed: boolean }) {
  const t = useT("auth");
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(forgotPasswordAction);
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert state={state} />
      <TextField
        id="forgot-identifier"
        name="identifier"
        type={phoneAllowed ? "text" : "email"}
        label={phoneAllowed ? t("fields.identifier") : t("fields.email")}
        hint={phoneAllowed ? t("fields.identifierHint") : undefined}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        errors={fieldErrors(state, "identifier")}
      />
      <SubmitButton pending={pending}>{t("forgot.submit")}</SubmitButton>
    </form>
  );
}

function NewPasswordFields({ state, minPasswordLength }: { state: Parameters<typeof fieldErrors>[0]; minPasswordLength: number }) {
  const t = useT("auth");
  return (
    <>
      <PasswordField
        id="reset-new-password"
        name="newPassword"
        label={t("fields.newPassword")}
        hint={t("fields.newPasswordHint", { min: minPasswordLength })}
        autoComplete="new-password"
        required
        errors={fieldErrors(state, "newPassword")}
      />
      <PasswordField
        id="reset-confirm-password"
        name="confirmPassword"
        label={t("fields.confirmPassword")}
        autoComplete="new-password"
        required
        errors={fieldErrors(state, "confirmPassword")}
      />
    </>
  );
}

/** /reset-password?token=… */
export function ResetWithTokenForm({ token, minPasswordLength }: { token: string; minPasswordLength: number }) {
  const t = useT("auth");
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(resetPasswordWithTokenAction);
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert state={state} />
      <input type="hidden" name="token" value={token} />
      <NewPasswordFields state={state} minPasswordLength={minPasswordLength} />
      <SubmitButton pending={pending}>{t("reset.submit")}</SubmitButton>
    </form>
  );
}

/** /reset-password after an SMS code was requested. */
export function ResetWithCodeForm({
  resendAvailableAt,
  initiallyCooling,
  minPasswordLength,
}: {
  resendAvailableAt: number;
  initiallyCooling: boolean;
  minPasswordLength: number;
}) {
  const t = useT("auth");
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(resetPasswordWithCodeAction);
  return (
    <div className="space-y-4">
      <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert state={state} />
        <OtpField id="reset-code" label={t("fields.code")} hint={t("verify.codeHint")} autoFocus errors={fieldErrors(state, "code")} />
        <NewPasswordFields state={state} minPasswordLength={minPasswordLength} />
        <SubmitButton pending={pending}>{t("reset.submit")}</SubmitButton>
      </form>
      <ResendCodeButton availableAt={resendAvailableAt} initiallyCooling={initiallyCooling} flow="reset" />
    </div>
  );
}
