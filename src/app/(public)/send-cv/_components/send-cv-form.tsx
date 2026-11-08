"use client";

import { FileUp, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";

import { ConsentCheckbox, Honeypot } from "@/components/public/forms/form-parts";
import { FormErrorAlert, FormField, fieldErrorsFor } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult, ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { CV_ACCEPT, CV_MAX_BYTES, CV_TYPES_LABEL, OTHER_TRADE, type CvSubmissionResult } from "@/modules/operations/cv-submission-schemas";

import { CvConfirmation } from "./cv-confirmation";

type Option = { value: string; label: string };

const SELECT =
  "h-12 w-full rounded-lg border border-input bg-white px-3 text-base text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";
const INPUT = "h-12 text-base";

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The short "Send your CV" form. Posts the fields and the CV together to /send-cv/submit (a route handler, so
 * the file is not limited by the Server Action body size). Without JavaScript the same form posts normally and
 * the handler redirects back with the reference.
 */
export function SendCvForm({
  trades,
  countries,
  requirement,
  whatsappGroupUrl,
}: {
  trades: Option[];
  countries: Option[];
  requirement: { slug: string; title: string } | null;
  whatsappGroupUrl: string | null;
}) {
  const [state, setState] = useState<ActionState<CvSubmissionResult>>(null);
  const [pending, startTransition] = useTransition();
  const [trade, setTrade] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [requirementRef, setRequirementRef] = useState(requirement);
  const fileInput = useRef<HTMLInputElement>(null);

  if (state?.ok && state.data) {
    return <CvConfirmation result={state.data} whatsappGroupUrl={whatsappGroupUrl} />;
  }

  const cvErrors = fileError ? [fileError] : fieldErrorsFor(state, "cv");

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null;
    setFile(chosen);
    if (!chosen) return setFileError(null);
    if (chosen.size > CV_MAX_BYTES) setFileError("This file is larger than 4 MB. Choose a smaller file, or take a photo of the first page of your CV.");
    else if (chosen.size === 0) setFileError("This file is empty.");
    else setFileError(null);
  };

  const clearFile = () => {
    setFile(null);
    setFileError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (fileError) {
      fileInput.current?.focus();
      return;
    }
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const response = await fetch("/send-cv/submit", { method: "POST", body: data, headers: { Accept: "application/json" } });
        const result = (await response.json().catch(() => null)) as ActionResult<CvSubmissionResult> | null;
        setState(result ?? { ok: false, error: response.status === 413 ? "The CV is larger than 4 MB. Send a smaller file." : "Something went wrong. Please try again." });
      } catch {
        setState({ ok: false, error: "We could not reach our server. Check your internet connection and try again, or send your CV on WhatsApp." });
      }
    });
  };

  return (
    <form
      action="/send-cv/submit"
      method="post"
      encType="multipart/form-data"
      onSubmit={onSubmit}
      noValidate
      aria-labelledby="send-cv-heading"
      className="relative space-y-5 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-8"
      data-testid="send-cv-form"
    >
      <div>
        <h2 id="send-cv-heading" className="font-heading text-xl font-semibold text-navy sm:text-2xl">
          Your details
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Fields marked * are required. It takes about two minutes.</p>
      </div>
      <FormErrorAlert state={state} />
      <Honeypot />

      {requirementRef ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-teal/40 bg-teal-soft p-4" data-testid="requirement-ref">
          <p className="text-sm text-foreground">
            Applying for: <strong className="font-semibold">{requirementRef.title}</strong>
          </p>
          <input type="hidden" name="requirement" value={requirementRef.slug} />
          <button type="button" onClick={() => setRequirementRef(null)} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-medium text-navy hover:bg-white" aria-label="Remove this requirement (send a general CV)">
            <X className="size-4" aria-hidden="true" />
            Remove
          </button>
        </div>
      ) : null}

      <FormField label="Full name" name="name" required state={state}>
        <Input autoComplete="name" maxLength={120} className={INPUT} />
      </FormField>

      <FormField label="Mobile / WhatsApp number" name="phone" required state={state} hint="Include the country code if your number is not Indian, for example +971.">
        <Input type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="98765 43210" className={INPUT} />
      </FormField>

      <FormField label="Your trade" name="trade" required state={state}>
        <select className={SELECT} value={trade} onChange={(e) => setTrade(e.target.value)}>
          <option value="">Choose your trade</option>
          {trades.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
          <option value={OTHER_TRADE}>Other (type your trade)</option>
        </select>
      </FormField>

      {trade === OTHER_TRADE ? (
        <FormField label="Type your trade" name="tradeOther" required state={state}>
          <Input maxLength={120} placeholder="For example: Mechanical helper" className={INPUT} />
        </FormField>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Years of experience" name="experienceYears" optional state={state}>
          <Input type="number" inputMode="numeric" min={0} max={60} step={1} className={INPUT} />
        </FormField>
        <FormField label="Preferred country" name="preferredCountryCode" optional state={state}>
          <select className={SELECT} defaultValue="">
            <option value="">Any country</option>
            {countries.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">
          Do you have a passport? <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        <div className="flex gap-3">
          {[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ].map((o) => (
            <label key={o.value} className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-input px-4 text-base has-checked:border-navy has-checked:bg-surface-subtle">
              <input type="radio" name="hasPassport" value={o.value} className="size-5 accent-[var(--brand-navy)]" />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <FormField label="Passport number" name="passportNumber" optional state={state} hint="As printed on your passport (6 to 12 letters and digits). Kept encrypted and seen only by our recruitment team.">
        <Input autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={14} placeholder="For example: Z1234567" className={cn(INPUT, "uppercase")} />
      </FormField>

      <FormField label="Notes for us" name="candidateNotes" optional state={state} hint="Anything we should know: certificates, Gulf experience, when you can travel.">
        <Textarea rows={3} maxLength={1000} className="text-base" />
      </FormField>

      <FormField label="Your CV" name="cv" required errors={cvErrors} hint={`${CV_TYPES_LABEL}, up to 4 MB. A clear photo of your CV is fine.`}>
        {(control) => (
          <div className="space-y-2">
            <label
              htmlFor={control.id}
              className={cn(
                "flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-navy/30 bg-surface-subtle px-4 py-3 text-base font-semibold text-navy hover:border-navy/60 focus-within:ring-3 focus-within:ring-ring/50",
                cvErrors?.length ? "border-destructive" : null,
              )}
            >
              <FileUp className="size-6 shrink-0" aria-hidden="true" />
              <span>{file ? "Choose a different file" : "Choose your CV file or photo"}</span>
            </label>
            <input {...control} ref={fileInput} type="file" accept={CV_ACCEPT} onChange={onFile} className="sr-only" data-testid="cv-input" />
            {file ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-foreground" data-testid="cv-chosen">
                <span className="font-medium">{file.name}</span>
                <span className="text-muted-foreground">{formatSize(file.size)}</span>
                <button type="button" onClick={clearFile} className="rounded-md px-2 py-1 text-sm font-medium text-navy underline underline-offset-4 hover:bg-surface-subtle">
                  Remove
                </button>
              </p>
            ) : null}
          </div>
        )}
      </FormField>

      <ConsentCheckbox state={state} label="I agree that Venkat Sai Global may call, WhatsApp or message me about jobs and keep my CV for this purpose." />

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-navy px-6 text-base font-semibold text-white hover:bg-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70 sm:w-auto"
        data-testid="send-cv-submit"
      >
        {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : null}
        {pending ? "Sending your CV..." : "Send my CV"}
      </button>
      <p aria-live="polite" className="sr-only">
        {pending ? "Sending your CV" : ""}
      </p>
      <p className="text-sm text-muted-foreground">
        Venkat Sai never charges candidates to apply for a job.{" "}
        <Link href="/safe-recruitment" className="font-medium text-teal-strong underline underline-offset-4">
          How to stay safe
        </Link>
      </p>
    </form>
  );
}
