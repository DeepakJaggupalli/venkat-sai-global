"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { resendCodeAction, twoFactorChallengeAction, verifyCodeAction } from "@/modules/identity/actions";

import { fieldErrors, FormAlert, OtpField, SubmitButton, TextField, useCountdown, useFormAction } from "./form-kit";

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** "Resend code" with a cooldown timer (the server enforces the same cooldown). */
export function ResendCodeButton({
  availableAt: initialAvailableAt,
  initiallyCooling,
  flow,
}: {
  availableAt: number;
  /** The cooldown was still running when the page was rendered (decided on the server). */
  initiallyCooling: boolean;
  flow: "verify" | "reset";
}) {
  const t = useT("auth");
  const [availableAt, setAvailableAt] = useState(initialAvailableAt);
  const remaining = useCountdown(availableAt);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [resent, setResent] = useState(false);

  const waiting = remaining === null || remaining > 0;
  const onClick = () =>
    startTransition(async () => {
      setStatus(null);
      const result = await resendCodeAction({ flow });
      if (result.ok) {
        setAvailableAt(result.data?.resendAvailableAt ?? Date.now() + 60_000);
        setResent(true);
        setStatus({ kind: "ok", text: result.message ?? t("verify.resent") });
      } else {
        setStatus({ kind: "error", text: result.error });
      }
    });

  // Announce once a countdown the visitor has been waiting for runs out.
  const readyText = remaining === 0 && (initiallyCooling || resent) ? t("verify.resendReady") : "";
  return (
    <div className="space-y-1">
      <Button type="button" variant="link" className="h-auto px-0 text-teal-strong" onClick={onClick} disabled={pending || waiting} aria-busy={pending || undefined}>
        {remaining !== null && remaining > 0 ? t("verify.resendIn", { time: formatSeconds(remaining) }) : t("verify.resend")}
      </Button>
      <p aria-live="polite" className={cn("min-h-5 text-sm", status?.kind === "error" ? "text-destructive" : "text-muted-foreground")}>
        {status?.text ?? readyText}
      </p>
    </div>
  );
}

/** /verify: the 6-digit code for sign-up or one-time-code sign-in. */
export function VerifyForm({
  resendAvailableAt,
  initiallyCooling,
  changeHref,
  changeLabel,
}: {
  resendAvailableAt: number;
  initiallyCooling: boolean;
  changeHref: string;
  changeLabel: string;
}) {
  const t = useT("auth");
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(verifyCodeAction);
  return (
    <div className="space-y-5">
      <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert state={state} />
        <OtpField id="verify-code" label={t("fields.code")} hint={t("verify.codeHint")} autoFocus errors={fieldErrors(state, "code")} />
        <SubmitButton pending={pending}>{t("verify.submit")}</SubmitButton>
      </form>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <ResendCodeButton availableAt={resendAvailableAt} initiallyCooling={initiallyCooling} flow="verify" />
        <Link href={changeHref} className="py-1 text-sm font-medium text-teal-strong underline-offset-4 hover:underline">
          {changeLabel}
        </Link>
      </div>
    </div>
  );
}

/** /sign-in/two-factor: authenticator code, or a recovery code. */
export function TwoFactorForm({ returnTo }: { returnTo: string | null }) {
  const t = useT("auth");
  const [method, setMethod] = useState<"totp" | "recovery">("totp");
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(twoFactorChallengeAction);
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert state={state} />
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="returnTo" value={returnTo ?? ""} />
      {method === "totp" ? (
        <OtpField id="two-factor-code" name="code" label={t("twoFactor.codeLabel")} hint={t("twoFactor.codeHint")} autoFocus errors={fieldErrors(state, "code")} />
      ) : (
        <TextField
          id="two-factor-recovery"
          name="recoveryCode"
          label={t("twoFactor.recoveryLabel")}
          hint={t("twoFactor.recoveryHint")}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          errors={fieldErrors(state, "recoveryCode")}
        />
      )}
      <SubmitButton pending={pending}>{t("twoFactor.submit")}</SubmitButton>
      <Button type="button" variant="link" className="h-auto px-0 text-teal-strong" onClick={() => setMethod((m) => (m === "totp" ? "recovery" : "totp"))}>
        {method === "totp" ? t("twoFactor.useRecovery") : t("twoFactor.useApp")}
      </Button>
    </form>
  );
}
