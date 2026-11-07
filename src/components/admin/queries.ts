import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import type { SelectOption } from "@/components/shared/types";
import { SUPER_ADMIN_ROLE_KEY, type PlatformPermission } from "@/config/permissions";
import { db } from "@/db";
import { organizations, roles, userRoles, users } from "@/db/schema";

/**
 * Read helpers shared by Command Centre pages (owned by the admin team). Staff-only callers: every page
 * that uses these has already called requireStaff(). No contact details are returned.
 */

/** Active staff members as picker options, optionally only those holding a permission (via their roles). */
export async function listStaffOptions(opts: { permission?: PlatformPermission } = {}): Promise<SelectOption[]> {
  const rows = await db
    .select({ id: users.id, name: users.displayName, permissions: roles.permissions, roleName: roles.name, roleKey: roles.key })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.scope, "platform")))
    .where(and(eq(users.isStaff, true), eq(users.status, "active")))
    .orderBy(asc(users.displayName));
  const byUser = new Map<string, { name: string; roleNames: Set<string>; permissions: Set<string>; superAdmin: boolean }>();
  for (const r of rows) {
    const entry = byUser.get(r.id) ?? { name: r.name, roleNames: new Set<string>(), permissions: new Set<string>(), superAdmin: false };
    if (r.roleKey === SUPER_ADMIN_ROLE_KEY) entry.superAdmin = true;
    if (r.roleName) entry.roleNames.add(r.roleName);
    for (const p of r.permissions ?? []) entry.permissions.add(p);
    byUser.set(r.id, entry);
  }
  const out: SelectOption[] = [];
  for (const [id, e] of byUser) {
    if (opts.permission && !e.superAdmin && !e.permissions.has(opts.permission)) continue;
    out.push({ value: id, label: e.name, description: [...e.roleNames].join(", ") || undefined });
  }
  return out;
}

/** Display names for a set of user ids (missing ids are omitted). */
export async function userNames(ids: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (!unique.length) return new Map();
  const rows = await db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Organisations of a type as picker options (most recently updated first, not deleted). */
export async function listOrganizationOptions(type?: "employer" | "recruitment_partner" | "institution", limit = 300): Promise<SelectOption[]> {
  const rows = await db
    .select({ id: organizations.id, name: organizations.name, status: organizations.status, city: organizations.city })
    .from(organizations)
    .where(type ? and(eq(organizations.type, type), isNull(organizations.deletedAt)) : isNull(organizations.deletedAt))
    .orderBy(desc(organizations.updatedAt))
    .limit(limit);
  return rows.map((r) => ({ value: r.id, label: r.name, description: [r.city, r.status].filter(Boolean).join(" · ") || undefined }));
}
