import type { FormEvent } from "react";

/**
 * Keep what the person typed after a form action answers.
 *
 * React 19 resets every uncontrolled field of a `<form action={…}>` once the action finishes, whatever the
 * result: a validation error wiped text, selects and checkboxes (Radix checkboxes follow the form's "reset"
 * event), so people had to fill the whole form in again. `form.reset()` fires a cancelable "reset" event; this
 * capture-phase handler cancels it before Radix's own listener on the form runs. The native action flow stays
 * as it is, so useFormStatus (SubmitButton's pending state) and submitting before hydration keep working.
 *
 *   <form action={formAction} onResetCapture={keepFormValues}>…</form>
 *
 * Forms that should start empty again after a success call resetFormValues(form) themselves.
 */
export function keepFormValues(event: FormEvent<HTMLFormElement>): void {
  const form = event.currentTarget;
  if (form.dataset.allowReset === "true") {
    delete form.dataset.allowReset;
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

/** Deliberately clear a form that uses keepFormValues (for example after a request was sent). */
export function resetFormValues(form: HTMLFormElement | null | undefined): void {
  if (!form) return;
  form.dataset.allowReset = "true";
  form.reset();
}
