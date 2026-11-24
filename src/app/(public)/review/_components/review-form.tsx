"use client";

import { CheckCircle2, Star } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Honeypot } from "@/components/public/forms/form-parts";
import { CONTACT_BUTTON_STYLES, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { FormErrorAlert, FormField, SubmitButton, fieldErrorsFor } from "@/components/shared/form";
import { keepFormValues } from "@/components/shared/form/keep-values";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  WORKER_REVIEW_BODY_MAX,
  WORKER_REVIEW_NAME_MAX,
  WORKER_REVIEW_RATING_LABELS,
  WORKER_REVIEW_RATINGS,
  WORKER_REVIEW_TRADE_MAX,
  type WorkerReviewRating,
  type WorkerReviewSubmitResult,
} from "@/modules/worker-reviews/schemas";

import { submitWorkerReviewAction } from "../actions";
import { LinkProblem } from "./link-problem";

type Option = { value: string; label: string };

const INPUT = "h-12 text-base md:text-base";
const SELECT =
  "h-12 w-full rounded-lg border border-input bg-white px-3 text-base text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

/**
 * The worker's review: 1 to 5 stars (native radio buttons drawn as large stars), a few words, the name to show,
 * trade and country (prefilled from their CV), and the optional permission to show it on the website.
 */
export function WorkerReviewForm({
  token,
  firstName,
  defaults,
  countries,
}: {
  token: string;
  firstName: string;
  defaults: { displayName: string; trade: string; countryCode: string | null };
  countries: Option[];
}) {
  const [state, formAction] = useActionState(submitWorkerReviewAction, null);
  const [rating, setRating] = useState(0);

  if (state?.ok && state.data) return <ReviewThanks result={state.data} />;
  if (state && !state.ok && state.code === "already_reviewed") return <LinkProblem kind="used" firstName={firstName} />;
  if (state && !state.ok && state.code === "link_expired") return <LinkProblem kind="expired" />;

  return (
    <form
      action={formAction}
      onResetCapture={keepFormValues}
      noValidate
      aria-labelledby="review-form-heading"
      className="relative space-y-6 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-8"
      data-testid="worker-review-form"
    >
      <div>
        <h2 id="review-form-heading" className="font-heading text-xl font-semibold text-foreground sm:text-2xl">
          {firstName ? `${firstName}, tell us how it went` : "Tell us how it went"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Fields marked * are required. It takes about two minutes.</p>
      </div>
      <FormErrorAlert state={state} title="Please check your review" />
      <Honeypot />
      <input type="hidden" name="token" value={token} />

      <StarRating value={rating} onChange={setRating} errors={fieldErrorsFor(state, "rating")} />

      <FormField label="Your review" name="body" required state={state} hint="A few words are enough. You can write in any language.">
        <Textarea rows={4} maxLength={WORKER_REVIEW_BODY_MAX} placeholder="How did we help you? How is your job now?" className="min-h-28 text-base md:text-base" />
      </FormField>

      <FormField label="Name to show" name="displayName" required state={state} hint="Shown with your review, for example: Ravi K.">
        <Input defaultValue={defaults.displayName} maxLength={WORKER_REVIEW_NAME_MAX} autoComplete="off" className={INPUT} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Your trade" name="trade" required state={state}>
          <Input defaultValue={defaults.trade} maxLength={WORKER_REVIEW_TRADE_MAX} autoComplete="off" className={INPUT} />
        </FormField>
        <FormField label="Country where you work" name="countryCode" optional state={state}>
          <select className={SELECT} defaultValue={defaults.countryCode ?? ""}>
            <option value="">Choose a country</option>
            {countries.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <PublishConsent />

      <SubmitButton pendingLabel="Sending…" className="h-auto min-h-14 w-full rounded-full px-8 text-base font-semibold sm:w-auto">
        Send my review
      </SubmitButton>
      <p className="text-sm text-muted-foreground">We never show your phone number, passport or other details.</p>
    </form>
  );
}

/** Five large stars as a native radio group (keyboard: arrow keys), filled up to the chosen one. */
function StarRating({ value, onChange, errors }: { value: number; onChange: (rating: number) => void; errors?: string[] }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const invalid = Boolean(errors?.length);
  const chosen = WORKER_REVIEW_RATING_LABELS[value as WorkerReviewRating];
  return (
    <fieldset data-field-name="rating" aria-describedby={invalid ? `${hintId} ${errorId}` : hintId} className="space-y-2">
      <legend className="text-base font-semibold text-foreground">
        How many stars do you give us?
        <span aria-hidden="true" className="text-danger-strong">
          {" "}
          *
        </span>
      </legend>
      <p id={hintId} className="text-sm text-muted-foreground">
        1 star is poor, 5 stars is excellent.
      </p>
      <div className="flex gap-1 sm:gap-2">
        {WORKER_REVIEW_RATINGS.map((n) => (
          <label
            key={n}
            className="relative flex size-14 cursor-pointer items-center justify-center rounded-xl transition-colors duration-150 hover:bg-surface-subtle has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
            data-testid={`review-star-${n}`}
          >
            <input
              type="radio"
              name="rating"
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="peer sr-only"
            />
            <Star
              aria-hidden="true"
              strokeWidth={1.75}
              className={cn(
                "size-10",
                n <= value ? "fill-current text-teal-strong" : "text-muted-foreground peer-checked:fill-current peer-checked:text-teal-strong",
              )}
            />
            <span className="sr-only">
              {n === 1 ? "1 star" : `${n} stars`}: {WORKER_REVIEW_RATING_LABELS[n]}
            </span>
          </label>
        ))}
      </div>
      <p aria-hidden="true" className="min-h-6 text-base font-medium text-foreground">
        {chosen ? `${value} of 5: ${chosen}` : ""}
      </p>
      {invalid ? (
        <p id={errorId} className="text-sm font-medium text-danger-strong">
          {errors![0]}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Optional, never pre-ticked: without it only our team reads the review. */
function PublishConsent() {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="rounded-xl border border-border bg-surface-subtle p-4">
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          id={id}
          type="checkbox"
          name="consentToPublish"
          value="true"
          aria-describedby={hintId}
          className="mt-0.5 size-6 shrink-0 rounded border-input accent-[var(--brand-navy)] focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <span className="text-base font-medium leading-snug text-foreground">You may show my review on your website</span>
      </label>
      <p id={hintId} className="mt-1 pl-9 text-sm text-muted-foreground">
        With the name, trade and country above. If you leave this empty, only our team reads your review.
      </p>
    </div>
  );
}

function ReviewThanks({ result }: { result: WorkerReviewSubmitResult }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div ref={ref} tabIndex={-1} role="status" className="rounded-2xl border border-success/40 bg-success-soft p-6 focus:outline-none sm:p-8" data-testid="worker-review-thanks">
      <CheckCircle2 className="size-10 text-success-strong" aria-hidden="true" />
      <h2 className="mt-4 font-heading text-2xl font-bold text-foreground">Thank you{result.firstName ? `, ${result.firstName}` : ""}</h2>
      <p className="mt-3 text-base leading-relaxed text-foreground">
        {result.consentToPublish
          ? "We have received your review. Our team reads every review before it goes on our website."
          : "We have received your review. Only our team will read it. It will not be shown on the website."}
      </p>
      <p className="mt-2 text-base text-foreground">We wish you all the best in your job abroad.</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <WhatsAppButton message="Hello Venkat Sai, I have sent my review." className="min-h-14 text-lg" />
        <Link href="/" className={cn(CONTACT_BUTTON_STYLES.outline, "min-h-14 text-lg")}>
          Visit our website
        </Link>
      </div>
    </div>
  );
}
