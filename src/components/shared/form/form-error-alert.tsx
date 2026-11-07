"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";

import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";

import { TONE_STYLES } from "../tones";
import { formErrorOf, listFieldErrors } from "./action-result";

const FOCUSABLE = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** Move focus to a field by name: FormField wrapper first (custom controls), then a named element. */
export function focusField(from: HTMLElement | null, name: string): boolean {
  const scope: ParentNode = from?.closest("form") ?? document;
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(name) : name.replace(/"/g, '\\"');
  const wrapper = scope.querySelector(`[data-field-name="${escaped}"]`);
  const target =
    wrapper?.querySelector<HTMLElement>(FOCUSABLE) ??
    scope.querySelector<HTMLElement>(`[name="${escaped}"]:not([type="hidden"])`) ??
    scope.querySelector<HTMLElement>(`[name="${escaped}[]"]:not([type="hidden"])`);
  if (!target) return false;
  target.focus();
  return true;
}

type FormErrorAlertProps = {
  /** The `useActionState` result. Renders nothing unless it is a failure. */
  state: ActionState<unknown> | undefined;
  title?: string;
  /**
   * Field labels for an error summary with links to each invalid field (recommended on long forms).
   * Fields not listed here are summarised by their message only.
   */
  fieldLabels?: Record<string, string>;
  /** Show the per-field summary list (default: when `fieldLabels` is given). */
  showSummary?: boolean;
  /** Move keyboard focus to the alert when a new error arrives (default true). */
  focusOnError?: boolean;
  className?: string;
};

/**
 * Form-level error for the ActionResult contract: announces the error, takes focus after a failed
 * submission and (optionally) lists each invalid field with a button that moves focus to it.
 *
 *   <FormErrorAlert state={state} fieldLabels={{ title: "Job title", countryCode: "Country" }} />
 */
export function FormErrorAlert({ state, title = "Please fix the following", fieldLabels, showSummary, focusOnError = true, className }: FormErrorAlertProps) {
  const ref = useRef<HTMLDivElement>(null);
  const message = formErrorOf(state);
  const fieldErrors = state && !state.ok ? listFieldErrors(state.fieldErrors) : [];
  const summary = (showSummary ?? Boolean(fieldLabels)) ? fieldErrors : [];

  useEffect(() => {
    if (focusOnError && state && !state.ok) ref.current?.focus();
  }, [state, focusOnError]);

  if (!message) return null;

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      data-slot="form-error-alert"
      className={cn("flex gap-3 rounded-xl border p-4 text-sm outline-none focus-visible:outline-2", TONE_STYLES.danger.surface, TONE_STYLES.danger.border, className)}
    >
      <CircleAlert aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", TONE_STYLES.danger.text)} />
      <div className="min-w-0 space-y-1.5">
        <p className={cn("font-semibold", TONE_STYLES.danger.text)}>{summary.length > 0 ? title : message}</p>
        {summary.length > 0 ? (
          <>
            {message && message !== title ? <p className="text-foreground/90">{message}</p> : null}
            <ul className="list-disc space-y-1 pl-5 text-foreground/90">
              {summary.map(({ name, messages }) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={(e) => focusField(e.currentTarget, name)}
                    className="text-left font-medium underline underline-offset-2 hover:no-underline"
                  >
                    {fieldLabels?.[name] ? `${fieldLabels[name]}: ` : null}
                    {messages[0]}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
