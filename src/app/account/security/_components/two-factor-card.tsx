"use client";

import { AlertTriangle, Copy, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
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
import type { ActionResult, ActionState } from "@/lib/actions";
import { beginTwoFactorSetupAction, confirmTwoFactorSetupAction, disableTwoFactorAction, regenerateRecoveryCodesAction } from "@/modules/identity/actions";
import type { TwoFactorSetupData } from "@/modules/identity/types";

import { copyToClipboard, RecoveryCodesPanel } from "./recovery-codes";

type Step = { name: "overview" } | { name: "setup"; data: TwoFactorSetupData } | { name: "codes"; codes: string[] };

function StepHeading({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      <span aria-hidden className="grid size-6 place-items-center rounded-full bg-navy text-xs text-white">
        {number}
      </span>
      {children}
    </h3>
  );
}

function SetupWizard({ data, onCancel, onEnabled }: { data: TwoFactorSetupData; onCancel: () => void; onEnabled: (codes: string[]) => void }) {
  const t = useT("auth");
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(confirmTwoFactorSetupAction);
  useOnSuccess(state, (result) => {
    if (result.data) onEnabled(result.data.recoveryCodes);
  });

  const copyKey = async () => {
    if (await copyToClipboard(data.manualKey.replace(/\s+/g, ""))) toast.success(t("security.twoFactor.keyCopied"));
    else toast.error(t("security.recovery.copyFailed"));
  };

  return (
    <ol className="space-y-6">
      <li className="space-y-2">
        <StepHeading number={1}>{t("security.twoFactor.step1Title")}</StepHeading>
        <p className="text-sm text-muted-foreground">{t("security.twoFactor.step1Body")}</p>
      </li>
      <li className="space-y-3">
        <StepHeading number={2}>{t("security.twoFactor.step2Title")}</StepHeading>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Image
            src={data.qrCodeDataUrl}
            alt={t("security.twoFactor.qrAlt")}
            width={192}
            height={192}
            unoptimized
            className="size-48 shrink-0 rounded-lg border bg-white p-2"
          />
          <div className="min-w-0 space-y-2">
            <p className="text-sm text-muted-foreground">{t("security.twoFactor.manualIntro")}</p>
            <code className="block rounded-md bg-muted px-3 py-2 font-mono text-sm break-all" aria-label={t("security.twoFactor.manualKeyLabel")}>
              {data.manualKey}
            </code>
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={copyKey}>
              <Copy aria-hidden />
              {t("security.twoFactor.copyKey")}
            </Button>
          </div>
        </div>
      </li>
      <li className="space-y-3">
        <StepHeading number={3}>{t("security.twoFactor.step3Title")}</StepHeading>
        <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
          <FormAlert state={state && !state.ok ? state : null} />
          <OtpField id="two-factor-setup-code" label={t("fields.code")} hint={t("security.twoFactor.step3Hint")} errors={fieldErrors(state, "code")} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <SubmitButton pending={pending} className="sm:w-auto">
              {t("security.twoFactor.confirm")}
            </SubmitButton>
            <Button type="button" variant="ghost" size="lg" className="h-10" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      </li>
    </ol>
  );
}

type ReauthAction<T> = (prev: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;

function ReauthForm<T>({
  action,
  hasPassword,
  submitLabel,
  destructive,
  onSuccess,
}: {
  action: ReauthAction<T>;
  hasPassword: boolean;
  submitLabel: string;
  destructive?: boolean;
  onSuccess: (data: T | undefined, message?: string) => void;
}) {
  const t = useT("auth");
  const [usePassword, setUsePassword] = useState(false);
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(action);
  useOnSuccess(state, (result) => onSuccess(result.data, result.message));
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert state={state && !state.ok ? state : null} />
      {usePassword && hasPassword ? (
        <PasswordField id="reauth-password" name="password" label={t("fields.currentPassword")} autoComplete="current-password" autoFocus errors={fieldErrors(state, "password")} />
      ) : (
        <TextField
          id="reauth-code"
          name="code"
          label={t("security.reauth.codeLabel")}
          hint={t("security.reauth.codeHint")}
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          errors={fieldErrors(state, "code")}
        />
      )}
      {hasPassword ? (
        <Button type="button" variant="link" className="h-auto px-0 text-teal-strong" onClick={() => setUsePassword((value) => !value)}>
          {usePassword ? t("security.reauth.useCode") : t("security.reauth.usePassword")}
        </Button>
      ) : null}
      <SubmitButton pending={pending} variant={destructive ? "destructive" : "default"}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

/** Two-factor authentication: status, setup wizard, recovery codes, turn off. */
export function TwoFactorCard({
  enabled,
  enabledLabel,
  recoveryCodesRemaining,
  hasPassword,
  disableBlocked,
  continueHref,
}: {
  enabled: boolean;
  enabledLabel: string | null;
  recoveryCodesRemaining: number;
  hasPassword: boolean;
  /** Staff accounts cannot turn 2FA off while it is required. */
  disableBlocked: boolean;
  /** Where to go after setup when 2FA was required (e.g. back to the Command Centre). */
  continueHref: string | null;
}) {
  const t = useT("auth");
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "overview" });
  const [starting, startTransition] = useTransition();
  const [startError, setStartError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"regenerate" | "disable" | null>(null);

  const begin = () =>
    startTransition(async () => {
      setStartError(null);
      const result = await beginTwoFactorSetupAction({});
      if (result.ok && result.data) setStep({ name: "setup", data: result.data });
      else if (!result.ok) setStartError(result.error);
    });

  if (step.name === "setup") {
    return <SetupWizard data={step.data} onCancel={() => setStep({ name: "overview" })} onEnabled={(codes) => setStep({ name: "codes", codes })} />;
  }
  if (step.name === "codes") {
    return (
      <RecoveryCodesPanel
        codes={step.codes}
        doneLabel={continueHref ? t("security.recovery.continue") : t("security.recovery.done")}
        onDone={() => {
          setStep({ name: "overview" });
          if (continueHref) router.push(continueHref);
          else router.refresh();
        }}
      />
    );
  }

  if (!enabled) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("security.twoFactor.offBody")}</p>
        {startError ? (
          <Alert variant="destructive" className="border-destructive/30 bg-danger-soft">
            <AlertTriangle aria-hidden />
            <AlertDescription>{startError}</AlertDescription>
          </Alert>
        ) : null}
        <SubmitButton type="button" pending={starting} onClick={begin} className="sm:w-auto">
          <ShieldCheck aria-hidden />
          {t("security.twoFactor.setUp")}
        </SubmitButton>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-foreground">
          <ShieldCheck className="size-3.5 text-success" aria-hidden />
          {t("security.twoFactor.on")}
        </span>
        {enabledLabel ? <span className="text-sm text-muted-foreground">{t("security.twoFactor.enabledSince", { date: enabledLabel })}</span> : null}
      </div>
      <p className={recoveryCodesRemaining <= 3 ? "text-sm font-medium text-foreground" : "text-sm text-muted-foreground"}>
        {recoveryCodesRemaining <= 3 ? <AlertTriangle className="mr-1 inline size-4 text-warning" aria-hidden /> : null}
        {t("security.twoFactor.codesLeft", { count: recoveryCodesRemaining })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Dialog open={dialog === "regenerate"} onOpenChange={(open) => setDialog(open ? "regenerate" : null)}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              {t("security.twoFactor.regenerate")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("security.twoFactor.regenerateTitle")}</DialogTitle>
              <DialogDescription>{t("security.twoFactor.regenerateDescription")}</DialogDescription>
            </DialogHeader>
            <ReauthForm
              action={regenerateRecoveryCodesAction}
              hasPassword={hasPassword}
              submitLabel={t("security.twoFactor.regenerateConfirm")}
              onSuccess={(data) => {
                setDialog(null);
                if (data) setStep({ name: "codes", codes: data.recoveryCodes });
              }}
            />
          </DialogContent>
        </Dialog>
        {disableBlocked ? null : (
          <Dialog open={dialog === "disable"} onOpenChange={(open) => setDialog(open ? "disable" : null)}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" className="h-9">
                {t("security.twoFactor.disable")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("security.twoFactor.disableTitle")}</DialogTitle>
                <DialogDescription>{t("security.twoFactor.disableDescription")}</DialogDescription>
              </DialogHeader>
              <ReauthForm
                action={disableTwoFactorAction}
                hasPassword={hasPassword}
                destructive
                submitLabel={t("security.twoFactor.disableConfirm")}
                onSuccess={(_data, message) => {
                  setDialog(null);
                  if (message) toast.success(message);
                  router.refresh();
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
      {disableBlocked ? <p className="text-xs text-muted-foreground">{t("security.twoFactor.staffRequired")}</p> : null}
    </div>
  );
}
