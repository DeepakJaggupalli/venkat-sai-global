"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { track } from "@/modules/analytics/client";

import { sendContactEnquiryAction } from "../actions";
import { CONTACT_TYPE_OPTIONS, type ContactEnquiryType } from "../_lib/enquiry-types";
import { ConsentCheckbox, Honeypot, SubmissionReceived, usePublicFormAction } from "./form-bits";

const ORG_TYPES = new Set<ContactEnquiryType>(["employer", "partner", "institution", "media"]);
const FORM_ID = "contact";

const FIELD_LABELS = {
  type: "Enquiry type",
  name: "Your name",
  email: "Email",
  phone: "Phone",
  organizationName: "Organisation",
  subject: "Subject",
  message: "Your message",
  consentToContact: "Consent to contact",
};

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive";

export function ContactForm({ initialType, privacyHref = "/legal/privacy-policy" }: { initialType: ContactEnquiryType; privacyHref?: string }) {
  const { state, formAction, pending, onSubmit, formRef } = usePublicFormAction(sendContactEnquiryAction);
  const [type, setType] = useState<ContactEnquiryType>(initialType);
  const started = useRef(false);
  const option = CONTACT_TYPE_OPTIONS.find((o) => o.value === type) ?? CONTACT_TYPE_OPTIONS[0]!;

  useEffect(() => {
    if (state?.ok) track("form_submitted", { form: FORM_ID, enquiryType: type });
    else if (state && !state.ok) track("error_shown", { form: FORM_ID, kind: state.fieldErrors ? "validation" : "server" });
    // Only on a new result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (state?.ok) {
    const code = state.data?.code ?? null;
    return (
      <SubmissionReceived title="Thank you, we have received your enquiry" code={code}>
        <p>Our team will reply using the contact details you gave us. Please keep the reference if you need to follow up.</p>
        <p>
          Venkat Sai Global never asks candidates for money. If anyone does, please{" "}
          <Link href="/grievance" className="font-medium text-teal-strong underline underline-offset-2">
            report it
          </Link>
          .
        </p>
      </SubmissionReceived>
    );
  }

  const onFirstInput = () => {
    if (started.current) return;
    started.current = true;
    track("form_started", { form: FORM_ID });
  };

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      onFocusCapture={onFirstInput}
      noValidate
      aria-labelledby="contact-form-title"
      data-analytics-form={FORM_ID}
      className="relative space-y-5"
    >
      <h2 id="contact-form-title" className="font-heading text-xl font-semibold text-navy">
        Send us a message
      </h2>
      <FormErrorAlert state={state} fieldLabels={FIELD_LABELS} />
      <input type="hidden" name="sourcePage" value="/contact" />
      <Honeypot />

      <FormField label="What is it about?" name="type" required state={state} hint={option.hint}>
        <select className={SELECT_CLASS} value={type} onChange={(e) => setType(e.target.value as ContactEnquiryType)}>
          {CONTACT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Your name" name="name" required state={state}>
        <Input autoComplete="name" maxLength={120} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Email" name="email" state={state} hint="Email or phone, so we can reply.">
          <Input type="email" autoComplete="email" inputMode="email" maxLength={254} />
        </FormField>
        <FormField label="Phone" name="phone" optional state={state} hint="Include the country code, for example +91.">
          <Input type="tel" autoComplete="tel" inputMode="tel" maxLength={20} />
        </FormField>
      </div>

      {ORG_TYPES.has(type) ? (
        <FormField label={type === "media" ? "Publication or organisation" : "Organisation"} name="organizationName" optional state={state}>
          <Input autoComplete="organization" maxLength={200} />
        </FormField>
      ) : null}

      <FormField label="Subject" name="subject" optional state={state}>
        <Input maxLength={200} />
      </FormField>

      <FormField label="Your message" name="message" required state={state} hint="At least 10 characters. Please do not include passport, Aadhaar or bank details.">
        <Textarea rows={6} maxLength={5000} />
      </FormField>

      <ConsentCheckbox errors={state && !state.ok ? state.fieldErrors?.consentToContact : undefined}>
        I agree that Venkat Sai Global may contact me about this enquiry. Read our{" "}
        <Link href={privacyHref} className="font-medium text-teal-strong underline underline-offset-2">
          privacy policy
        </Link>
        .
      </ConsentCheckbox>

      <SubmitButton pending={pending} pendingLabel="Sending…" size="lg" className="w-full sm:w-auto">
        Send message
      </SubmitButton>
    </form>
  );
}
