import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import type { PlatformPermission } from "@/config/permissions";
import { db, type DbOrTx } from "@/db";
import { organizationMembers, organizations, roles } from "@/db/schema";
import type { OrgType } from "@/db/schema/_constants";
import { staffCan, type OrgContext, type StaffContext } from "@/modules/identity/authz";

import { BILLING_MANAGE_PERMISSION, BILLING_VIEW_PERMISSION } from "./constants";
import { forbidden, notFound } from "./errors";

/**
 * Who acts on commercial records:
 *  - staff (Command Centre) with commercial.* / partners.settlements permissions;
 *  - organisation members (portal context) with the billing permission of their organisation type.
 * Every service re-checks the actor against the record it touches (organisation id, buyer user id).
 */
export type BillingActor = StaffContext | OrgContext;

export function isOrgActor(actor: BillingActor): actor is OrgContext {
  return "orgType" in actor && "organization" in actor;
}

export function isStaffActor(actor: BillingActor): actor is StaffContext {
  return !isOrgActor(actor);
}

export function actorUserId(actor: BillingActor): string {
  return actor.user.id;
}

export function assertStaff(ctx: StaffContext, permission: PlatformPermission | PlatformPermission[], mode: "all" | "any" = "all"): void {
  if (!staffCan(ctx, permission, mode)) throw forbidden();
}

export function billingPermission(orgType: OrgType, level: "view" | "manage"): string {
  return level === "view" ? BILLING_VIEW_PERMISSION[orgType] : BILLING_MANAGE_PERMISSION[orgType];
}

/** The member may see (view) or buy (manage) for the organisation of its portal context. */
export function orgCanBilling(ctx: OrgContext, level: "view" | "manage"): boolean {
  return ctx.permissions.has(billingPermission(ctx.orgType, level)) || (level === "view" && ctx.permissions.has(billingPermission(ctx.orgType, "manage")));
}

export function assertOrgBilling(ctx: OrgContext, level: "view" | "manage"): void {
  if (!orgCanBilling(ctx, level)) {
    throw forbidden(level === "manage" ? "You do not have permission to manage billing for this organisation." : "You do not have permission to view billing for this organisation.");
  }
}

/**
 * Authorise an actor for an organisation's billing:
 *  - staff need `staffPermission`;
 *  - members must act in the context of THAT organisation and hold the billing permission.
 * Returns the organisation row.
 */
export async function authorizeOrgBilling(
  actor: BillingActor,
  organizationId: string,
  opts: { level: "view" | "manage"; staffPermission: PlatformPermission | PlatformPermission[] },
  tx: DbOrTx = db,
): Promise<typeof organizations.$inferSelect> {
  if (isOrgActor(actor)) {
    if (actor.organization.id !== organizationId) throw notFound("Organisation");
    assertOrgBilling(actor, opts.level);
  } else {
    assertStaff(actor, opts.staffPermission, Array.isArray(opts.staffPermission) ? "any" : "all");
  }
  const [org] = await tx.select().from(organizations).where(and(eq(organizations.id, organizationId), isNull(organizations.deletedAt))).limit(1);
  if (!org) throw notFound("Organisation");
  return org;
}

/**
 * Permissions a user holds in a specific organisation (active membership), or null. Used where the viewer is
 * not necessarily acting in that organisation's portal context (e.g. the shared printable invoice page).
 */
export async function membershipPermissions(userId: string, organizationId: string, tx: DbOrTx = db): Promise<{ orgType: OrgType; permissions: ReadonlySet<string> } | null> {
  const [row] = await tx
    .select({ orgType: organizations.type, permissions: roles.permissions })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.status, "active"),
        isNull(organizations.deletedAt),
      ),
    )
    .limit(1);
  return row ? { orgType: row.orgType, permissions: new Set(row.permissions) } : null;
}

/** May this user see the billing records of the organisation (any membership, not just the active context)? */
export async function userCanViewOrgBilling(userId: string, organizationId: string, tx: DbOrTx = db): Promise<boolean> {
  const membership = await membershipPermissions(userId, organizationId, tx);
  if (!membership) return false;
  return membership.permissions.has(BILLING_VIEW_PERMISSION[membership.orgType]) || membership.permissions.has(BILLING_MANAGE_PERMISSION[membership.orgType]);
}

export async function userCanManageOrgBilling(userId: string, organizationId: string, tx: DbOrTx = db): Promise<boolean> {
  const membership = await membershipPermissions(userId, organizationId, tx);
  return Boolean(membership?.permissions.has(BILLING_MANAGE_PERMISSION[membership.orgType]));
}
