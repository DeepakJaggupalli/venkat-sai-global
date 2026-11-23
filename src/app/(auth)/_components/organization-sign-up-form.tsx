"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import type { FieldErrors } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { organizationSignUpAction } from "@/modules/identity/actions";
import { ORGANIZATION_SIGNUP_STEP1_FIELDS } from "@/modules/identity/schemas";
import type { OrganizationSignupIntent } from "@/modules/identity/types";
import { COMPANY_SIZE_BANDS, INSTITUTION_KINDS, PARTNER_BUSINESS_TYPES } from "@/modules/organizations/constants";

import { fieldErrors, FormAlert, PasswordField, SelectField, SubmitButton, TextField, useFormAction } from "./form-kit";
import { ConsentFields, GoogleSignUp, useConsents } from "./sign-up-form";

type Step = 1 | 2;
const STEP1_FIELDS: readonly string[] = ORGANIZATION_SIGNUP_STEP1_FIELDS;

/**
 * Sign-up of an organisation account (company / HR, travel agency, recruitment partner, training institute) in two
 * steps on one form: the organisation details, then the contact person's login. Both steps stay mounted (step 1 is
 * only hidden), so one submit carries everything and nothing typed is lost when the server returns errors.
 */
export function OrganizationSignUpForm({
  intent,
  returnTo,
  minPasswordLength,
  googleEnabled,
  countries,
}: {
  intent: OrganizationSignupIntent;
  returnTo: string | null;
  minPasswordLength: number;
  googleEnabled: boolean;
  countries: { value: string; label: string }[];
}) {
  const t = useT("auth");
  const { state, formAction, pending, onSubmit, formRef } = useFormAction(organizationSignUpAction);
  const { consents, toggle } = useConsents();
  const [step, setStep] = useState<Step>(1);
  const [localErrors, setLocalErrors] = useState<FieldErrors>({});
  const [focusRequest, setFocusRequest] = useState(0);
  const [handledState, setHandledState] = useState(state);

  const errors = (field: string) => localErrors[field] ?? fieldErrors(state, field);

  // A new server result: show the step holding the first invalid field (adjusted during render, not in an effect).
  if (state !== handledState) {
    setHandledState(state);
    setLocalErrors({});
    const invalid = state && !state.ok ? Object.keys(state.fieldErrors ?? {}) : [];
    if (invalid.length) {
      setStep(invalid.some((field) => STEP1_FIELDS.includes(field)) ? 1 : 2);
      setFocusRequest((n) => n + 1);
    }
  }

  // After a step change, focus the first invalid field of the visible step, else its heading.
  useEffect(() => {
    if (!focusRequest) return;
    const section = formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    const target = section?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? section?.querySelector<HTMLElement>("[data-step-heading]");
    target?.focus();
  }, [focusRequest, step, formRef]);

  const goTo = (next: Step) => {
    setStep(next);
    setFocusRequest((n) => n + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Required step-1 fields, checked in the browser before showing step 2 (the server checks everything again). */
  const continueToLogin = () => {
    const form = formRef.current;
    if (!form) return;
    const value = (name: string) => String(new FormData(form).get(name) ?? "").trim();
    const next: FieldErrors = {};
    if (value("orgName").length < 2) next.orgName = [t("validation.org_name_required")];
    if ((intent === "partner" || intent === "institution") && !value("businessType")) next.businessType = [t("validation.business_type_required")];
    if (!value("countryCode")) next.countryCode = [t("validation.country_required")];
    if (!value("city")) next.city = [t("validation.city_required")];
    if (value("displayName").length < 2) next.displayName = [t("validation.name_required")];
    if (value("designation").length < 2) next.designation = [t("validation.designation_required")];
    setLocalErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[data-step="1"] [aria-invalid="true"]')?.focus());
      return;
    }
    goTo(2);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (step === 1) {
      // Enter in a step-1 field continues instead of submitting.
      event.preventDefault();
      continueToLogin();
      return;
    }
    onSubmit(event);
  };

  const businessTypes =
    intent === "partner"
      ? PARTNER_BUSINESS_TYPES.map((value) => ({ value, label: t(`signUp.org.partnerType.${value}`) }))
      : intent === "institution"
        ? INSTITUTION_KINDS.map((value) => ({ value, label: t(`signUp.org.institutionKind.${value}`) }))
        : null;
  const choose = { value: "", label: t("signUp.org.choose") };

  return (
    <div className="space-y-6">
      <form ref={formRef} action={formAction} onSubmit={handleSubmit} noValidate className="space-y-5">
        <FormAlert state={state} />
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="returnTo" value={returnTo ?? ""} />

        <ol className="grid grid-cols-2 gap-2" aria-label={t("signUp.org.stepsLabel")}>
          {([1, 2] as const).map((n) => (
            <li key={n} aria-current={step === n ? "step" : undefined} className="space-y-1.5">
              <span className={cn("block h-1 rounded-full", n <= step ? "bg-primary" : "bg-muted")} aria-hidden />
              <span className={cn("block text-xs", step === n ? "font-medium text-foreground" : "text-muted-foreground")}>
                {t("signUp.org.step", { current: n, total: 2 })} · {t(n === 1 ? "signUp.org.step1" : "signUp.org.step2")}
              </span>
            </li>
          ))}
        </ol>

        <div data-step="1" hidden={step !== 1} className="space-y-5">
          <div className="space-y-1">
            <h2 data-step-heading tabIndex={-1} className="font-heading text-lg font-semibold text-navy outline-none">
              {t("signUp.org.step1")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("signUp.org.step1Hint")}</p>
          </div>

          <TextField id="org-name" name="orgName" label={t(`signUp.org.nameLabel.${intent}`)} autoComplete="organization" required errors={errors("orgName")} />
          {businessTypes ? (
            <SelectField
              id="org-business-type"
              name="businessType"
              label={t(`signUp.org.businessType.${intent}`)}
              options={[choose, ...businessTypes]}
              defaultValue=""
              errors={errors("businessType")}
            />
          ) : null}
          <SelectField id="org-country" name="countryCode" label={t("signUp.org.country")} options={[choose, ...countries]} defaultValue="IN" errors={errors("countryCode")} />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField id="org-state" name="stateRegion" label={t("signUp.org.state")} autoComplete="address-level1" errors={errors("stateRegion")} />
            <TextField id="org-city" name="city" label={t("signUp.org.city")} autoComplete="address-level2" required errors={errors("city")} />
          </div>
          <TextField id="org-address" name="addressLine1" label={t("signUp.org.address")} autoComplete="street-address" errors={errors("addressLine1")} />
          <TextField
            id="org-website"
            name="websiteUrl"
            label={t("signUp.org.website")}
            hint={t("signUp.org.websiteHint")}
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            errors={errors("websiteUrl")}
          />
          <TextField id="org-registration" name="registrationNumber" label={t("signUp.org.registration")} autoCapitalize="characters" errors={errors("registrationNumber")} />
          {intent === "partner" ? (
            <TextField id="org-licence" name="licenceNumber" label={t("signUp.org.licence")} hint={t("signUp.org.licenceHint")} errors={errors("licenceNumber")} />
          ) : null}
          {intent === "employer" || intent === "travel_agency" ? (
            <SelectField
              id="org-size"
              name="companySize"
              label={t("signUp.org.size")}
              options={[choose, ...COMPANY_SIZE_BANDS.map((value) => ({ value, label: t(`signUp.org.sizeBand.${value}`) }))]}
              defaultValue=""
              errors={errors("companySize")}
            />
          ) : null}

          <fieldset className="space-y-5 border-t pt-5">
            <legend className="float-left mb-1 text-sm font-medium">{t("signUp.org.contactPerson")}</legend>
            <div className="clear-both grid gap-5 sm:grid-cols-2">
              <TextField id="org-contact-name" name="displayName" label={t("signUp.org.contactName")} autoComplete="name" required errors={errors("displayName")} />
              <TextField
                id="org-designation"
                name="designation"
                label={t("signUp.org.designation")}
                hint={t("signUp.org.designationHint")}
                autoComplete="organization-title"
                required
                errors={errors("designation")}
              />
            </div>
          </fieldset>

          <Button type="button" size="lg" className="h-10 w-full" onClick={continueToLogin}>
            {t("signUp.org.continue")}
          </Button>
        </div>

        <div data-step="2" hidden={step !== 2} className="space-y-5">
          <div className="space-y-1">
            <h2 data-step-heading tabIndex={-1} className="font-heading text-lg font-semibold text-navy outline-none">
              {t("signUp.org.step2")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("signUp.org.step2Hint")}</p>
          </div>

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
            errors={errors("email")}
          />
          <TextField
            id="signup-phone"
            name="phone"
            type="tel"
            label={t("signUp.org.mobile")}
            hint={t("fields.phoneCountryHint")}
            placeholder="+91 98765 43210"
            autoComplete="tel"
            inputMode="tel"
            required
            errors={errors("phone")}
          />
          <PasswordField
            id="signup-password"
            name="password"
            label={t("fields.password")}
            hint={t("signUp.org.passwordHint", { min: minPasswordLength })}
            autoComplete="new-password"
            required
            errors={errors("password")}
          />

          <ConsentFields consents={consents} toggle={toggle} state={state} />

          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button type="button" variant="outline" size="lg" className="h-10 sm:w-auto" onClick={() => goTo(1)}>
              <ArrowLeft aria-hidden />
              {t("signUp.org.back")}
            </Button>
            <SubmitButton pending={pending} className="sm:flex-1">
              {t("signUp.submit")}
            </SubmitButton>
          </div>
        </div>
      </form>

      {googleEnabled && step === 2 ? (
        <div className="space-y-2">
          <GoogleSignUp consents={consents} intent={intent} returnTo={returnTo} />
          <p className="text-xs text-muted-foreground">{t("signUp.org.googleHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
