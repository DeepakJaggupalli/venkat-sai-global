"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import type { ActionResult, ActionState } from "@/lib/actions";

type UseActionToastOptions<T> = {
  /** Also toast failures (default false — errors are shown inline with FormErrorAlert). */
  errorToast?: boolean;
  /** Fallback success text when the action returns no message. */
  successMessage?: string;
  /** Called once per successful result (reset the form, close a dialog, navigate…). */
  onSuccess?: (result: Extract<ActionResult<T>, { ok: true }>) => void;
  onError?: (result: Extract<ActionResult<T>, { ok: false }>) => void;
};

/**
 * Toast the outcome of a `useActionState` Server Action exactly once per submission.
 *
 *   const [state, formAction] = useActionState(saveJob, null);
 *   useActionToast(state, { onSuccess: () => setOpen(false) });
 */
export function useActionToast<T>(state: ActionState<T> | undefined, options: UseActionToastOptions<T> = {}): void {
  const handled = useRef<ActionState<T> | undefined>(state);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    // useActionState returns a new object per submission; the initial state is never toasted.
    if (!state || state === handled.current) return;
    handled.current = state;
    const opts = optionsRef.current;
    if (state.ok) {
      const message = state.message ?? opts.successMessage;
      if (message) toast.success(message);
      opts.onSuccess?.(state);
    } else {
      if (opts.errorToast) toast.error(state.error);
      opts.onError?.(state);
    }
  }, [state]);
}
