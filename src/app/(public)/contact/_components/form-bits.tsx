"use client";

import { CheckCircle2 } from "lucide-react";
import { startTransition, useActionState, useCallback, useEffect, useRef, type FormEvent, type ReactNode } from "react";

import { ContactButtons } from "@/components/public/requirements/contact-buttons";
import { CopyButton } from "@/components/shared/copy-button";
import type { ActionResult, ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";

type FormActionFn<T> = (prev: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;

/**
 * useActionState wrapper for public forms. Submitting through onSubmit + startTransition keeps what the
 * visitor typed when the server returns field errors (React resets forms submitted through the `action`
 * prop); the `action` prop still makes the form work without JavaScript.
 */
export function usePublicFormAction<T>(action: FormActionFn<T>) {
  const [state, formAction, pending] = useActionState<ActionState<T>, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      startTransition(() => formAction(formData));
    },
    [formAction],
  );
  return { state, formAction, pending, onSubmit, formRef };
}

/**
 * Spam trap: a field people never see or reach. Bots that fill it are dropped silently by the
 * operations module (the visitor sees the normal confirmation, without a reference code).
 */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden" data-nosnippet="">
      <label htmlFor="website-field">Leave this field empty</label>
      <input id="website-field" type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
    </div>
  );
}

/** Required consent checkbox (`consentToContact`) with inline error. */
export function ConsentCheckbox({ errors, children, id = "consent-to-contact" }: { errors?: string[]; children: ReactNode; id?: string }) {
  const errorId = `${id}-error`;
  const invalid = Boolean(errors?.length);
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          name="consentToContact"
          value="true"
          required
          aria-required="true"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          className="mt-1 size-4 shrink-0 rounded border-input accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <label htmlFor={id} className="text-sm leading-6 text-foreground">
          {children}
        </label>
      </div>
      {invalid ? (
        <p id={errorId} className="pl-7 text-sm font-medium text-danger-strong">
          {errors![0]}
        </p>
      ) : null}
    </div>
  );
}

/** Confirmation shown after a public form is accepted, with the reference code when one was issued. */
export function SubmissionReceived({
  title,
  code,
  codeLabel = "Your reference",
  children,
  actions,
  className,
}: {
  title: string;
  code: string | null | undefined;
  codeLabel?: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      data-testid="form-confirmation"
      className={cn("rounded-xl border border-success/40 bg-success-soft/60 p-6 focus:outline-none sm:p-8", className)}
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success-strong" aria-hidden="true" />
        <div className="min-w-0 space-y-3">
          <h2 className="font-heading text-xl font-semibold text-navy">{title}</h2>
          {code ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{codeLabel}:</span>
              <span className="rounded-md bg-white px-2.5 py-1 font-mono text-base font-semibold text-navy" data-testid="reference-code">
                {code}
              </span>
              <CopyButton value={code} label="reference" />
            </div>
          ) : null}
          {children ? <div className="space-y-2 text-sm leading-6 text-foreground">{children}</div> : null}
          {actions ? <div className="flex flex-wrap gap-3 pt-1">{actions}</div> : null}
          <div className="space-y-2 pt-2">
            <p className="text-sm font-medium text-foreground">Need a quicker answer? Contact us directly:</p>
            <ContactButtons message={code ? `Hello Venkat Sai, my reference is ${code}.` : undefined} emailSubject={code ? `Reference ${code}` : undefined} />
          </div>
        </div>
      </div>
    </div>
  );
}
