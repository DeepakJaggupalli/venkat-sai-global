"use client";

import { startTransition, useActionState, useCallback, type FormEvent } from "react";

import type { ActionResult, ActionState } from "@/lib/actions";

type FormActionFn<T> = (prev: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;

/**
 * useActionState for Institution Portal forms. Submitting through onSubmit + startTransition keeps what the
 * person typed when the server returns field errors (React resets uncontrolled forms submitted through the
 * `action` prop). The submitter button is included, so `<button name="asDraft" value="true">` works.
 * Pass `pending` to <SubmitButton pending={pending}> because useFormStatus does not see this submission.
 */
export function useInstitutionForm<T>(action: FormActionFn<T>) {
  const [state, formAction, pending] = useActionState<ActionState<T>, FormData>(action, null);
  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
      let formData: FormData;
      try {
        formData = new FormData(event.currentTarget, submitter);
      } catch {
        formData = new FormData(event.currentTarget);
        if (submitter instanceof HTMLButtonElement && submitter.name) formData.set(submitter.name, submitter.value);
      }
      startTransition(() => formAction(formData));
    },
    [formAction],
  );
  return { state, formAction, pending, onSubmit };
}

/**
 * Pick between two form actions with different result types (e.g. create vs update) for one form.
 * The form only reads `ok`, `message`, `data` (as unknown) and field errors, so widening is safe.
 */
type LooseFormAction = (prev: never, formData: FormData) => Promise<ActionResult<unknown>>;

export function eitherFormAction(a: LooseFormAction, b: LooseFormAction, useFirst: boolean): FormActionFn<unknown> {
  return (useFirst ? a : b) as unknown as FormActionFn<unknown>;
}
