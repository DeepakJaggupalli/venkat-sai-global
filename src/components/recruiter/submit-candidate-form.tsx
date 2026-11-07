"use client";

import { useRouter } from "next/navigation";
import { cloneElement, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { FileUpload } from "@/components/files";
import { Callout } from "@/components/shared/callout";
import { CountrySelect, SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { track } from "@/modules/analytics/client";
import { submitCandidateAction } from "@/modules/recruitment/actions";

import { CONSENT_METHOD_LABELS } from "./labels";
import { buildSubmissionPayload, type SubmissionDraft } from "./submission-payload";

type Mode = "existing" | "new";

/** Inline field with label, hint and error (ids wired for screen readers). */
function Field({ id, label, required, hint, error, children, className }: { id: string; label: string; required?: boolean; hint?: string; error?: string; children: React.ReactElement<Record<string, unknown>>; className?: string }) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-danger-strong" aria-hidden="true">
            {" "}
            *
          </span>
        ) : (
          <span className="font-normal text-muted-foreground"> (optional)</span>
        )}
      </Label>
      {cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, "aria-required": required || undefined })}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-danger-strong">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitCandidateForm({
  assignmentId,
  organizationId,
  candidates,
  targetJobs,
  countries,
  attestation,
  attributionDays,
  defaultMode,
  defaultCandidateId,
}: {
  assignmentId: string;
  organizationId: string;
  candidates: SelectOption[];
  targetJobs: SelectOption[];
  countries: SelectOption[];
  attestation: string;
  attributionDays: number;
  defaultMode: Mode;
  defaultCandidateId?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [result, setResult] = useState<ActionResult<{ submissionId: string; status: string }> | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(0);
  const started = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const fe = result?.ok === false ? (result.fieldErrors ?? {}) : {};
  const err = (...keys: string[]) => keys.map((k) => fe[k]?.[0]).find(Boolean);

  function onUploading(busy: boolean) {
    setUploading((n) => Math.max(0, n + (busy ? 1 : -1)));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || uploading > 0) return;
    const fd = new FormData(event.currentTarget);
    const draft = Object.fromEntries(Array.from(fd.entries()).filter(([, v]) => typeof v === "string")) as SubmissionDraft;
    const payload = buildSubmissionPayload(assignmentId, mode, draft);
    startTransition(async () => {
      const res = await submitCandidateAction(payload as Parameters<typeof submitCandidateAction>[0]);
      setResult(res as ActionResult<{ submissionId: string; status: string }>);
      if (res.ok && res.data) {
        track("form_submitted", { formId: "partner_submission", outcome: res.data.status, candidateKind: mode });
        toast.success(res.message ?? "Candidate submitted.");
        router.push(`/recruiter/submissions/${res.data.submissionId}?submitted=1`);
      } else {
        track("error_shown", { formId: "partner_submission" });
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      onFocus={() => {
        if (started.current) return;
        started.current = true;
        track("form_started", { formId: "partner_submission" });
      }}
      noValidate
      className="space-y-8"
      data-testid="submit-candidate-form"
    >
      {result?.ok === false ? (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <Callout tone="danger" title="The candidate was not submitted" live="assertive">
            {Object.keys(fe).length ? "Check the highlighted fields and try again." : result.error}
          </Callout>
        </div>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="font-heading text-base font-semibold text-foreground">Who are you submitting?</legend>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Candidate">
          {(
            [
              { value: "existing", title: "Someone you sourced before", text: "Pick from your candidate pool.", disabled: candidates.length === 0 },
              { value: "new", title: "A new person", text: "Add their details and resume.", disabled: false },
            ] as const
          ).map((o) => (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                mode === o.value ? "border-navy bg-surface-subtle" : "border-border bg-background",
                o.disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input type="radio" name="mode" value={o.value} checked={mode === o.value} disabled={o.disabled} onChange={() => setMode(o.value)} className="mt-1 size-4 accent-[var(--color-navy)]" />
              <span>
                <span className="block text-sm font-medium text-foreground">{o.title}</span>
                <span className="block text-sm text-muted-foreground">{o.disabled ? "You have no earlier candidates yet." : o.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode === "existing" ? (
        <Field id="candidateId" label="Candidate" required error={err("candidate.candidateId", "candidate")} hint="Only people you sourced or submitted before are listed.">
          <SearchableSelect name="candidateId" options={candidates} defaultValue={defaultCandidateId} placeholder="Choose a candidate" searchPlaceholder="Search by name" emptyText="No matching candidates" />
        </Field>
      ) : (
        <fieldset className="space-y-4">
          <legend className="font-heading text-base font-semibold text-foreground">Candidate details</legend>
          <p className="text-sm text-muted-foreground">
            Venkat Sai creates a private profile and sends the person a notice that you submitted them, with a link to claim the profile. Enter an email or a phone number.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="fullName" label="Full name" required error={err("candidate.fullName")} hint="As on their passport or ID." className="sm:col-span-2">
              <Input name="fullName" autoComplete="off" maxLength={200} />
            </Field>
            <Field id="email" label="Email" error={err("candidate.email")}>
              <Input name="email" type="email" autoComplete="off" maxLength={254} />
            </Field>
            <Field id="phone" label="Mobile number" error={err("candidate.phone")} hint="With country code, for example +91 98480 12345.">
              <Input name="phone" type="tel" autoComplete="off" maxLength={32} />
            </Field>
            <Field id="dateOfBirth" label="Date of birth" error={err("candidate.dateOfBirth")} hint="Used for duplicate checks. Under-18s cannot be submitted for overseas jobs.">
              <Input name="dateOfBirth" type="date" />
            </Field>
            <Field id="nationalityCode" label="Nationality" error={err("candidate.nationalityCode")}>
              <CountrySelect name="nationalityCode" options={countries} allowClear />
            </Field>
            <Field id="currentCountryCode" label="Current country" error={err("candidate.currentCountryCode")}>
              <CountrySelect name="currentCountryCode" options={countries} allowClear />
            </Field>
            <Field id="city" label="City" error={err("candidate.city")}>
              <Input name="city" maxLength={120} />
            </Field>
            <Field id="currentJobTitle" label="Current or last job title" error={err("candidate.currentJobTitle")}>
              <Input name="currentJobTitle" maxLength={200} />
            </Field>
            <Field id="experienceYears" label="Total experience (years)" error={err("candidate.totalExperienceMonths")}>
              <Input name="experienceYears" type="number" inputMode="decimal" min={0} max={60} step={0.5} />
            </Field>
            <Field id="passportNumber" label="Passport number" error={err("candidate.passportNumber")} hint="Stored as a protected value for duplicate checks.">
              <Input name="passportNumber" autoComplete="off" maxLength={20} />
            </Field>
            <Field id="passportExpiry" label="Passport expiry" error={err("candidate.passportExpiry")}>
              <Input name="passportExpiry" type="date" />
            </Field>
            <Field id="preferredLocale" label="Language for the notice" error={err("candidate.preferredLocale")}>
              <SimpleSelect
                name="preferredLocale"
                defaultValue="en"
                options={[
                  { value: "en", label: "English" },
                  { value: "hi", label: "Hindi (हिन्दी)" },
                  { value: "te", label: "Telugu (తెలుగు)" },
                ]}
              />
            </Field>
          </div>
          <FileUpload
            purpose="resume"
            name="resumeFileId"
            organizationId={organizationId}
            label="Resume"
            description="PDF or Word, up to 10 MB."
            invalid={Boolean(err("candidate.resumeFileId"))}
            errorId="resume-error"
            onUploadingChange={onUploading}
          />
          {err("candidate.resumeFileId") ? (
            <p id="resume-error" className="text-sm font-medium text-danger-strong">
              {err("candidate.resumeFileId")}
            </p>
          ) : null}
        </fieldset>
      )}

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-foreground">Submission</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {targetJobs.length > 1 ? (
            <Field id="jobId" label="Job" error={err("jobId")} hint="The requirement has several jobs. Choose the best fit, or leave it for Venkat Sai to decide." className="sm:col-span-2">
              <SimpleSelect name="jobId" options={targetJobs} placeholder="Let Venkat Sai decide" allowClear clearLabel="Let Venkat Sai decide" />
            </Field>
          ) : null}
          <Field id="partnerNotes" label="Notes for Venkat Sai" error={err("partnerNotes")} hint="Why this person fits, availability, notice period. Not shown to the candidate." className="sm:col-span-2">
            <Textarea name="partnerNotes" rows={4} maxLength={4000} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-border bg-surface-subtle p-4 sm:p-5">
        <legend className="px-1 font-heading text-base font-semibold text-foreground">Candidate consent</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="consentMethod" label="How the candidate agreed" required error={err("consent.method")}>
            <SimpleSelect name="consentMethod" options={Object.entries(CONSENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))} placeholder="Choose how" />
          </Field>
          <Field id="consentCapturedOn" label="Date of consent" error={err("consent.capturedOn")}>
            <Input name="consentCapturedOn" type="date" />
          </Field>
        </div>
        <FileUpload
          purpose="candidate_document"
          name="evidenceFileId"
          organizationId={organizationId}
          label="Evidence of consent (optional)"
          description="A signed form, email or message screenshot. PDF or image, up to 10 MB."
          invalid={Boolean(err("consent.evidenceFileId"))}
          onUploadingChange={onUploading}
        />
        <div className="space-y-1.5">
          <div className="flex items-start gap-3">
            <input
              id="consentAttested"
              name="consentAttested"
              type="checkbox"
              value="true"
              aria-required="true"
              aria-invalid={err("consent.attested", "consent") ? true : undefined}
              aria-describedby={err("consent.attested", "consent") ? "consentAttested-error" : undefined}
              className="mt-1 size-4 shrink-0 accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <label htmlFor="consentAttested" className="text-sm leading-6 text-foreground">
              I confirm: {attestation} The candidate has not been and will not be charged any fee for this opportunity.
            </label>
          </div>
          {err("consent.attested", "consent") ? (
            <p id="consentAttested-error" className="text-sm font-medium text-danger-strong">
              {err("consent.attested", "consent")}
            </p>
          ) : null}
        </div>
      </fieldset>

      <Callout tone="info" title="Duplicates and attribution">
        Venkat Sai checks every submission against existing profiles. The first valid submission of a person is attributed to that partner for {attributionDays} days. If
        another partner already represents this person, your submission is held as a duplicate for Venkat Sai to review.
      </Callout>

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" size="lg" aria-disabled={pending || uploading > 0} disabled={uploading > 0}>
          {pending ? "Submitting…" : uploading > 0 ? "Waiting for uploads…" : "Submit candidate"}
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {pending ? "Submitting the candidate" : ""}
      </p>
    </form>
  );
}
