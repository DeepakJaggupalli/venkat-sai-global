"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useTransition, type FormEvent } from "react";

import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { track } from "@/modules/analytics/client";
import type { ENQUIRY_TYPE_OPTION_LABELS } from "@/modules/content/constants";
import { submitEnquiryAction } from "@/modules/operations/actions";

import { SAFE_RECRUITMENT_PATH } from "../links";
import { ConsentCheckbox, Honeypot } from "./form-parts";

/** Enquiry types the public form may send (the CMS list mirrors the operations module's ENQUIRY_TYPES). */
export type PublicEnquiryType = keyof typeof ENQUIRY_TYPE_OPTION_LABELS;

const ORG_TYPES: readonly PublicEnquiryType[] = ["employer", "partner", "institution", "media"];

/**
 * Contextual enquiry form (service pages and landing pages) posting to the operations module's
 * `submitEnquiryAction` (honeypot, rate limits, consent, lead creation and acknowledgement happen there).
 * Conversions (`employer_enquiry_submitted` / `contact_form_submitted`) are recorded server-side; the form
 * only records `employer_enquiry_opened` the first time an employer starts typing.
 */
export function EnquiryForm({
  type,
  sourcePage,
  defaultSubject,
  formId,
  heading = "Send us an enquiry",
  intro,
}: {
  type: PublicEnquiryType;
  sourcePage: string;
  defaultSubject?: string;
  /** Non-personal identifier for analytics (e.g. "service:overseas-employment"). */
  formId: string;
  heading?: string;
  intro?: string;
}) {
  const [state, formAction] = useActionState(submitEnquiryAction, null);
  const [pending, startTransition] = useTransition();
  const opened = useRef(false);
  useActionToast(state);
  const askOrg = ORG_TYPES.includes(type);
  const headingId = `enquiry-${formId.replace(/[^a-z0-9]+/gi, "-")}`;

  const onFirstInput = () => {
    if (opened.current) return;
    opened.current = true;
    if (type === "employer") track("employer_enquiry_opened", { formId });
  };

  // Submit without React's automatic form reset so visitors keep their text when a field needs correcting.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };

  if (state?.ok) {
    const code = (state.data as { code?: string | null } | undefined)?.code;
    return (
      <div role="status" aria-live="polite" className="rounded-2xl border border-success/30 bg-success-soft p-6 sm:p-8" data-testid="enquiry-success">
        <CheckCircle2 aria-hidden="true" className="size-8 text-success-strong" />
        <h3 className="mt-4 font-heading text-xl font-semibold text-navy">Thank you. Your enquiry has been received.</h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          We will reply using the contact details you gave us.
          {code ? (
            <>
              {" "}
              Your reference is <strong className="font-semibold tabular-nums">{code}</strong>.
            </>
          ) : null}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Venkat Sai never asks candidates for money to apply for a job. <Link href={SAFE_RECRUITMENT_PATH} className="font-medium text-teal-strong underline underline-offset-4">How to stay safe</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} onInput={onFirstInput} noValidate aria-labelledby={headingId} className="rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8" data-testid="enquiry-form">
      <h2 id={headingId} className="font-heading text-xl font-semibold text-navy">
        {heading}
      </h2>
      {intro ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{intro}</p> : null}
      <FormErrorAlert state={state} className="mt-5" />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="sourcePage" value={sourcePage} />
      <input type="hidden" name="locale" value="en" />
      <Honeypot />
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <FormField label="Your name" name="name" required state={state} className="sm:col-span-2">
          <Input autoComplete="name" maxLength={120} />
        </FormField>
        <FormField label="Email" name="email" state={state} hint="Email or phone — we need one to reply.">
          <Input type="email" autoComplete="email" inputMode="email" maxLength={254} />
        </FormField>
        <FormField label="Phone" name="phone" state={state}>
          <Input type="tel" autoComplete="tel" inputMode="tel" maxLength={20} />
        </FormField>
        {askOrg ? (
          <FormField label="Organisation" name="organizationName" optional state={state} className="sm:col-span-2">
            <Input autoComplete="organization" maxLength={200} />
          </FormField>
        ) : null}
        <FormField label="Subject" name="subject" optional state={state} className="sm:col-span-2">
          <Input defaultValue={defaultSubject} maxLength={200} />
        </FormField>
        <FormField label="Your message" name="message" required state={state} className="sm:col-span-2" hint="At least 10 characters.">
          <Textarea rows={5} maxLength={5000} />
        </FormField>
      </div>
      <ConsentCheckbox state={state} className="mt-5" label="I agree that Venkat Sai may contact me about this enquiry." />
      <SubmitButton pending={pending} pendingLabel="Sending…" className="mt-6 w-full sm:w-auto">
        Send enquiry
      </SubmitButton>
    </form>
  );
}
