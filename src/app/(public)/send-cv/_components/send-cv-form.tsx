"use client";

import { FileUp, Loader2, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";

import { ConsentCheckbox, Honeypot } from "@/components/public/forms/form-parts";
import { SharedFileCard, type SharedFileView } from "@/components/public/shared-file-card";
import { FormErrorAlert, FormField, fieldErrorsFor } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult, ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { CV_ACCEPT, CV_MAX_BYTES, CV_TYPES_LABEL, OTHER_TRADE, POSTER_TRADE_PREFIX, type CvSubmissionResult } from "@/modules/operations/cv-submission-schemas";

import { CvConfirmation } from "./cv-confirmation";

type Option = { value: string; label: string };

const SELECT =
  "h-12 w-full rounded-lg border border-input bg-white px-3 text-base text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";
const INPUT = "h-12 text-base";

/** Error summary labels (links to each invalid field). */
const FIELD_LABELS: Record<string, string> = {
  name: "Full name",
  phone: "Mobile / WhatsApp number",
  trade: "Your trade",
  tradeOther: "Type your trade",
  experienceAbroadYears: "Experience abroad",
  experienceIndiaYears: "Experience in India",
  passportNumber: "Passport number",
  passportExpiry: "Passport expiry date",
  email: "Email",
  cv: "CV",
  preferredCountryCode: "Preferred country",
  consentToContact: "Permission to contact you",
};

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The quick apply form ("Send your CV"): name, mobile number and trade are required; experience, passport, email, CV
 * file, country and notes are optional. Posts the fields and the optional CV together to /send-cv/submit (a route
 * handler, so the file is not limited by the Server Action body size). Without JavaScript the same form posts normally
 * and the handler redirects back with the reference. A file shared from the phone (/share → ?shared=<token>) is shown
 * instead of the picker and sent as the `shared` token (no new upload). From a poster, its trades come first.
 */
export function SendCvForm({
  trades,
  posterTrades = [],
  countries,
  requirement,
  whatsappGroupUrl,
  shared = null,
  referralCode = null,
  defaults = {},
}: {
  trades: Option[];
  /** The poster's trades (values: category id or "other:<trade>"), offered first while applying for it. */
  posterTrades?: Option[];
  countries: Option[];
  requirement: { slug: string; title: string; countryName?: string | null } | null;
  whatsappGroupUrl: string | null;
  shared?: SharedFileView | null;
  referralCode?: string | null;
  /** Prefill from the signed-in account. */
  defaults?: { name?: string; email?: string; phone?: string };
}) {
  const [state, setState] = useState<ActionState<CvSubmissionResult>>(null);
  const [pending, startTransition] = useTransition();
  const [requirementRef, setRequirementRef] = useState(requirement);
  const showPosterTrades = Boolean(requirementRef) && posterTrades.length > 0;
  // One trade on the poster: chosen for the candidate (they can still change it).
  const [trade, setTrade] = useState(posterTrades.length === 1 && requirement ? posterTrades[0]!.value : "");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sharedFile, setSharedFile] = useState(shared);
  const fileInput = useRef<HTMLInputElement>(null);

  if (state?.ok && state.data) {
    return <CvConfirmation result={state.data} whatsappGroupUrl={whatsappGroupUrl} />;
  }

  const cvErrors = fileError ? [fileError] : fieldErrorsFor(state, "cv");

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null;
    setFile(chosen);
    if (!chosen) return setFileError(null);
    if (chosen.size > CV_MAX_BYTES) setFileError("This file is larger than 4 MB. Choose a smaller file, take a photo of the first page, or apply without it and send it on WhatsApp.");
    else if (chosen.size === 0) setFileError("This file is empty.");
    else setFileError(null);
  };

  const clearFile = () => {
    setFile(null);
    setFileError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const removeRequirement = () => {
    setRequirementRef(null);
    if (trade.startsWith(POSTER_TRADE_PREFIX)) setTrade("");
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
        setState(result ?? { ok: false, error: response.status === 413 ? "The CV is larger than 4 MB. Send a smaller file, or apply without it." : "Something went wrong. Please try again." });
      } catch {
        setState({ ok: false, error: "We could not reach our server. Check your internet connection and try again, or apply on WhatsApp." });
      }
    });
  };

  const tradeOptions = (list: Option[], prefix: string) =>
    list.map((t) => (
      <option key={`${prefix}-${t.value}`} value={t.value}>
        {t.label}
      </option>
    ));

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
          Apply in one minute
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Only the fields marked * are needed. Everything else is optional but helps us find you the right job.</p>
      </div>
      <FormErrorAlert state={state} fieldLabels={FIELD_LABELS} />
      <Honeypot />
      {referralCode ? (
        <>
          <input type="hidden" name="referralCode" value={referralCode} />
          <p className="rounded-xl border border-border bg-surface-subtle p-4 text-sm text-muted-foreground" data-testid="referral-notice">
            A friend referred you. They will see only your first name, last initial, trade and progress, never your number or
            documents. Applying is free.
          </p>
        </>
      ) : null}

      {requirementRef ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-teal/40 bg-teal-soft p-4" data-testid="requirement-ref">
          <p className="min-w-0 text-sm text-foreground">
            Applying for: <strong className="font-semibold break-words">{requirementRef.title}</strong>
            {requirementRef.countryName ? <span className="text-muted-foreground"> ({requirementRef.countryName})</span> : null}
          </p>
          <input type="hidden" name="requirement" value={requirementRef.slug} />
          <button
            type="button"
            onClick={removeRequirement}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-medium text-navy hover:bg-white"
            aria-label="Remove this requirement (apply for any suitable job)"
          >
            <X className="size-4" aria-hidden="true" />
            Remove
          </button>
        </div>
      ) : null}

      <FormField label="Full name" name="name" required state={state}>
        <Input autoComplete="name" maxLength={120} defaultValue={defaults.name} className={INPUT} />
      </FormField>

      <FormField label="Mobile / WhatsApp number" name="phone" required state={state} hint="Include the country code if your number is not Indian, for example +971.">
        <Input type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="98765 43210" defaultValue={defaults.phone} className={INPUT} />
      </FormField>

      <FormField label="Your trade" name="trade" required state={state} hint={showPosterTrades ? "The jobs in this requirement are at the top of the list." : undefined}>
        <select className={SELECT} value={trade} onChange={(e) => setTrade(e.target.value)} data-testid="trade-select">
          <option value="">Choose your trade</option>
          {showPosterTrades ? (
            <>
              <optgroup label="Jobs in this requirement">{tradeOptions(posterTrades, "poster")}</optgroup>
              <optgroup label="All trades">
                {tradeOptions(trades, "all")}
                <option value={OTHER_TRADE}>Other (type your trade)</option>
              </optgroup>
            </>
          ) : (
            <>
              {tradeOptions(trades, "all")}
              <option value={OTHER_TRADE}>Other (type your trade)</option>
            </>
          )}
        </select>
      </FormField>

      {trade === OTHER_TRADE ? (
        <FormField label="Type your trade" name="tradeOther" required state={state}>
          <Input maxLength={120} placeholder="For example: Mechanical helper" className={INPUT} />
        </FormField>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">
          Work experience in years <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Abroad" name="experienceAbroadYears" state={state} hint="Gulf, Singapore, Malaysia…">
            <Input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={2} className={cn(INPUT, "tabular-nums")} />
          </FormField>
          <FormField label="In India" name="experienceIndiaYears" state={state}>
            <Input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={2} className={cn(INPUT, "tabular-nums")} />
          </FormField>
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Passport number" name="passportNumber" optional state={state} hint="As printed on your passport. Kept encrypted; only our recruitment team sees it.">
          <Input autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={14} placeholder="Z1234567" className={cn(INPUT, "uppercase")} />
        </FormField>
        <FormField label="Passport expiry date" name="passportExpiry" optional state={state} hint="We remind you before it runs out.">
          <Input type="date" min="2000-01-01" max="2060-12-31" className={INPUT} />
        </FormField>
      </div>

      <FormField label="Email" name="email" optional state={state}>
        <Input type="email" inputMode="email" autoComplete="email" spellCheck={false} maxLength={254} placeholder="name@gmail.com" defaultValue={defaults.email} className={INPUT} />
      </FormField>

      {sharedFile ? (
        <div className="space-y-2">
          <input type="hidden" name="shared" value={sharedFile.token} />
          <SharedFileCard
            file={sharedFile}
            label="Your CV (shared from your phone)"
            action={
              <button type="button" onClick={() => setSharedFile(null)} className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm font-medium text-navy underline underline-offset-4 hover:bg-surface-subtle">
                Change
              </button>
            }
          />
          {cvErrors?.length ? (
            <p role="alert" className="text-sm text-danger-strong">
              {cvErrors[0]}
            </p>
          ) : null}
        </div>
      ) : (
        <FormField label="Upload CV (photo or PDF)" name="cv" optional errors={cvErrors} hint={`${CV_TYPES_LABEL}, up to 4 MB. A clear photo of your CV is fine.`}>
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
                  <span className="min-w-0 font-medium break-all">{file.name}</span>
                  <span className="text-muted-foreground">{formatSize(file.size)}</span>
                  <button type="button" onClick={clearFile} className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-navy underline underline-offset-4 hover:bg-surface-subtle">
                    Remove
                  </button>
                </p>
              ) : (
                <p className="flex items-start gap-2 text-sm text-foreground" data-testid="no-cv-note">
                  <MessageCircle className="mt-0.5 size-4 shrink-0 text-success-strong" aria-hidden="true" />
                  <span>
                    <strong className="font-semibold">No CV? Apply now and send it later on WhatsApp.</strong>
                  </span>
                </p>
              )}
            </div>
          )}
        </FormField>
      )}

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

      <FormField label="Notes for us" name="candidateNotes" optional state={state} hint="Anything we should know: certificates, Gulf experience, when you can travel.">
        <Textarea rows={3} maxLength={1000} className="text-base" />
      </FormField>

      <ConsentCheckbox state={state} label="I agree that Venkat Sai Global may call, WhatsApp or message me about jobs and keep my details for this purpose." />

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-navy px-8 text-base font-semibold text-white hover:bg-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70 sm:w-auto"
        data-testid="send-cv-submit"
      >
        {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : null}
        Apply now
      </button>
      <p aria-live="polite" className="sr-only">
        {pending ? "Sending your application…" : ""}
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
