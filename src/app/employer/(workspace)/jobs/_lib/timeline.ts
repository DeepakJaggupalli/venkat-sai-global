import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";

/**
 * Status timeline for an employer-owned record, read from the audit log (read-only, local to the
 * Employer Portal — see the cross-module note in the report). Always scoped to the caller's
 * organisation; callers must have loaded the record through the owning module first (ownership check).
 * Only employer-safe metadata is returned: the listed `metadataKeys` (e.g. a reviewer's reason that
 * the module already shows to the employer). Staff are shown as "Venkat Sai", never by name.
 */
export type EntityTimelineEvent = {
  id: string;
  action: string;
  at: Date;
  actorName: string | null;
  byVenkatSai: boolean;
  metadata: Record<string, unknown>;
};

export async function loadEntityTimeline(opts: {
  organizationId: string;
  entityType: string;
  entityId: string;
  actions: readonly string[];
  metadataKeys: readonly string[];
  limit?: number;
}): Promise<EntityTimelineEvent[]> {
  if (!opts.actions.length) return [];
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      at: auditLogs.occurredAt,
      actorType: auditLogs.actorType,
      actorName: users.displayName,
      metadata: auditLogs.metadata,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(
      and(
        eq(auditLogs.organizationId, opts.organizationId),
        eq(auditLogs.entityType, opts.entityType),
        eq(auditLogs.entityId, opts.entityId),
        inArray(auditLogs.action, [...opts.actions]),
      ),
    )
    .orderBy(desc(auditLogs.occurredAt))
    .limit(opts.limit ?? 50);

  return rows.map((r) => {
    const byVenkatSai = r.actorType === "staff" || r.actorType === "system";
    const metadata: Record<string, unknown> = {};
    for (const key of opts.metadataKeys) if (r.metadata && key in r.metadata) metadata[key] = r.metadata[key];
    return { id: String(r.id), action: r.action, at: r.at, actorName: byVenkatSai ? null : r.actorName, byVenkatSai, metadata };
  });
}
