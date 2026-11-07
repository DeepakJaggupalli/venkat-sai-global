"use client";

import { useActionState } from "react";

import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { intlLocale } from "@/components/training/training-rules";
import { VerificationResult } from "@/components/training/verification-result";
import { Input } from "@/components/ui/input";
import { useLocale, useT } from "@/i18n/client";
import { verifyCertificateAction } from "@/modules/training/candidate-actions";

/** Code lookup (rate-limited per network by the action). Shows only what is printed on the certificate. */
export function VerifyCertificateForm({ defaultCode }: { defaultCode?: string }) {
  const t = useT("talent-training");
  const locale = useLocale();
  const [state, formAction] = useActionState(verifyCertificateAction, null);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6" noValidate>
        <FormErrorAlert state={state} title={t("verify.formError")} />
        <FormField label={t("verify.codeLabel")} name="code" required state={state} hint={t("verify.codeHint")}>
          <Input
            defaultValue={defaultCode}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={32}
            placeholder="XXXX-XXXX-XXXX"
            className="font-mono uppercase sm:max-w-xs"
          />
        </FormField>
        <SubmitButton pendingLabel={t("verify.checking")}>{t("verify.submit")}</SubmitButton>
      </form>
      <div aria-live="polite">{state?.ok && state.data ? <VerificationResult t={t} result={state.data} fmtLocale={intlLocale(locale)} /> : null}</div>
    </div>
  );
}
