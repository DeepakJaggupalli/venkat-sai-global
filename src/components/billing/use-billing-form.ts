"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { useActionToast } from "@/components/shared/form";
import type { ActionResult, ActionState } from "@/lib/actions";

type FormActionFn<T> = (prev: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;

type Options<T> = {
  /** Called once per successful submission with the result data. */
  onSuccess?: (data: T | undefined) => void;
  /** Re-render the current route after success (default true) so server data refreshes. */
  refresh?: boolean;
  /** Clear the form after success (bumps `formKey`; put `key={formKey}` on the form). */
  resetOnSuccess?: boolean;
};

/**
 * useActionState for billing forms. Submitting through onSubmit + startTransition keeps typed values when the
 * server returns field errors. Toasts the result message, refreshes the route on success and optionally resets.
 * Pass `pending` to <SubmitButton pending={pending}> (useFormStatus does not see this submission).
 */
export function useBillingForm<T>(action: FormActionFn<T>, options: Options<T> = {}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState<T>, FormData>(action, null);
  const [formKey, setFormKey] = useState(0);
  const last = useRef(state);
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });
  useActionToast(state);

  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (!state?.ok) return;
    if (opts.current.resetOnSuccess) setFormKey((k) => k + 1);
    opts.current.onSuccess?.(state.data);
    if (opts.current.refresh !== false) router.refresh();
  }, [state, router]);

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

  return { state, pending, onSubmit, formKey };
}
