/**
 * Demo accounts against PostgreSQL (isolated test database only: vsg_t_*, vsg_r_* or vsg_test_*):
 *   node scripts/test-db.mjs vsg_t_demo
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_t_demo npx vitest run src/server/seed/demo.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { OrgContext } from "@/modules/identity/authz";

const enabled = /\/vsg_(?:t|test|r)_[a-z0-9_]+(\?|$)/.test(process.env.DATABASE_URL ?? "");

/** In-memory cookie jar, so the real sign-in service can create a session outside a request. */
const browser = vi.hoisted(() => {
  const store = new Map<string, string>();
  const jar = {
    get: (name: string) => (store.has(name) ? { name, value: store.get(name) as string } : undefined),
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    has: (name: string) => store.has(name),
    set: (name: string | { name: string; value: string }, value?: string) => {
      if (typeof name === "string") store.set(name, value ?? "");
      else store.set(name.name, name.value);
    },
    delete: (name: string | { name: string }) => {
      store.delete(typeof name === "string" ? name : name.name);
    },
  };
  return { store, jar };
});

vi.mock("next/headers", () => ({
  cookies: async () => browser.jar,
  headers: async () => new Headers({ "user-agent": "demo-seed-test", host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("demo accounts", async () => {
  if (!enabled) return;
  const { and, count, eq, inArray, isNotNull, isNull, like, sql } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const fx = await import("@/modules/organizations/testing");
  const { createOrganization } = await import("@/modules/organizations/service");
  const employer = await import("@/modules/organizations/employer");
  const institution = await import("@/modules/organizations/institution");
  const { getPublicJobBySlug } = await import("@/modules/jobs/queries");
  const { searchJobs } = await import("@/modules/jobs/search");
  const { parseJobSearchParams } = await import("@/modules/jobs/schemas");
  const training = await import("@/modules/training/queries");
  const campus = await import("@/modules/training/campus");
  const { listPublicInternships } = await import("@/modules/training/internships");
  const career = await import("@/app/talent/career/_lib/queries");
  const { getActiveAnnouncements } = await import("@/modules/content/announcements");
  const { computeLiveMetric } = await import("@/modules/content/public-metrics");
  const { searchCandidates } = await import("@/modules/candidates/search");
  const { candidateSearchFiltersSchema, personalSchema } = await import("@/modules/candidates/schemas");
  const candidates = await import("@/modules/candidates/service");
  const { verifyPassword } = await import("@/modules/identity/password");
  const authz = await import("@/modules/identity/authz");
  const { setSetting } = await import("@/modules/settings");
  const { hasDemoMarker } = await import("@/lib/demo-accounts");
  const demo = await import("./demo");
  const { DEMO_ACCOUNTS, demoEmail } = await import("./demo-guard");

  type SeedResult = Awaited<ReturnType<typeof demo.runDemoSeed>>;
  const tag = Date.now().toString(36);
  const page = { page: 1, pageSize: 100, offset: 0 };
  const ADMIN = "admin@demo.venkatsai.test";
  let first: SeedResult;
  let latest: SeedResult;

  const passwordsOf = (result: SeedResult) => Object.fromEntries(result.logins.map((l) => [l.email, l.password]));
  const userRow = async (id: string) => (await db.select().from(s.users).where(eq(s.users.id, id)))[0]!;
  const orgRow = async (id: string) => (await db.select().from(s.organizations).where(eq(s.organizations.id, id)))[0]!;
  const demoOrgIds = () => Object.values(first.organizationIds) as string[];
  const addSession = async (userId: string, id: string) => {
    await db.insert(s.sessions).values({ id, userId, expiresAt: new Date(Date.now() + 3_600_000) });
    return async () => (await db.select({ id: s.sessions.id }).from(s.sessions).where(eq(s.sessions.id, id))).length === 1;
  };

  beforeAll(async () => {
    await fx.seedReferenceData();
    first = await demo.runDemoSeed({ local: true });
    latest = first;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates a sign-in for every portal, verified demo organisations and the demo person", async () => {
    expect(first.logins.map((l) => l.email)).toEqual(DEMO_ACCOUNTS.map((a) => demoEmail(a.local)));
    for (const spec of DEMO_ACCOUNTS) {
      const user = await userRow(first.userIds[spec.key]);
      expect(user).toMatchObject({ email: demoEmail(spec.local), displayName: spec.name, status: "active", isStaff: !!spec.staffRole });
      expect(user.emailVerifiedAt).not.toBeNull();
      expect(hasDemoMarker(user.preferences)).toBe(true);
      expect(await verifyPassword(user.passwordHash!, passwordsOf(first)[user.email!]!)).toBe(true);
      expect(authz.portalHomePath(await authz.getPortalAccess(await fx.reloadUser(user.id)))).toBe(spec.home);
    }
    const roleKeys = async (userId: string) =>
      (await db.select({ key: s.roles.key }).from(s.userRoles).innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId)).where(eq(s.userRoles.userId, userId))).map((r) => r.key);
    expect(await roleKeys(first.userIds.admin)).toEqual(["super_admin"]);
    expect(await roleKeys(first.userIds.staff)).toEqual(["recruiter"]);
    expect(await roleKeys(first.userIds.person)).toEqual([]);

    for (const key of ["company", "agency", "partner", "institution"] as const) {
      const org = await orgRow(first.organizationIds[key]!);
      expect(org).toMatchObject({ status: "verified", isPublic: false, deletedAt: null, verificationExpiresAt: null });
      expect(org.metadata).toMatchObject({ demoAccount: true, demoKey: key });
    }
    expect((await orgRow(first.organizationIds.company!)).employerKind).toBe("direct_company");
    expect((await orgRow(first.organizationIds.agency!)).employerKind).toBe("travel_agency");
    // Verified without the approval centre: no request, so no alert to real staff.
    expect(await db.select({ id: s.approvalRequests.id }).from(s.approvalRequests).where(inArray(s.approvalRequests.entityId, demoOrgIds()))).toHaveLength(0);

    const [person] = await db.select().from(s.candidateProfiles).where(eq(s.candidateProfiles.id, first.candidateId));
    expect(person).toMatchObject({ userId: first.userIds.person, headline: "Pipe Welder", currentJobTitle: "Pipe Welder", city: "Visakhapatnam", visibility: "venkat_sai_only" });
    expect(person!.dateOfBirth).not.toBeNull();
    const onboarding = ((await userRow(first.userIds.person)).preferences as { talentOnboarding?: { finishedAt?: unknown } }).talentOnboarding;
    expect(typeof onboarding?.finishedAt).toBe("string");
  });

  it("re-runs without duplicates, keeping passwords and sessions", async () => {
    const stillSignedIn = await addSession(first.userIds.person, `demo-keep-${tag}`);
    const verifications = async () =>
      (await db.select({ value: count() }).from(s.organizationVerifications).where(inArray(s.organizationVerifications.organizationId, demoOrgIds())))[0]!.value;
    const before = await verifications();
    // Other suites sharing the test database may have their own demo-marked organisations; compare before and after.
    const markedIds = async () =>
      (await db.select({ id: s.organizations.id }).from(s.organizations).where(sql`${s.organizations.metadata} @> '{"demoAccount": true}'::jsonb`)).map((o) => o.id).sort();
    const markedBefore = await markedIds();
    const second = await demo.runDemoSeed({ local: true, keptPasswords: passwordsOf(first) });
    expect(second.userIds).toEqual(first.userIds);
    expect(second.organizationIds).toEqual(first.organizationIds);
    expect(second.candidateId).toBe(first.candidateId);
    expect(passwordsOf(second)).toEqual(passwordsOf(first));
    expect(await stillSignedIn()).toBe(true);
    expect(await verifications()).toBe(before);
    const markedAfter = await markedIds();
    expect(markedAfter).toEqual(markedBefore);
    expect(markedAfter).toEqual(expect.arrayContaining(demoOrgIds()));
    latest = second;
  });

  it("refuses to take over an account on a demo address that the script did not create", async () => {
    const staff = await userRow(first.userIds.staff);
    const admin = await userRow(first.userIds.admin);
    // For example a pending account a recruitment partner submitted with its own phone number.
    await db.update(s.users).set({ preferences: sql`${s.users.preferences} - 'demoAccount'`, signupSource: "partner_submission" }).where(eq(s.users.id, staff.id));
    expect(await demo.findForeignDemoAddressAccounts()).toEqual(["staff@demo.venkatsai.test"]);
    await expect(demo.runDemoSeed({ local: true })).rejects.toThrow(/staff@demo\.venkatsai\.test is already used by an account the demo script did not create/);
    // Nothing changed, not even the accounts listed before it (a run without kept passwords would have reset them).
    expect((await userRow(admin.id)).passwordHash).toBe(admin.passwordHash);
    expect(await userRow(staff.id)).toMatchObject({ signupSource: "partner_submission", passwordHash: staff.passwordHash });

    // The sign-up source alone is enough to recognise an account the script made.
    await db.update(s.users).set({ signupSource: "demo" }).where(eq(s.users.id, staff.id));
    expect(await demo.findForeignDemoAddressAccounts()).toEqual([]);
    await db.update(s.users).set({ preferences: staff.preferences, signupSource: staff.signupSource }).where(eq(s.users.id, staff.id));
  });

  it("gives every account a new password without the kept ones, and signs them out", async () => {
    const stillSignedIn = await addSession(first.userIds.company, `demo-rotate-${tag}`);
    const rotated = await demo.runDemoSeed({ local: true });
    const before = passwordsOf(latest);
    const after = passwordsOf(rotated);
    for (const email of Object.keys(before)) expect(after[email]).not.toBe(before[email]);
    expect(await stillSignedIn()).toBe(false);
    const company = await userRow(first.userIds.company);
    expect(await verifyPassword(company.passwordHash!, before["company@demo.venkatsai.test"]!)).toBe(false);
    expect(await verifyPassword(company.passwordHash!, after["company@demo.venkatsai.test"]!)).toBe(true);
    latest = rotated;
  });

  it("never keeps a weak password from a hand-edited credentials file", async () => {
    const kept: Record<string, string> = { ...passwordsOf(latest), [ADMIN]: "Demo@123" };
    const result = await demo.runDemoSeed({ local: true, keptPasswords: kept });
    const after = passwordsOf(result);
    expect(after[ADMIN]).not.toBe("Demo@123");
    expect(await verifyPassword((await userRow(first.userIds.admin)).passwordHash!, "Demo@123")).toBe(false);
    expect(await verifyPassword((await userRow(first.userIds.admin)).passwordHash!, after[ADMIN]!)).toBe(true);
    expect(after["company@demo.venkatsai.test"]).toBe(kept["company@demo.venkatsai.test"]);
    latest = result;
  });

  it("tells staff about two-step sign-in: on by default for the live site, otherwise the stored setting", async () => {
    const kept = passwordsOf(latest);
    const adminNotes = (result: SeedResult) => result.logins.find((l) => l.email === ADMIN)!.notes.join(" ");
    const personNotes = (result: SeedResult) => result.logins.find((l) => l.email === "person@demo.venkatsai.test")!.notes.join(" ");
    await db.delete(s.platformSettings).where(eq(s.platformSettings.key, "security.require_staff_2fa"));
    expect(adminNotes(await demo.runDemoSeed({ local: true, keptPasswords: kept }))).toMatch(/optional/);
    const live = await demo.runDemoSeed({ local: false, keptPasswords: kept });
    expect(adminNotes(live)).toMatch(/First sign-in asks you to set up an authenticator app/);
    expect(personNotes(live)).not.toMatch(/authenticator/);
    await setSetting("security.require_staff_2fa", false, null);
    expect(adminNotes(await demo.runDemoSeed({ local: false, keptPasswords: kept }))).toMatch(/optional/);
    await setSetting("security.require_staff_2fa", true, null);
    await db.insert(s.userTwoFactor).values({ userId: first.userIds.admin, totpSecretEncrypted: "test-only", enabledAt: new Date() });
    expect(adminNotes(await demo.runDemoSeed({ local: true, keptPasswords: kept }))).toMatch(/6-digit code/);
    await db.delete(s.userTwoFactor).where(eq(s.userTwoFactor.userId, first.userIds.admin));
    await db.delete(s.platformSettings).where(eq(s.platformSettings.key, "security.require_staff_2fa"));
  });

  it("signs in with the saved passwords through the real sign-in service, straight into each portal", async () => {
    const { signInWithPassword } = await import("@/modules/identity/sign-in");
    await db.execute(sql`delete from rate_limit_buckets where key like 'login:%'`);
    for (const spec of DEMO_ACCOUNTS) {
      const login = latest.logins.find((l) => l.email === demoEmail(spec.local))!;
      browser.store.clear();
      const { redirectTo } = await signInWithPassword({ identifier: { kind: "email", value: login.email }, password: login.password });
      expect(redirectTo, login.email).toBe(spec.home);
    }
    browser.store.clear();
  });

  it("keeps demo organisations and the demo person off every public listing", async () => {
    // Worst case: someone switched the public pages on while testing.
    await db.update(s.organizations).set({ isPublic: true }).where(inArray(s.organizations.id, demoOrgIds()));
    const company = await orgRow(first.organizationIds.company!);
    const agency = await orgRow(first.organizationIds.agency!);
    const demoInstitute = await orgRow(first.organizationIds.institution!);
    const realOwner = await fx.createUser();
    const real = await createOrganization("employer", { name: `Real Fabricators ${tag}`, countryCode: "IN", city: "Visakhapatnam" }, realOwner);
    const realInstitute = await createOrganization("institution", { name: `Real Institute ${tag}`, countryCode: "IN", city: "Visakhapatnam" }, await fx.createUser());
    await db
      .update(s.organizations)
      .set({ status: "verified", verifiedAt: new Date(), isPublic: true })
      .where(inArray(s.organizations.id, [real.id, realInstitute.id]));

    // Company and institution pages.
    expect(await employer.getPublicCompany(company.slug)).toBeNull();
    expect(await employer.getPublicCompany(agency.slug)).toBeNull();
    expect((await employer.getPublicCompany(real.slug))?.id).toBe(real.id);
    const directory = (await employer.listPublicCompanies({}, page)).items.map((c) => c.id);
    expect(directory).toContain(real.id);
    expect(directory).not.toContain(company.id);
    expect(directory).not.toContain(agency.id);
    expect(await institution.getPublicInstitution(demoInstitute.slug)).toBeNull();
    expect((await institution.getPublicInstitution(realInstitute.slug))?.id).toBe(realInstitute.id);

    // Jobs: search, job pages, sitemap, alerts and the homepage share one rule.
    const job = async (organizationId: string, key: string, countryCode = "IN") =>
      (
        await db
          .insert(s.jobs)
          .values({ code: `VSG-JOB-${key}-${tag}`, slug: `${key}-pipe-welder-${tag}`, title: `Pipe welder ${key} ${tag}`, organizationId, status: "published", publishedAt: new Date(Date.now() - 60_000), countryCode })
          .returning()
      )[0]!;
    const demoJob = await job(company.id, "demo");
    const agencyJob = await job(agency.id, "agency", "AE");
    const realJob = await job(real.id, "real");
    expect(await getPublicJobBySlug(demoJob.slug)).toBeNull();
    expect(await getPublicJobBySlug(agencyJob.slug)).toBeNull();
    expect((await getPublicJobBySlug(realJob.slug))?.id).toBe(realJob.id);
    const listed = (await searchJobs(parseJobSearchParams({ sort: "newest", pageSize: "50" }), { kind: "public" })).items.map((j) => j.slug);
    expect(listed).toContain(realJob.slug);
    expect(listed).not.toContain(demoJob.slug);
    expect(listed).not.toContain(agencyJob.slug);

    // Training courses and campus drives.
    const course = async (organizationId: string | null, key: string) =>
      (
        await db
          .insert(s.courses)
          .values({ code: `VSG-CRS-${key}-${tag}`, slug: `${key}-welding-basics-${tag}`, title: `Welding basics ${key} ${tag}`, category: "welding", organizationId, status: "published", publishedAt: new Date() })
          .returning()
      )[0]!;
    const demoCourse = await course(demoInstitute.id, "demo");
    const ownCourse = await course(null, "own");
    const courseSlugs = (await training.listPublicCourses({}, page)).items.map((c) => c.slug);
    expect(courseSlugs).toContain(ownCourse.slug);
    expect(courseSlugs).not.toContain(demoCourse.slug);
    expect(await training.getPublicCourse(demoCourse.slug)).toBeNull();
    const drive = async (organizationId: string, key: string) =>
      (await db.insert(s.campusDrives).values({ code: `VSG-CD-${key}-${tag}`, title: `Hiring day ${key} ${tag}`, organizationId, status: "open", isPublic: true }).returning())[0]!;
    const demoDrive = await drive(demoInstitute.id, "demo");
    const realDrive = await drive(realInstitute.id, "real");
    const drives = (await campus.listPublicCampusDrives(page)).items.map((d) => d.id);
    expect(drives).toContain(realDrive.id);
    expect(drives).not.toContain(demoDrive.id);
    const internship = async (organizationId: string, key: string) =>
      (await db.insert(s.internshipProgrammes).values({ organizationId, title: `Welding internship ${key} ${tag}`, status: "open" }).returning())[0]!;
    const demoInternship = await internship(demoInstitute.id, "demo");
    const realInternship = await internship(realInstitute.id, "real");
    const internships = (await listPublicInternships(page)).items.map((i) => i.id);
    expect(internships).toContain(realInternship.id);
    expect(internships).not.toContain(demoInternship.id);

    // People Portal career page: courses that teach a skill, and the skills live jobs ask for.
    const skill = async (key: string) =>
      (await db.insert(s.skills).values({ slug: `${key}-tig-welding-${tag}`, name: `TIG welding ${key} ${tag}`, category: "trade" }).returning())[0]!;
    const sharedSkill = await skill("shared");
    const demoOnlySkill = await skill("demo-only");
    await db.update(s.courses).set({ skillIds: [sharedSkill.id] }).where(inArray(s.courses.id, [demoCourse.id, ownCourse.id]));
    const teaching = (await career.getCoursesTeaching([sharedSkill.id])).map((c) => c.id);
    expect(teaching).toContain(ownCourse.id);
    expect(teaching).not.toContain(demoCourse.id);
    await db.insert(s.jobSkills).values([
      { jobId: realJob.id, skillId: sharedSkill.id },
      { jobId: demoJob.id, skillId: sharedSkill.id },
      { jobId: demoJob.id, skillId: demoOnlySkill.id },
    ]);
    const demand = (await career.getSkillDemand([])).demand;
    expect(demand.find((d) => d.skillId === sharedSkill.id)?.jobCount).toBe(1);
    expect(demand.map((d) => d.skillId)).not.toContain(demoOnlySkill.id);

    // Partner announcements.
    const announce = async (organizationId: string, key: string) =>
      (
        await db
          .insert(s.announcements)
          .values({ title: `Walk-in interviews ${key} ${tag}`, audience: ["all"], placements: ["homepage_banner"], status: "published", publishedAt: new Date(), organizationId })
          .returning()
      )[0]!;
    const demoNotice = await announce(company.id, "demo");
    const realNotice = await announce(real.id, "real");
    const shown = (await getActiveAnnouncements({ audience: "all", placement: "homepage_banner", limit: 20 })).map((a) => a.id);
    expect(shown).toContain(realNotice.id);
    expect(shown).not.toContain(demoNotice.id);

    // Public counters: removing the marker adds exactly the demo rows.
    const counts = async () => ({
      employers: await computeLiveMetric("employer_partners"),
      partners: await computeLiveMetric("recruitment_partners"),
      institutions: await computeLiveMetric("training_partners"),
      candidates: await computeLiveMetric("registered_candidates"),
      activeEmployers: await computeLiveMetric("active_employers"),
      jobs: await computeLiveMetric("jobs_facilitated"),
      courses: await computeLiveMetric("training_programmes"),
      verifiedCandidates: await computeLiveMetric("verified_candidates"),
      // No placement or internship here: unchanged, but they must run.
      placements: await computeLiveMetric("successful_placements"),
      internships: await computeLiveMetric("internship_opportunities"),
      countries: await computeLiveMetric("active_countries"),
      careerJobs: (await career.getSkillDemand([])).totalJobs,
    });
    const [demoJobs] = await db
      .select({ value: count() })
      .from(s.jobs)
      .where(and(inArray(s.jobs.organizationId, demoOrgIds()), isNotNull(s.jobs.publishedAt), isNull(s.jobs.deletedAt)));
    const [demoCourses] = await db
      .select({ value: count() })
      .from(s.courses)
      .where(and(inArray(s.courses.organizationId, demoOrgIds()), eq(s.courses.status, "published"), isNull(s.courses.deletedAt)));
    const [personLevel] = await db.select({ level: s.candidateProfiles.verificationLevel }).from(s.candidateProfiles).where(eq(s.candidateProfiles.id, first.candidateId));
    const hidden = await counts();
    const setMarker = async (on: boolean) => {
      const change = on ? sql`|| '{"demoAccount": true}'::jsonb` : sql`- 'demoAccount'`;
      await db.update(s.organizations).set({ metadata: sql`${s.organizations.metadata} ${change}` }).where(inArray(s.organizations.id, demoOrgIds()));
      await db.update(s.users).set({ preferences: sql`${s.users.preferences} ${change}` }).where(eq(s.users.id, first.userIds.person));
    };
    await setMarker(false);
    const counted = await counts();
    await setMarker(true);
    // The demo agency's job is in AE: it adds a country only when no real live job is in AE (a shared test database
    // may hold real AE jobs from other test files).
    expect(counted.countries - hidden.countries).toBeGreaterThanOrEqual(0);
    expect(counted.countries - hidden.countries).toBeLessThanOrEqual(1);
    expect({ ...counted, countries: 0 }).toEqual({
      employers: hidden.employers + 2,
      partners: hidden.partners + 1,
      institutions: hidden.institutions + 1,
      candidates: hidden.candidates + 1,
      activeEmployers: hidden.activeEmployers + 2,
      jobs: hidden.jobs + demoJobs!.value,
      courses: hidden.courses + demoCourses!.value,
      verifiedCandidates: hidden.verifiedCandidates + (personLevel!.level === "none" ? 0 : 1),
      placements: hidden.placements,
      internships: hidden.internships,
      countries: 0,
      careerJobs: hidden.careerJobs + demoJobs!.value,
    });
    expect(hidden.countries).toBeGreaterThan(0);

    // Employers' candidate search: a real employer never finds the demo person, the demo company does.
    await db.update(s.candidateProfiles).set({ visibility: "public_to_employers", isOpenToWork: true }).where(eq(s.candidateProfiles.id, first.candidateId));
    const welder = await fx.createUser({ displayName: `Real Welder ${tag}` });
    const profile = await candidates.ensureCandidateProfile(welder.id);
    await candidates.updatePersonalDetails(
      candidates.selfActor({ user: welder, candidate: profile }),
      personalSchema.parse({ dateOfBirth: "1990-01-01", currentCountryCode: "IN", city: "Visakhapatnam" }),
    );
    await candidates.updateVisibility(candidates.selfActor({ user: welder, candidate: (await candidates.getCandidateById(profile.id))! }), {
      visibility: "public_to_employers",
      isOpenToWork: true,
    });
    const found = async (ctx: OrgContext<"employer">) =>
      (await searchCandidates(candidateSearchFiltersSchema.parse({ pageSize: 50 }), { kind: "employer", ctx })).items.map((c) => c.candidateId);
    const byReal = await found(await fx.memberContext<"employer">(realOwner, real.id));
    expect(byReal).toContain(profile.id);
    expect(byReal).not.toContain(first.candidateId);
    expect(await found(await fx.memberContext<"employer">(await fx.reloadUser(first.userIds.company), company.id))).toContain(first.candidateId);
    await db.update(s.candidateProfiles).set({ visibility: "venkat_sai_only" }).where(eq(s.candidateProfiles.id, first.candidateId));
  });

  it("removes every demo account and organisation, keeps the last Super Admin, and comes back on the next run", async () => {
    const [superRole] = await db
      .select({ id: s.roles.id })
      .from(s.roles)
      .where(and(eq(s.roles.scope, "platform"), eq(s.roles.key, "super_admin"), isNull(s.roles.organizationId)));
    // In this database only the demo admin holds Super Admin.
    await db.delete(s.userRoles).where(and(eq(s.userRoles.roleId, superRole!.id), sql`${s.userRoles.userId} <> ${first.userIds.admin}`));
    const signedIn = await addSession(first.userIds.staff, `demo-remove-${tag}`);

    const blocked = await demo.removeDemoAccounts();
    expect(blocked.keptSuperAdmins).toEqual([ADMIN]);
    expect((await userRow(first.userIds.admin)).status).toBe("active");
    expect(await signedIn()).toBe(false);

    const realAdmin = await fx.createUser();
    await db.insert(s.userRoles).values({ userId: realAdmin.id, roleId: superRole!.id });
    const removed = await demo.removeDemoAccounts();
    expect(removed.keptSuperAdmins).toEqual([]);
    expect(await demo.removeDemoAccounts()).toMatchObject({ usersDeleted: 0, organizationsDeleted: 0 });

    const leftUsers = await db.select().from(s.users).where(like(s.users.email, "%@demo.venkatsai.test"));
    for (const user of leftUsers) expect(user).toMatchObject({ status: "closed", passwordHash: null, isStaff: false });
    if (leftUsers.length) {
      const ids = leftUsers.map((u) => u.id);
      expect(await db.select().from(s.sessions).where(inArray(s.sessions.userId, ids))).toHaveLength(0);
      expect(await db.select().from(s.userRoles).where(inArray(s.userRoles.userId, ids))).toHaveLength(0);
    }
    const leftOrgs = await db.select().from(s.organizations).where(inArray(s.organizations.id, demoOrgIds()));
    for (const org of leftOrgs) {
      // Kept only because jobs / courses point at them: suspended, hidden, soft-deleted.
      expect(org).toMatchObject({ status: "suspended", isPublic: false });
      expect(org.deletedAt).not.toBeNull();
    }
    expect(leftOrgs.map((o) => o.id)).toContain(first.organizationIds.company);
    expect(leftOrgs.map((o) => o.id)).not.toContain(first.organizationIds.partner);
    const activeMembers = await db
      .select()
      .from(s.organizationMembers)
      .where(and(inArray(s.organizationMembers.organizationId, demoOrgIds()), eq(s.organizationMembers.status, "active")));
    expect(activeMembers).toHaveLength(0);

    const back = await demo.runDemoSeed({ local: true });
    for (const spec of DEMO_ACCOUNTS) expect((await userRow(back.userIds[spec.key])).status).toBe("active");
    expect(back.organizationIds.company).toBe(first.organizationIds.company);
    expect(back.organizationIds.institution).toBe(first.organizationIds.institution);
    for (const id of Object.values(back.organizationIds) as string[]) {
      expect(await orgRow(id)).toMatchObject({ status: "verified", deletedAt: null });
    }
    const [owner] = await db
      .select({ status: s.organizationMembers.status })
      .from(s.organizationMembers)
      .where(and(eq(s.organizationMembers.organizationId, back.organizationIds.company!), eq(s.organizationMembers.userId, back.userIds.company)));
    expect(owner?.status).toBe("active");
  });
});
