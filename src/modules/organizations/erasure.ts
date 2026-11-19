import "server-only";

import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";

import { ORG_OWNER_ROLE_KEY } from "@/config/permissions";
import type { DbOrTx } from "@/db";
import { organizationMembers, organizations, roles } from "@/db/schema";
import { audit } from "@/modules/audit";
import { notify, notifyStaff } from "@/modules/notifications";

import { adminOrganizationPath, ORG_TEAM_PATH } from "./paths";

/**
 * Ownership hand-over when a person's account is erased (privacy module, DPDP s.12(3)).
 *
 * An active organisation must never be left without an owner silently:
 *  - another active member exists → the longest-serving one (template admins first, then by join date)
 *    becomes the owner; audited and the new owner is told;
 *  - the person was the only active member → the organisation is suspended as "orphaned" with the
 *    reason recorded, audited and flagged to staff holding orgs.manage so they can contact the company.
 * Organisations that keep another active owner are untouched. Runs inside the erasure transaction,
 * before the person's memberships are disabled.
 */

export type OwnerHandover =
  | { organizationId: string; organizationName: string; outcome: "promoted"; newOwnerUserId: string; newOwnerMemberId: string }
  | { organizationId: string; organizationName: string; outcome: "orphaned"; previousStatus: string };

export const ORPHANED_REASON_PREFIX = "Orphaned: the only owner's account was erased";

export async function handOverSoleOwnerships(tx: DbOrTx, userId: string, opts: { requestCode: string; actorUserId: string }): Promise<OwnerHandover[]> {
  const owned = await tx
    .select({ member: organizationMembers, org: organizations })
    .from(organizationMembers)
    .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active"), eq(roles.key, ORG_OWNER_ROLE_KEY), isNull(roles.organizationId), isNull(organizations.deletedAt)))
    .for("update", { of: organizations });

  const results: OwnerHandover[] = [];
  for (const { member, org } of owned) {
    const [others] = await tx
      .select({ value: count() })
      .from(organizationMembers)
      .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
      .where(and(eq(organizationMembers.organizationId, org.id), eq(organizationMembers.status, "active"), eq(roles.key, ORG_OWNER_ROLE_KEY), isNull(roles.organizationId), ne(organizationMembers.id, member.id)));
    if ((others?.value ?? 0) > 0) continue;

    // Longest-serving active member: template admins first, then the earliest join (invitation accepted / created).
    const [successor] = await tx
      .select({ id: organizationMembers.id, userId: organizationMembers.userId })
      .from(organizationMembers)
      .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
      .where(and(eq(organizationMembers.organizationId, org.id), eq(organizationMembers.status, "active"), ne(organizationMembers.id, member.id), ne(organizationMembers.userId, userId)))
      .orderBy(sql`case when ${roles.key} = 'admin' and ${roles.organizationId} is null then 0 else 1 end`, sql`coalesce(${organizationMembers.joinedAt}, ${organizationMembers.createdAt}) asc`, asc(organizationMembers.createdAt))
      .limit(1);

    if (successor) {
      const [ownerRole] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.scope, org.type), isNull(roles.organizationId), eq(roles.key, ORG_OWNER_ROLE_KEY)))
        .limit(1);
      if (!ownerRole) throw new Error(`Role templates for ${org.type} are missing. Run npm run db:seed.`);
      await tx.update(organizationMembers).set({ roleId: ownerRole.id, updatedAt: new Date() }).where(eq(organizationMembers.id, successor.id));
      await audit({
        action: "organization.ownership_transferred",
        entityType: "organization",
        entityId: org.id,
        organizationId: org.id,
        actorUserId: opts.actorUserId,
        actorType: "staff",
        metadata: { toUserId: successor.userId, fromUserId: userId, reason: "owner_erased", requestCode: opts.requestCode, demotedMemberIds: [member.id] },
        tx,
      });
      await notify(
        {
          event: "org.ownership_transferred",
          recipients: [{ userId: successor.userId }],
          organizationId: org.id,
          data: { organizationName: org.name },
          link: ORG_TEAM_PATH[org.type],
          dedupeKey: `org-ownership-erasure:${org.id}:${successor.userId}`,
        },
        { tx },
      );
      results.push({ organizationId: org.id, organizationName: org.name, outcome: "promoted", newOwnerUserId: successor.userId, newOwnerMemberId: successor.id });
      continue;
    }

    const now = new Date();
    const reason = `${ORPHANED_REASON_PREFIX} (data request ${opts.requestCode}). Contact the company to appoint a new owner.`;
    await tx
      .update(organizations)
      .set({
        status: "suspended",
        suspendedAt: org.status === "suspended" ? org.suspendedAt : now,
        statusReason: reason,
        metadata: { ...(org.metadata ?? {}), statusBeforeSuspension: org.status === "suspended" ? (org.metadata?.statusBeforeSuspension ?? org.status) : org.status, orphanedAt: now.toISOString(), orphanedReason: "owner_erased" },
        updatedAt: now,
      })
      .where(eq(organizations.id, org.id));
    await audit({
      action: "organization.orphaned",
      entityType: "organization",
      entityId: org.id,
      organizationId: org.id,
      actorUserId: opts.actorUserId,
      actorType: "staff",
      metadata: { previousStatus: org.status, reason: "owner_erased", requestCode: opts.requestCode, erasedUserId: userId },
      tx,
    });
    await notifyStaff(
      {
        event: "org.orphaned",
        permission: "orgs.manage",
        organizationId: org.id,
        data: { organizationName: org.name, code: opts.requestCode, reason },
        link: adminOrganizationPath(org.id),
        dedupeKey: `org-orphaned:${org.id}`,
      },
      { tx },
    );
    results.push({ organizationId: org.id, organizationName: org.name, outcome: "orphaned", previousStatus: org.status });
  }
  return results;
}
