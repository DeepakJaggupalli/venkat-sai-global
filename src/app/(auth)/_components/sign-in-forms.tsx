"use client";

import Link from "next/link";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/i18n/client";
import { requestLoginOtpAction, signInWithPasswordAction } from "@/modules/identity/actions";

import { fieldErrors, FormAlert, PasswordField, SubmitButton, TextField, useFormAction } from "./form-kit";

type SignInFormsProps = {
  returnTo: string | null;
  intent: string | null;
  otp: { email: boolean; phone: boolean };
  defaultTab?: "password" | "otp";
};

function HiddenTargets({ returnTo, intent }: { returnTo: string | null; intent: string | null }) {
  return (
    <>
      <input type="hidden" name="returnTo" value={returnTo ?? ""} />
      <input type="hidden" name="intent" value={intent ?? ""} />
    </>
  );
}

function PasswordSignInForm({ returnTo, intent }: { returnTo: string | null; intent: string | null }) {
  const t = useT("auth");
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(signInWithPasswordAction);
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert state={state} />
      <HiddenTargets returnTo={returnTo} intent={intent} />
      <TextField
        id="signin-identifier"
        name="identifier"
        label={t("fields.identifier")}
        hint={t("fields.identifierHint")}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        errors={fieldErrors(state, "identifier")}
      />
      <PasswordField
        id="signin-password"
        name="password"
        label={t("fields.password")}
        autoComplete="current-password"
        required
        errors={fieldErrors(state, "password")}
        labelAction={
          <Link href="/forgot-password" className="text-sm font-medium text-teal-strong underline-offset-4 hover:underline">
            {t("signIn.forgot")}
          </Link>
        }
      />
      <SubmitButton pending={pending}>{t("signIn.submit")}</SubmitButton>
    </form>
  );
}

function OtpRequestForm({ returnTo, intent, otp }: { returnTo: string | null; intent: string | null; otp: { email: boolean; phone: boolean } }) {
  const t = useT("auth");
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(requestLoginOtpAction);
  const hint = otp.email && otp.phone ? t("signIn.otp.hintBoth") : otp.email ? t("signIn.otp.hintEmail") : t("signIn.otp.hintPhone");
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert state={state} />
      <HiddenTargets returnTo={returnTo} intent={intent} />
      <TextField
        id="signin-otp-identifier"
        name="identifier"
        label={otp.email && otp.phone ? t("fields.identifier") : otp.email ? t("fields.email") : t("fields.phone")}
        hint={`${hint} ${otp.phone ? t("fields.phoneCountryHint") : ""}`.trim()}
        type={otp.email && !otp.phone ? "email" : otp.phone && !otp.email ? "tel" : "text"}
        autoComplete={otp.phone && !otp.email ? "tel" : "username"}
        autoCapitalize="none"
        spellCheck={false}
        required
        errors={fieldErrors(state, "identifier")}
      />
      <SubmitButton pending={pending}>{t("signIn.otp.submit")}</SubmitButton>
    </form>
  );
}

/** /sign-in: "Password" and "One-time code" tabs. */
export function SignInForms({ returnTo, intent, otp, defaultTab = "password" }: SignInFormsProps) {
  const t = useT("auth");
  const otpAvailable = otp.email || otp.phone;
  return (
    <Tabs defaultValue={otpAvailable ? defaultTab : "password"} className="gap-5">
      <TabsList className="grid w-full grid-cols-2 group-data-horizontal/tabs:h-10">
        <TabsTrigger value="password">{t("signIn.tabs.password")}</TabsTrigger>
        <TabsTrigger value="otp" disabled={!otpAvailable}>
          {t("signIn.tabs.otp")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="password">
        <PasswordSignInForm returnTo={returnTo} intent={intent} />
      </TabsContent>
      <TabsContent value="otp">
        {otpAvailable ? (
          <OtpRequestForm returnTo={returnTo} intent={intent} otp={otp} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("signIn.otp.unavailable")}</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
