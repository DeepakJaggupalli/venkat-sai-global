import "server-only";

import { and, asc, count, eq, inArray, isNotNull, isNull, like, notInArray, or, sql } from "drizzle-orm";

import { ONBOARDING_STEPS, type OnboardingState } from "@/components/talent/onboarding/steps";
import { SUPER_ADMIN_ROLE_KEY } from "@/config/permissions";
import { db, type DbOrTx } from "@/db";
import {
  institutionProfiles,
  organizationMembers,
  organizations,
  organizationVerifications,
  partnerProfiles,
  platformSettings,
  roles,
  sessions,
  userRoles,
  userTwoFactor,
  users,
} from "@/db/schema";
import { DEMO_EMAIL_DOMAIN, DEMO_MARKER, DEMO_MARKER_KEY, hasDemoMarker } from "@/lib/demo-accounts";
import { audit } from "@/modules/audit";
import { personalSchema, professionalSchema } from "@/modules/candidates/schemas";
import { ensureCandidateProfile, selfActor, updatePersonalDetails, updateProfessionalSummary } from "@/modules/candidates/service";
import type { CandidateProfileRow } from "@/modules/candidates/types";
import { evaluatePasswordStrength, hashPassword, verifyPassword } from "@/modules/identity/password";
import { currentPolicyVersions, recordSignupConsents } from "@/modules/identity/service";
import { updateInstitutionProfile } from "@/modules/organizations/institution";
import { updatePartnerProfile } from "@/modules/organizations/partner";
import { institutionProfileSchema, organizationDetailsSchema, partnerProfileSchema } from "@/modules/organizations/schemas";
import { createOrganization } from "@/modules/organizations/service";

import { DEMO_ACCOUNTS, demoEmail, demoLoginNotes, demoSignInPath, type DemoAccountKey, type DemoAccountSpec, type DemoLogin, type StaffTwoFactorState } from "./demo-guard";
import { dateOfBirthForAge, ensureMember, generatePassword, loadSessionUser, orgContextFor, setStaffRole, type SeedLog } from "./e2e-helpers";

/**
 * Demo sign-in accounts for every portal (`npm run db:seed:demo`, runner: scripts/seed-demo.ts), so Venkat Sai can
 * try the whole platform, also on the live site. Accounts live on the reserved domain demo.venkatsai.test; every
 * demo user and organisation carries `demoAccount: true` (users.preferences / organizations.metadata), which the
 * public listings filter on (src/lib/demo-accounts.ts).
 *
 * Production-safe by design: no files, no approval requests and no notifications. Organisations are marked verified
 * directly (history row + audit entry) instead of going through the approval centre, which would alert real staff.
 * No jobs, courses, requirements, reviews or CVs are created.
 *
 * Idempotent: rows are found by email / marker and reset to a known state. A kept password that still matches is
 * left alone (no new hash, sessions stay); a changed password signs that account out.
 */

type OrgRow = typeof organizations.$inferSelect;

export type DemoSeedOptions = {
  /** Email (lower-case) → password from the previous credentials file; missing ones get a new random password. */
  keptPasswords?: Readonly<Record<string, string>>;
  /** The target database is on this computer (the live site runs with staff two-step sign-in on by default). */
  local: boolean;
  log?: SeedLog;
  now?: Date;
};

export type DemoSeedResult = {
  logins: DemoLogin[];
  userIds: Record<DemoAccountKey, string>;
  organizationIds: Partial<Record<DemoAccountKey, string>>;
  candidateId: string;
};

const DEMO_VERIFICATION_NOTE = "Demo account for testing. Marked verified by the demo account script; no documents were checked.";
const REMOVED_REASON = "Demo account removed";
const markerJson = (extra: Record<string, unknown> = {}): string => JSON.stringify({ ...DEMO_MARKER, ...extra });

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const DEMO_SIGNUP_SOURCE = "demo";
/** Same bar as generatePassword(): a kept password below it (a hand-edited credentials file) is replaced. */
const DEMO_PASSWORD_MIN_LENGTH = 12;

function keptPasswordFor(kept: Readonly<Record<string, string>>, email: string, name: string): string | null {
  const password = kept[email];
  return password && evaluatePasswordStrength(password, { minLength: DEMO_PASSWORD_MIN_LENGTH, email, name }).ok ? password : null;
}

/**
 * Accounts already on a demo address that this script did not create (no marker, other sign-up source), for
 * example a pending account a recruitment partner submitted with its own phone number. Taking one over would
 * hand it a demo password, staff roles and an active status, so the seed stops before changing anything.
 */
export async function findForeignDemoAddressAccounts(): Promise<string[]> {
  const emails = DEMO_ACCOUNTS.map((spec) => demoEmail(spec.local));
  const rows = await db
    .select({ email: users.email, preferences: users.preferences, signupSource: users.signupSource })
    .from(users)
    .where(inArray(users.email, emails));
  return rows.filter((row) => !hasDemoMarker(row.preferences) && row.signupSource !== DEMO_SIGNUP_SOURCE).map((row) => row.email ?? "");
}

async function upsertDemoUser(spec: DemoAccountSpec, password: string): Promise<{ id: string; created: boolean; passwordChanged: boolean }> {
  const email = demoEmail(spec.local);
  const isStaff = !!spec.staffRole;
  const [existing] = await db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    const same = !!existing.passwordHash && (await verifyPassword(existing.passwordHash, password));
    await db
      .update(users)
      .set({
        displayName: spec.name,
        isStaff,
        status: "active",
        statusReason: null,
        closedAt: null,
        emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
        failedLoginCount: 0,
        lockedUntil: null,
        preferences: sql`coalesce(${users.preferences}, '{}'::jsonb) || ${markerJson()}::jsonb`,
        ...(same ? {} : { passwordHash: await hashPassword(password), passwordChangedAt: new Date() }),
      })
      .where(eq(users.id, existing.id));
    if (!same) await db.delete(sessions).where(eq(sessions.userId, existing.id));
    await audit({ action: "demo.account_reset", entityType: "user", entityId: existing.id, actorType: "system", metadata: { demoKey: spec.key, passwordChanged: !same } });
    return { id: existing.id, created: false, passwordChanged: !same };
  }
  const now = new Date();
  const [created] = await db
    .insert(users)
    .values({
      email,
      emailVerifiedAt: now,
      passwordHash: await hashPassword(password),
      passwordChangedAt: now,
      displayName: spec.name,
      status: "active",
      isStaff,
      signupSource: DEMO_SIGNUP_SOURCE,
      preferences: { ...DEMO_MARKER },
    })
    .returning({ id: users.id });
  const id = created!.id;
  if (!isStaff) {
    await recordSignupConsents(id, { versions: await currentPolicyVersions(), marketing: null, source: "admin", evidence: { seededBy: "demo-seed" } });
  }
  await audit({ action: "demo.account_created", entityType: "user", entityId: id, actorType: "system", metadata: { demoKey: spec.key, staffRole: spec.staffRole ?? null } });
  return { id, created: true, passwordChanged: true };
}

/** Portal accounts never keep Command Centre roles someone granted while testing. */
async function removePlatformRoles(userId: string): Promise<void> {
  const platformRoles = db.select({ id: roles.id }).from(roles).where(eq(roles.scope, "platform"));
  await db.delete(userRoles).where(and(eq(userRoles.userId, userId), inArray(userRoles.roleId, platformRoles)));
}

async function markOnboardingFinished(userId: string, now: Date): Promise<void> {
  const [row] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1);
  const current = (row?.preferences as Record<string, unknown> | undefined)?.talentOnboarding as { finishedAt?: unknown } | undefined;
  if (typeof current?.finishedAt === "string") return;
  const state: OnboardingState = { goals: ["job", "overseas"], completed: [...ONBOARDING_STEPS], skipped: [], finishedAt: now.toISOString() };
  await db
    .update(users)
    .set({ preferences: sql`coalesce(${users.preferences}, '{}'::jsonb) || ${JSON.stringify({ talentOnboarding: state })}::jsonb` })
    .where(eq(users.id, userId));
}

/** Adult candidate (30) with the age gate passed, onboarding finished and a one-line profile: Pipe Welder, Visakhapatnam. */
async function ensureDemoPerson(userId: string, now: Date): Promise<CandidateProfileRow> {
  let profile = await ensureCandidateProfile(userId);
  const session = async () => ({ user: await loadSessionUser(userId), candidate: profile });
  if (!profile.dateOfBirth) {
    profile = await updatePersonalDetails(
      selfActor(await session()),
      personalSchema.parse({ legalName: "Demo Person", dateOfBirth: dateOfBirthForAge(30, now), nationalityCode: "IN", currentCountryCode: "IN", stateRegion: "Andhra Pradesh", city: "Visakhapatnam" }),
    );
  }
  if (!profile.headline) {
    profile = await updateProfessionalSummary(
      selfActor(await session()),
      professionalSchema.parse({ headline: "Pipe Welder", currentJobTitle: "Pipe Welder", about: "Demo account used to try the People Portal. Not a real person." }),
    );
  }
  await markOnboardingFinished(userId, now);
  return profile;
}

// ---------------------------------------------------------------------------
// Organisations
// ---------------------------------------------------------------------------

function isVerifiedNow(org: OrgRow, now: Date): boolean {
  return org.status === "verified" && !org.deletedAt && (!org.verificationExpiresAt || org.verificationExpiresAt > now);
}

/** Verified without the approval centre (no request, no staff alert, no documents); history row + audit entry. */
async function markDemoVerified(org: OrgRow, ownerUserId: string, demoKey: DemoAccountKey, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(organizations)
      .set({
        status: "verified",
        statusReason: null,
        verifiedAt: now,
        verificationExpiresAt: null,
        suspendedAt: null,
        deletedAt: null,
        metadata: sql`(coalesce(${organizations.metadata}, '{}'::jsonb) - 'statusBeforeSuspension' - 'verificationExpiryReminderSentAt' - 'orphanedReason')`,
      })
      .where(eq(organizations.id, org.id));
    await tx.insert(organizationVerifications).values({
      organizationId: org.id,
      status: "approved",
      submittedByUserId: ownerUserId,
      submittedAt: now,
      reviewedAt: now,
      decisionNotes: DEMO_VERIFICATION_NOTE,
      checklist: { [DEMO_MARKER_KEY]: true },
    });
    await audit({
      action: "organization.demo_verified",
      entityType: "organization",
      entityId: org.id,
      organizationId: org.id,
      actorType: "system",
      metadata: { demoKey, previousStatus: org.status },
      tx,
    });
  });
}

/** Profile fields the portals ask for first (partner business type, institution kind), set once through the services. */
async function ensureProfile(org: OrgRow, ownerUserId: string): Promise<void> {
  if (org.type === "recruitment_partner") {
    const [profile] = await db.select({ businessType: partnerProfiles.businessType }).from(partnerProfiles).where(eq(partnerProfiles.organizationId, org.id)).limit(1);
    if (profile?.businessType) return;
    // Domestic sourcing only: no overseas service is declared, so no recruitment licence is needed.
    await updatePartnerProfile(
      await orgContextFor<"recruitment_partner">(ownerUserId, org.id),
      org.id,
      partnerProfileSchema.parse({ businessType: "agency", servicesProvided: ["candidate_sourcing", "screening"], specialisations: ["Welding"], industryIds: [] }),
    );
  } else if (org.type === "institution") {
    const [profile] = await db.select({ kind: institutionProfiles.institutionKind }).from(institutionProfiles).where(eq(institutionProfiles.organizationId, org.id)).limit(1);
    if (profile?.kind) return;
    await updateInstitutionProfile(
      await orgContextFor<"institution">(ownerUserId, org.id),
      org.id,
      institutionProfileSchema.parse({ institutionKind: "training_centre", accreditationBodies: [], aboutHtml: "<p>Test institution used to try the Institution Portal. Not a real institute.</p>" }),
    );
  }
}

async function ensureDemoOrganization(spec: DemoAccountSpec, ownerUserId: string, log: SeedLog, now: Date): Promise<OrgRow> {
  const def = spec.organization!;
  const keyMarker = markerJson({ demoKey: spec.key });
  const find = async () =>
    (
      await db
        .select()
        .from(organizations)
        .where(and(eq(organizations.type, def.type), sql`${organizations.metadata} @> ${keyMarker}::jsonb`))
        .orderBy(asc(organizations.createdAt))
        .limit(1)
    )[0] ?? null;

  let org = await find();
  if (!org) {
    // A run that stopped between creating and marking the organisation left it unmarked: adopt it by name and creator.
    const [unmarked] = await db
      .select()
      .from(organizations)
      .where(and(eq(organizations.type, def.type), eq(organizations.name, def.name), eq(organizations.createdByUserId, ownerUserId)))
      .limit(1);
    const base =
      unmarked ??
      (await createOrganization(
        def.type,
        organizationDetailsSchema.parse({
          name: def.name,
          description: def.description,
          email: demoEmail(spec.local),
          countryCode: "IN",
          stateRegion: "Andhra Pradesh",
          city: "Visakhapatnam",
        }),
        { id: ownerUserId, status: "active" },
        { employerKind: def.employerKind },
      ));
    await db
      .update(organizations)
      .set({ metadata: sql`coalesce(${organizations.metadata}, '{}'::jsonb) || ${keyMarker}::jsonb` })
      .where(eq(organizations.id, base.id));
    log(`  created ${def.name}`);
    org = (await find())!;
  }

  await ensureMember(org.id, def.type, ownerUserId, "owner");
  if (def.type === "employer" && org.employerKind !== def.employerKind) {
    await db.update(organizations).set({ employerKind: def.employerKind }).where(eq(organizations.id, org.id));
  }
  await ensureProfile(org, ownerUserId);
  if (!isVerifiedNow(org, now)) {
    await markDemoVerified(org, ownerUserId, spec.key, now);
    log(`  verified ${def.name}`);
  } else {
    log(`  ${def.name} is verified`);
  }
  return (await find())!;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

/** Is staff two-step sign-in required on the target site? A stored setting wins; otherwise the live site default is on. */
async function staffTwoFactorRequired(local: boolean): Promise<boolean> {
  const [row] = await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, "security.require_staff_2fa")).limit(1);
  if (row) return row.value === true;
  return !local;
}

export async function runDemoSeed(opts: DemoSeedOptions): Promise<DemoSeedResult> {
  const log = opts.log ?? (() => undefined);
  const now = opts.now ?? new Date();
  const kept = opts.keptPasswords ?? {};
  const userIds = {} as Record<DemoAccountKey, string>;
  const passwords = {} as Record<DemoAccountKey, string>;

  const foreign = await findForeignDemoAddressAccounts();
  if (foreign.length) {
    throw new Error(
      `Nothing was changed: ${foreign.join(", ")} is already used by an account the demo script did not create. Check that account, delete it or change its email, then run the demo seed again.`,
    );
  }

  log("Accounts:");
  for (const spec of DEMO_ACCOUNTS) {
    const email = demoEmail(spec.local);
    const keptPassword = keptPasswordFor(kept, email, spec.name);
    if (kept[email] && !keptPassword) log(`  the saved password of ${email} is too weak: it gets a new one`);
    const password = keptPassword ?? generatePassword({ email, name: spec.name });
    const result = await upsertDemoUser(spec, password);
    if (spec.staffRole) await setStaffRole(result.id, spec.staffRole);
    else await removePlatformRoles(result.id);
    userIds[spec.key] = result.id;
    passwords[spec.key] = password;
    log(`  ${result.created ? "created" : result.passwordChanged ? "reset (new password)" : "reset"} ${email}`);
  }

  log("Organisations:");
  const organizationIds: Partial<Record<DemoAccountKey, string>> = {};
  for (const spec of DEMO_ACCOUNTS) {
    if (!spec.organization) continue;
    organizationIds[spec.key] = (await ensureDemoOrganization(spec, userIds[spec.key], log, now)).id;
  }

  log("Demo person:");
  const person = await ensureDemoPerson(userIds.person, now);
  log("  Pipe Welder, Visakhapatnam (onboarding finished)");

  const required = await staffTwoFactorRequired(opts.local);
  const staffIds = DEMO_ACCOUNTS.filter((s) => s.staffRole).map((s) => userIds[s.key]);
  const withAuthenticator = new Set(
    (
      await db
        .select({ userId: userTwoFactor.userId })
        .from(userTwoFactor)
        .where(and(inArray(userTwoFactor.userId, staffIds), isNotNull(userTwoFactor.enabledAt)))
    ).map((r) => r.userId),
  );
  const logins: DemoLogin[] = DEMO_ACCOUNTS.map((spec) => {
    const state: StaffTwoFactorState = withAuthenticator.has(userIds[spec.key]) ? "set_up" : required ? "required" : "optional";
    return { portal: spec.portal, signInPath: demoSignInPath(spec), email: demoEmail(spec.local), password: passwords[spec.key], notes: demoLoginNotes(spec, state) };
  });
  return { logins, userIds, organizationIds, candidateId: person.id };
}

// ---------------------------------------------------------------------------
// Removal
// ---------------------------------------------------------------------------

export type DemoRemovalSummary = {
  organizationsDeleted: number;
  /** Kept because other records point at them (jobs, invoices…): suspended, hidden and soft-deleted instead. */
  organizationsClosed: number;
  usersDeleted: number;
  /** Kept because other records point at them: closed, password and roles removed, signed out. */
  usersClosed: number;
  /** Emails left active because no other active Super Admin would remain. */
  keptSuperAdmins: string[];
};

/** Delete inside its own transaction; false when a foreign key keeps the row. */
async function tryDelete(run: (tx: DbOrTx) => Promise<unknown>): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      await run(tx);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove every demo organisation and account: deleted when nothing else refers to them, otherwise closed (organisation
 * suspended + soft-deleted, members disabled; account closed with no password, roles, authenticator or sessions).
 * Never removes the last active Super Admin. Idempotent; a later `runDemoSeed` brings everything back.
 */
export async function removeDemoAccounts(opts: { log?: SeedLog; now?: Date } = {}): Promise<DemoRemovalSummary> {
  const log = opts.log ?? (() => undefined);
  const now = opts.now ?? new Date();
  const summary: DemoRemovalSummary = { organizationsDeleted: 0, organizationsClosed: 0, usersDeleted: 0, usersClosed: 0, keptSuperAdmins: [] };

  const orgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(sql`${organizations.metadata} @> ${markerJson()}::jsonb`);
  for (const org of orgs) {
    if (await tryDelete((tx) => tx.delete(organizations).where(eq(organizations.id, org.id)))) {
      summary.organizationsDeleted += 1;
      log(`  deleted ${org.name}`);
    } else {
      await db.transaction(async (tx) => {
        await tx
          .update(organizations)
          .set({ status: "suspended", statusReason: REMOVED_REASON, suspendedAt: now, isPublic: false, deletedAt: now })
          .where(eq(organizations.id, org.id));
        await tx.update(organizationMembers).set({ status: "disabled" }).where(eq(organizationMembers.organizationId, org.id));
      });
      summary.organizationsClosed += 1;
      log(`  closed ${org.name} (other records refer to it)`);
    }
  }

  const people = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(or(like(users.email, `%@${DEMO_EMAIL_DOMAIN}`), sql`${users.preferences} @> ${markerJson()}::jsonb`));
  const demoIds = people.map((p) => p.id);
  const [superRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.scope, "platform"), eq(roles.key, SUPER_ADMIN_ROLE_KEY), isNull(roles.organizationId)))
    .limit(1);
  const superAdminIds = new Set(
    superRole && demoIds.length
      ? (await db.select({ userId: userRoles.userId }).from(userRoles).where(and(eq(userRoles.roleId, superRole.id), inArray(userRoles.userId, demoIds)))).map((r) => r.userId)
      : [],
  );
  const [otherSuperAdmins] =
    superRole && superAdminIds.size
      ? await db
          .select({ value: count() })
          .from(userRoles)
          .innerJoin(users, eq(users.id, userRoles.userId))
          .where(and(eq(userRoles.roleId, superRole.id), eq(users.status, "active"), notInArray(users.id, demoIds)))
      : [{ value: 1 }];

  for (const person of people) {
    const label = person.email ?? person.id;
    if (superAdminIds.has(person.id) && Number(otherSuperAdmins?.value ?? 0) === 0) {
      summary.keptSuperAdmins.push(label);
      log(`  kept ${label}: it is the only active Super Admin. Give another person the Super Admin role first.`);
      continue;
    }
    if (await tryDelete((tx) => tx.delete(users).where(eq(users.id, person.id)))) {
      summary.usersDeleted += 1;
      log(`  deleted ${label}`);
      continue;
    }
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ status: "closed", statusReason: REMOVED_REASON, closedAt: now, passwordHash: null, isStaff: false, failedLoginCount: 0, lockedUntil: null })
        .where(eq(users.id, person.id));
      await tx.delete(userRoles).where(eq(userRoles.userId, person.id));
      await tx.delete(userTwoFactor).where(eq(userTwoFactor.userId, person.id));
      await tx.delete(sessions).where(eq(sessions.userId, person.id));
      await tx.update(organizationMembers).set({ status: "disabled" }).where(eq(organizationMembers.userId, person.id));
    });
    summary.usersClosed += 1;
    log(`  closed ${label} (other records refer to it)`);
  }

  await audit({
    action: "demo.accounts_removed",
    entityType: "demo_accounts",
    actorType: "system",
    metadata: {
      organizationsDeleted: summary.organizationsDeleted,
      organizationsClosed: summary.organizationsClosed,
      usersDeleted: summary.usersDeleted,
      usersClosed: summary.usersClosed,
      keptSuperAdmins: summary.keptSuperAdmins.length,
    },
  });
  return summary;
}
