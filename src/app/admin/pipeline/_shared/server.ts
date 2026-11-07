import "server-only";

import { notFound } from "next/navigation";
import { z } from "zod";

import { ActionError } from "@/lib/actions";
import { env } from "@/lib/env";
import type { StaffContext } from "@/modules/identity/authz";
import { isValidTimeZone, zonedLocalToUtc } from "@/modules/recruitment/timezone";

import { humanize } from "./status";

/** The viewer's display time zone (their profile setting, else the deployment default). Never assumes India. */
export function staffTimeZone(staff: StaffContext): string {
  const tz = staff.user.timezone;
  return tz && isValidTimeZone(tz) ? tz : env().DEFAULT_TIMEZONE;
}

/** Validates a route `[id]` segment; invalid ids are treated as not found by callers. */
export function isUuid(value: string | undefined | null): value is string {
  return !!value && z.uuid().safeParse(value).success;
}

/**
 * `<input type="datetime-local">` value + IANA zone → ISO 8601 instant (UTC "Z"), the format the
 * training schemas expect. The zone comes from the form (venue / centre) or the browser fallback.
 */
export function localToIsoInstant(local: string | undefined, timeZone: string | undefined, fallbackZone: string): string | undefined {
  if (!local) return undefined;
  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : fallbackZone;
  try {
    const instant = zonedLocalToUtc(local.slice(0, 16), zone);
    return Number.isNaN(instant.getTime()) ? undefined : instant.toISOString();
  } catch {
    return undefined;
  }
}

/**
 * Awaits a module read and turns the module's scope errors (`not_found`, `forbidden` — services report
 * out-of-scope records as not found so ids cannot be probed) into a 404 page.
 */
export async function orNotFound<T>(promise: Promise<T | null | undefined>): Promise<T> {
  try {
    const value = await promise;
    if (value === null || value === undefined) notFound();
    return value;
  } catch (err) {
    if (err instanceof ActionError && (err.code === "not_found" || err.code === "forbidden")) notFound();
    throw err;
  }
}

/** Common search-param reader with a whitelist. */
export function pickEnum<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function optionsFrom<T extends string>(values: readonly T[], labels?: Partial<Record<T, string>>): { value: T; label: string }[] {
  return values.map((v) => ({ value: v, label: labels?.[v] ?? humanize(v) }));
}

/** An instant `hours` before now (request time; pages are dynamic). */
export function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000);
}
