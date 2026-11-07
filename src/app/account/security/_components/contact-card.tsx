"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  fieldErrors,
  FormAlert,
  OtpField,
  PasswordField,
  SubmitButton,
  TextField,
  useFormAction,
  useOnSuccess,
} from "@/app/(auth)/_components/form-kit";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useT } from "@/i18n/client";
import {
  confirmContactChangeAction,
  confirmContactVerificationAction,
  requestContactChangeAction,
  requestContactVerificationAction,
} from "@/modules/identity/actions";

type Kind = "email" | "phone";

export function VerificationBadge({ verified }: { verified: boolean }) {
  const t = useT("auth");
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-foreground">
      <CheckCircle2 className="size-3.5 text-success" aria-hidden />
      {t("account.contact.verified")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-foreground">
      <AlertTriangle className="size-3.5 text-warning" aria-hidden />
      {t("account.contact.notVerified")}
    </span>
  );
}

function ChangeRequestStep({ kind, hasPassword, onCodeSent }: { kind: Kind; hasPassword: boolean; onCodeSent: (target: string) => void }) {
  const t = useT("auth");
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(requestContactChangeAction);
  useOnSuccess(state, (result) => {
    if (result.data) onCodeSent(result.data.value);
  });
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert state={state && !state.ok ? state : null} />
      <input type="hidden" name="kind" value={kind} />
      <TextField
        id={`change-${kind}-value`}
        name="value"
        type={kind === "email" ? "email" : "tel"}
        label={t(kind === "email" ? "account.contact.newEmail" : "account.contact.newPhone")}
        hint={kind === "phone" ? t("fields.phoneCountryHint") : undefined}
        autoComplete={kind === "email" ? "email" : "tel"}
        autoCapitalize="none"
        spellCheck={false}
        required
        errors={fieldErrors(state, "value")}
      />
      {hasPassword ? (
        <PasswordField
          id={`change-${kind}-password`}
          name="currentPassword"
          label={t("fields.currentPassword")}
          hint={t("account.contact.passwordHint")}
          autoComplete="current-password"
          required
          errors={fieldErrors(state, "currentPassword")}
        />
      ) : null}
      <SubmitButton pending={pending}>{t("account.contact.sendCode")}</SubmitButton>
    </form>
  );
}

function ChangeConfirmStep({ kind, target, onDone, onStartOver }: { kind: Kind; target: string; onDone: () => void; onStartOver: () => void }) {
  const t = useT("auth");
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(confirmContactChangeAction);
  useOnSuccess(state, (result) => {
    if (result.message) toast.success(result.message);
    onDone();
  });
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      {state === null ? (
        <Alert role="status" className="border-success/30 bg-success-soft">
          <CheckCircle2 className="text-success" aria-hidden />
          <AlertDescription className="text-foreground">{t("account.contact.enterCode", { target })}</AlertDescription>
        </Alert>
      ) : null}
      <FormAlert state={state && !state.ok ? state : null} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="value" value={target} />
      <OtpField id={`change-${kind}-code`} label={t("fields.code")} hint={t("verify.codeHint")} autoFocus errors={fieldErrors(state, "code")} />
      <SubmitButton pending={pending}>{t("account.contact.confirm")}</SubmitButton>
      <Button type="button" variant="link" className="h-auto px-0 text-teal-strong" onClick={onStartOver}>
        {t("account.contact.startOver")}
      </Button>
    </form>
  );
}

function ChangeContactBody({ kind, hasPassword, onDone }: { kind: Kind; hasPassword: boolean; onDone: () => void }) {
  const [target, setTarget] = useState<string | null>(null);
  return target ? (
    <ChangeConfirmStep kind={kind} target={target} onDone={onDone} onStartOver={() => setTarget(null)} />
  ) : (
    <ChangeRequestStep kind={kind} hasPassword={hasPassword} onCodeSent={setTarget} />
  );
}

function VerifyContactBody({ kind, value, onDone }: { kind: Kind; value: string; onDone: () => void }) {
  const t = useT("auth");
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(confirmContactVerificationAction);
  const [sending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useOnSuccess(state, (result) => {
    if (result.message) toast.success(result.message);
    onDone();
  });

  const send = () =>
    startTransition(async () => {
      setSendError(null);
      const result = await requestContactVerificationAction({ kind });
      if (result.ok) setSent(true);
      else setSendError(result.error);
    });

  return (
    <div className="space-y-4">
      {sendError ? (
        <Alert variant="destructive" className="border-destructive/30 bg-danger-soft">
          <AlertTriangle aria-hidden />
          <AlertDescription>{sendError}</AlertDescription>
        </Alert>
      ) : null}
      {!sent ? (
        <SubmitButton type="button" pending={sending} onClick={send}>
          {t("account.contact.sendCodeTo", { target: value })}
        </SubmitButton>
      ) : (
        <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
          <p role="status" className="text-sm text-muted-foreground">
            {t("account.contact.enterCode", { target: value })}
          </p>
          <FormAlert state={state && !state.ok ? state : null} />
          <input type="hidden" name="kind" value={kind} />
          <OtpField id={`verify-${kind}-code`} label={t("fields.code")} hint={t("verify.codeHint")} autoFocus errors={fieldErrors(state, "code")} />
          <SubmitButton pending={pending}>{t("account.contact.confirm")}</SubmitButton>
          <Button type="button" variant="link" className="h-auto px-0 text-teal-strong" onClick={send} disabled={sending}>
            {t("verify.resend")}
          </Button>
        </form>
      )}
    </div>
  );
}

/** One row of the "Email and phone" section on /account. */
export function ContactCard({
  kind,
  value,
  verified,
  hasPassword,
  codesAvailable,
}: {
  kind: Kind;
  value: string | null;
  verified: boolean;
  hasPassword: boolean;
  /** Codes can be sent over this channel (feature flag). */
  codesAvailable: boolean;
}) {
  const t = useT("auth");
  const [changeOpen, setChangeOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <h3 className="text-sm font-medium">{t(kind === "email" ? "fields.email" : "fields.phone")}</h3>
        {value ? (
          <>
            <p className="text-sm break-all">{value}</p>
            <VerificationBadge verified={verified} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t(kind === "email" ? "account.contact.noEmail" : "account.contact.noPhone")}</p>
        )}
        {!codesAvailable ? <p className="text-xs text-muted-foreground">{t("account.contact.smsUnavailable")}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {value && !verified ? (
          <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={!codesAvailable}>
                {t("account.contact.verify")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t(kind === "email" ? "account.contact.verifyEmailTitle" : "account.contact.verifyPhoneTitle")}</DialogTitle>
                <DialogDescription>{t("account.contact.verifyDescription")}</DialogDescription>
              </DialogHeader>
              <VerifyContactBody kind={kind} value={value} onDone={() => setVerifyOpen(false)} />
            </DialogContent>
          </Dialog>
        ) : null}
        <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={!codesAvailable}>
              {value ? t("account.contact.change") : t("account.contact.add")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t(
                  kind === "email"
                    ? value
                      ? "account.contact.changeEmailTitle"
                      : "account.contact.addEmailTitle"
                    : value
                      ? "account.contact.changePhoneTitle"
                      : "account.contact.addPhoneTitle",
                )}
              </DialogTitle>
              <DialogDescription>{t(kind === "email" ? "account.contact.changeEmailDescription" : "account.contact.changePhoneDescription")}</DialogDescription>
            </DialogHeader>
            <ChangeContactBody kind={kind} hasPassword={hasPassword} onDone={() => setChangeOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
