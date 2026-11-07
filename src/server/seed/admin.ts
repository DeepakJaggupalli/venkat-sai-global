import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { SUPER_ADMIN_ROLE_KEY } from "@/config/permissions";
import { db } from "@/db";
import { roles, sessions, userRoles, users } from "@/db/schema";
import { maskEmail } from "@/lib/format";
import { audit } from "@/modules/audit";
import { checkPasswordStrength, hashPassword } from "@/modules/identity/password";

import type { SeedResult } from "./util";

/**
 * First Super Admin from SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD (optional SEED_ADMIN_NAME).
 * Runs only while NO Super Admin exists, so it can never take over an established platform.
 * If an account with that email already exists (e.g. it signed up as a candidate) it is promoted:
 * the password is replaced with the seed password and its existing sessions are revoked.
 * Remove SEED_ADMIN_PASSWORD from the environment after the first successful run.
 */
export async function seedFirstSuperAdmin(): Promise<SeedResult> {
  const name = "super admin";
  const existing = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(roles.scope, "platform"), eq(roles.key, SUPER_ADMIN_ROLE_KEY), isNull(roles.organizationId)))
    .limit(1);
  if (existing.length) return { name, inserted: 0, updated: 0, total: 1, note: "a Super Admin already exists — skipped" };

  const rawEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!rawEmail || !password) {
    return { name, inserted: 0, updated: 0, total: 1, note: "no Super Admin yet — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD and run the seed again" };
  }
  const email = z.email().safeParse(rawEmail);
  if (!email.success) throw new Error("SEED_ADMIN_EMAIL is not a valid email address");
  const strength = await checkPasswordStrength(password, { email: email.data });
  if (!strength.ok) throw new Error(`SEED_ADMIN_PASSWORD is too weak: ${strength.message}`);
  const displayName = process.env.SEED_ADMIN_NAME?.trim() || "Super Admin";
  const passwordHash = await hashPassword(password);

  const result = await db.transaction(async (tx) => {
    const [role] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.scope, "platform"), eq(roles.key, SUPER_ADMIN_ROLE_KEY), isNull(roles.organizationId)))
      .limit(1);
    if (!role) throw new Error("Super Admin role not found — seed roles first");

    const now = new Date();
    const [current] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email.data)).limit(1);
    let userId: string;
    let promoted = false;
    if (current) {
      promoted = true;
      userId = current.id;
      await tx
        .update(users)
        .set({
          isStaff: true,
          status: "active",
          statusReason: null,
          emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
          passwordHash,
          passwordChangedAt: now,
          failedLoginCount: 0,
          lockedUntil: null,
        })
        .where(eq(users.id, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
    } else {
      const [created] = await tx
        .insert(users)
        .values({
          email: email.data,
          emailVerifiedAt: now,
          passwordHash,
          passwordChangedAt: now,
          displayName,
          status: "active",
          isStaff: true,
          signupSource: "seed",
        })
        .returning({ id: users.id });
      userId = created!.id;
    }
    await tx.insert(userRoles).values({ userId, roleId: role.id, grantedByUserId: null }).onConflictDoNothing();
    await audit({
      action: promoted ? "user.promoted_to_super_admin" : "user.super_admin_created",
      entityType: "user",
      entityId: userId,
      actorType: "system",
      metadata: { source: "seed", email: maskEmail(email.data) },
      tx,
    });
    return { promoted };
  });

  return {
    name,
    inserted: result.promoted ? 0 : 1,
    updated: result.promoted ? 1 : 0,
    total: 1,
    note: `${result.promoted ? "existing account promoted" : "created"} for ${maskEmail(email.data)}`,
  };
}
