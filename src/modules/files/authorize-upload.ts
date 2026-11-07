import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { organizationMembers, organizations, roles } from "@/db/schema";
import type { FilePurpose } from "@/db/schema/_constants";
import { getStaffContext } from "@/modules/identity/authz";
import type { SessionUser } from "@/modules/identity/session";
import { getSetting } from "@/modules/settings";

import { getFilePolicy, type UploadRule } from "./policies";

/**
 * Upload authorization hook (POST /api/v1/uploads): decides whether the signed-in user may upload
 * a file for `purpose` (optionally on behalf of `organizationId`) and who will own it.
 * Rules per purpose live in policies.ts (`upload`):
 *   cms_media → staff with media.manage; org_logo / org_document / partner_licence → active member
 *   of the organisation with the profile permission, or staff with orgs.manage/verify; candidate
 *   purposes → the user themself (plus partner members / staff acting for a candidate).
 */
export type UploadAuthorization = { ownerUserId: string; organizationId: string | null; via: "self" | "org" | "staff" };

export class UploadAuthorizationError extends Error {
  readonly status: 400 | 403;
  constructor(status: 400 | 403, message: string) {
    super(message);
    this.name = "UploadAuthorizationError";
    this.status = status;
  }
}

async function staffPermissions(user: SessionUser): Promise<ReadonlySet<string> | null> {
  if (!user.isStaff) return null;
  const ctx = await getStaffContext();
  if (!ctx) return null;
  if (!user.twoFactorEnabled && (await getSetting("security.require_staff_2fa"))) return null;
  return ctx.permissions;
}

async function activeMembership(userId: string, organizationId: string) {
  const [row] = await db
    .select({ organizationType: organizations.type, permissions: roles.permissions })
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
  return row ?? null;
}

async function organizationExists(organizationId: string): Promise<boolean> {
  const [row] = await db.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, organizationId), isNull(organizations.deletedAt))).limit(1);
  return Boolean(row);
}

function staffRuleMatches(rules: readonly UploadRule[], perms: ReadonlySet<string> | null): boolean {
  if (!perms) return false;
  return rules.some((r) => r.kind === "staff" && r.permissions.some((p) => perms.has(p)));
}

export async function authorizeUpload(args: { user: SessionUser; purpose: FilePurpose; organizationId: string | null }): Promise<UploadAuthorization> {
  const { user, purpose, organizationId } = args;
  const rules = getFilePolicy(purpose).upload.filter((r) => r.kind !== "system");
  if (!rules.length) throw new UploadAuthorizationError(400, "This kind of file cannot be uploaded.");

  const orgRules = rules.filter((r): r is Extract<UploadRule, { kind: "org" }> => r.kind === "org");

  if (organizationId) {
    if (orgRules.length) {
      const membership = await activeMembership(user.id, organizationId);
      if (
        membership &&
        orgRules.some(
          (r) => r.orgTypes.includes(membership.organizationType) && (r.permissions.length === 0 || r.permissions.some((p) => membership.permissions.includes(p))),
        )
      ) {
        return { ownerUserId: user.id, organizationId, via: "org" };
      }
    }
    // Staff may upload on an organisation's behalf (e.g. verification documents received by email).
    if (staffRuleMatches(rules, await staffPermissions(user))) {
      if (!(await organizationExists(organizationId))) throw new UploadAuthorizationError(400, "The organisation was not found.");
      return { ownerUserId: user.id, organizationId, via: "staff" };
    }
    if (!orgRules.length) throw new UploadAuthorizationError(400, "This kind of file cannot be linked to an organisation.");
    throw new UploadAuthorizationError(403, "You do not have permission to upload this file for the organisation.");
  }

  if (rules.some((r) => r.kind === "self")) return { ownerUserId: user.id, organizationId: null, via: "self" };
  if (staffRuleMatches(rules, await staffPermissions(user))) return { ownerUserId: user.id, organizationId: null, via: "staff" };
  if (orgRules.length) throw new UploadAuthorizationError(400, "Choose the organisation this file belongs to.");
  throw new UploadAuthorizationError(403, "You do not have permission to upload this kind of file.");
}
