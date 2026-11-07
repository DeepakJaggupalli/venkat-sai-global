import "server-only";

import { and, arrayContains, eq, or } from "drizzle-orm";

import { SUPER_ADMIN_ROLE_KEY, type PlatformPermission } from "@/config/permissions";
import { db, type DbOrTx } from "@/db";
import { roles, userRoles, users } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { getSettings } from "@/modules/settings";

import type { SlaSettings } from "./sla";

/**
 * Shared helpers for the operations services (authorisation, assignment checks, rate limits, error mapping).
 */

export function assertStaff(ctx: StaffContext, permission: PlatformPermission | PlatformPermission[], mode: "all" | "any" = "all"): void {
  if (!staffCan(ctx, permission, mode)) {
    throw new ActionError("You do not have permission to do this.", { code: "forbidden" });
  }
}

/** The target of an assignment must be an active staff member whose roles grant `permission`. */
export async function assertAssignableStaff(userId: string, permission: PlatformPermission, tx: DbOrTx = db): Promise<{ id: string; displayName: string }> {
  const [row] = await tx
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.scope, "platform")))
    .where(and(eq(users.id, userId), eq(users.isStaff, true), eq(users.status, "active"), or(eq(roles.key, SUPER_ADMIN_ROLE_KEY), arrayContains(roles.permissions, [permission]))))
    .limit(1);
  if (!row) {
    throw new ActionError("Choose an active team member who is allowed to work on this.", { fieldErrors: { assigneeUserId: ["Not an eligible team member"] } });
  }
  return row;
}

/** Apply several fixed-window limits; the request is refused when any is exceeded. */
export async function enforceRateLimits(limits: { key: string; limit: number; windowSeconds: number }[], message: string): Promise<void> {
  for (const l of limits) {
    const result = await rateLimit(l.key, l.limit, l.windowSeconds);
    if (!result.allowed) throw new ActionError(message, { code: "rate_limited" });
  }
}

/** PostgreSQL error code / constraint of a failed statement (drizzle wraps driver errors in `cause`). */
export function pgError(error: unknown): { code?: string; constraint?: string } {
  const candidates = [error, (error as { cause?: unknown })?.cause];
  for (const c of candidates) {
    if (c && typeof c === "object" && "code" in c) {
      const e = c as { code?: unknown; constraint?: unknown };
      return { code: typeof e.code === "string" ? e.code : undefined, constraint: typeof e.constraint === "string" ? e.constraint : undefined };
    }
  }
  return {};
}

/** Turn constraint violations into user-facing errors (unknown errors are rethrown). */
export function rethrowConstraint(error: unknown, messages: Record<string, string>): never {
  const { code, constraint } = pgError(error);
  if (constraint && messages[constraint]) throw new ActionError(messages[constraint]);
  if (code === "23503") throw new ActionError("A linked record could not be found. Refresh the page and try again.");
  if (code === "23514") {
    logger.warn("Check constraint violated", { constraint });
    throw new ActionError("Some details are inconsistent. Please review the form and try again.");
  }
  throw error;
}

/** Escape a search term for ILIKE. */
export function likePattern(q: string): string {
  return `%${q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

export async function loadSlaSettings(): Promise<SlaSettings> {
  const s = await getSettings([
    "support.sla_hours_urgent",
    "support.sla_hours_high",
    "support.sla_hours_normal",
    "support.sla_hours_low",
    "privacy.grievance_ack_hours",
    "privacy.grievance_resolution_days",
  ]);
  return {
    firstResponseHours: {
      urgent: Number(s["support.sla_hours_urgent"]),
      high: Number(s["support.sla_hours_high"]),
      normal: Number(s["support.sla_hours_normal"]),
      low: Number(s["support.sla_hours_low"]),
    },
    grievanceAckHours: Number(s["privacy.grievance_ack_hours"]),
    grievanceResolutionDays: Number(s["privacy.grievance_resolution_days"]),
  };
}

/** Short plain-text excerpt for notifications (never the whole message). */
export function excerptText(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}
