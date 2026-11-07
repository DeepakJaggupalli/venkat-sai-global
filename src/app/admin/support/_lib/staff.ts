import "server-only";

import { and, asc, eq, or, sql } from "drizzle-orm";

import { SUPER_ADMIN_ROLE_KEY } from "@/config/permissions";
import { db } from "@/db";
import { roles, userRoles, users } from "@/db/schema";
import type { SelectOption } from "@/components/shared/types";

/**
 * Active staff members holding a platform permission (or super admin) — assignee pickers in the
 * Command Centre. Read-only, names only (no contact details).
 */
export async function staffOptionsWithPermission(permission: string): Promise<SelectOption[]> {
  const rows = await db
    .selectDistinct({ id: users.id, name: users.displayName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(
        eq(users.isStaff, true),
        eq(users.status, "active"),
        eq(roles.scope, "platform"),
        or(sql`${permission} = any(${roles.permissions})`, eq(roles.key, SUPER_ADMIN_ROLE_KEY)),
      ),
    )
    .orderBy(asc(users.displayName))
    .limit(200);
  return rows.map((r) => ({ value: r.id, label: r.name }));
}
