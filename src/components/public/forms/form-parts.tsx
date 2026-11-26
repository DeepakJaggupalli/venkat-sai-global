"use client";

import Link from "next/link";
import { useId } from "react";

import { fieldErrorsFor } from "@/components/shared/form";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";

/**
 * Main submit button of a public form: the black pill (DESIGN.md), at least 48px tall so it is easy to tap on a
 * phone, full width on phones. Pass to `<SubmitButton className={SUBMIT_PILL}>`.
 */
export const SUBMIT_PILL = "h-auto min-h-12 w-full rounded-full bg-foreground px-6 text-base font-semibold text-white hover:bg-[#26262b] sm:w-auto";

/**
 * Hidden honeypot field (`website`). Real visitors never see or reach it (off-screen, not focusable, hidden from
 * assistive technology); bots that fill it are dropped silently by the operations module.
 */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

/** Required "consent to contact" checkbox with the privacy policy link and inline error. */
export function ConsentCheckbox({ state, label, className }: { state: ActionState<unknown> | undefined; label: string; className?: string }) {
  const id = useId();
  const errors = fieldErrorsFor(state, "consentToContact");
  const errorId = `${id}-error`;
  return (
    <div className={cn("relative", className)}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          name="consentToContact"
          value="true"
          required
          aria-required="true"
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={errors?.length ? errorId : undefined}
          className="mt-0.5 size-5 shrink-0 rounded border-input accent-[var(--brand-navy)] focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <label htmlFor={id} className="text-sm leading-relaxed text-foreground">
          {label} See our{" "}
          <Link href="/legal/privacy-policy" className="font-medium text-teal-strong underline underline-offset-4">
            privacy policy
          </Link>
          .
        </label>
      </div>
      {errors?.length ? (
        <p id={errorId} className="mt-2 text-sm font-medium text-danger-strong">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}
