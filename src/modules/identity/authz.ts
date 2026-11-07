import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { organizationMembers, organizations, roles, userRoles } from "@/db/schema";
import type { OrgType } from "@/db/schema/_constants";
import {
  PLATFORM_PERMISSIONS,
  SUPER_ADMIN_ROLE_KEY,
  type OrgPermissionFor,
  type PlatformPermission,
} from "@/config/permissions";
import { getSetting } from "@/modules/settings";

import { currentPathForReturn, getCurrentSession, requireUser, type SessionUser } from "./session";

// ---------------------------------------------------------------------------
// Portals
// ---------------------------------------------------------------------------

export const PORTAL_BASE_PATH: Record<OrgType, string> = {
  employer: "/employer",
  recruitment_partner: "/recruiter",
  institution: "/institution",
};

export const PORTAL_ONBOARDING_PATH: Record<OrgType, string> = {
  employer: "/employer/onboarding",
  recruitment_partner: "/recruiter/onboarding",
  institution: "/institution/onboarding",
};

// ---------------------------------------------------------------------------
// Staff (Venkat Sai team)
// ---------------------------------------------------------------------------

export type StaffContext = {
  user: SessionUser;
  roleKeys: string[];
  permissions: ReadonlySet<string>;
  isSuperAdmin: boolean;
};

const ALL_PLATFORM_PERMISSIONS: ReadonlySet<string> = new Set(PLATFORM_PERMISSIONS.map((p) => p.key));

/** Staff context for the signed-in user (memoised per request). Null for non-staff. */
export const getStaffContext = cache(async (): Promise<StaffContext | null> => {
  const current = await getCurrentSession();
  if (!current || current.needsTwoFactor || !current.user.isStaff) return null;
  const rows = await db
    .select({ key: roles.key, permissions: roles.permissions })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, current.user.id), eq(roles.scope, "platform")));
  const roleKeys = rows.map((r) => r.key);
  const isSuperAdmin = roleKeys.includes(SUPER_ADMIN_ROLE_KEY);
  const permissions = isSuperAdmin ? ALL_PLATFORM_PERMISSIONS : new Set(rows.flatMap((r) => r.permissions));
  return { user: current.user, roleKeys, permissions, isSuperAdmin };
});

export function staffCan(ctx: StaffContext | null | undefined, permission: PlatformPermission | PlatformPermission[], mode: "all" | "any" = "all"): boolean {
  if (!ctx) return false;
  const list = Array.isArray(permission) ? permission : [permission];
  return mode === "all" ? list.every((p) => ctx.permissions.has(p)) : list.some((p) => ctx.permissions.has(p));
}

/**
 * Require a Venkat Sai staff member, optionally holding permission(s).
 * - signed out → sign-in redirect; non-staff or missing permission → 403 (forbidden()).
 * - When the "security.require_staff_2fa" setting is on, staff without TOTP are sent to set it up.
 */
export async function requireStaff(permission?: PlatformPermission | PlatformPermission[], mode: "all" | "any" = "all"): Promise<StaffContext> {
  const user = await requireUser();
  if (!user.isStaff) forbidden();
  const ctx = await getStaffContext();
  if (!ctx) forbidden();
  if (!user.twoFactorEnabled && (await getSetting("security.require_staff_2fa"))) {
    redirect(`/account/security?require=2fa&returnTo=${encodeURIComponent(await currentPathForReturn())}`);
  }
  if (permission && !staffCan(ctx, permission, mode)) forbidden();
  return ctx;
}

// ---------------------------------------------------------------------------
// Organisation members (employer / recruitment partner / institution portals)
// ---------------------------------------------------------------------------

export type OrganizationRow = typeof organizations.$inferSelect;

export type OrgContext<T extends OrgType = OrgType> = {
  orgType: T;
  user: SessionUser;
  sessionId: string;
  organization: OrganizationRow;
  membership: { id: string; status: "invited" | "active" | "disabled"; jobTitle: string | null; department: string | null };
  role: { id: string; key: string; name: string };
  permissions: ReadonlySet<string>;
  isOwner: boolean;
};

/**
 * Active organisation context for a portal (memoised per request), or null if the user
 * has no active membership of that organisation type. Prefers the organisation chosen
 * in this session (sessions.activeOrgs), then the most recently active membership.
 */
export const getOrgContext = cache(async <T extends OrgType>(orgType: T): Promise<OrgContext<T> | null> => {
  const current = await getCurrentSession();
  if (!current || current.needsTwoFactor) return null;
  const preferredOrgId = current.session.activeOrgs?.[orgType] ?? null;

  const rows = await db
    .select({ member: organizationMembers, org: organizations, role: roles })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
    .where(
      and(
        eq(organizationMembers.userId, current.user.id),
        eq(organizationMembers.status, "active"),
        eq(organizations.type, orgType),
        isNull(organizations.deletedAt),
      ),
    )
    .orderBy(
      preferredOrgId ? sql`case when ${organizations.id} = ${preferredOrgId} then 0 else 1 end` : sql`0`,
      desc(organizationMembers.lastActiveAt),
      desc(organizationMembers.createdAt),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    orgType,
    user: current.user,
    sessionId: current.session.id,
    organization: row.org,
    membership: { id: row.member.id, status: row.member.status, jobTitle: row.member.jobTitle, department: row.member.department },
    role: { id: row.role.id, key: row.role.key, name: row.role.name },
    permissions: new Set(row.role.permissions),
    isOwner: row.role.key === "owner",
  };
});

export function orgCan<T extends OrgType>(
  ctx: OrgContext<T> | null | undefined,
  permission: OrgPermissionFor<T> | OrgPermissionFor<T>[],
  mode: "all" | "any" = "all",
): boolean {
  if (!ctx) return false;
  const list = (Array.isArray(permission) ? permission : [permission]) as string[];
  return mode === "all" ? list.every((p) => ctx.permissions.has(p)) : list.some((p) => ctx.permissions.has(p));
}

/**
 * Require membership of an organisation of `orgType` (optionally with permission(s)).
 * - signed out → sign-in; no organisation yet → the portal's onboarding page; missing permission → 403.
 * - Organisation verification status is NOT enforced here: pages decide what an unverified or
 *   suspended organisation may do (e.g. jobs cannot be published until verified).
 */
export async function requireOrgMember<T extends OrgType>(
  orgType: T,
  permission?: OrgPermissionFor<T> | OrgPermissionFor<T>[],
  mode: "all" | "any" = "all",
): Promise<OrgContext<T>> {
  await requireUser();
  const ctx = await getOrgContext(orgType);
  if (!ctx) redirect(PORTAL_ONBOARDING_PATH[orgType]);
  if (permission && !orgCan(ctx, permission, mode)) forbidden();
  return ctx;
}

/** All active memberships of a user (portal switcher, account page). */
export async function listUserMemberships(userId: string) {
  return db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationType: organizations.type,
      organizationStatus: organizations.status,
      logoFileId: organizations.logoFileId,
      roleKey: roles.key,
      roleName: roles.name,
      memberStatus: organizationMembers.status,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active"), isNull(organizations.deletedAt)))
    .orderBy(organizations.name);
}

export type PortalAccess = {
  talent: true;
  employer: boolean;
  recruiter: boolean;
  institution: boolean;
  admin: boolean;
};

export const getPortalAccess = cache(async (user: SessionUser): Promise<PortalAccess> => {
  const memberships = await listUserMemberships(user.id);
  const types = new Set(memberships.map((m) => m.organizationType));
  return {
    talent: true,
    employer: types.has("employer"),
    recruiter: types.has("recruitment_partner"),
    institution: types.has("institution"),
    admin: user.isStaff,
  };
});

/** Where to send a user after sign-in when no returnTo was given. */
export function portalHomePath(access: PortalAccess): string {
  if (access.admin) return "/admin";
  if (access.employer) return "/employer";
  if (access.recruiter) return "/recruiter";
  if (access.institution) return "/institution";
  return "/talent";
}
