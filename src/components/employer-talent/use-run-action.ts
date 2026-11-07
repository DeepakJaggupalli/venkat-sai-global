"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

import type { ActionResult, ActionState } from "@/lib/actions";
import { isNavigationError } from "@/components/shared/form";

const GENERIC = "Something went wrong. Please try again.";
const FIELD_ERRORS = "Please correct the highlighted fields.";

/** createAction() reports schema failures as "Invalid request."; in a form, point people at the fields instead. */
function forForm<T>(result: ActionResult<T>): ActionResult<T> {
  if (result.ok || result.error !== "Invalid request." || !result.fieldErrors || Object.keys(result.fieldErrors).length === 0) return result;
  return { ...result, error: FIELD_ERRORS };
}

/**
 * Runs a programmatic Server Action (createAction) from a client form or button and keeps the last
 * result as `state`, so FormField / FormErrorAlert can show field and form errors. Success messages are
 * toasted; errors stay inline (toastErrors to also toast them, e.g. for menu buttons). The route is
 * refreshed after a success because some module actions do not revalidate every Employer Portal path.
 */
export function useRunAction<TInput, TResult>(
  action: (input: TInput) => Promise<ActionResult<TResult>>,
  opts: { onSuccess?: (data: TResult | undefined) => void; successMessage?: string; toastErrors?: boolean } = {},
) {
  const [state, setState] = useState<ActionState<TResult>>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { onSuccess, successMessage, toastErrors } = opts;

  const run = useCallback(
    (input: TInput) =>
      new Promise<ActionResult<TResult>>((resolve) => {
        startTransition(async () => {
          let result: ActionResult<TResult>;
          try {
            result = forForm(await action(input));
          } catch (err) {
            if (isNavigationError(err)) throw err;
            result = { ok: false, error: GENERIC };
          }
          setState(result);
          if (result.ok) {
            const message = result.message ?? successMessage;
            if (message) toast.success(message);
            onSuccess?.(result.data);
            router.refresh();
          } else if (toastErrors) {
            toast.error(result.error);
          }
          resolve(result);
        });
      }),
    [action, onSuccess, successMessage, toastErrors, router],
  );

  const reset = useCallback(() => setState(null), []);
  return { state, pending, run, reset };
}

/** FormData text value or undefined when blank. */
export function textOf(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

/** FormData integer or undefined (blank / not a number). */
export function intOf(form: FormData, key: string): number | undefined {
  const t = textOf(form, key);
  if (t === undefined) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}
