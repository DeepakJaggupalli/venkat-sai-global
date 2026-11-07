"use client";

import { useState, type ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useT } from "@/i18n/client";
import { signUpAction } from "@/modules/identity/actions";

import { FieldMessage, fieldErrors, FormAlert, PasswordField, SubmitButton, TextField, useFormAction } from "./form-kit";
import { GoogleButton, OrSeparator } from "./google-button";

type Consents = { terms: boolean; privacy: boolean; email: boolean; sms: boolean; whatsapp: boolean };

function ConsentCheckbox({
  id,
  name,
  checked,
  onCheckedChange,
  required = false,
  errors,
  children,
}: {
  id: string;
  name: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  required?: boolean;
  errors?: string[];
  children: ReactNode;
}) {
  const t = useT("auth");
  const errorId = errors?.length ? `${id}-error` : undefined;
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          name={name}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
          aria-required={required || undefined}
          className="mt-0.5"
        />
        <Label htmlFor={id} className="block text-sm leading-snug font-normal select-text">
          {children}
          {required ? (
            <>
              <span aria-hidden className="text-destructive">
                {" "}
                *
              </span>
              <span className="sr-only"> ({t("common.required")})</span>
            </>
          ) : null}
        </Label>
      </div>
      <FieldMessage id={errorId} messages={errors} />
    </div>
  );
}

function PolicyLink({ href, children }: { href: string; children: ReactNode }) {
  const t = useT("auth");
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-strong underline underline-offset-2">
      {children}
      <span className="sr-only"> ({t("common.newTab")})</span>
    </a>
  );
}

export function SignUpForm({
  intent,
  returnTo,
  phoneAllowed,
  minPasswordLength,
  googleEnabled,
}: {
  intent: string | null;
  returnTo: string | null;
  phoneAllowed: boolean;
  minPasswordLength: number;
  googleEnabled: boolean;
}) {
  const t = useT("auth");
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(signUpAction);
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [consents, setConsents] = useState<Consents>({ terms: false, privacy: false, email: false, sms: false, whatsapp: false });
  const toggle = (key: keyof Consents) => (checked: boolean) => setConsents((current) => ({ ...current, [key]: checked }));

  let googleHref: string | null = null;
  if (consents.terms && consents.privacy) {
    const params = new URLSearchParams({ consent: "checkbox" });
    if (intent) params.set("intent", intent);
    if (returnTo) params.set("returnTo", returnTo);
    if (consents.email) params.set("me", "1");
    if (consents.sms) params.set("ms", "1");
    if (consents.whatsapp) params.set("mw", "1");
    googleHref = `/auth/google?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-5">
        <FormAlert state={state} />
        <input type="hidden" name="intent" value={intent ?? ""} />
        <input type="hidden" name="returnTo" value={returnTo ?? ""} />

        <TextField
          id="signup-name"
          name="displayName"
          label={intent && intent !== "candidate" ? t("fields.yourName") : t("fields.fullName")}
          autoComplete="name"
          required
          errors={fieldErrors(state, "displayName")}
        />

        {phoneAllowed ? (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("signUp.contactMethod")}</legend>
            <RadioGroup name="contactMethod" value={method} onValueChange={(value) => setMethod(value === "phone" ? "phone" : "email")} className="grid grid-cols-2 gap-2">
              {(["email", "phone"] as const).map((option) => (
                <Label
                  key={option}
                  htmlFor={`signup-method-${option}`}
                  className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 font-normal has-data-checked:border-primary has-data-checked:bg-primary/5"
                >
                  <RadioGroupItem id={`signup-method-${option}`} value={option} />
                  {t(`signUp.method.${option}`)}
                </Label>
              ))}
            </RadioGroup>
          </fieldset>
        ) : (
          <input type="hidden" name="contactMethod" value="email" />
        )}

        {method === "email" ? (
          <TextField
            id="signup-email"
            name="email"
            type="email"
            label={t("fields.email")}
            hint={t("signUp.emailHint")}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            errors={fieldErrors(state, "email")}
          />
        ) : (
          <TextField
            id="signup-phone"
            name="phone"
            type="tel"
            label={t("fields.phone")}
            hint={`${t("signUp.phoneHint")} ${t("fields.phoneCountryHint")}`}
            autoComplete="tel"
            inputMode="tel"
            required
            errors={fieldErrors(state, "phone")}
          />
        )}

        <PasswordField
          id="signup-password"
          name="password"
          label={t("signUp.passwordLabel")}
          hint={t("signUp.passwordHint", { min: minPasswordLength })}
          autoComplete="new-password"
          errors={fieldErrors(state, "password")}
        />

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">{t("signUp.agreements")}</legend>
          <ConsentCheckbox id="signup-terms" name="acceptTerms" checked={consents.terms} onCheckedChange={toggle("terms")} required errors={fieldErrors(state, "acceptTerms")}>
            {t("consent.termsPrefix")} <PolicyLink href="/legal/terms">{t("consent.termsLink")}</PolicyLink>
            {t("consent.termsSuffix")}
          </ConsentCheckbox>
          <ConsentCheckbox
            id="signup-privacy"
            name="acceptPrivacy"
            checked={consents.privacy}
            onCheckedChange={toggle("privacy")}
            required
            errors={fieldErrors(state, "acceptPrivacy")}
          >
            {t("consent.privacyPrefix")} <PolicyLink href="/legal/privacy-policy">{t("consent.privacyLink")}</PolicyLink>
            {t("consent.privacySuffix")}
          </ConsentCheckbox>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t("signUp.updates")}</legend>
          <p className="text-xs text-muted-foreground">{t("signUp.updatesHint")}</p>
          <ConsentCheckbox id="signup-mkt-email" name="marketingEmail" checked={consents.email} onCheckedChange={toggle("email")}>
            {t("consent.marketingEmail")}
          </ConsentCheckbox>
          <ConsentCheckbox id="signup-mkt-sms" name="marketingSms" checked={consents.sms} onCheckedChange={toggle("sms")}>
            {t("consent.marketingSms")}
          </ConsentCheckbox>
          <ConsentCheckbox id="signup-mkt-whatsapp" name="whatsappUpdates" checked={consents.whatsapp} onCheckedChange={toggle("whatsapp")}>
            {t("consent.whatsapp")}
          </ConsentCheckbox>
        </fieldset>

        <SubmitButton pending={pending}>{t("signUp.submit")}</SubmitButton>
      </form>

      {googleEnabled ? (
        <div className="space-y-3">
          <OrSeparator label={t("common.or")} />
          <GoogleButton href={googleHref} label={t("google.signUp")} describedById="signup-google-hint" />
          <p id="signup-google-hint" className="text-xs text-muted-foreground" aria-live="polite">
            {googleHref ? t("google.signUpReady") : t("google.signUpNeedsConsent")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
