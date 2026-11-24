/**
 * Integration tests for CV ↔ requirement matching against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_match
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_test_match npx vitest run src/modules/operations/cv-matching
 *   node scripts/test-db.mjs vsg_test_match --drop
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("CV matching (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  const { eq, sql } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const m = await import("./cv-matching");
  type StaffContext = import("@/modules/identity/authz").StaffContext;

  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  let posterId = "";
  let requirementId = "";
  let staff: StaffContext;

  async function makeStaff(permissions: string[]): Promise<StaffContext> {
    const [u] = await db.insert(s.users).values({ displayName: "Match test", email: `m-${randomUUID()}@vsg-test.invalid`, emailVerifiedAt: new Date(), isStaff: true }).returning();
    return {
      user: { id: u!.id, email: u!.email, phone: null, emailVerifiedAt: u!.emailVerifiedAt, phoneVerifiedAt: null, displayName: u!.displayName, avatarFileId: null, status: u!.status, isStaff: true, locale: "en", timezone: null, hasPassword: false, twoFactorEnabled: false },
      roleKeys: ["test"],
      permissions: new Set(permissions),
      isSuperAdmin: false,
    } as StaffContext;
  }

  beforeAll(async () => {
    await db.insert(s.countries).values([{ code: "SA", name: "Saudi Arabia" }, { code: "AE", name: "United Arab Emirates" }]).onConflictDoNothing();
    const [cat] = await db.insert(s.jobCategories).values({ slug: `welder-${tag}`, name: "Welder" }).returning({ id: s.jobCategories.id });
    await db.insert(s.skills).values({ slug: `pipe-fitter-${tag}`, name: "Pipe fitter", category: "technical", synonyms: ["Pipefitter"] }).onConflictDoNothing();
    staff = await makeStaff(["candidates.view", "candidates.view_contact", "candidates.manage", "content.view", "requirements.view"]);

    const [file] = await db
      .insert(s.files)
      .values({ storageDriver: "local", storageKey: `test/${tag}.pdf`, originalName: "cv.pdf", mimeType: "application/pdf", sizeBytes: 10, sha256: "0".repeat(64), purpose: "cv_submission", scanStatus: "clean" })
      .returning({ id: s.files.id });
    const day = 86_400_000;
    const cv = async (key: string, trade: string, opts: { cat?: boolean; country?: string; status?: string; ageDays: number }) => {
      const [row] = await db
        .insert(s.cvSubmissions)
        .values({
          code: `VSG-CV-T${tag}-${key}`,
          name: `${key} Kumar`,
          phone: `+91980000${String(Object.keys(ids).length).padStart(4, "0")}`,
          tradeLabel: trade,
          jobCategoryId: opts.cat ? cat!.id : null,
          preferredCountryCode: opts.country ?? null,
          status: (opts.status ?? "received") as never,
          consentToContact: true,
          cvFileId: file!.id,
          createdAt: new Date(Date.now() - opts.ageDays * day),
        })
        .returning({ id: s.cvSubmissions.id });
      ids[key] = row!.id;
    };
    await cv("A", "Welder", { cat: true, country: "SA", ageDays: 10 }); // category + exact + country = 9
    await cv("G", "Welder", { country: "SA", ageDays: 5 }); // exact + country = 5
    await cv("B", "WELDER", { country: "AE", ageDays: 1 }); // exact = 4
    await cv("C", "TIG welder", { ageDays: 3 }); // partial = 2
    await cv("F", "Pipefitter", { ageDays: 2 }); // synonym = 2 (newer than C)
    await cv("D", "Welder", { status: "not_suitable", ageDays: 1 }); // excluded
    await cv("E", "Electrician", { ageDays: 1 }); // no match

    const profile = async (key: string, title: string, dob: string) => {
      const [u] = await db.insert(s.users).values({ displayName: `${key} Profile`, email: `p-${randomUUID()}@vsg-test.invalid`, phone: `+9197${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}` }).returning();
      const [p] = await db.insert(s.candidateProfiles).values({ userId: u!.id, currentJobTitle: title, dateOfBirth: dob, preferredCategoryIds: [cat!.id], isOpenToWork: true }).returning({ id: s.candidateProfiles.id });
      await db.insert(s.candidatePreferredLocations).values({ candidateId: p!.id, countryCode: "SA" });
      ids[key] = p!.id;
    };
    await profile("P", "Welder", "1990-01-01");
    await profile("M", "Welder", `${new Date().getFullYear() - 15}-01-01`); // minor: never matched

    const [poster] = await db
      .insert(s.cmsEntries)
      .values({ collection: "requirement_posts", slug: `welders-${tag}`, title: "Welders for Riyadh", status: "published", publishedAt: new Date(), publishedVersion: 1, data: { countryCode: "SA", trades: [{ trade: "Welder" }, { trade: "Pipe fitter" }] } })
      .returning({ id: s.cmsEntries.id });
    posterId = poster!.id;

    const [req] = await db
      .insert(s.requirementRequests)
      .values({ code: `VSG-REQ-T${tag}`, source: "staff_entry", title: "Shutdown crew", contactName: "Ops", totalPositions: 5, status: "draft", countryCode: "SA" })
      .returning({ id: s.requirementRequests.id });
    requirementId = req!.id;
    await db.insert(s.requirementLines).values({ requirementId, roleTitle: "Structural welder", positions: 5, jobCategoryId: cat!.id });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("ranks poster matches by score, then newest, with a reason", async () => {
    const criteria = (await m.getPosterCriteria(staff, posterId))!;
    expect(criteria.trades).toEqual(["Welder", "Pipe fitter"]);
    expect(criteria.publicUrl).toMatch(/\/requirements\/welders-/);
    const result = await m.findMatches(staff, criteria);
    // Only this suite's submissions: other suites share the database in a sequential run.
    const own = new Set(Object.values(ids));
    const cvOrder = result.items.filter((i) => i.kind === "cv" && own.has(i.id)).map((i) => i.name[0]);
    const expected = ["A", "G", "B", "F", "C"];
    if (result.items.length < m.MATCH_LIMIT) {
      expect(cvOrder).toEqual(expected);
    } else {
      // A shared database can hold more than MATCH_LIMIT higher-ranked CVs from other suites, which pushes the
      // low-scoring ones (F, C) off the list; the order of what is shown must still hold.
      expect(cvOrder.slice(0, 3)).toEqual(["A", "G", "B"]);
      expect(cvOrder).toEqual(expected.filter((k) => cvOrder.includes(k)));
    }
    const a = result.items.find((i) => i.id === ids.A)!;
    expect(a.score).toBe(9);
    expect(a.reason).toContain('Trade matches "welder"');
    expect(a.reason).toContain("same job category");
    expect(a.reason).toContain("prefers Saudi Arabia");
    expect(a.phoneMasked).not.toContain("98000000");
    if (cvOrder.includes("F")) expect(result.items.find((i) => i.id === ids.F)!.reason).toContain("Related term");
    // Profiles: the adult matches, the minor never does.
    expect(result.items.some((i) => i.id === ids.P && i.kind === "profile" && i.prefersTargetCountry)).toBe(true);
    expect(result.items.some((i) => i.id === ids.M)).toBe(false);
    expect(result.items.some((i) => i.id === ids.D || i.id === ids.E)).toBe(false);

    const counts = await m.countMatches(staff, [criteria]);
    expect(counts.get(posterId)).toEqual({ cvs: result.cvCount, profiles: result.profileCount });
  });

  it("matches an operations requirement through its job category and role", async () => {
    const criteria = (await m.getRequirementCriteria(staff, requirementId))!;
    const result = await m.findMatches(staff, criteria);
    const firstCv = result.items.find((i) => i.kind === "cv")!;
    expect(firstCv.id).toBe(ids.A);
    expect(firstCv.reason).toContain("same job category");
    expect(criteria.publicUrl).toBeNull();
    expect(m.matchOutreachText(criteria, "Ravi Kumar")).toContain("Hello Ravi, this is Venkat Sai Global");
  });

  it("reveals numbers with logging and marks only received CVs as contacted", async () => {
    const target = { kind: "poster" as const, id: posterId };
    const phones = await m.revealMatchPhones(staff, [{ kind: "cv", id: ids.A! }, { kind: "profile", id: ids.P! }], { target, accessType: "export", reason: "test" });
    expect(phones).toHaveLength(2);
    const [logged] = await db.select({ n: sql<number>`count(*)::int` }).from(s.dataAccessLogs).where(eq(s.dataAccessLogs.actorUserId, staff.user.id));
    expect(logged!.n).toBe(2);
    await expect(m.revealMatchPhones({ ...staff, permissions: new Set(["candidates.view"]) } as StaffContext, [{ kind: "cv", id: ids.A! }], { target, accessType: "reveal", reason: "x" })).rejects.toThrow();

    expect(await m.markMatchedCvsContacted(staff, [ids.A!, ids.D!])).toBe(1);
    expect(await m.markMatchedCvsContacted(staff, [ids.A!])).toBe(0);
    const [a] = await db.select({ status: s.cvSubmissions.status }).from(s.cvSubmissions).where(eq(s.cvSubmissions.id, ids.A!));
    expect(a!.status).toBe("contacted");
  });
});
