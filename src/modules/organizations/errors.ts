import "server-only";

import { ActionError, type FieldErrors } from "@/lib/actions";

/**
 * Error helpers shared by the organizations and training services.
 *
 * Services throw `ActionError` for expected failures (the action wrappers turn them into
 * `{ ok: false, error }`). The `code` lets pages and tests tell the cases apart:
 * "forbidden", "not_found", "conflict", "invalid_state", "validation".
 */
export function forbiddenError(message = "You do not have permission to do this."): ActionError {
  return new ActionError(message, { code: "forbidden" });
}

export function notFoundError(message = "This record could not be found."): ActionError {
  return new ActionError(message, { code: "not_found" });
}

export function conflictError(message: string, fieldErrors?: FieldErrors): ActionError {
  return new ActionError(message, { code: "conflict", fieldErrors });
}

export function invalidStateError(message: string): ActionError {
  return new ActionError(message, { code: "invalid_state" });
}

export function validationError(message: string, fieldErrors?: FieldErrors): ActionError {
  return new ActionError(message, { code: "validation", fieldErrors });
}

export type PgErrorInfo = { code: string; constraint: string | null; detail: string | null };

/**
 * PostgreSQL error details from an error thrown by Drizzle / node-postgres. Drizzle wraps driver
 * errors (DrizzleQueryError.cause), so the cause chain is walked.
 */
export function pgErrorInfo(error: unknown): PgErrorInfo | null {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth++) {
    const candidate = current as { code?: unknown; constraint?: unknown; detail?: unknown; cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return {
        code: candidate.code,
        constraint: typeof candidate.constraint === "string" ? candidate.constraint : null,
        detail: typeof candidate.detail === "string" ? candidate.detail : null,
      };
    }
    current = candidate.cause;
  }
  return null;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const info = pgErrorInfo(error);
  return info?.code === "23505" && (!constraint || info.constraint === constraint);
}

/**
 * Run `fn` (usually a whole transaction — a failed statement aborts the transaction, so the mapping
 * must wrap it from outside) and turn known constraint violations into user-facing errors.
 * Keys are constraint names; values are messages or ready-made ActionErrors.
 */
export async function withConstraintMessages<T>(fn: () => Promise<T>, messages: Record<string, string | ActionError>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ActionError) throw error;
    const info = pgErrorInfo(error);
    if (info?.constraint && info.constraint in messages) {
      const mapped = messages[info.constraint]!;
      throw typeof mapped === "string" ? conflictError(mapped) : mapped;
    }
    if (info?.code === "23503") {
      throw validationError("A selected value no longer exists. Refresh the page and try again.");
    }
    throw error;
  }
}
