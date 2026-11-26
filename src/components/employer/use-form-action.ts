"use client";

import { startTransition, useActionState, useCallback, type FormEvent } from "react";

import type { ActionResult, ActionState } from "@/lib/actions";

type FormActionFn<T> = (prev: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;

/**
 * useActionState for Employer Portal forms. Submitting through onSubmit + startTransition keeps what the
 * person typed when the server returns field errors (React resets uncontrolled forms submitted through the
 * `action` prop). The submitter button is included, so `<button name="asDraft" value="true">` works.
 * Pass `pending` to <SubmitButton pending={pending}>. React also marks the whole <form> pending (useFormStatus), so a
 * form with two submit buttons sets `indicator` on each to show the pending label only on the one that was clicked.
 */
export function useEmployerForm<T>(action: FormActionFn<T>) {
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
