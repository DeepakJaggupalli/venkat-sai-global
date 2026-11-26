"use client";

import { Check, Circle, PauseCircle } from "lucide-react";
import { useActionState } from "react";

import { SUBMIT_PILL } from "@/components/public/forms/form-parts";
import { CallButton, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { keepFormValues } from "@/components/shared/form/keep-values";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CV_SUBMISSION_JOURNEY, CV_SUBMISSION_STATUS_LABELS, type CvStatusView } from "@/modules/operations/cv-submission-schemas";

import { checkCvStatusAction } from "./actions";

const INPUT = "h-12 text-base";

function day(iso: string | undefined): string | null {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
}

/** Mobile number + reference lookup, then a step tracker of the placement journey (initials, trade, stage, note only). */
export function CvStatusForm({ defaultReference }: { defaultReference?: string }) {
  const [state, formAction] = useActionState(checkCvStatusAction, null);
  const result = state?.ok ? state.data : undefined;

  return (
    <div className="space-y-6">
      <form action={formAction} onResetCapture={keepFormValues} className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6" noValidate data-testid="cv-status-form">
        <FormErrorAlert state={state} title="We could not show your status" />
        <FormField label="Mobile / WhatsApp number" name="phone" required state={state} hint="The number you gave when you sent your CV.">
          <Input type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="98765 43210" className={INPUT} />
        </FormField>
        <FormField label="Reference" name="reference" required state={state} hint="Shown after you sent your CV, for example VSG-CV-000123.">
          <Input defaultValue={defaultReference} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={24} placeholder="VSG-CV-000123" className={cn(INPUT, "font-mono uppercase sm:max-w-xs")} />
        </FormField>
        <SubmitButton pendingLabel="Checking…" className={SUBMIT_PILL}>Check my status</SubmitButton>
      </form>
      <div aria-live="polite">{result ? <StatusResult view={result} /> : null}</div>
    </div>
  );
}

function StatusResult({ view }: { view: CvStatusView }) {
  const journey: readonly string[] = CV_SUBMISSION_JOURNEY;
  const reached = journey.indexOf(view.journeyStage);
  const aside = view.status === "on_hold" || view.status === "not_suitable";
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" data-testid="cv-status-result" aria-labelledby="cv-status-heading">
      <p className="text-sm text-muted-foreground">
        {view.initials} · {view.trade}
      </p>
      <h2 id="cv-status-heading" className="mt-1 font-heading text-2xl font-bold text-navy">
        {view.status === "not_suitable" ? "Not taken forward for now" : CV_SUBMISSION_STATUS_LABELS[view.status]}
      </h2>
      {aside ? (
        <p className="mt-2 flex items-start gap-2 text-base text-foreground">
          <PauseCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          {view.status === "on_hold"
            ? "Your application is on hold. We will contact you when there is an update."
            : "We could not take your CV forward for the current requirements. We keep it on file and will contact you if a suitable job opens."}
        </p>
      ) : null}
      {view.note ? (
        <div className="mt-4 rounded-xl border border-teal/30 bg-teal-soft p-4 text-base text-foreground" data-testid="cv-status-note">
          <p className="text-sm font-semibold text-navy">Message from our team</p>
          <p className="mt-1 whitespace-pre-line">{view.note}</p>
        </div>
      ) : null}
      {!view.hasCv ? (
        <div className="mt-4 rounded-xl border border-border bg-surface-subtle p-4 text-base text-foreground" data-testid="cv-status-no-cv">
          <p className="text-sm font-semibold text-navy">We do not have your CV yet</p>
          <p className="mt-1">Send it to us on WhatsApp. A clear photo or a PDF is fine.</p>
          <WhatsAppButton message={`Hello Venkat Sai, I am sending my CV for my application ${view.reference}.`} label="Send my CV on WhatsApp" className="mt-3 min-h-12 w-full sm:w-auto" />
        </div>
      ) : null}
      <ol className="mt-6 space-y-0" aria-label="Your placement steps">
        {CV_SUBMISSION_JOURNEY.map((stage, i) => {
          const done = i < reached || (i === reached && view.status === "departed");
          const current = i === reached && !done;
          const date = day(view.stageDates[stage]);
          return (
            <li key={stage} className="relative flex gap-3 pb-5 last:pb-0" aria-current={current ? "step" : undefined}>
              {i < CV_SUBMISSION_JOURNEY.length - 1 ? <span aria-hidden="true" className={cn("absolute top-8 left-[15px] h-[calc(100%-2rem)] w-0.5", i < reached ? "bg-teal" : "bg-border")} /> : null}
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border-2",
                  done ? "border-teal bg-teal text-white" : current ? "border-teal bg-white text-teal" : "border-border bg-white text-muted-foreground",
                )}
              >
                {done ? <Check className="size-4" /> : <Circle className={cn("size-3", current ? "fill-current" : "")} />}
              </span>
              <div className="min-w-0 pt-1">
                <p className={cn("text-base", current ? "font-semibold text-navy" : done ? "text-foreground" : "text-muted-foreground")}>
                  {CV_SUBMISSION_STATUS_LABELS[stage]}
                  <span className="sr-only">{done ? " (done)" : current ? " (current step)" : " (not yet)"}</span>
                </p>
                {date && i <= reached ? <p className="text-sm text-muted-foreground">{date}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <WhatsAppButton message={`Hello Venkat Sai, I would like to ask about my application ${view.reference}.`} className="min-h-14 text-lg" />
        <CallButton label="Call us" className="min-h-14 text-lg" />
      </div>
    </section>
  );
}
