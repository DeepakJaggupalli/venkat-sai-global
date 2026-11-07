import "server-only";

import { and, asc, count, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { ORG_OWNER_ROLE_KEY, PERMISSIONS_BY_SCOPE } from "@/config/permissions";
import { db, type DbOrTx } from "@/db";
import { companyBranches, files, organizationInvitations, organizationMembers, organizations, roles, users } from "@/db/schema";
import type { OrgType } from "@/db/schema/_constants";
import { ActionError } from "@/lib/actions";
import { hmacToken, randomToken } from "@/lib/crypto";
import { maskEmail } from "@/lib/format";
import { slugify } from "@/lib/http";
import { audit } from "@/modules/audit";
import { checkEntitlement } from "@/modules/commercial/entitlements";
import { fileUrl } from "@/modules/files";
import type { OrgContext } from "@/modules/identity/authz";
import type { SessionUser } from "@/modules/identity/session";
import { notify, notifyOrganization } from "@/modules/notifications";
import { getSetting } from "@/modules/settings";

import { authorizeOrg, ORG_PERMISSION, type OrgAccess, type OrganizationRow, type OrgActor } from "./access";
import { ORG_TYPE_LABELS } from "./constants";
import { conflictError, forbiddenError, invalidStateError, notFoundError, validationError, withConstraintMessages } from "./errors";
import { invitationPath, ORG_PORTAL_PATH, ORG_TEAM_PATH } from "./paths";
import {
  canGrantRole,
  evaluateInvitationAcceptance,
  INVITATION_REJECTION_MESSAGES,
  invitationStatus,
  invitationTtlDays,
  normalizeInvitationEmail,
  unknownPermissions,
  type InvitationStatus,
} from "./rules";
import type { InviteMemberInput, MemberDetailsInput, OrgRoleInput } from "./schemas";

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_PURPOSE = "org-invitation";

/** Invitation validity from the orgs.invitation_ttl_days setting. Read before opening a transaction (settings use the global pool). */
async function invitationTtlMs(): Promise<number> {
  return invitationTtlDays(await getSetting("orgs.invitation_ttl_days")) * DAY_MS;
}
/** randomToken(32) → 43 base64url characters; accept a little slack, reject anything else before hashing. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

type RoleRow = typeof roles.$inferSelect;

export type MemberListItem = {
  id: string;
  userId: string;
  displayName: string;
  email: string | null;
  roleId: string;
  roleKey: string;
  roleName: string;
  isOwner: boolean;
  status: "invited" | "active" | "disabled";
  jobTitle: string | null;
  department: string | null;
  branchId: string | null;
  joinedAt: Date | null;
  lastActiveAt: Date | null;
};

export type InvitationListItem = {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  invitedByName: string | null;
};

export type OrgRoleItem = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  /** Template role available to every organisation of the type (cannot be edited by organisations). */
  isTemplate: boolean;
  memberCount: number;
};

export type InvitationPreview = {
  status: InvitationStatus | "not_found";
  organization: { id: string; name: string; type: OrgType; typeLabel: string; slug: string; logoUrl: string | null; suspended: boolean } | null;
  roleName: string | null;
  inviterName: string | null;
  /** Full address only when it matches the signed-in viewer; masked otherwise. */
  invitedEmail: string | null;
  viewerEmailMatches: boolean;
  viewerEmailVerified: boolean;
  expiresAt: Date | null;
};

export type AcceptInvitationResult = { organizationId: string; orgType: OrgType; organizationName: string; portalPath: string; alreadyMember: boolean };

export function hashInvitationToken(token: string): string {
  return hmacToken(token, TOKEN_PURPOSE);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadAssignableRole(tx: DbOrTx, org: OrganizationRow, roleId: string): Promise<RoleRow> {
  const [role] = await tx
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.scope, org.type), or(isNull(roles.organizationId), eq(roles.organizationId, org.id))))
    .limit(1);
  if (!role) throw validationError("Choose a valid role.", { roleId: ["Choose a valid role"] });
  return role;
}

function isOwnerRole(role: Pick<RoleRow, "key" | "organizationId">): boolean {
  return role.key === ORG_OWNER_ROLE_KEY && role.organizationId === null;
}

function grantActor(access: OrgAccess) {
  return { isStaff: access.via === "staff", isOwner: access.isOwner, permissions: access.memberPermissions };
}

function assertCanGrant(access: OrgAccess, role: Pick<RoleRow, "key" | "permissions">): void {
  if (!canGrantRole(grantActor(access), role)) throw forbiddenError("You cannot assign a role with more access than your own.");
}

/** Non-owner members may only act on members whose current role they could grant themselves. */
function assertCanManageMember(access: OrgAccess, currentRole: Pick<RoleRow, "key" | "permissions" | "organizationId">): void {
  if (access.via === "staff" || access.isOwner) return;
  if (isOwnerRole(currentRole)) throw forbiddenError("Only an owner can change another owner.");
  if (!currentRole.permissions.every((p) => access.memberPermissions.has(p))) throw forbiddenError("You cannot change a member who has more access than you.");
}

async function countActiveOwners(tx: DbOrTx, organizationId: string, excludeMemberId?: string): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(organizationMembers)
    .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.status, "active"),
        eq(roles.key, ORG_OWNER_ROLE_KEY),
        isNull(roles.organizationId),
        excludeMemberId ? ne(organizationMembers.id, excludeMemberId) : undefined,
      ),
    );
  return row?.value ?? 0;
}

/**
 * Team-seat check (plan entitlement "team_seats"). Pending, unexpired invitations reserve a seat, so
 * new invitations count them; accepting an invitation uses the seat it reserved.
 */
async function assertSeatAvailable(tx: DbOrTx, organizationId: string, opts: { includePendingInvitations: boolean }): Promise<void> {
  const ent = await checkEntitlement(organizationId, "team_seats");
  if (!ent.allowed) throw invalidStateError(ent.reason ?? "Your plan has no free team seats. Upgrade the plan or remove a member first.");
  // Limits off (default until plans are configured) or unlimited plan: nothing to reserve locally.
  if (!ent.enforced || ent.limit === null) return;
  const [members] = await tx
    .select({ value: count() })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.status, "active")));
  let pending = 0;
  if (opts.includePendingInvitations) {
    const [row] = await tx
      .select({ value: count() })
      .from(organizationInvitations)
      .where(
        and(
          eq(organizationInvitations.organizationId, organizationId),
          isNull(organizationInvitations.acceptedAt),
          isNull(organizationInvitations.revokedAt),
          gt(organizationInvitations.expiresAt, new Date()),
        ),
      );
    pending = row?.value ?? 0;
  }
  if ((members?.value ?? 0) + pending + 1 > ent.limit) {
    throw invalidStateError(
      `Your plan includes ${ent.limit} team seat${ent.limit === 1 ? "" : "s"} and all of them are in use or reserved by pending invitations. Upgrade the plan, cancel an invitation or remove a member first.`,
    );
  }
}

async function loadMemberForUpdate(tx: DbOrTx, memberId: string) {
  const [row] = await tx
    .select({ member: organizationMembers, role: roles })
    .from(organizationMembers)
    .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
    .where(eq(organizationMembers.id, memberId))
    .limit(1)
    .for("update", { of: organizationMembers });
  if (!row) throw notFoundError("Member not found.");
  return row;
}

async function sendInvitation(
  tx: DbOrTx,
  args: { org: OrganizationRow; email: string; roleName: string; inviterName: string; token: string; expiresAt: Date },
): Promise<void> {
  await notify(
    {
      event: "org.invitation",
      recipients: [{ email: args.email }],
      data: {
        organizationName: args.org.name,
        organizationType: ORG_TYPE_LABELS[args.org.type],
        roleName: args.roleName,
        inviterName: args.inviterName,
        expiresAt: args.expiresAt.toISOString(),
      },
      link: invitationPath(args.token),
      organizationId: args.org.id,
    },
    { tx },
  );
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/** Team list (members with the team permission of their type, or staff with orgs.view). */
export async function listMembers(actor: OrgActor, organizationId: string): Promise<MemberListItem[]> {
  await authorizeOrg(actor, organizationId, { member: ORG_PERMISSION.team, staff: "orgs.view" });
  const rows = await db
    .select({ member: organizationMembers, role: roles, displayName: users.displayName, email: users.email })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(asc(organizationMembers.status), asc(users.displayName));
  return rows.map((r) => ({
    id: r.member.id,
    userId: r.member.userId,
    displayName: r.displayName,
    email: r.email,
    roleId: r.role.id,
    roleKey: r.role.key,
    roleName: r.role.name,
    isOwner: isOwnerRole(r.role),
    status: r.member.status,
    jobTitle: r.member.jobTitle,
    department: r.member.department,
    branchId: r.member.branchId,
    joinedAt: r.member.joinedAt,
    lastActiveAt: r.member.lastActiveAt,
  }));
}

/**
 * Active colleagues for pickers (batch instructors, drive coordinators, assignees): any member of the
 * organisation or staff with orgs.view. Names and roles only — no contact details.
 */
export async function listMemberOptions(actor: OrgActor, organizationId: string): Promise<{ userId: string; displayName: string; roleName: string }[]> {
  await authorizeOrg(actor, organizationId, { member: "any", staff: "orgs.view" });
  return db
    .select({ userId: organizationMembers.userId, displayName: users.displayName, roleName: roles.name })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.status, "active"), eq(users.status, "active")))
    .orderBy(asc(users.displayName));
}

/** Pending and expired (not accepted, not cancelled) invitations. */
export async function listInvitations(actor: OrgActor, organizationId: string, now: Date = new Date()): Promise<InvitationListItem[]> {
  await authorizeOrg(actor, organizationId, { member: ORG_PERMISSION.team, staff: "orgs.view" });
  const rows = await db
    .select({ inv: organizationInvitations, roleName: roles.name, invitedByName: users.displayName })
    .from(organizationInvitations)
    .innerJoin(roles, eq(roles.id, organizationInvitations.roleId))
    .leftJoin(users, eq(users.id, organizationInvitations.invitedByUserId))
    .where(and(eq(organizationInvitations.organizationId, organizationId), isNull(organizationInvitations.acceptedAt), isNull(organizationInvitations.revokedAt)))
    .orderBy(desc(organizationInvitations.createdAt));
  return rows.map((r) => ({
    id: r.inv.id,
    email: r.inv.email,
    roleId: r.inv.roleId,
    roleName: r.roleName,
    status: invitationStatus(r.inv, now),
    expiresAt: r.inv.expiresAt,
    createdAt: r.inv.createdAt,
    invitedByName: r.invitedByName,
  }));
}

/**
 * Invite someone by email with a role (members with the team permission, or staff orgs.manage).
 * Checks the team-seat entitlement, refuses existing members, and rotates the token of an existing
 * pending invitation to the same address instead of creating a second one. Only an HMAC of the random
 * token is stored; the link /invite/<token> goes out through the org.invitation notification.
 */
export async function inviteMember(actor: OrgActor, organizationId: string, input: InviteMemberInput): Promise<{ invitationId: string; email: string; expiresAt: Date }> {
  const ttlMs = await invitationTtlMs();
  return withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const access = await authorizeOrg(actor, organizationId, { member: ORG_PERMISSION.team, staff: "orgs.manage" }, { tx, lock: true });
        const org = access.organization;
        if (org.status === "suspended") throw invalidStateError("A suspended organisation cannot invite new members.");
        const email = normalizeInvitationEmail(input.email);
        const role = await loadAssignableRole(tx, org, input.roleId);
        assertCanGrant(access, role);

        const [existingMember] = await tx
          .select({ status: organizationMembers.status })
          .from(organizationMembers)
          .innerJoin(users, eq(users.id, organizationMembers.userId))
          .where(and(eq(organizationMembers.organizationId, org.id), sql`lower(${users.email}) = ${email}`))
          .limit(1);
        if (existingMember) {
          throw conflictError(
            existingMember.status === "disabled" ? "This person is a disabled member. Re-enable their membership instead." : "This person is already a member of your organisation.",
            { email: ["Already a member"] },
          );
        }

        const now = new Date();
        const [pending] = await tx
          .select()
          .from(organizationInvitations)
          .where(
            and(
              eq(organizationInvitations.organizationId, org.id),
              sql`lower(${organizationInvitations.email}) = ${email}`,
              isNull(organizationInvitations.acceptedAt),
              isNull(organizationInvitations.revokedAt),
            ),
          )
          .orderBy(desc(organizationInvitations.createdAt))
          .limit(1)
          .for("update");
        if (!pending || pending.expiresAt.getTime() <= now.getTime()) await assertSeatAvailable(tx, org.id, { includePendingInvitations: true });

        const token = randomToken(32);
        const expiresAt = new Date(now.getTime() + ttlMs);
        let invitationId: string;
        if (pending) {
          await tx
            .update(organizationInvitations)
            .set({ roleId: role.id, tokenHash: hashInvitationToken(token), expiresAt, invitedByUserId: access.actorUserId })
            .where(eq(organizationInvitations.id, pending.id));
          invitationId = pending.id;
        } else {
          const [created] = await tx
            .insert(organizationInvitations)
            .values({ organizationId: org.id, email, roleId: role.id, tokenHash: hashInvitationToken(token), invitedByUserId: access.actorUserId, expiresAt })
            .returning({ id: organizationInvitations.id });
          invitationId = created!.id;
        }

        await sendInvitation(tx, { org, email, roleName: role.name, inviterName: actor.user.displayName, token, expiresAt });
        await audit({
          action: pending ? "organization.invitation_resent" : "organization.member_invited",
          entityType: "organization_invitation",
          entityId: invitationId,
          organizationId: org.id,
          actorUserId: access.actorUserId,
          actorType: access.via === "staff" ? "staff" : "user",
          metadata: { email: maskEmail(email), roleKey: role.key, expiresAt: expiresAt.toISOString() },
          tx,
        });
        return { invitationId, email, expiresAt };
      }),
    { organization_invitations_token_uq: "Please try again." },
  );
}

/** Send a fresh link for a pending (or expired) invitation; the previous link stops working. */
export async function resendInvitation(actor: OrgActor, invitationId: string): Promise<{ expiresAt: Date }> {
  const ttlMs = await invitationTtlMs();
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(organizationInvitations).where(eq(organizationInvitations.id, invitationId)).limit(1).for("update");
    if (!inv) throw notFoundError("Invitation not found.");
    const access = await authorizeOrg(actor, inv.organizationId, { member: ORG_PERMISSION.team, staff: "orgs.manage" }, { tx, lock: true });
    const now = new Date();
    const status = invitationStatus(inv, now);
    if (status === "accepted" || status === "revoked") throw invalidStateError("This invitation can no longer be sent.");
    if (access.organization.status === "suspended") throw invalidStateError("A suspended organisation cannot invite new members.");
    const [role] = await tx.select().from(roles).where(eq(roles.id, inv.roleId)).limit(1);
    if (!role) throw invalidStateError("The role of this invitation no longer exists. Send a new invitation.");
    assertCanGrant(access, role);
    if (status === "expired") await assertSeatAvailable(tx, inv.organizationId, { includePendingInvitations: true });
    const token = randomToken(32);
    const expiresAt = new Date(now.getTime() + ttlMs);
    await tx
      .update(organizationInvitations)
      .set({ tokenHash: hashInvitationToken(token), expiresAt, invitedByUserId: access.actorUserId })
      .where(eq(organizationInvitations.id, inv.id));
    await sendInvitation(tx, { org: access.organization, email: inv.email, roleName: role.name, inviterName: actor.user.displayName, token, expiresAt });
    await audit({
      action: "organization.invitation_resent",
      entityType: "organization_invitation",
      entityId: inv.id,
      organizationId: inv.organizationId,
      actorUserId: access.actorUserId,
      metadata: { email: maskEmail(inv.email) },
      tx,
    });
    return { expiresAt };
  });
}

/** Cancel a pending invitation (the link stops working immediately). */
export async function revokeInvitation(actor: OrgActor, invitationId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(organizationInvitations).where(eq(organizationInvitations.id, invitationId)).limit(1).for("update");
    if (!inv) throw notFoundError("Invitation not found.");
    const access = await authorizeOrg(actor, inv.organizationId, { member: ORG_PERMISSION.team, staff: "orgs.manage" }, { tx });
    if (inv.acceptedAt) throw invalidStateError("This invitation has already been accepted. Remove the member instead.");
    if (inv.revokedAt) return;
    await tx.update(organizationInvitations).set({ revokedAt: new Date() }).where(eq(organizationInvitations.id, inv.id));
    await audit({
      action: "organization.invitation_revoked",
      entityType: "organization_invitation",
      entityId: inv.id,
      organizationId: inv.organizationId,
      actorUserId: access.actorUserId,
      metadata: { email: maskEmail(inv.email) },
      tx,
    });
  });
}

/** What the /invite/<token> page shows. Never reveals the full invited address to a different viewer. */
export async function getInvitationPreview(token: string, viewer: Pick<SessionUser, "email" | "emailVerifiedAt"> | null, now: Date = new Date()): Promise<InvitationPreview> {
  const empty: InvitationPreview = {
    status: "not_found",
    organization: null,
    roleName: null,
    inviterName: null,
    invitedEmail: null,
    viewerEmailMatches: false,
    viewerEmailVerified: false,
    expiresAt: null,
  };
  if (!TOKEN_PATTERN.test(token)) return empty;
  const [row] = await db
    .select({ inv: organizationInvitations, org: organizations, roleName: roles.name, inviterName: users.displayName, logo: files })
    .from(organizationInvitations)
    .innerJoin(organizations, eq(organizations.id, organizationInvitations.organizationId))
    .innerJoin(roles, eq(roles.id, organizationInvitations.roleId))
    .leftJoin(users, eq(users.id, organizationInvitations.invitedByUserId))
    .leftJoin(files, eq(files.id, organizations.logoFileId))
    .where(eq(organizationInvitations.tokenHash, hashInvitationToken(token)))
    .limit(1);
  if (!row || row.org.deletedAt) return empty;
  const matches = !!viewer?.email && normalizeInvitationEmail(viewer.email) === normalizeInvitationEmail(row.inv.email);
  const logoUrl = row.logo && row.logo.visibility === "public" && !row.logo.deletedAt && row.logo.scanStatus !== "infected" ? fileUrl(row.logo, { variant: "thumb" }) : null;
  return {
    status: invitationStatus(row.inv, now),
    organization: {
      id: row.org.id,
      name: row.org.name,
      type: row.org.type,
      typeLabel: ORG_TYPE_LABELS[row.org.type],
      slug: row.org.slug,
      logoUrl,
      suspended: row.org.status === "suspended",
    },
    roleName: row.roleName,
    inviterName: row.inviterName,
    invitedEmail: matches ? row.inv.email : maskEmail(row.inv.email),
    viewerEmailMatches: matches,
    viewerEmailVerified: matches && !!viewer?.emailVerifiedAt,
    expiresAt: row.inv.expiresAt,
  };
}

/**
 * Accept an invitation as the signed-in user. The token must be valid, not expired / cancelled / used,
 * and the user's email must equal the invited address (case-insensitive) and be verified. Creates the
 * membership (seat checked) — or keeps an existing active membership — and marks the invitation used.
 * The caller switches the session's active organisation and redirects to `portalPath`.
 */
export async function acceptInvitation(token: string, user: Pick<SessionUser, "id" | "displayName">, now: Date = new Date()): Promise<AcceptInvitationResult> {
  if (!TOKEN_PATTERN.test(token)) throw notFoundError("This invitation link is not valid.");
  return db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.tokenHash, hashInvitationToken(token)))
      .limit(1)
      .for("update");
    if (!inv) throw notFoundError("This invitation link is not valid.");
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, inv.organizationId)).limit(1);
    if (!org || org.deletedAt) throw notFoundError("This organisation is no longer on Venkat Sai Global.");

    const [fresh] = await tx
      .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt, status: users.status })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!fresh) throw notFoundError("Your account could not be found.");
    const check = evaluateInvitationAcceptance(inv, fresh, now);
    if (!check.ok) throw new ActionError(INVITATION_REJECTION_MESSAGES[check.reason], { code: `invitation_${check.reason}` });
    if (org.status === "suspended") throw invalidStateError("This organisation's account is suspended, so new members cannot join right now.");

    const [role] = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.id, inv.roleId), eq(roles.scope, org.type), or(isNull(roles.organizationId), eq(roles.organizationId, org.id))))
      .limit(1);
    if (!role) throw invalidStateError("The role in this invitation no longer exists. Ask the organisation to send a new invitation.");

    const [existing] = await tx
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, org.id), eq(organizationMembers.userId, user.id)))
      .limit(1)
      .for("update");
    let alreadyMember = false;
    if (existing) {
      if (existing.status === "disabled") throw invalidStateError("Your membership of this organisation is disabled. Contact its administrator.");
      alreadyMember = existing.status === "active";
      if (!alreadyMember) {
        await tx.update(organizationMembers).set({ status: "active", roleId: role.id, joinedAt: now, lastActiveAt: now }).where(eq(organizationMembers.id, existing.id));
      }
    } else {
      await assertSeatAvailable(tx, org.id, { includePendingInvitations: false });
      await tx.insert(organizationMembers).values({
        organizationId: org.id,
        userId: user.id,
        roleId: role.id,
        status: "active",
        invitedByUserId: inv.invitedByUserId,
        joinedAt: now,
        lastActiveAt: now,
      });
    }
    await tx.update(organizationInvitations).set({ acceptedAt: now, acceptedByUserId: user.id }).where(eq(organizationInvitations.id, inv.id));

    if (!alreadyMember) {
      await notifyOrganization(
        {
          event: "org.member_added",
          organizationId: org.id,
          permission: ORG_PERMISSION.team[org.type],
          data: { organizationName: org.name, memberName: user.displayName, roleName: role.name },
          link: ORG_TEAM_PATH[org.type],
        },
        { tx },
      );
    }
    await audit({
      action: "organization.member_joined",
      entityType: "organization",
      entityId: org.id,
      organizationId: org.id,
      actorUserId: user.id,
      actorType: "user",
      metadata: { invitationId: inv.id, roleKey: role.key, alreadyMember },
      tx,
    });
    return { organizationId: org.id, orgType: org.type, organizationName: org.name, portalPath: ORG_PORTAL_PATH[org.type], alreadyMember };
  });
}

/** Change a member's role (escalation-guarded; an organisation always keeps an active owner). */
export async function changeMemberRole(actor: OrgActor, memberId: string, roleId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { member, role: currentRole } = await loadMemberForUpdate(tx, memberId);
    const access = await authorizeOrg(actor, member.organizationId, { member: ORG_PERMISSION.team, staff: "orgs.manage" }, { tx, lock: true });
    const role = await loadAssignableRole(tx, access.organization, roleId);
    if (role.id === currentRole.id) return;
    assertCanManageMember(access, currentRole);
    assertCanGrant(access, role);
    if (isOwnerRole(currentRole) && !isOwnerRole(role) && member.status === "active" && (await countActiveOwners(tx, member.organizationId, member.id)) === 0) {
      throw invalidStateError("An organisation must keep at least one owner. Transfer ownership first.");
    }
    await tx.update(organizationMembers).set({ roleId: role.id }).where(eq(organizationMembers.id, member.id));
    await audit({
      action: "organization.member_role_changed",
      entityType: "organization_member",
      entityId: member.id,
      organizationId: member.organizationId,
      actorUserId: access.actorUserId,
      actorType: access.via === "staff" ? "staff" : "user",
      metadata: { userId: member.userId, fromRole: currentRole.key, toRole: role.key },
      tx,
    });
  });
}

/** Disable or re-enable a membership. You cannot disable yourself or the last active owner. */
export async function setMemberStatus(actor: OrgActor, memberId: string, status: "active" | "disabled"): Promise<void> {
  await db.transaction(async (tx) => {
    const { member, role } = await loadMemberForUpdate(tx, memberId);
    const access = await authorizeOrg(actor, member.organizationId, { member: ORG_PERMISSION.team, staff: "orgs.manage" }, { tx, lock: true });
    if (member.status === status) return;
    if (access.via === "member" && member.id === access.membershipId) throw invalidStateError("You cannot change your own membership status.");
    assertCanManageMember(access, role);
    if (status === "disabled" && isOwnerRole(role) && (await countActiveOwners(tx, member.organizationId, member.id)) === 0) {
      throw invalidStateError("An organisation must keep at least one active owner.");
    }
    if (status === "active") await assertSeatAvailable(tx, member.organizationId, { includePendingInvitations: true });
    await tx.update(organizationMembers).set({ status }).where(eq(organizationMembers.id, member.id));
    await audit({
      action: status === "disabled" ? "organization.member_disabled" : "organization.member_enabled",
      entityType: "organization_member",
      entityId: member.id,
      organizationId: member.organizationId,
      actorUserId: access.actorUserId,
      actorType: access.via === "staff" ? "staff" : "user",
      metadata: { userId: member.userId },
      tx,
    });
  });
}

/** Disable a membership (access stops at once; the last active owner cannot be disabled). */
export function disableMember(actor: OrgActor, memberId: string): Promise<void> {
  return setMemberStatus(actor, memberId, "disabled");
}

/** Re-enable a disabled membership (uses a team seat). */
export function enableMember(actor: OrgActor, memberId: string): Promise<void> {
  return setMemberStatus(actor, memberId, "active");
}

/** Job title, department and (employers) branch of a member. */
export async function updateMemberDetails(actor: OrgActor, input: MemberDetailsInput): Promise<void> {
  await db.transaction(async (tx) => {
    const { member } = await loadMemberForUpdate(tx, input.memberId);
    const access = await authorizeOrg(actor, member.organizationId, { member: ORG_PERMISSION.team, staff: "orgs.manage" }, { tx });
    if (input.branchId) {
      if (access.organization.type !== "employer") throw validationError("Branches apply to employers only.", { branchId: ["Not available"] });
      const [branch] = await tx
        .select({ id: companyBranches.id })
        .from(companyBranches)
        .where(and(eq(companyBranches.id, input.branchId), eq(companyBranches.organizationId, member.organizationId)))
        .limit(1);
      if (!branch) throw validationError("Choose one of your branches.", { branchId: ["Choose one of your branches"] });
    }
    await tx
      .update(organizationMembers)
      .set({ jobTitle: input.jobTitle ?? null, department: input.department ?? null, branchId: input.branchId ?? null })
      .where(eq(organizationMembers.id, member.id));
    await audit({
      action: "organization.member_updated",
      entityType: "organization_member",
      entityId: member.id,
      organizationId: member.organizationId,
      actorUserId: access.actorUserId,
      metadata: { userId: member.userId },
      tx,
    });
  });
}

/** Remove another member (use leaveOrganization for yourself). The last active owner cannot be removed. */
export async function removeMember(actor: OrgActor, memberId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { member, role } = await loadMemberForUpdate(tx, memberId);
    const access = await authorizeOrg(actor, member.organizationId, { member: ORG_PERMISSION.team, staff: "orgs.manage" }, { tx, lock: true });
    if (access.via === "member" && member.id === access.membershipId) throw invalidStateError("To remove yourself, leave the organisation instead.");
    assertCanManageMember(access, role);
    if (isOwnerRole(role) && member.status === "active" && (await countActiveOwners(tx, member.organizationId, member.id)) === 0) {
      throw invalidStateError("An organisation must keep at least one owner. Transfer ownership first.");
    }
    await tx.delete(organizationMembers).where(eq(organizationMembers.id, member.id));
    await audit({
      action: "organization.member_removed",
      entityType: "organization_member",
      entityId: member.id,
      organizationId: member.organizationId,
      actorUserId: access.actorUserId,
      actorType: access.via === "staff" ? "staff" : "user",
      metadata: { userId: member.userId, roleKey: role.key },
      tx,
    });
  });
}

/** Leave the organisation (the last owner must transfer ownership first). */
export async function leaveOrganization(ctx: OrgContext): Promise<void> {
  await db.transaction(async (tx) => {
    const { member, role } = await loadMemberForUpdate(tx, ctx.membership.id);
    if (member.userId !== ctx.user.id) throw forbiddenError();
    await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, member.organizationId)).limit(1).for("update");
    if (isOwnerRole(role) && (await countActiveOwners(tx, member.organizationId, member.id)) === 0) {
      throw invalidStateError("You are the only owner. Transfer ownership to another member before leaving.");
    }
    await tx.delete(organizationMembers).where(eq(organizationMembers.id, member.id));
    await audit({ action: "organization.member_left", entityType: "organization_member", entityId: member.id, organizationId: member.organizationId, actorUserId: ctx.user.id, tx });
  });
}

/**
 * Make another active member the owner. A member-owner hands over ownership and becomes an admin;
 * staff (orgs.manage) can appoint an owner, demoting the existing owners to admin.
 */
export async function transferOwnership(actor: OrgActor, organizationId: string, toMemberId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const access = await authorizeOrg(actor, organizationId, { member: "any", staff: "orgs.manage" }, { tx, lock: true });
    if (access.via === "member" && !access.isOwner) throw forbiddenError("Only an owner can transfer ownership.");
    const { member: target, role: targetRole } = await loadMemberForUpdate(tx, toMemberId);
    if (target.organizationId !== organizationId) throw notFoundError("Member not found.");
    if (target.status !== "active") throw invalidStateError("Ownership can only be transferred to an active member.");
    if (isOwnerRole(targetRole)) throw invalidStateError("This member is already an owner.");

    const type = access.organization.type;
    const templates = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.scope, type), isNull(roles.organizationId), inArray(roles.key, [ORG_OWNER_ROLE_KEY, "admin"])));
    const ownerRole = templates.find((r) => r.key === ORG_OWNER_ROLE_KEY);
    const adminRole = templates.find((r) => r.key === "admin");
    if (!ownerRole || !adminRole) throw new Error(`Role templates for ${type} are missing. Run npm run db:seed.`);

    await tx.update(organizationMembers).set({ roleId: ownerRole.id }).where(eq(organizationMembers.id, target.id));
    const demoted =
      access.via === "member"
        ? [access.membershipId!]
        : (
            await tx
              .select({ id: organizationMembers.id })
              .from(organizationMembers)
              .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.roleId, ownerRole.id), ne(organizationMembers.id, target.id)))
          ).map((r) => r.id);
    if (demoted.length) await tx.update(organizationMembers).set({ roleId: adminRole.id }).where(inArray(organizationMembers.id, demoted));
    await audit({
      action: "organization.ownership_transferred",
      entityType: "organization",
      entityId: organizationId,
      organizationId,
      actorUserId: access.actorUserId,
      actorType: access.via === "staff" ? "staff" : "user",
      metadata: { toUserId: target.userId, demotedMemberIds: demoted },
      tx,
    });
  });
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/** Template roles of the organisation type plus the organisation's custom roles, with member counts. */
export async function listOrgRoles(actor: OrgActor, organizationId: string): Promise<OrgRoleItem[]> {
  const { organization: org } = await authorizeOrg(actor, organizationId, { member: ORG_PERMISSION.team, staff: "orgs.view" });
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(roles)
      .where(and(eq(roles.scope, org.type), or(isNull(roles.organizationId), eq(roles.organizationId, org.id))))
      .orderBy(asc(roles.sortOrder), asc(roles.name)),
    db
      .select({ roleId: organizationMembers.roleId, value: count() })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, org.id))
      .groupBy(organizationMembers.roleId),
  ]);
  const byRole = new Map(counts.map((c) => [c.roleId, c.value]));
  return rows.map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    permissions: role.permissions,
    isTemplate: role.organizationId === null,
    memberCount: byRole.get(role.id) ?? 0,
  }));
}

function validateRolePermissions(type: OrgType, permissions: readonly string[]): void {
  const catalogue = PERMISSIONS_BY_SCOPE[type].map((p) => p.key);
  const unknown = unknownPermissions(catalogue, permissions);
  if (unknown.length) throw validationError("Some permissions are not available for this organisation type.", { permissions: [`Not available: ${unknown.join(", ")}`] });
}

async function uniqueRoleKey(tx: DbOrTx, org: OrganizationRow, name: string): Promise<string> {
  // Custom keys are prefixed so they can never collide with template keys ("owner", "admin"...).
  const root = `custom-${slugify(name, 40) || "role"}`;
  const existing = await tx
    .select({ key: roles.key })
    .from(roles)
    .where(and(eq(roles.scope, org.type), eq(roles.organizationId, org.id), sql`${roles.key} like ${`${root}%`}`));
  const taken = new Set(existing.map((r) => r.key));
  if (!taken.has(root)) return root;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${Date.now().toString(36)}`;
}

/** Create a custom role (permissions must come from the type's catalogue and be grantable by the actor). */
export async function createOrgRole(actor: OrgActor, organizationId: string, input: OrgRoleInput): Promise<OrgRoleItem> {
  return withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const access = await authorizeOrg(actor, organizationId, { member: ORG_PERMISSION.team, staff: "orgs.manage" }, { tx, lock: true });
        const org = access.organization;
        validateRolePermissions(org.type, input.permissions);
        assertCanGrant(access, { key: "custom", permissions: input.permissions });
        const key = await uniqueRoleKey(tx, org, input.name);
        const [role] = await tx
          .insert(roles)
          .values({ scope: org.type, key, name: input.name, description: input.description ?? null, permissions: input.permissions, organizationId: org.id, isSystem: false, sortOrder: 1000 })
          .returning();
        await audit({
          action: "organization.role_created",
          entityType: "role",
          entityId: role!.id,
          organizationId: org.id,
          actorUserId: access.actorUserId,
          metadata: { key, name: input.name, permissions: input.permissions },
          tx,
        });
        return { id: role!.id, key, name: role!.name, description: role!.description, permissions: role!.permissions, isTemplate: false, memberCount: 0 };
      }),
    { roles_scope_key_org_uq: "A role with this name already exists. Choose another name." },
  );
}

async function loadCustomRoleForUpdate(tx: DbOrTx, roleId: string): Promise<RoleRow & { organizationId: string }> {
  const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).limit(1).for("update");
  if (!role || !role.organizationId || role.isSystem) throw notFoundError("Custom role not found. Template roles cannot be changed here.");
  return role as RoleRow & { organizationId: string };
}

/** Rename / re-describe / change permissions of a custom role (applies to its members immediately). */
export async function updateOrgRole(actor: OrgActor, roleId: string, input: OrgRoleInput): Promise<void> {
  await db.transaction(async (tx) => {
    const role = await loadCustomRoleForUpdate(tx, roleId);
    const access = await authorizeOrg(actor, role.organizationId, { member: ORG_PERMISSION.team, staff: "orgs.manage" }, { tx });
    if (role.scope !== access.organization.type) throw notFoundError("Custom role not found.");
    validateRolePermissions(access.organization.type, input.permissions);
    assertCanGrant(access, role);
    assertCanGrant(access, { key: role.key, permissions: input.permissions });
    await tx.update(roles).set({ name: input.name, description: input.description ?? null, permissions: input.permissions }).where(eq(roles.id, role.id));
    await audit({
      action: "organization.role_updated",
      entityType: "role",
      entityId: role.id,
      organizationId: role.organizationId,
      actorUserId: access.actorUserId,
      metadata: { name: input.name, from: role.permissions, to: input.permissions },
      tx,
    });
  });
}

/** Delete an unused custom role (no members and no pending invitations use it). */
export async function deleteOrgRole(actor: OrgActor, roleId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const role = await loadCustomRoleForUpdate(tx, roleId);
    const access = await authorizeOrg(actor, role.organizationId, { member: ORG_PERMISSION.team, staff: "orgs.manage" }, { tx });
    assertCanGrant(access, role);
    const [members] = await tx.select({ value: count() }).from(organizationMembers).where(eq(organizationMembers.roleId, role.id));
    if ((members?.value ?? 0) > 0) throw conflictError(`Reassign the ${members!.value} member(s) who have this role first.`);
    const now = new Date();
    const [pending] = await tx
      .select({ value: count() })
      .from(organizationInvitations)
      .where(and(eq(organizationInvitations.roleId, role.id), isNull(organizationInvitations.acceptedAt), isNull(organizationInvitations.revokedAt), gt(organizationInvitations.expiresAt, now)));
    if ((pending?.value ?? 0) > 0) throw conflictError("Cancel the pending invitations that use this role first.");
    // Used, cancelled and expired invitations only reference the role for history (kept in the audit log).
    await tx.delete(organizationInvitations).where(eq(organizationInvitations.roleId, role.id));
    await tx.delete(roles).where(eq(roles.id, role.id));
    await audit({ action: "organization.role_deleted", entityType: "role", entityId: role.id, organizationId: role.organizationId, actorUserId: access.actorUserId, metadata: { key: role.key, name: role.name }, tx });
  });
}
