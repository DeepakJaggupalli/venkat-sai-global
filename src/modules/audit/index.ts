import "server-only";

import { db, type DbOrTx } from "@/db";
import { auditLogs, dataAccessLogs, securityEvents } from "@/db/schema";
import { logger } from "@/lib/logger";
import { getRequestMeta } from "@/lib/request";
import { getCurrentSession } from "@/modules/identity/session";

/**
 * Audit trail. Call `audit()` after every state change that matters to the business or to
 * compliance: approvals, verification decisions, publishing, role changes, suspensions,
 * pipeline moves, payments/refunds, settings changes, data exports, deletions.
 *
 *   await audit({ action: "job.approved", entityType: "job", entityId: job.id, organizationId: job.organizationId });
 *
 * Never put secrets, OTPs, passwords, document contents or full identity numbers in metadata.
 */
export type AuditInput = {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  organizationId?: string | null;
  metadata?: Record<string, unknown>;
  /** Override the actor (defaults to the signed-in user, or "system" outside a request). */
  actorUserId?: string | null;
  actorType?: "user" | "staff" | "system" | "anonymous" | "api";
  tx?: DbOrTx;
};

async function resolveActor(input: Pick<AuditInput, "actorUserId" | "actorType">) {
  if (input.actorType === "system") return { actorUserId: input.actorUserId ?? null, actorType: "system" as const };
  if (input.actorUserId !== undefined) {
    return { actorUserId: input.actorUserId, actorType: input.actorType ?? ("user" as const) };
  }
  try {
    const current = await getCurrentSession();
    if (current) return { actorUserId: current.user.id, actorType: current.user.isStaff ? ("staff" as const) : ("user" as const) };
    return { actorUserId: null, actorType: "anonymous" as const };
  } catch {
    return { actorUserId: null, actorType: "system" as const };
  }
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    const actor = await resolveActor(input);
    const meta = await getRequestMeta().catch(() => null);
    await (input.tx ?? db).insert(auditLogs).values({
      actorUserId: actor.actorUserId,
      actorType: actor.actorType,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      organizationId: input.organizationId ?? null,
      ipHash: meta?.ipHash ?? null,
      userAgent: meta?.userAgent ?? null,
      requestId: meta?.requestId ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    // Inside a transaction we must surface the failure; outside, never break the user flow.
    if (input.tx) throw error;
    logger.error("Failed to write audit log", { error, action: input.action });
  }
}

export type SecurityEventInput = {
  userId?: string | null;
  type: string;
  severity?: "info" | "warning" | "critical";
  metadata?: Record<string, unknown>;
};

export async function logSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    const meta = await getRequestMeta().catch(() => null);
    await db.insert(securityEvents).values({
      userId: input.userId ?? null,
      type: input.type,
      severity: input.severity ?? "info",
      ipHash: meta?.ipHash ?? null,
      userAgent: meta?.userAgent ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    logger.error("Failed to write security event", { error, type: input.type });
  }
}

export type DataAccessInput = {
  actorUserId?: string | null;
  actorOrganizationId?: string | null;
  subjectUserId?: string | null;
  subjectType: string;
  subjectId: string;
  dataCategory: string;
  accessType: "view" | "reveal" | "download" | "export" | "share";
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

/** Log access to sensitive personal data (contact reveal, document download, exports). */
export async function logDataAccess(input: DataAccessInput, tx?: DbOrTx): Promise<void> {
  let actorUserId = input.actorUserId;
  if (actorUserId === undefined) {
    const current = await getCurrentSession().catch(() => null);
    actorUserId = current?.user.id ?? null;
  }
  await (tx ?? db).insert(dataAccessLogs).values({
    actorUserId,
    actorOrganizationId: input.actorOrganizationId ?? null,
    subjectUserId: input.subjectUserId ?? null,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    dataCategory: input.dataCategory,
    accessType: input.accessType,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
  });
}
