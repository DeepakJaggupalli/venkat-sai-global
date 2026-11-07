import "server-only";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { logger } from "./logger";

/**
 * Standard Server Action contract used by every form in the product.
 *
 *   export const saveThing = createFormAction(schema, async (input) => { ...; return ok({ id }) });
 *   // client: const [state, formAction, pending] = useActionState(saveThing, null);
 *
 * - Validation errors come back as `fieldErrors` keyed by field name (dot paths for nested).
 * - Throw `new ActionError("message")` for expected, user-facing failures.
 * - `redirect()`, `notFound()`, `forbidden()` work inside handlers (re-thrown untouched).
 * - Unexpected errors are logged and a generic message is returned (no internals leak).
 */
export type FieldErrors = Record<string, string[]>;

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: FieldErrors; code?: string };

export type ActionState<T = undefined> = ActionResult<T> | null;

export class ActionError extends Error {
  code?: string;
  fieldErrors?: FieldErrors;
  constructor(message: string, opts?: { code?: string; fieldErrors?: FieldErrors }) {
    super(message);
    this.name = "ActionError";
    this.code = opts?.code;
    this.fieldErrors = opts?.fieldErrors;
  }
}

export function ok<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: FieldErrors, code?: string): ActionResult<never> {
  return { ok: false, error, fieldErrors, code };
}

/** Convert zod issues into { "field.path": ["message"] }. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/**
 * FormData → plain object.
 *  - `name[]` or repeated keys → array
 *  - `name:json` → JSON.parse(value) stored under `name`
 *  - empty strings → undefined (so `.optional()` works for blank inputs)
 *  - File entries with size 0 (no file chosen) are dropped
 */
export function formDataToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (const [rawKey, rawValue] of fd.entries()) {
    if (rawKey.startsWith("$ACTION")) continue; // Next.js internal fields
    let key = rawKey;
    let value: unknown = rawValue;
    if (typeof rawValue !== "string" && rawValue instanceof File && rawValue.size === 0) continue;
    if (key.endsWith(":json")) {
      key = key.slice(0, -5);
      try {
        value = typeof rawValue === "string" && rawValue !== "" ? JSON.parse(rawValue) : undefined;
      } catch {
        value = undefined;
      }
    } else if (typeof value === "string" && value.trim() === "") {
      value = undefined;
    }
    const isArrayKey = key.endsWith("[]");
    if (isArrayKey) key = key.slice(0, -2);
    if (value === undefined && !isArrayKey) {
      if (!(key in out)) out[key] = undefined;
      continue;
    }
    if (isArrayKey) {
      const arr = (Array.isArray(out[key]) ? out[key] : []) as unknown[];
      if (value !== undefined) arr.push(value);
      out[key] = arr;
    } else if (seen.has(key) && out[key] !== undefined) {
      out[key] = Array.isArray(out[key]) ? [...(out[key] as unknown[]), value] : [out[key], value];
    } else {
      out[key] = value;
    }
    seen.add(key);
  }
  return out;
}

export function createFormAction<TSchema extends z.ZodType, TResult = undefined>(
  schema: TSchema,
  handler: (input: z.output<TSchema>, formData: FormData) => Promise<ActionResult<TResult> | void>,
): (prevState: ActionState<TResult>, formData: FormData) => Promise<ActionResult<TResult>> {
  return async (_prev, formData) => {
    const parsed = schema.safeParse(formDataToObject(formData));
    if (!parsed.success) {
      return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) };
    }
    try {
      const result = await handler(parsed.data, formData);
      return result ?? { ok: true };
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof ActionError) {
        return { ok: false, error: err.message, fieldErrors: err.fieldErrors, code: err.code };
      }
      logger.error("Server action failed", { error: err });
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  };
}

/**
 * Same contract for actions called programmatically (buttons, menus) with a typed argument.
 *   export const archiveJob = createAction(z.object({ id: z.uuid() }), async ({ id }) => {...})
 */
export function createAction<TSchema extends z.ZodType, TResult = undefined>(
  schema: TSchema,
  handler: (input: z.output<TSchema>) => Promise<ActionResult<TResult> | void>,
): (input: z.input<TSchema>) => Promise<ActionResult<TResult>> {
  return async (input) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Invalid request.", fieldErrors: zodFieldErrors(parsed.error) };
    }
    try {
      const result = await handler(parsed.data);
      return result ?? { ok: true };
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof ActionError) {
        return { ok: false, error: err.message, fieldErrors: err.fieldErrors, code: err.code };
      }
      logger.error("Server action failed", { error: err });
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  };
}
