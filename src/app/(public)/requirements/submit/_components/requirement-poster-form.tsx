"use client";

import { ImageUp, Loader2 } from "lucide-react";
import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";

import { ConsentCheckbox, Honeypot } from "@/components/public/forms/form-parts";
import { SharedFileCard, type SharedFileView } from "@/components/public/shared-file-card";
import { FormErrorAlert, FormField, fieldErrorsFor } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult, ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { POSTER_SUBMISSION_ACCEPT, POSTER_SUBMISSION_MAX_BYTES, POSTER_SUBMISSION_TYPES_LABEL, type PublicPosterSubmissionResult } from "@/modules/operations/requirement-poster-schemas";

import { RequirementConfirmation } from "./requirement-confirmation";

type Option = { value: string; label: string };

const SELECT =
  "h-12 w-full rounded-lg border border-input bg-white px-3 text-base text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";
const INPUT = "h-12 text-base";

/**
 * Short public "Post a requirement" form. Posts fields + poster photo together to /requirements/submit/send (a
 * route handler: the photo may be up to 4 MB). A poster shared from the phone (?shared=<token>) is sent as the
 * `shared` token instead. Without JavaScript the form posts normally and the handler redirects back.
 */
export function RequirementPosterForm({ countries, shared }: { countries: Option[]; shared: SharedFileView | null }) {
  const [state, setState] = useState<ActionState<PublicPosterSubmissionResult>>(null);
  const [pending, startTransition] = useTransition();
  const [sharedFile, setSharedFile] = useState(shared);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (state?.ok && state.data) return <RequirementConfirmation code={state.data.code} companyName={state.data.companyName} />;

  const posterErrors = fileError ? [fileError] : fieldErrorsFor(state, "poster");

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null;
    setFile(chosen);
    if (!chosen) return setFileError(null);
    if (chosen.size > POSTER_SUBMISSION_MAX_BYTES) setFileError("This photo is larger than 4 MB. Choose a smaller photo or a screenshot of the poster.");
    else if (!chosen.type.startsWith("image/")) setFileError("Choose a photo of the poster.");
    else setFileError(null);
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
        const response = await fetch("/requirements/submit/send", { method: "POST", body: data, headers: { Accept: "application/json" } });
        const result = (await response.json().catch(() => null)) as ActionResult<PublicPosterSubmissionResult> | null;
        setState(result ?? { ok: false, error: response.status === 413 ? "The photo is larger than 4 MB. Choose a smaller photo." : "Something went wrong. Please try again." });
      } catch {
        setState({ ok: false, error: "We could not reach our server. Check your internet connection and try again, or send the poster on WhatsApp." });
      }
    });
  };

  return (
    <form
      action="/requirements/submit/send"
      method="post"
      encType="multipart/form-data"
      onSubmit={onSubmit}
      noValidate
      aria-labelledby="requirement-form-heading"
      className="relative space-y-5 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-8"
      data-testid="requirement-poster-form"
    >
      <div>
        <h2 id="requirement-form-heading" className="font-heading text-xl font-semibold text-navy sm:text-2xl">
          Your requirement
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Fields marked * are required. Your contact details are never shown on the website.</p>
      </div>
      <FormErrorAlert state={state} />
      <Honeypot />

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          Poster photo <span className="text-danger-strong">*</span>
        </p>
        {sharedFile ? (
          <>
            <input type="hidden" name="shared" value={sharedFile.token} />
            <SharedFileCard
              file={sharedFile}
              label="Shared from your phone"
              action={
                <button type="button" onClick={() => setSharedFile(null)} className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-navy underline underline-offset-4 hover:bg-surface-subtle">
                  Change
                </button>
              }
            />
          </>
        ) : (
          <>
            <label
              htmlFor="poster"
              className={cn(
                "flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-navy/30 bg-surface-subtle px-4 py-3 text-base font-semibold text-navy hover:border-navy/60 focus-within:ring-3 focus-within:ring-ring/50",
                posterErrors?.length ? "border-destructive" : null,
              )}
            >
              <ImageUp className="size-6 shrink-0" aria-hidden="true" />
              <span>{file ? "Choose a different photo" : "Choose photo"}</span>
            </label>
            <input
              id="poster"
              name="poster"
              ref={fileInput}
              type="file"
              accept={POSTER_SUBMISSION_ACCEPT}
              onChange={onFile}
              aria-invalid={posterErrors?.length ? true : undefined}
              aria-describedby="poster-hint"
              className="sr-only"
              data-testid="poster-input"
            />
            {file ? <p className="text-sm font-medium text-foreground">{file.name}</p> : null}
            <p id="poster-hint" className="text-sm text-muted-foreground">
              {POSTER_SUBMISSION_TYPES_LABEL}, up to 4 MB. A screenshot of the poster is fine.
            </p>
          </>
        )}
        {posterErrors?.length ? (
          <p role="alert" className="text-sm text-danger-strong">
            {posterErrors[0]}
          </p>
        ) : null}
      </div>

      <FormField label="Company name" name="companyName" required state={state}>
        <Input autoComplete="organization" maxLength={160} className={INPUT} />
      </FormField>
      <FormField label="Your name" name="contactName" required state={state}>
        <Input autoComplete="name" maxLength={120} className={INPUT} />
      </FormField>
      <FormField label="Phone / WhatsApp number" name="phone" required state={state} hint="Include the country code if the number is not Indian, for example +971.">
        <Input type="tel" inputMode="tel" autoComplete="tel" maxLength={20} className={INPUT} />
      </FormField>
      <FormField label="Email" name="email" optional state={state}>
        <Input type="email" inputMode="email" autoComplete="email" maxLength={200} className={INPUT} />
      </FormField>
      <FormField label="Country of work" name="countryCode" optional state={state}>
        <select className={SELECT} defaultValue="">
          <option value="">Choose a country</option>
          {countries.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Trades and salary" name="trades" optional state={state} hint="One per line, salary after a dash. For example: Mechanical helper - 900 AED">
        <Textarea rows={4} maxLength={4000} className="text-base" defaultValue={shared?.sharedText ?? undefined} />
      </FormField>
      <FormField label="Notes for us" name="notes" optional state={state} hint="Number of workers, food and accommodation, joining date, interview details.">
        <Textarea rows={3} maxLength={2000} className="text-base" />
      </FormField>

      <ConsentCheckbox state={state} label="I agree that Venkat Sai Global may call, WhatsApp or email me about this requirement." />

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-navy px-6 text-base font-semibold text-white hover:bg-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70 sm:w-auto"
        data-testid="requirement-submit"
      >
        {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : null}
        {pending ? "Sending..." : "Send requirement"}
      </button>
      <p aria-live="polite" className="sr-only">
        {pending ? "Sending your requirement" : ""}
      </p>
    </form>
  );
}
