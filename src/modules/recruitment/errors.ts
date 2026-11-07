import "server-only";

import { ActionError } from "@/lib/actions";

/**
 * PostgreSQL error helpers. Drizzle wraps driver errors (DrizzleQueryError.cause), so the SQLSTATE
 * and constraint name are looked up along the `cause` chain.
 */
export type PgErrorInfo = { code: string | null; constraint: string | null };

export function pgErrorInfo(error: unknown): PgErrorInfo {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return { code: candidate.code, constraint: typeof candidate.constraint === "string" ? candidate.constraint : null };
    }
    current = candidate.cause;
  }
  return { code: null, constraint: null };
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const info = pgErrorInfo(error);
  return info.code === "23505" && (!constraint || info.constraint === constraint);
}

export function isCheckViolation(error: unknown, constraint?: string): boolean {
  const info = pgErrorInfo(error);
  return info.code === "23514" && (!constraint || info.constraint === constraint);
}

export function isForeignKeyViolation(error: unknown, constraint?: string): boolean {
  const info = pgErrorInfo(error);
  return info.code === "23503" && (!constraint || info.constraint === constraint);
}

/**
 * Turn known constraint violations into user-facing ActionErrors (docs/SCHEMA_NOTES.md §5);
 * anything else is re-thrown unchanged.
 */
export function rethrowConstraint(error: unknown, messages: Readonly<Record<string, string>>): never {
  const info = pgErrorInfo(error);
  if (info.constraint && messages[info.constraint]) throw new ActionError(messages[info.constraint]!, { code: info.constraint });
  throw error;
}

export function notFoundError(what: string): ActionError {
  return new ActionError(`${what} not found.`, { code: "not_found" });
}

export function forbiddenError(message = "You do not have permission to do this."): ActionError {
  return new ActionError(message, { code: "forbidden" });
}
