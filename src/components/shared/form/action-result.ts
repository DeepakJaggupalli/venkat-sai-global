import type { ActionResult, ActionState, FieldErrors } from "@/lib/actions";

/**
 * Pure helpers around the `ActionResult` contract from src/lib/actions.ts (client-safe — type-only
 * imports from the server module are erased at compile time). Unit-tested.
 */

const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Field errors for one input (dot paths for nested fields, e.g. "lines.0.amount"). */
export function fieldErrorsFor(state: ActionState<unknown> | undefined, name: string | undefined): string[] | undefined {
  if (!state || state.ok || !name || !state.fieldErrors) return undefined;
  const direct = state.fieldErrors[name];
  // Array inputs are submitted as "skills[]" but validated as "skills".
  const fallback = name.endsWith("[]") ? state.fieldErrors[name.slice(0, -2)] : undefined;
  const errors = direct ?? fallback;
  return errors && errors.length > 0 ? errors : undefined;
}

/** Form-level error message (also covers zod "_form" issues). */
export function formErrorOf(state: ActionState<unknown> | undefined): string | undefined {
  if (!state || state.ok) return undefined;
  return state.error || state.fieldErrors?._form?.[0] || GENERIC_ERROR;
}

/** Field errors excluding the form-level bucket, for an error summary. */
export function listFieldErrors(fieldErrors: FieldErrors | undefined): { name: string; messages: string[] }[] {
  if (!fieldErrors) return [];
  return Object.entries(fieldErrors)
    .filter(([name, messages]) => name !== "_form" && messages.length > 0)
    .map(([name, messages]) => ({ name, messages }));
}

export function isActionResult(value: unknown): value is ActionResult<unknown> {
  return typeof value === "object" && value !== null && "ok" in value && typeof (value as { ok: unknown }).ok === "boolean";
}

/**
 * Normalise whatever a confirm/bulk callback returned into success or failure:
 *  - ActionResult → as-is; `false` → failure; anything else (void, true) → success.
 */
export function interpretOutcome(value: unknown, fallbackError = GENERIC_ERROR): { ok: true; message?: string } | { ok: false; error: string } {
  if (value === false) return { ok: false, error: fallbackError };
  if (isActionResult(value)) {
    return value.ok ? { ok: true, message: value.message } : { ok: false, error: value.error || fallbackError };
  }
  return { ok: true };
}

/**
 * Next.js control-flow errors (redirect(), notFound(), forbidden()) carry a "NEXT_" digest and must be
 * re-thrown so the router can handle them; ordinary errors are shown inline instead.
 */
export function isNavigationError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("digest" in err)) return false;
  const digest = (err as { digest: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

export { GENERIC_ERROR };
