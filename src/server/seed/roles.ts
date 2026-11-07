import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { DEFAULT_ROLES, PLATFORM_PERMISSIONS, SUPER_ADMIN_ROLE_KEY } from "@/config/permissions";
import { db } from "@/db";
import { roles } from "@/db/schema";

import { assertUnique, countInserted, type SeedResult } from "./util";

/**
 * Default roles (DEFAULT_ROLES in src/config/permissions.ts) as organisation-independent system
 * roles. Missing roles are inserted (matched by scope + key with organizationId NULL); existing
 * roles keep their edited names and permissions — except Super Admin, which is always reset to
 * every platform permission so the platform can never lock itself out.
 */
export async function seedRoles(): Promise<SeedResult> {
  assertUnique(DEFAULT_ROLES, (r) => `${r.scope}:${r.key}`, "role scope/key");
  const rows = await db
    .insert(roles)
    .values(
      DEFAULT_ROLES.map((r, index) => ({
        scope: r.scope,
        key: r.key,
        name: r.name,
        description: r.description,
        permissions: [...new Set(r.permissions)],
        organizationId: null,
        isSystem: true,
        sortOrder: (index + 1) * 10,
      })),
    )
    .onConflictDoNothing()
    .returning({ inserted: sql<boolean>`(xmax = 0)` });

  const allPlatform = PLATFORM_PERMISSIONS.map((p) => p.key);
  const reset = await db
    .update(roles)
    .set({ permissions: allPlatform, isSystem: true })
    .where(and(eq(roles.scope, "platform"), eq(roles.key, SUPER_ADMIN_ROLE_KEY), isNull(roles.organizationId)))
    .returning({ id: roles.id });
  if (!reset.length) throw new Error("Super Admin role is missing after seeding roles");

  const counts = countInserted(rows);
  return { name: "roles", inserted: counts.inserted, updated: reset.length, total: DEFAULT_ROLES.length, note: "super_admin permissions reset" };
}
