"use client";

import Link from "next/link";
import { useState } from "react";

import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DATA_REQUEST_TYPE_LABELS, GUEST_REQUEST_TYPES } from "@/modules/privacy/constants";
import { createGuestDataRequestAction, verifyGuestDataRequestAction } from "@/modules/privacy/actions";

import { Honeypot, SubmissionReceived, usePublicFormAction } from "../../../contact/_components/form-bits";

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive";

const REQUEST_LABELS = { name: "Your name", email: "Email", phone: "Phone", type: "Request type", details: "Details" };
const VERIFY_LABELS = { otp: "6-digit code", code: "Request reference", email: "Email" };

/**
 * Data-subject request for people without an account (or who cannot sign in). Step 1 records the
 * request and emails a 6-digit code; step 2 confirms the code, which puts the request in the
 * privacy team's queue. Rules (honeypot, rate limits, due date) live in the privacy module.
 */
export function GuestDataRequestForm() {
  const { state: requestState, formAction: requestAction, pending: requestPending, onSubmit: onRequestSubmit, formRef: requestRef } = usePublicFormAction(createGuestDataRequestAction);
  const { state: verifyState, formAction: verifyAction, pending: verifyPending, onSubmit: onVerifySubmit, formRef: verifyRef } = usePublicFormAction(verifyGuestDataRequestAction);
  const [email, setEmail] = useState("");

  if (verifyState?.ok) {
    return (
      <SubmissionReceived title="Your request is confirmed" code={verifyState.data?.code}>
        <p>Our privacy team will reply by email within the response time shown on this page. Please keep the reference if you need to follow up.</p>
      </SubmissionReceived>
    );
  }

  if (requestState?.ok) {
    const code = requestState.data?.code ?? null;
    if (!code) {
      return <SubmissionReceived title="Thank you" code={null}><p>If the details were complete, you will receive an email shortly.</p></SubmissionReceived>;
    }
    return (
      <form ref={verifyRef} action={verifyAction} onSubmit={onVerifySubmit} className="space-y-4" noValidate data-testid="guest-data-request-verify">
        <p className="text-sm text-foreground">
          We sent a 6-digit code to <span className="font-medium">{email}</span>. Enter it below to confirm request <span className="font-mono">{code}</span>. The code expires after a short time.
        </p>
        <FormErrorAlert state={verifyState} fieldLabels={VERIFY_LABELS} />
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="email" value={email} />
        <FormField label={VERIFY_LABELS.otp} name="otp" required state={verifyState}>
          <Input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} className="max-w-40 font-mono tracking-widest" />
        </FormField>
        <SubmitButton pending={verifyPending} pendingLabel="Confirming…">Confirm request</SubmitButton>
      </form>
    );
  }

  return (
    <form ref={requestRef} action={requestAction} onSubmit={onRequestSubmit} className="relative space-y-4" noValidate data-testid="guest-data-request">
      <FormErrorAlert state={requestState} fieldLabels={REQUEST_LABELS} />
      <Honeypot />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={REQUEST_LABELS.name} name="name" required state={requestState}>
          <Input autoComplete="name" maxLength={120} />
        </FormField>
        <FormField label={REQUEST_LABELS.email} name="email" required state={requestState} hint="We send a code to this address to confirm it is yours.">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
      </div>
      <FormField label={REQUEST_LABELS.phone} name="phone" optional state={requestState}>
        <Input type="tel" autoComplete="tel" />
      </FormField>
      <FormField label={REQUEST_LABELS.type} name="type" required state={requestState}>
        <select className={SELECT_CLASS} defaultValue="">
          <option value="" disabled>
            Choose a request type
          </option>
          {GUEST_REQUEST_TYPES.map((type) => (
            <option key={type} value={type}>
              {DATA_REQUEST_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label={REQUEST_LABELS.details} name="details" required state={requestState} hint="Tell us what you would like us to do and anything that helps us find your data (at least 10 characters).">
        <Textarea rows={4} maxLength={4000} />
      </FormField>
      <p className="text-sm text-muted-foreground">
        Have an account? Signing in and using{" "}
        <Link href="/account/privacy" className="font-medium text-teal-strong hover:underline">
          Privacy settings
        </Link>{" "}
        is quicker.
      </p>
      <SubmitButton pending={requestPending} pendingLabel="Sending…">Send request</SubmitButton>
    </form>
  );
}
