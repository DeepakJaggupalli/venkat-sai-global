"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult, ActionState } from "@/lib/actions";
import { track } from "@/modules/analytics/client";

import { ConsentCheckbox, Honeypot, SubmissionReceived, usePublicFormAction } from "../../contact/_components/form-bits";
import type { PublicTicketResult } from "../_lib/ticket-schema";

type Option = { value: string; label: string };

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive";

const FIELD_LABELS = {
  name: "Your name",
  email: "Email",
  phone: "Phone",
  category: "What is it about",
  grievanceType: "Type of grievance",
  subject: "Subject",
  message: "Details",
  consentToContact: "Consent to contact",
};

/**
 * Support request / grievance form for public pages. Signed-in visitors raise it on their account; guests
 * give a name and email for the reply. Includes the honeypot and the consent checkbox.
 */
export function TicketForm({
  mode,
  action,
  signedInAs,
  categories,
  grievanceTypes,
  locale,
  formId,
}: {
  mode: "support" | "grievance";
  action: (prev: ActionState<PublicTicketResult>, formData: FormData) => Promise<ActionResult<PublicTicketResult>>;
  /** Display name when the visitor is signed in (the ticket goes on their account). */
  signedInAs: string | null;
  categories?: Option[];
  grievanceTypes?: Option[];
  locale?: string;
  formId: string;
}) {
  const { state, formAction, pending, onSubmit, formRef } = usePublicFormAction(action);
  const started = useRef(false);
  const grievance = mode === "grievance";

  useEffect(() => {
    if (state?.ok) track("form_submitted", { form: formId });
    else if (state && !state.ok) track("error_shown", { form: formId, kind: state.fieldErrors ? "validation" : "server" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (state?.ok) {
    const code = state.data?.code ?? null;
    return (
      <SubmissionReceived
        title={grievance ? "Your grievance has been registered" : "We have received your request"}
        code={code}
        codeLabel={grievance ? "Grievance reference" : "Request reference"}
        actions={
          <Link href="/" className="text-sm font-semibold text-teal-strong hover:underline">
            Back to the home page
          </Link>
        }
      >
        <p>
          {state.data?.signedIn
            ? "We will reply by email and you will be notified in your account."
            : "We have sent an acknowledgement to your email address and will reply there."}{" "}
          {grievance ? "We will acknowledge and resolve it within the timelines shown on this page." : null}
        </p>
        <p>Please quote the reference if you contact us about it.</p>
      </SubmissionReceived>
    );
  }

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      onFocusCapture={() => {
        if (started.current) return;
        started.current = true;
        track("form_started", { form: formId });
      }}
      noValidate
      aria-labelledby={`${formId}-title`}
      data-analytics-form={formId}
      className="relative space-y-5"
    >
      <h2 id={`${formId}-title`} className="font-heading text-xl font-semibold text-navy">
        {grievance ? "Raise a grievance" : "Ask for help"}
      </h2>
      <FormErrorAlert state={state} fieldLabels={FIELD_LABELS} />
      <Honeypot />
      {locale ? <input type="hidden" name="locale" value={locale} /> : null}
      {grievance ? <input type="hidden" name="category" value="grievance" /> : null}

      {signedInAs ? (
        <p className="rounded-lg bg-surface-subtle px-4 py-3 text-sm">
          You are signed in as <span className="font-semibold">{signedInAs}</span>. We will reply to the contact details on your account.
        </p>
      ) : (
        <>
          <FormField label="Your name" name="name" required state={state}>
            <Input autoComplete="name" maxLength={120} />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Email" name="email" required state={state} hint="We reply to this address.">
              <Input type="email" autoComplete="email" inputMode="email" maxLength={254} />
            </FormField>
            <FormField label="Phone" name="phone" optional state={state} hint="Include the country code, for example +91.">
              <Input type="tel" autoComplete="tel" inputMode="tel" maxLength={20} />
            </FormField>
          </div>
        </>
      )}

      {!grievance && categories?.length ? (
        <FormField label="What is it about?" name="category" required state={state}>
          <select className={SELECT_CLASS} defaultValue="">
            <option value="" disabled>
              Choose a topic
            </option>
            {categories.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
      ) : null}

      {grievance && grievanceTypes?.length ? (
        <FormField label="Type of grievance" name="grievanceType" required state={state} hint="Choose the closest match. Some types are handled faster, as the law requires.">
          <select className={SELECT_CLASS} defaultValue="general">
            {grievanceTypes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
      ) : null}

      <FormField label="Subject" name="subject" required state={state}>
        <Input maxLength={200} />
      </FormField>

      <FormField
        label={grievance ? "What happened?" : "Describe the issue"}
        name="message"
        required
        state={state}
        hint={
          grievance
            ? "Include dates, links or names involved and what you would like us to do. Do not include passport, Aadhaar or bank details."
            : "At least 10 characters. Do not include passwords, passport, Aadhaar or bank details."
        }
      >
        <Textarea rows={7} maxLength={10_000} />
      </FormField>

      <ConsentCheckbox id={`${formId}-consent`} errors={fieldErrors?.consentToContact}>
        I agree that Venkat Sai Global may contact me about this {grievance ? "grievance" : "request"}. Read our{" "}
        <Link href="/legal/privacy-policy" className="font-medium text-teal-strong underline underline-offset-2">
          privacy policy
        </Link>
        .
      </ConsentCheckbox>

      <SubmitButton pending={pending} pendingLabel="Sending…" size="lg" className="w-full sm:w-auto">
        {grievance ? "Submit grievance" : "Send request"}
      </SubmitButton>
    </form>
  );
}
