/**
 * Invitation and membership rules against PostgreSQL. Runs only against an isolated test database:
 *   node scripts/test-db.mjs vsg_test_orgs_training
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_orgs_training'; npx vitest run src/modules/organizations
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

// Team-seat limit controlled per test (the real entitlement module is permissive until plans exist).
const seats = vi.hoisted(() => ({ limit: null as number | null }));
vi.mock("@/modules/commercial/entitlements", () => ({
  checkEntitlement: async () => ({ allowed: true, enforced: true, limit: seats.limit, used: 0, remaining: null }),
  consumeEntitlement: async () => undefined,
}));

describe.skipIf(!enabled)("organisation members and invitations", async () => {
  if (!enabled) return;
  const { eq } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { organizationInvitations, organizationMembers } = await import("@/db/schema");
  const fx = await import("./testing");
  const service = await import("./service");
  const members = await import("./members");

  let owner: Awaited<ReturnType<typeof fx.createUser>>;
  let orgId: string;

  /** The token travels only in the invitation notification (link /invite/<token>). */
  async function lastInvitationToken(since: Date): Promise<string> {
    const tasks = await fx.tasksSince(since, "notifications.dispatch");
    const invite = tasks.filter((t) => t.payload.event === "org.invitation").at(-1);
    const link = String(invite?.payload.link ?? "");
    const token = decodeURIComponent(link.replace(/^\/invite\//, ""));
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    return token;
  }

  async function invite(email: string, roleKey = "recruiter") {
    const ctx = await fx.memberContext<"employer">(owner, orgId);
    const since = new Date(Date.now() - 1000);
    const result = await members.inviteMember(ctx, orgId, { email, roleId: await fx.templateRoleId("employer", roleKey) });
    return { ...result, token: await lastInvitationToken(since) };
  }

  beforeAll(async () => {
    await fx.seedReferenceData();
    owner = await fx.createUser({ displayName: "Owner" });
    const org = await service.createOrganization("employer", { name: `Invite Test Co ${Date.now()}`, countryCode: "AE", city: "Dubai" }, owner);
    orgId = org.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates the organisation with an owner membership and an empty company profile", async () => {
    const ctx = await fx.memberContext<"employer">(owner, orgId);
    expect(ctx.isOwner).toBe(true);
    expect(ctx.organization.status).toBe("draft");
    expect(ctx.permissions.has("employer.team.manage")).toBe(true);
  });

  it("stores only a hash of the token and previews the invitation without leaking the address", async () => {
    const email = fx.uniqueEmail("Alice");
    const { invitationId, token } = await invite(email);
    const [row] = await db.select().from(organizationInvitations).where(eq(organizationInvitations.id, invitationId));
    expect(row!.tokenHash).not.toContain(token);
    expect(row!.tokenHash).toBe(members.hashInvitationToken(token));

    const anonymous = await members.getInvitationPreview(token, null);
    expect(anonymous).toMatchObject({ status: "pending", roleName: "Recruiter", viewerEmailMatches: false });
    expect(anonymous.invitedEmail).not.toBe(email.toLowerCase());
    const matching = await members.getInvitationPreview(token, { email: email.toUpperCase(), emailVerifiedAt: new Date() });
    expect(matching).toMatchObject({ viewerEmailMatches: true, viewerEmailVerified: true, invitedEmail: email.toLowerCase() });
    expect((await members.getInvitationPreview("x".repeat(43), null)).status).toBe("not_found");
  });

  it("only lets the invited, verified email accept, once", async () => {
    const email = fx.uniqueEmail("bob");
    const { token } = await invite(email);

    const stranger = await fx.createUser({ email: fx.uniqueEmail("stranger") });
    await expect(members.acceptInvitation(token, stranger)).rejects.toMatchObject({ code: "invitation_email_mismatch" });

    // Same address in different letter case: matching is case-insensitive.
    const unverified = await fx.createUser({ email: email.replace(/^bob/, "BoB"), verified: false });
    await expect(members.acceptInvitation(token, unverified)).rejects.toMatchObject({ code: "invitation_email_unverified" });

    // Verify the address (case differs from the invitation) and accept.
    const { users } = await import("@/db/schema");
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, unverified.id));
    const result = await members.acceptInvitation(token, unverified);
    expect(result).toMatchObject({ organizationId: orgId, orgType: "employer", portalPath: "/employer", alreadyMember: false });
    const [membership] = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, unverified.id));
    expect(membership).toMatchObject({ organizationId: orgId, status: "active" });

    await expect(members.acceptInvitation(token, unverified)).rejects.toMatchObject({ code: "invitation_accepted" });
    expect((await members.getInvitationPreview(token, null)).status).toBe("accepted");
  });

  it("refuses expired and cancelled invitations, and rotates tokens on resend", async () => {
    const expiredEmail = fx.uniqueEmail("late");
    const expired = await invite(expiredEmail);
    await db.update(organizationInvitations).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(organizationInvitations.id, expired.invitationId));
    const lateUser = await fx.createUser({ email: expiredEmail });
    await expect(members.acceptInvitation(expired.token, lateUser)).rejects.toMatchObject({ code: "invitation_expired" });

    const ctx = await fx.memberContext<"employer">(owner, orgId);
    const since = new Date(Date.now() - 1000);
    await members.resendInvitation(ctx, expired.invitationId);
    const fresh = await lastInvitationToken(since);
    expect(fresh).not.toBe(expired.token);
    expect((await members.getInvitationPreview(expired.token, null)).status).toBe("not_found");
    await members.revokeInvitation(ctx, expired.invitationId);
    await expect(members.acceptInvitation(fresh, lateUser)).rejects.toMatchObject({ code: "invitation_revoked" });
  });

  it("refuses inviting existing members and enforces the team-seat limit including pending invitations", async () => {
    const ctx = await fx.memberContext<"employer">(owner, orgId);
    await expect(members.inviteMember(ctx, orgId, { email: owner.email!, roleId: await fx.templateRoleId("employer", "viewer") })).rejects.toMatchObject({ code: "conflict" });

    const active = (await members.listMembers(ctx, orgId)).filter((m) => m.status === "active").length;
    const pending = (await members.listInvitations(ctx, orgId)).filter((i) => i.status === "pending").length;
    seats.limit = active + pending + 1;
    try {
      await invite(fx.uniqueEmail("seat-ok"));
      await expect(members.inviteMember(ctx, orgId, { email: fx.uniqueEmail("seat-full"), roleId: await fx.templateRoleId("employer", "viewer") })).rejects.toThrow(/team seat/);
    } finally {
      seats.limit = null;
    }
  });

  it("blocks privilege escalation and protects the last owner", async () => {
    const adminUser = await fx.createUser({ displayName: "Admin" });
    const adminInvite = await invite(adminUser.email!, "admin");
    await members.acceptInvitation(adminInvite.token, adminUser);
    const adminCtx = await fx.memberContext<"employer">(adminUser, orgId);

    // An admin cannot hand out the owner role, nor change the owner.
    await expect(members.inviteMember(adminCtx, orgId, { email: fx.uniqueEmail("wannabe"), roleId: await fx.templateRoleId("employer", "owner") })).rejects.toMatchObject({ code: "forbidden" });
    const ownerCtx = await fx.memberContext<"employer">(owner, orgId);
    const ownerMembership = ownerCtx.membership.id;
    await expect(members.changeMemberRole(adminCtx, ownerMembership, await fx.templateRoleId("employer", "viewer"))).rejects.toMatchObject({ code: "forbidden" });

    // The only owner cannot leave or demote themselves.
    await expect(members.leaveOrganization(ownerCtx)).rejects.toMatchObject({ code: "invalid_state" });
    await expect(members.changeMemberRole(ownerCtx, ownerMembership, await fx.templateRoleId("employer", "admin"))).rejects.toMatchObject({ code: "invalid_state" });

    // Custom roles: only catalogue permissions, never more than the creator holds.
    await expect(members.createOrgRole(adminCtx, orgId, { name: "Ops", permissions: ["orgs.manage"] })).rejects.toMatchObject({ code: "validation" });
    const custom = await members.createOrgRole(adminCtx, orgId, { name: "Owner", permissions: ["employer.dashboard"] });
    expect(custom.key).toBe("custom-owner");

    // Transfer: the target becomes owner, the previous owner an admin.
    const adminMembership = adminCtx.membership.id;
    await members.transferOwnership(ownerCtx, orgId, adminMembership);
    expect((await fx.memberContext<"employer">(adminUser, orgId)).isOwner).toBe(true);
    const formerOwner = await fx.memberContext<"employer">(owner, orgId);
    expect(formerOwner.isOwner).toBe(false);
    expect(formerOwner.role.key).toBe("admin");
  });
});
