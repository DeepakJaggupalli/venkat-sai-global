import "server-only";

import { and, eq } from "drizzle-orm";

import { PLATFORM_PERMISSIONS, SUPER_ADMIN_ROLE_KEY } from "@/config/permissions";
import { db } from "@/db";
import { roles, userRoles, users, userTwoFactor } from "@/db/schema";
import type { StaffContext } from "@/modules/identity/authz";

/**
 * Staff context for a staff member outside a request (background tasks act on behalf of the staff
 * member who started them, so every module's own permission checks still apply). Same rules as
 * identity's getStaffContext(): platform roles only, super admins hold every permission.
 * Returns null when the user is not an active staff member.
 */
export async function loadStaffContextForUser(userId: string): Promise<StaffContext | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      emailVerifiedAt: users.emailVerifiedAt,
      phoneVerifiedAt: users.phoneVerifiedAt,
      displayName: users.displayName,
      avatarFileId: users.avatarFileId,
      status: users.status,
      isStaff: users.isStaff,
      locale: users.locale,
      timezone: users.timezone,
      passwordHash: users.passwordHash,
      twoFactorEnabled: userTwoFactor.enabledAt,
    })
    .from(users)
    .leftJoin(userTwoFactor, eq(userTwoFactor.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || !user.isStaff || user.status !== "active") return null;
  const rows = await db
    .select({ key: roles.key, permissions: roles.permissions })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), eq(roles.scope, "platform")));
  const roleKeys = rows.map((r) => r.key);
  const isSuperAdmin = roleKeys.includes(SUPER_ADMIN_ROLE_KEY);
  const permissions: ReadonlySet<string> = isSuperAdmin ? new Set(PLATFORM_PERMISSIONS.map((p) => p.key)) : new Set(rows.flatMap((r) => r.permissions));
  const { passwordHash, twoFactorEnabled, ...rest } = user;
  return {
    user: { ...rest, hasPassword: Boolean(passwordHash), twoFactorEnabled: Boolean(twoFactorEnabled) },
    roleKeys,
    permissions,
    isSuperAdmin,
  };
}
