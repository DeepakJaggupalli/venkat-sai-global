import "server-only";

import { forbidden, notFound } from "next/navigation";

import { ActionError } from "@/lib/actions";
import { env } from "@/lib/env";
import type { OrgContext } from "@/modules/identity/authz";

/**
 * Module reads throw ActionError("not_found" | "forbidden") for records outside the partner's scope;
 * pages turn them into the matching HTTP responses so ids cannot be probed.
 */
export async function loadOr404<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof ActionError) {
      if (error.code === "not_found" || error.code === "validation") notFound();
      if (error.code === "forbidden") forbidden();
    }
    throw error;
  }
}

export function viewerTimeZone(ctx: OrgContext): string {
  return ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
}

/** First value of a search param. */
export function sp(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}
