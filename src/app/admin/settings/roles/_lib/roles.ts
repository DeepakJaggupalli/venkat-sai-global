import "server-only";

import { and, asc, count, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { ORG_OWNER_ROLE_KEY, PERMISSIONS_BY_SCOPE, SUPER_ADMIN_ROLE_KEY } from "@/config/permissions";
import { db } from "@/db";
import { organizationMembers, roles, userRoles } from "@/db/schema";
import type { RoleScope } from "@/db/schema/_constants";
import { ActionError } from "@/lib/actions";
import { slugify } from "@/lib/http";
import { audit, logSecurityEvent } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";

/**
 * Role administration (Command Centre, settings.roles). Platform roles and organisation role TEMPLATES
 * (organizationId null) are managed here; organisations manage their own custom roles in their portals.
 * Code checks permission keys, never role keys — except Super Admin, which always holds everything and
 * cannot be edited or deleted.
 */

export type RoleRow = typeof roles.$inferSelect;
export type RoleWithCounts = RoleRow & { memberCount: number };

async function memberCount(role: Pick<RoleRow, "id" | "scope">): Promise<number> {
  if (role.scope === "platform") {
    const [r] = await db.select({ value: count() }).from(userRoles).where(eq(userRoles.roleId, role.id));
    return r?.value ?? 0;
  }
  const [r] = await db.select({ value: count() }).from(organizationMembers).where(eq(organizationMembers.roleId, role.id));
  return r?.value ?? 0;
}

export async function listRoleTemplates(scope: RoleScope): Promise<RoleWithCounts[]> {
  const rows = await db
    .select()
    .from(roles)
    .where(and(eq(roles.scope, scope), isNull(roles.organizationId)))
    .orderBy(asc(roles.sortOrder), asc(roles.name));
  const counts =
    scope === "platform"
      ? await db.select({ roleId: userRoles.roleId, value: count() }).from(userRoles).groupBy(userRoles.roleId)
      : await db.select({ roleId: organizationMembers.roleId, value: count() }).from(organizationMembers).groupBy(organizationMembers.roleId);
  const byRole = new Map(counts.map((c) => [c.roleId, c.value]));
  return rows.map((r) => ({ ...r, memberCount: byRole.get(r.id) ?? 0 }));
}

/** Organisation-defined custom roles per scope (managed in the portals; counted here for context). */
export async function countOrgCustomRoles(): Promise<Record<string, number>> {
  const rows = await db.select({ scope: roles.scope, value: count() }).from(roles).where(isNotNull(roles.organizationId)).groupBy(roles.scope);
  return Object.fromEntries(rows.map((r) => [r.scope, r.value]));
}

export async function getRoleTemplate(id: string): Promise<RoleWithCounts | null> {
  const [row] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, id), isNull(roles.organizationId)))
    .limit(1);
  if (!row) return null;
  return { ...row, memberCount: await memberCount(row) };
}

export const isProtectedRole = (role: Pick<RoleRow, "key" | "scope">) => role.scope === "platform" && role.key === SUPER_ADMIN_ROLE_KEY;

function validPermissions(scope: RoleScope, permissions: string[]): string[] {
  const allowed = new Set(PERMISSIONS_BY_SCOPE[scope].map((p) => p.key));
  const unique = [...new Set(permissions)];
  const invalid = unique.filter((p) => !allowed.has(p));
  if (invalid.length) throw new ActionError("Some permissions do not apply to this kind of role.", { fieldErrors: { permissions: ["Remove permissions that do not apply to this role"] } });
  return unique;
}

/** Staff may not grant platform permissions they do not hold themselves (privilege escalation). */
function assertCanGrant(ctx: StaffContext, scope: RoleScope, added: string[]) {
  if (scope !== "platform" || ctx.isSuperAdmin) return;
  const missing = added.filter((p) => !ctx.permissions.has(p));
  if (missing.length) {
    throw new ActionError("You can only grant permissions you hold yourself.", { fieldErrors: { permissions: [`Not allowed: ${missing.join(", ")}`] } });
  }
}

function isSensitive(scope: RoleScope, key: string) {
  return PERMISSIONS_BY_SCOPE[scope].some((p) => p.key === key && p.sensitive);
}

export async function createRoleTemplate(ctx: StaffContext, input: { scope: RoleScope; name: string; description?: string; copyFromId?: string }): Promise<{ id: string }> {
  let permissions: string[] = [];
  if (input.copyFromId) {
    const source = await getRoleTemplate(input.copyFromId);
    if (!source || source.scope !== input.scope) throw new ActionError("The role to copy was not found.");
    permissions = validPermissions(input.scope, source.permissions);
    assertCanGrant(ctx, input.scope, permissions);
  }
  const base = slugify(input.name, 50).replace(/-/g, "_") || "role";
  let key = base;
  for (let i = 2; ; i++) {
    const [exists] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.scope, input.scope), eq(roles.key, key), isNull(roles.organizationId)))
      .limit(1);
    if (!exists) break;
    key = `${base}_${i}`;
    if (i > 50) throw new ActionError("Choose a different name.");
  }
  if (key === SUPER_ADMIN_ROLE_KEY || key === ORG_OWNER_ROLE_KEY) key = `${key}_custom`;
  const [maxSort] = await db.select({ value: roles.sortOrder }).from(roles).where(eq(roles.scope, input.scope)).orderBy(desc(roles.sortOrder)).limit(1);
  const [row] = await db
    .insert(roles)
    .values({ scope: input.scope, key, name: input.name, description: input.description ?? null, permissions, isSystem: false, organizationId: null, sortOrder: (maxSort?.value ?? 0) + 100 })
    .returning({ id: roles.id });
  await audit({ action: "role.created", entityType: "role", entityId: row!.id, metadata: { scope: input.scope, key, name: input.name, permissionCount: permissions.length } });
  return { id: row!.id };
}

export async function updateRoleTemplate(ctx: StaffContext, id: string, input: { name: string; description?: string; permissions: string[] }): Promise<{ added: string[]; removed: string[] }> {
  const role = await getRoleTemplate(id);
  if (!role) throw new ActionError("Role not found.");
  if (isProtectedRole(role)) throw new ActionError("Super Admin always holds every permission and cannot be edited.");
  const next = validPermissions(role.scope, input.permissions);
  const before = new Set(role.permissions);
  const added = next.filter((p) => !before.has(p));
  const removed = role.permissions.filter((p) => !next.includes(p));
  assertCanGrant(ctx, role.scope, added);
  if (role.scope === "platform" && !ctx.isSuperAdmin && removed.length && !ctx.permissions.has("settings.roles")) {
    throw new ActionError("You do not have permission to change roles.");
  }
  await db
    .update(roles)
    .set({ name: input.name, description: input.description ?? null, permissions: next, updatedAt: new Date() })
    .where(eq(roles.id, id));
  await audit({ action: "role.updated", entityType: "role", entityId: id, metadata: { scope: role.scope, key: role.key, name: input.name, added, removed, renamed: role.name !== input.name } });
  const sensitiveAdded = added.filter((p) => isSensitive(role.scope, p));
  if (sensitiveAdded.length) {
    await logSecurityEvent({ userId: ctx.user.id, type: "role_changed", severity: "warning", metadata: { roleId: id, roleKey: role.key, scope: role.scope, sensitiveAdded } });
  }
  return { added, removed };
}

export async function deleteRoleTemplate(ctx: StaffContext, id: string): Promise<void> {
  const role = await getRoleTemplate(id);
  if (!role) throw new ActionError("Role not found.");
  if (role.isSystem || isProtectedRole(role)) throw new ActionError("Built-in roles cannot be deleted. Remove permissions instead.");
  if (role.memberCount > 0) throw new ActionError(`This role is assigned to ${role.memberCount} ${role.memberCount === 1 ? "person" : "people"}. Move them to another role first.`);
  if (role.scope === "platform" && !ctx.isSuperAdmin && role.permissions.some((p) => !ctx.permissions.has(p))) {
    throw new ActionError("You can only delete roles whose permissions you hold.");
  }
  await db.delete(roles).where(eq(roles.id, id));
  await audit({ action: "role.deleted", entityType: "role", entityId: id, metadata: { scope: role.scope, key: role.key, name: role.name } });
}
