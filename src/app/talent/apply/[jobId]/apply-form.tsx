"use client";

import { CheckCircle2, GraduationCap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useId, useState } from "react";

import { FileLink, FileUpload } from "@/components/files";
import { enumLabel } from "@/components/jobs/labels";
import { Callout } from "@/components/shared/callout";
import { CopyButton } from "@/components/shared/copy-button";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { keepFormValues } from "@/components/shared/form/keep-values";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";
import type { ActionState } from "@/lib/actions";
import { track } from "@/modules/analytics/client";
import type { FileSummary } from "@/modules/files/types";
import type { PublicScreeningQuestion } from "@/modules/jobs/types";

import { submitApplicationAction } from "./actions";

type Answer = string | number | boolean | string[];
type Option = { value: string; label: string };

type ApplyFormProps = {
  jobId: string;
  jobTitle: string;
  employerName: string;
  questions: PublicScreeningQuestion[];
  profileResume: FileSummary | null;
  currencies: Option[];
  /** The job's own salary currency / period, offered first (never assume a currency). */
  defaultCurrency: string;
  defaultPeriod: string;
};

const SALARY_PERIODS = ["hour", "day", "week", "month", "year", "project"] as const;
const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";

export type ApplyResult = { id: string; code: string; reopened: boolean };

function QuestionField({ question, value, onChange, error }: { question: PublicScreeningQuestion; value: Answer | undefined; onChange: (v: Answer | undefined) => void; error?: string }) {
  const t = useT("talent-jobs");
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [question.helpText ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const label = (
    <>
      {question.question}
      {question.isRequired ? (
        <span className="ms-0.5 text-danger-strong" aria-hidden="true">
          *
        </span>
      ) : (
        <span className="ms-1 text-xs font-normal text-muted-foreground">({t("form.optional")})</span>
      )}
    </>
  );
  const hint = question.helpText ? (
    <p id={hintId} className="text-xs text-muted-foreground">
      {question.helpText}
    </p>
  ) : null;
  const errorText = error ? (
    <p id={errorId} className="text-sm text-danger-strong">
      {error}
    </p>
  ) : null;

  if (question.type === "yes_no" || question.type === "single_choice" || question.type === "multi_choice") {
    const options: Option[] = question.type === "yes_no" ? [{ value: "true", label: t("common.yes") }, { value: "false", label: t("common.no") }] : question.options;
    const multi = question.type === "multi_choice";
    const selected = multi ? (Array.isArray(value) ? value : []) : value === undefined ? "" : String(value);
    return (
      <fieldset className="space-y-2" aria-describedby={describedBy} aria-invalid={!!error || undefined} data-question={question.id}>
        <legend className="text-sm font-medium text-foreground">{label}</legend>
        {hint}
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {options.map((o) => {
            const optionId = `${id}-${o.value}`;
            if (multi) {
              const list = selected as string[];
              return (
                <div key={o.value} className="flex items-center gap-2">
                  <Checkbox
                    id={optionId}
                    checked={list.includes(o.value)}
                    onCheckedChange={(on) => onChange(on === true ? [...list, o.value] : list.filter((v) => v !== o.value))}
                  />
                  <Label htmlFor={optionId} className="text-sm font-normal">
                    {o.label}
                  </Label>
                </div>
              );
            }
            return (
              <label key={o.value} htmlFor={optionId} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  id={optionId}
                  name={`q-${question.id}`}
                  value={o.value}
                  checked={selected === o.value}
                  onChange={() => onChange(question.type === "yes_no" ? o.value === "true" : o.value)}
                  className="size-4 accent-[var(--color-navy)]"
                  required={question.isRequired}
                />
                {o.label}
              </label>
            );
          })}
        </div>
        {errorText}
      </fieldset>
    );
  }

  return (
    <div className="space-y-1.5" data-question={question.id}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      {hint}
      {question.type === "number" ? (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          value={value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          aria-required={question.isRequired || undefined}
          className="max-w-xs"
        />
      ) : (
        <Textarea
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
          maxLength={2000}
          rows={3}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          aria-required={question.isRequired || undefined}
        />
      )}
      {errorText}
    </div>
  );
}

/**
 * "Application submitted" with the application code. The apply page renders it from the URL
 * (?submitted=<application id>) once the form has navigated there, so a refresh keeps it.
 */
export function Confirmation({ result, jobTitle }: { result: ApplyResult; jobTitle: string }) {
  const t = useT("talent-jobs");
  useEffect(() => {
    document.getElementById("apply-done")?.focus();
  }, []);
  return (
    <section className="space-y-4 rounded-xl border bg-card p-6 text-center shadow-xs" aria-labelledby="apply-done" data-testid="apply-confirmation">
      <CheckCircle2 aria-hidden="true" className="mx-auto size-12 text-success-strong" />
      <h2 id="apply-done" className="font-heading text-xl font-semibold text-navy" tabIndex={-1}>
        {result.reopened ? t("apply.resubmittedTitle") : t("apply.submittedTitle")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("apply.submittedBody", { title: jobTitle })}</p>
      <div className="inline-flex items-center gap-2 rounded-lg bg-surface-subtle px-4 py-2">
        <span className="text-sm text-muted-foreground">{t("apply.applicationCode")}</span>
        <span className="font-mono text-base font-semibold text-navy" data-testid="application-code">
          {result.code}
        </span>
        <CopyButton value={result.code} label={t("apply.applicationCode")} />
      </div>
      <p className="text-sm text-muted-foreground">{t("apply.whatNext")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href={`/talent/applications/${result.id}`}>{t("apply.trackApplication")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/talent/jobs">{t("apply.findMore")}</Link>
        </Button>
      </div>
    </section>
  );
}

/**
 * The application form: resume, screening questions, expected salary, cover letter, and explicit
 * consent + declaration. Submission goes through the recruitment module; the confirmation shows the
 * application code. A minor applying for an overseas job gets the module's refusal as a kind note with
 * a route to training instead.
 */
export function ApplyForm({ jobId, jobTitle, employerName, questions, profileResume, currencies, defaultCurrency, defaultPeriod }: ApplyFormProps) {
  const t = useT("talent-jobs");
  const router = useRouter();
  // On success, move to the confirmation URL from the action itself. The action revalidates the People Portal,
  // and the refreshed apply page shows "You have already applied" instead of this form, so the confirmation
  // kept in this component's state was never seen.
  const submit = useCallback(
    async (prev: ActionState<ApplyResult>, formData: FormData) => {
      const result = await submitApplicationAction(prev, formData);
      if (result.ok && result.data) {
        router.replace(`/talent/apply/${jobId}?submitted=${result.data.id}${result.data.reopened ? "&again=1" : ""}`, { scroll: false });
      }
      return result;
    },
    [jobId, router],
  );
  const [state, formAction] = useActionState<ActionState<ApplyResult>, FormData>(submit, null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [resumeChoice, setResumeChoice] = useState<"profile" | "upload">(profileResume ? "profile" : "upload");
  const ids = { consent: useId(), docs: useId(), declaration: useId(), resume: useId() };

  useEffect(() => {
    track("application_started", { jobId });
  }, [jobId]);

  if (state?.ok && state.data) return <Confirmation result={state.data} jobTitle={jobTitle} />;

  const failure = state && !state.ok ? state : null;
  const fieldError = (name: string) => failure?.fieldErrors?.[name]?.[0];

  if (failure?.code === "minor_overseas") {
    return (
      <Callout tone="info" title={t("apply.minorTitle")} icon={<GraduationCap />} action={{ label: t("apply.minorAction"), href: "/talent/training" }} live="polite">
        {t("apply.minorBody")}
      </Callout>
    );
  }

  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-6" noValidate data-testid="apply-form">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="answers:json" value={JSON.stringify(answers)} />
      {failure?.code === "duplicate_application" ? (
        <Callout tone="info" title={t("apply.duplicateTitle")} action={{ label: t("apply.viewApplications"), href: "/talent/applications" }} live="polite">
          {t("apply.duplicateBody")}
        </Callout>
      ) : (
        <FormErrorAlert state={state} title={t("form.fixErrors")} />
      )}

      <section aria-labelledby={ids.resume} className="space-y-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <h2 id={ids.resume} className="font-heading text-base font-semibold text-navy">
          {t("apply.resumeTitle")}
        </h2>
        {profileResume ? (
          <div className="space-y-2" role="radiogroup" aria-labelledby={ids.resume}>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="resumeChoice" value="profile" checked={resumeChoice === "profile"} onChange={() => setResumeChoice("profile")} className="mt-0.5 size-4 accent-[var(--color-navy)]" />
              <span className="space-y-1">
                <span className="block">{t("apply.useProfileResume")}</span>
                <FileLink file={profileResume} />
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="resumeChoice" value="upload" checked={resumeChoice === "upload"} onChange={() => setResumeChoice("upload")} className="size-4 accent-[var(--color-navy)]" />
              {t("apply.uploadDifferent")}
            </label>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("apply.noProfileResume")}</p>
        )}
        {resumeChoice === "upload" ? (
          <FileUpload
            purpose="resume"
            name="resumeFileId"
            label={t("apply.resumeUploadLabel")}
            description={t("apply.resumeUploadHint")}
            invalid={!!fieldError("resumeFileId")}
            errorId="resume-error"
          />
        ) : null}
        {fieldError("resumeFileId") ? (
          <p id="resume-error" className="text-sm text-danger-strong">
            {fieldError("resumeFileId")}
          </p>
        ) : null}
      </section>

      {questions.length ? (
        <section aria-labelledby="apply-questions" className="space-y-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
          <div>
            <h2 id="apply-questions" className="font-heading text-base font-semibold text-navy">
              {t("apply.questionsTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("apply.questionsHint")}</p>
          </div>
          {questions.map((q) => (
            <QuestionField
              key={q.id}
              question={q}
              value={answers[q.id]}
              error={fieldError(`answers.${q.id}`)}
              onChange={(v) =>
                setAnswers((prev) => {
                  const next = { ...prev };
                  if (v === undefined || (Array.isArray(v) && !v.length)) delete next[q.id];
                  else next[q.id] = v;
                  return next;
                })
              }
            />
          ))}
        </section>
      ) : null}

      <section aria-labelledby="apply-extra" className="space-y-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <h2 id="apply-extra" className="font-heading text-base font-semibold text-navy">
          {t("apply.moreTitle")}
        </h2>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">
            {t("apply.expectedSalary")} <span className="text-xs font-normal text-muted-foreground">({t("form.optional")})</span>
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label={t("apply.amount")} name="expectedSalaryAmount" state={state}>
              <Input type="number" inputMode="decimal" min={0} />
            </FormField>
            <FormField label={t("filters.currency")} name="expectedSalaryCurrency" state={state}>
              <select className={SELECT_CLASS} defaultValue={defaultCurrency}>
                <option value="">{t("filters.chooseCurrency")}</option>
                {currencies.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t("filters.period")} name="expectedSalaryPeriod" state={state}>
              <select className={SELECT_CLASS} defaultValue={defaultPeriod}>
                <option value="">{t("filters.choosePeriod")}</option>
                {SALARY_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {enumLabel(t, "salaryPeriod", p)}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </fieldset>
        <FormField label={t("apply.coverLetter")} name="coverLetter" optional state={state} hint={t("apply.coverLetterHint")} labels={{ optional: t("form.optional") }}>
          <Textarea rows={6} maxLength={5000} />
        </FormField>
      </section>

      <section aria-labelledby="apply-consent" className="space-y-3 rounded-xl border border-navy/20 bg-card p-4 shadow-xs sm:p-5">
        <h2 id="apply-consent" className="font-heading text-base font-semibold text-navy">
          {t("apply.consentTitle")}
        </h2>
        {(
          [
            { id: ids.consent, name: "consentToShare", text: t("apply.consentProfile", { employer: employerName }) },
            { id: ids.docs, name: "consentDocuments", text: t("apply.consentDocuments", { employer: employerName }) },
            { id: ids.declaration, name: "declaration", text: t("apply.declaration") },
          ] as const
        ).map((item) => {
          const error = fieldError(item.name);
          return (
            <div key={item.name} className="space-y-1">
              <div className="flex items-start gap-2">
                <Checkbox id={item.id} name={item.name} required aria-invalid={!!error || undefined} aria-describedby={error ? `${item.id}-error` : undefined} className="mt-0.5" />
                <Label htmlFor={item.id} className="text-sm leading-snug font-normal">
                  {item.text}
                </Label>
              </div>
              {error ? (
                <p id={`${item.id}-error`} className="ps-6 text-sm text-danger-strong">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          {t("apply.consentFootnote")}{" "}
          <Link href="/legal/privacy-policy" className="font-medium text-teal-strong underline underline-offset-2">
            {t("privacy.policyLink")}
          </Link>
        </p>
        <p className="rounded-lg bg-teal-soft/60 px-3 py-2 text-sm text-foreground">{t("detail.freeToApply")}</p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="lg" pendingLabel={t("apply.submitting")} data-testid="submit-application">
          {t("apply.submit")}
        </SubmitButton>
        <Button asChild variant="ghost">
          <Link href="/talent/jobs">{t("common.cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
