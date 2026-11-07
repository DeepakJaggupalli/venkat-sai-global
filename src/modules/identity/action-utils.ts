import "server-only";

import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";

import { getT, type TFunction } from "@/i18n/server";
import { ActionError, formDataToObject, zodFieldErrors, type ActionResult, type ActionState, type FieldErrors } from "@/lib/actions";
import { logger } from "@/lib/logger";

import { isAuthError } from "./errors";

/**
 * Server Action wrappers for the identity forms. Same contract as createFormAction / createAction
 * (src/lib/actions.ts), plus translation: zod messages (translation keys) and AuthError codes are
 * rendered in the visitor's language ("auth" namespace) before they reach the client.
 */

type Failure = Extract<ActionResult, { ok: false }>;

function translateFieldErrors(fieldErrors: FieldErrors, t: TFunction): FieldErrors {
  return Object.fromEntries(Object.entries(fieldErrors).map(([field, messages]) => [field, messages.map((message) => t(message))]));
}

async function failureFrom(error: unknown): Promise<Failure> {
  const t = await getT("auth");
  if (isAuthError(error)) {
    const message = t(`errors.${error.authCode}`, error.vars);
    return { ok: false, error: message, code: error.authCode, fieldErrors: error.field ? { [error.field]: [message] } : undefined };
  }
  if (error instanceof ActionError) {
    return { ok: false, error: t(error.message), code: error.code, fieldErrors: error.fieldErrors ? translateFieldErrors(error.fieldErrors, t) : undefined };
  }
  logger.error("Identity action failed", { error });
  return { ok: false, error: t("errors.generic") };
}

async function validationFailure(error: z.ZodError): Promise<Failure> {
  const t = await getT("auth");
  return { ok: false, error: t("errors.fix_fields"), fieldErrors: translateFieldErrors(zodFieldErrors(error), t) };
}

/** For forms: `useActionState(action, null)`. `redirect()` inside the handler works as usual. */
export function authFormAction<TSchema extends z.ZodType, TResult = undefined>(
  schema: TSchema,
  handler: (input: z.output<TSchema>, formData: FormData) => Promise<ActionResult<TResult> | void>,
): (prevState: ActionState<TResult>, formData: FormData) => Promise<ActionResult<TResult>> {
  return async (_prev, formData) => {
    const parsed = schema.safeParse(formDataToObject(formData));
    if (!parsed.success) return validationFailure(parsed.error);
    try {
      return (await handler(parsed.data, formData)) ?? { ok: true };
    } catch (error) {
      unstable_rethrow(error);
      return failureFrom(error);
    }
  };
}

/** For buttons / programmatic calls with a typed argument. */
export function authAction<TSchema extends z.ZodType, TResult = undefined>(
  schema: TSchema,
  handler: (input: z.output<TSchema>) => Promise<ActionResult<TResult> | void>,
): (input: z.input<TSchema>) => Promise<ActionResult<TResult>> {
  return async (input) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    try {
      return (await handler(parsed.data)) ?? { ok: true };
    } catch (error) {
      unstable_rethrow(error);
      return failureFrom(error);
    }
  };
}
