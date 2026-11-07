import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import type { EmployerPermission, InstitutionPermission, PartnerPermission, PlatformPermission } from "@/config/permissions";
import { db, type DbOrTx } from "@/db";
import { organizations } from "@/db/schema";
import type { OrgType } from "@/db/schema/_constants";
import { staffCan, type OrgContext, type StaffContext } from "@/modules/identity/authz";

import { forbiddenError, notFoundError } from "./errors";

export type OrganizationRow = typeof organizations.$inferSelect;

/**
 * Who is acting on an organisation: a member (portal context of that organisation) or a Venkat Sai
 * staff member (Command Centre). Services re-check permissions for the organisation they touch.
 */
export type OrgActor = OrgContext | StaffContext;

export function isMemberActor(actor: OrgActor): actor is OrgContext {
  return "orgType" in actor && "organization" in actor;
}

export function isStaffActor(actor: OrgActor): actor is StaffContext {
  return !isMemberActor(actor);
}

/** Member permission required per organisation type (null = members may not do this). */
export type MemberPermissionRule = Partial<{
  employer: EmployerPermission;
  recruitment_partner: PartnerPermission;
  institution: InstitutionPermission;
}>;

/** Permission keys used across organisation services. */
export const ORG_PERMISSION = {
  profile: { employer: "employer.company.manage", recruitment_partner: "partner.profile.manage", institution: "institution.profile.manage" },
  team: { employer: "employer.team.manage", recruitment_partner: "partner.team.manage", institution: "institution.team.manage" },
  dashboard: { employer: "employer.dashboard", recruitment_partner: "partner.dashboard", institution: "institution.dashboard" },
} as const satisfies Record<string, Required<MemberPermissionRule>>;

export type OrgAccessRule = {
  /** Required member permission per organisation type; null = staff only; "any" = any active member. */
  member: MemberPermissionRule | "any" | null;
  /** Required staff permission(s); null = members only. */
  staff: PlatformPermission | PlatformPermission[] | null;
  staffMode?: "all" | "any";
  /** Restrict to these organisation types. */
  types?: readonly OrgType[];
};

export type OrgAccess = {
  organization: OrganizationRow;
  actorUserId: string;
  via: "staff" | "member";
  /** Member permissions (empty for staff). */
  memberPermissions: ReadonlySet<string>;
  isOwner: boolean;
  membershipId: string | null;
  roleId: string | null;
};

/**
 * Authorise `actor` for `organizationId` and load the organisation row (optionally locked FOR UPDATE).
 * Throws not_found for unknown / deleted organisations and forbidden for anyone else.
 */
export async function authorizeOrg(
  actor: OrgActor,
  organizationId: string,
  rule: OrgAccessRule,
  opts: { tx?: DbOrTx; lock?: boolean } = {},
): Promise<OrgAccess> {
  const t = opts.tx ?? db;
  const base = t
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, organizationId), isNull(organizations.deletedAt)))
    .limit(1);
  const [organization] = opts.lock ? await base.for("update") : await base;
  if (!organization) throw notFoundError("Organisation not found.");
  if (rule.types && !rule.types.includes(organization.type)) throw notFoundError("Organisation not found.");

  if (isMemberActor(actor)) {
    if (actor.organization.id !== organizationId || actor.orgType !== organization.type) throw forbiddenError();
    if (rule.member === null) throw forbiddenError();
    if (rule.member !== "any") {
      const required = rule.member[organization.type];
      if (!required || !actor.permissions.has(required)) throw forbiddenError();
    }
    return {
      organization,
      actorUserId: actor.user.id,
      via: "member",
      memberPermissions: actor.permissions,
      isOwner: actor.isOwner,
      membershipId: actor.membership.id,
      roleId: actor.role.id,
    };
  }

  if (rule.staff === null || !staffCan(actor, rule.staff, rule.staffMode ?? "all")) throw forbiddenError();
  return { organization, actorUserId: actor.user.id, via: "staff", memberPermissions: new Set(), isOwner: false, membershipId: null, roleId: null };
}

/** Assert a staff permission (for staff-only services). */
export function assertStaff(ctx: StaffContext, permission: PlatformPermission | PlatformPermission[], mode: "all" | "any" = "all"): void {
  if (!staffCan(ctx, permission, mode)) throw forbiddenError();
}
