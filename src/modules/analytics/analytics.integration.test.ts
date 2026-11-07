/**
 * Integration tests for the analytics module against an isolated database:
 *   node scripts/test-db.mjs vsg_test_analytics
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_analytics'; npx vitest run src/modules/analytics
 * Only the request scope (next/headers) and the session lookup are mocked; the database, settings,
 * audit, data-access logging and the consent ledger are real.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

const requestState = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  headers: new Headers({ host: "localhost:3000" }),
  user: null as null | { id: string; isStaff: boolean },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (requestState.cookies.has(name) ? { name, value: requestState.cookies.get(name)! } : undefined),
    getAll: () => [...requestState.cookies.entries()].map(([name, value]) => ({ name, value })),
    has: (name: string) => requestState.cookies.has(name),
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => requestState.headers,
}));

vi.mock("@/modules/identity/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/identity/session")>();
  const sessionUser = () =>
    requestState.user
      ? {
          id: requestState.user.id,
          email: null,
          phone: null,
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: null,
          displayName: "Test user",
          avatarFileId: null,
          status: "active" as const,
          isStaff: requestState.user.isStaff,
          locale: "en",
          timezone: null,
          hasPassword: true,
          twoFactorEnabled: true,
        }
      : null;
  return {
    ...actual,
    getCurrentUser: async () => sessionUser(),
    getCurrentSession: async () => {
      const user = sessionUser();
      return user
        ? { user, needsTwoFactor: false, session: { id: "test", expiresAt: new Date(Date.now() + 3_600_000), twoFactorVerifiedAt: new Date(), activeOrgs: {}, createdAt: new Date() } }
        : null;
    },
  };
});

describe.skipIf(!enabled)("analytics module (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }

  const { and, eq, gte, inArray, lt, sql } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { ActionError } = await import("@/lib/actions");
  const consent = await import("./consent");
  const { ingestCollectBatch, prepareBatch } = await import("./collect");
  const { collectPayloadSchema } = await import("./schemas");
  const { recordServerEvent, trackServer } = await import("./server");
  const { recordConsentReceipt } = await import("./consent-service");
  const { computeFunnelSteps, computeFunnel, listFunnels } = await import("./funnels");
  const { stepsReached } = await import("./funnel-rules");
  const queries = await import("./queries");
  const behaviour = await import("./behaviour");
  const sessions = await import("./sessions");
  const service = await import("./service");
  const { aggregateDailyMetrics } = await import("./aggregate");
  const { runAnalyticsRetention } = await import("./retention");
  const { seed } = await import("./seed");
  const { getConsentVersion } = await import("./config");
  const collectRoute = await import("@/app/api/v1/collect/route");
  const consentRoute = await import("@/app/api/v1/consent/route");
  type StaffContext = import("@/modules/identity/authz").StaffContext;

  const RUN = Date.now().toString(36);
  const VERSION = await getConsentVersion();
  const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
  const BOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
  const id = (label: string) => `${label}_${RUN}_${Math.random().toString(36).slice(2, 10)}`.replace(/[^A-Za-z0-9_-]/g, "").padEnd(16, "x").slice(0, 64);

  const consentCookie = (categories: { functional?: boolean; analytics?: boolean; session_insights?: boolean }, extra: Partial<import("./consent").StoredConsent> = {}) =>
    consent.serializeConsentCookie({
      version: VERSION,
      categories: { functional: false, analytics: false, session_insights: false, ...categories },
      anonymousId: id("anon"),
      timestamp: new Date().toISOString(),
      ...extra,
    });

  const createdUserIds: string[] = [];
  async function createUser(opts: { staff?: boolean } = {}): Promise<string> {
    const [row] = await db
      .insert(s.users)
      .values({ email: `analytics-${RUN}-${Math.random().toString(36).slice(2, 8)}@vsg-test.invalid`, displayName: "Analytics Test", isStaff: opts.staff ?? false })
      .returning({ id: s.users.id });
    createdUserIds.push(row!.id);
    return row!.id;
  }
  async function staff(...permissions: string[]): Promise<StaffContext> {
    const userId = await createUser({ staff: true });
    return {
      user: {
        id: userId,
        email: null,
        phone: null,
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: null,
        displayName: "Staff",
        avatarFileId: null,
        status: "active",
        isStaff: true,
        locale: "en",
        timezone: null,
        hasPassword: true,
        twoFactorEnabled: true,
      },
      roleKeys: ["test"],
      permissions: new Set(permissions),
      isSuperAdmin: false,
    };
  }

  function collectRequest(body: unknown, opts: { cookie?: string; ua?: string; origin?: string | null; headers?: Record<string, string> } = {}): Request {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-forwarded-host": "localhost:3000",
      "user-agent": opts.ua ?? CHROME,
      "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
      "x-vercel-ip-country": "AE",
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.headers ?? {}),
    };
    if (opts.origin !== null) headers.origin = opts.origin ?? "http://localhost:3000";
    return new Request("http://localhost:3000/api/v1/collect", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
  }

  async function sessionRow(sid: string) {
    const [row] = await db.select().from(s.analyticsSessions).where(eq(s.analyticsSessions.id, sid));
    return row;
  }

  // Fixture windows (Feb–Apr 2025) start empty, so the suite can run repeatedly on the same database.
  {
    const from = new Date(Date.UTC(2025, 1, 1));
    const to = new Date(Date.UTC(2025, 4, 1));
    await db.delete(s.analyticsEvents).where(and(gte(s.analyticsEvents.occurredAt, from), lt(s.analyticsEvents.occurredAt, to)));
    await db.delete(s.analyticsHeatmapPoints).where(and(gte(s.analyticsHeatmapPoints.occurredAt, from), lt(s.analyticsHeatmapPoints.occurredAt, to)));
    await db.delete(s.analyticsScrollDepth).where(and(gte(s.analyticsScrollDepth.occurredAt, from), lt(s.analyticsScrollDepth.occurredAt, to)));
    await db.delete(s.analyticsSessions).where(and(gte(s.analyticsSessions.startedAt, from), lt(s.analyticsSessions.startedAt, to)));
  }

  afterAll(async () => {
    await db.delete(s.analyticsSessions).where(sql`${s.analyticsSessions.id} like ${`%_${RUN}_%`}`);
    if (createdUserIds.length) {
      await db.delete(s.consentRecords).where(inArray(s.consentRecords.userId, createdUserIds));
      await db.delete(s.candidateProfiles).where(inArray(s.candidateProfiles.userId, createdUserIds));
    }
    await pool.end();
  });

  // -------------------------------------------------------------------------

  it("seeds the default funnels idempotently", async () => {
    await seed();
    await seed();
    const rows = await db.select().from(s.analyticsFunnels).where(inArray(s.analyticsFunnels.key, ["employer_journey", "candidate_journey"]));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.key === "employer_journey")?.steps).toHaveLength(6);
  });

  describe("POST /api/v1/collect", () => {
    const sid = id("sess");
    const vid = id("visitor");
    const now = Date.now();
    const firstBatch = {
      v: 1,
      sid,
      vid,
      sentAt: now,
      start: { landingPath: "/jobs?utm_source=x", referrer: "www.google.com", utm: { source: "Google", medium: "CPC", campaign: "Diwali-2026" }, locale: "te", newVisitor: true },
      events: [
        { name: "page_view", path: "/jobs?page=2&q=ravi", props: { page: "2", email: "x@y.z" }, ts: now - 3000 },
        { name: "unknown_event", path: "/jobs", ts: now - 2500 },
        { name: "page_view", path: "/admin/analytics", ts: now - 2000 },
      ],
      heatmap: [
        { path: "/jobs", vw: "desktop", x: 500, y: 420, h: 3000, sel: "main > a[cta:apply]", kind: "click", ts: now - 1000 },
        { path: "/jobs", vw: "desktop", x: 10, y: 10, h: 3000, sel: 'input[value="secret"]', kind: "click", ts: now - 900 },
      ],
      scroll: [
        { path: "/jobs", depth: 25, ts: now - 800 },
        { path: "/jobs", depth: 50, ts: now - 700 },
      ],
    };

    it("rejects cross-site requests and invalid bodies", async () => {
      const cookie = `vsg_consent=${consentCookie({ analytics: true })}`;
      expect((await collectRoute.POST(collectRequest(firstBatch, { cookie, origin: "https://evil.test" }))).status).toBe(403);
      expect((await collectRoute.POST(collectRequest(firstBatch, { cookie, origin: null }))).status).toBe(403);
      expect((await collectRoute.POST(collectRequest("{not json", { cookie }))).status).toBe(400);
      expect((await collectRoute.POST(collectRequest({ v: 1, sid: "bad", sentAt: 1, events: [] }, { cookie }))).status).toBe(400);
      expect((await collectRoute.POST(collectRequest("x".repeat(70 * 1024), { cookie }))).status).toBe(413);
      expect(await sessionRow(sid)).toBeUndefined();
    });

    it("accepts a beacon without Origin when Fetch Metadata says same-origin", async () => {
      const otherSid = id("meta");
      const res = await collectRoute.POST(
        collectRequest({ ...firstBatch, sid: otherSid }, { cookie: `vsg_consent=${consentCookie({ analytics: true })}`, origin: null, headers: { "sec-fetch-site": "same-origin" } }),
      );
      expect(res.status).toBe(204);
      expect(await sessionRow(otherSid)).toBeDefined();
    });

    it("drops batches without analytics consent, with GPC, or from bots (204, nothing stored)", async () => {
      expect((await collectRoute.POST(collectRequest(firstBatch))).status).toBe(204);
      expect((await collectRoute.POST(collectRequest(firstBatch, { cookie: `vsg_consent=${consentCookie({ functional: true })}` }))).status).toBe(204);
      expect(
        (await collectRoute.POST(collectRequest(firstBatch, { cookie: `vsg_consent=${consentCookie({ analytics: true })}`, headers: { "sec-gpc": "1" } }))).status,
      ).toBe(204);
      expect((await collectRoute.POST(collectRequest(firstBatch, { cookie: `vsg_consent=${consentCookie({ analytics: true }, { version: "0.old" })}` }))).status).toBe(204);
      expect((await collectRoute.POST(collectRequest(firstBatch, { cookie: `vsg_consent=${consentCookie({ analytics: true })}`, ua: BOT }))).status).toBe(204);
      expect(await sessionRow(sid)).toBeUndefined();
    });

    it("stores a consented batch with privacy rules applied", async () => {
      const res = await collectRoute.POST(collectRequest(firstBatch, { cookie: `vsg_consent=${consentCookie({ analytics: true, session_insights: true })}` }));
      expect(res.status).toBe(204);
      const row = await sessionRow(sid);
      expect(row).toMatchObject({
        visitorId: vid,
        consentLevel: "session_insights",
        userId: null,
        landingPath: "/jobs",
        exitPath: "/jobs",
        referrerDomain: "www.google.com",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "diwali-2026",
        deviceType: "desktop",
        browser: "Chrome",
        os: "Windows",
        locale: "te",
        isNewVisitor: true,
        pageViews: 1,
        events: 1,
        isBounce: true,
      });
      expect(row?.countryCode?.trim()).toBe("AE");
      const events = await db.select().from(s.analyticsEvents).where(eq(s.analyticsEvents.sessionId, sid));
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ name: "page_view", path: "/jobs", props: { page: "2" }, visitorId: vid, source: "client" });
      const heat = await db.select().from(s.analyticsHeatmapPoints).where(and(eq(s.analyticsHeatmapPoints.path, "/jobs"), eq(s.analyticsHeatmapPoints.yPx, 420)));
      expect(heat.some((h) => h.selector === "main > a[cta:apply]")).toBe(true);
      const unsafe = await db.select().from(s.analyticsHeatmapPoints).where(and(eq(s.analyticsHeatmapPoints.path, "/jobs"), eq(s.analyticsHeatmapPoints.xPct, 10), eq(s.analyticsHeatmapPoints.yPx, 10)));
      expect(unsafe.every((h) => h.selector === null)).toBe(true);
      const [scroll] = await db.select().from(s.analyticsScrollDepth).where(eq(s.analyticsScrollDepth.sessionId, sid));
      expect(scroll?.maxDepthPct).toBe(50);
    });

    it("updates counters, exit page, bounce and deepest scroll on later batches", async () => {
      const t = Date.now();
      const res = await collectRoute.POST(
        collectRequest(
          {
            v: 1,
            sid,
            vid: id("othervisitor"),
            sentAt: t,
            events: [
              { name: "page_view", path: "/jobs/senior-tig-welder", ts: t - 2000 },
              { name: "cta_click", path: "/jobs/senior-tig-welder", props: { cta: "apply_now" }, ts: t - 1000 },
            ],
            scroll: [
              { path: "/jobs", depth: 25, ts: t - 500 },
              { path: "/jobs/senior-tig-welder", depth: 90, ts: t - 400 },
            ],
          },
          { cookie: `vsg_consent=${consentCookie({ analytics: true })}` },
        ),
      );
      expect(res.status).toBe(204);
      const row = await sessionRow(sid);
      expect(row).toMatchObject({ visitorId: vid, pageViews: 2, events: 3, isBounce: false, exitPath: "/jobs/senior-tig-welder", consentLevel: "analytics", landingPath: "/jobs" });
      const scroll = await db.select().from(s.analyticsScrollDepth).where(eq(s.analyticsScrollDepth.sessionId, sid));
      expect(scroll.find((r) => r.path === "/jobs")?.maxDepthPct).toBe(50);
      expect(scroll.find((r) => r.path === "/jobs/senior-tig-welder")?.maxDepthPct).toBe(90);
    });

    it("links signed-in users but never tracks staff or minors", async () => {
      const cookie = `vsg_consent=${consentCookie({ analytics: true })}`;
      const adultId = await createUser();
      requestState.user = { id: adultId, isStaff: false };
      const adultSid = id("adult");
      expect((await collectRoute.POST(collectRequest({ ...firstBatch, sid: adultSid }, { cookie }))).status).toBe(204);
      expect((await sessionRow(adultSid))?.userId).toBe(adultId);

      const staffId = await createUser({ staff: true });
      requestState.user = { id: staffId, isStaff: true };
      const staffSid = id("staff");
      await collectRoute.POST(collectRequest({ ...firstBatch, sid: staffSid }, { cookie }));
      expect(await sessionRow(staffSid)).toBeUndefined();

      const minorId = await createUser();
      const dob = new Date();
      dob.setUTCFullYear(dob.getUTCFullYear() - 16);
      await db.insert(s.candidateProfiles).values({ userId: minorId, dateOfBirth: dob.toISOString().slice(0, 10) });
      requestState.user = { id: minorId, isStaff: false };
      const minorSid = id("minor");
      await collectRoute.POST(collectRequest({ ...firstBatch, sid: minorSid }, { cookie }));
      expect(await sessionRow(minorSid)).toBeUndefined();
      requestState.user = null;
    });

    it("re-applies normalisation in prepareBatch and ignores heatmaps when the flag is off", () => {
      const payload = collectPayloadSchema.parse({ ...firstBatch, sid: id("prep") });
      const off = prepareBatch(payload, { now: new Date(), heatmapsEnabled: false });
      expect(off.heatmap).toEqual([]);
      expect(off.events.map((e) => e.path)).toEqual(["/jobs"]);
      expect(off.session.landingPath).toBe("/jobs");
    });

    it("refuses to store without consent even when called directly", async () => {
      const payload = collectPayloadSchema.parse({ ...firstBatch, sid: id("direct") });
      const result = await ingestCollectBatch(payload, { userAgent: CHROME, countryHeader: null, consent: { ...consent.NO_OPTIONAL_CONSENT }, userId: null, heatmapsEnabled: true });
      expect(result).toEqual({ stored: false, reason: "no_consent" });
    });
  });

  describe("consent receipts", () => {
    const receipt = (categories: { functional: boolean; analytics: boolean; session_insights: boolean }, anonymousId: string, extra: Record<string, unknown> = {}) => ({
      version: VERSION,
      categories,
      anonymousId,
      method: "custom",
      source: "cookie_banner",
      ...extra,
    });
    const post = (body: unknown, origin = "http://localhost:3000") =>
      consentRoute.POST(
        new Request("http://localhost:3000/api/v1/consent", {
          method: "POST",
          headers: { "content-type": "application/json", origin, "x-forwarded-host": "localhost:3000", "x-forwarded-for": "198.51.100.7" },
          body: JSON.stringify(body),
        }),
      );

    it("records an anonymous receipt", async () => {
      const anon = id("rcpt");
      expect((await post(receipt({ functional: false, analytics: true, session_insights: false }, anon), "https://evil.test")).status).toBe(403);
      expect((await post({ nope: true })).status).toBe(400);
      expect((await post(receipt({ functional: false, analytics: true, session_insights: false }, anon))).status).toBe(204);
      const [log] = await db.select().from(s.analyticsConsentLogs).where(eq(s.analyticsConsentLogs.anonymousId, anon));
      expect(log).toMatchObject({ method: "custom", policyVersion: VERSION, categories: { essential: true, analytics_cookies: true, session_insights: false, functional_cookies: false } });
    });

    it("writes changed purposes to the consent ledger for signed-in users", async () => {
      const userId = await createUser();
      requestState.user = { id: userId, isStaff: false };
      const anon = id("ledger");
      expect((await post(receipt({ functional: true, analytics: true, session_insights: false }, anon))).status).toBe(204);
      let ledger = await db.select().from(s.consentRecords).where(eq(s.consentRecords.userId, userId));
      expect(ledger.map((r) => `${r.purpose}:${r.granted}`).sort()).toEqual(["analytics_cookies:true", "functional_cookies:true", "session_insights:false"]);
      expect(ledger.every((r) => r.source === "cookie_banner" && r.policyVersion === VERSION && r.anonymousId === anon)).toBe(true);

      // Same choice again: receipt only. Withdraw analytics: one new ledger row.
      await post(receipt({ functional: true, analytics: true, session_insights: false }, anon));
      const result = await recordConsentReceipt(
        { version: VERSION, categories: { functional: true, analytics: false, session_insights: false }, anonymousId: anon, method: "withdrawn", source: "cookie_preferences" },
        { userId },
      );
      expect(result.ledgerPurposes).toEqual(["analytics_cookies"]);
      ledger = await db.select().from(s.consentRecords).where(eq(s.consentRecords.userId, userId));
      expect(ledger).toHaveLength(4);
      const logs = await db.select().from(s.analyticsConsentLogs).where(eq(s.analyticsConsentLogs.anonymousId, anon));
      expect(logs).toHaveLength(3);
      requestState.user = null;
    });
  });

  describe("server-side conversions", () => {
    it("attributes to an existing session and marks it engaged", async () => {
      const sid = id("conv");
      await db.insert(s.analyticsSessions).values({ id: sid, visitorId: id("cv"), consentLevel: "analytics", pageViews: 1, events: 1, isBounce: true });
      const res = await recordServerEvent({ sessionId: sid, name: "application_submitted", path: "/jobs/welder", props: { jobId: "x" } });
      expect(res.attributed).toBe(true);
      expect(await sessionRow(sid)).toMatchObject({ events: 2, isBounce: false });
      const orphan = await recordServerEvent({ sessionId: id("missing"), name: "contact_form_submitted", path: null, props: {} });
      expect(orphan.attributed).toBe(false);
    });

    it("trackServer needs the vsg_sid cookie and analytics consent", async () => {
      const sid = id("track");
      await db.insert(s.analyticsSessions).values({ id: sid, consentLevel: "analytics", visitorId: id("tv") });
      requestState.headers = new Headers({ host: "localhost:3000", "x-vsg-pathname": "/contact?name=ravi" });
      requestState.cookies = new Map([[consent.ANALYTICS_SESSION_COOKIE, sid]]);
      await trackServer("contact_form_submitted", { formId: "contact", email: "x@y.z" });
      expect(await db.select().from(s.analyticsEvents).where(eq(s.analyticsEvents.sessionId, sid))).toHaveLength(0);

      requestState.cookies.set(consent.CONSENT_COOKIE, consentCookie({ analytics: true }));
      await trackServer("contact_form_submitted", { formId: "contact", email: "x@y.z" });
      const events = await db.select().from(s.analyticsEvents).where(eq(s.analyticsEvents.sessionId, sid));
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ source: "server", path: "/contact", props: { formId: "contact" } });
      requestState.cookies = new Map();
      requestState.headers = new Headers({ host: "localhost:3000" });
    });
  });

  describe("funnels", () => {
    // Fixture data lives in March 2025 so other tests do not interfere.
    const range = { preset: "custom" as const, from: "2025-03-01", to: "2025-03-10", days: 10, previousFrom: "2025-02-19", previousTo: "2025-02-28", timeZone: "UTC" };
    const steps: import("@/db/schema").AnalyticsFunnelStep[] = [
      { label: "Jobs", match: { event: "page_view", path: "/jobs" } },
      { label: "Job details", match: { event: "page_view", path: "/jobs/*" } },
      { label: "Registered", match: { event: "registration_completed", props: { intent: "candidate" } } },
      { label: "Applied", match: { event: "application_submitted" } },
    ];
    const at = (day: number, hour: number) => new Date(Date.UTC(2025, 2, day, hour));
    type Ev = { name: string; path: string | null; props?: Record<string, string>; at: Date };
    const visitors: Record<string, { sessions: string[]; events: (Ev & { session: number })[] }> = {
      full: {
        sessions: [id("f1"), id("f2")],
        events: [
          { session: 0, name: "page_view", path: "/jobs", at: at(2, 9) },
          { session: 0, name: "page_view", path: "/jobs/tig-welder", at: at(2, 10) },
          { session: 1, name: "registration_completed", path: "/verify", props: { intent: "candidate" }, at: at(4, 9) },
          { session: 1, name: "application_submitted", path: "/jobs/tig-welder", at: at(4, 10) },
        ],
      },
      wrongIntent: {
        sessions: [id("w1")],
        events: [
          { session: 0, name: "page_view", path: "/jobs", at: at(3, 9) },
          { session: 0, name: "page_view", path: "/jobs/fitter", at: at(3, 10) },
          { session: 0, name: "registration_completed", path: "/verify", props: { intent: "employer" }, at: at(3, 11) },
          { session: 0, name: "application_submitted", path: "/jobs/fitter", at: at(3, 12) },
        ],
      },
      outOfOrder: {
        sessions: [id("o1")],
        events: [
          { session: 0, name: "page_view", path: "/jobs/fitter", at: at(5, 8) },
          { session: 0, name: "page_view", path: "/jobs", at: at(5, 9) },
        ],
      },
      lateCompletion: {
        sessions: [id("l1"), id("l2")],
        events: [
          { session: 0, name: "page_view", path: "/jobs", at: at(1, 9) },
          { session: 0, name: "page_view", path: "/jobs/rigger", at: at(1, 10) },
          { session: 0, name: "registration_completed", path: "/verify", props: { intent: "candidate" }, at: at(1, 11) },
          { session: 1, name: "application_submitted", path: "/jobs/rigger", at: at(9, 9) },
        ],
      },
      outsideRange: {
        sessions: [id("x1")],
        events: [
          { session: 0, name: "page_view", path: "/jobs", at: new Date(Date.UTC(2025, 1, 20, 9)) },
          { session: 0, name: "page_view", path: "/jobs/rigger", at: at(2, 9) },
        ],
      },
    };

    it("computes ordered steps per visitor within the window and matches the reference implementation", async () => {
      for (const [name, v] of Object.entries(visitors)) {
        const visitorId = id(`v${name}`);
        for (const sessionId of v.sessions) {
          await db.insert(s.analyticsSessions).values({ id: sessionId, visitorId, consentLevel: "analytics", startedAt: at(1, 0), lastSeenAt: at(1, 0) }).onConflictDoNothing();
        }
        await db.insert(s.analyticsEvents).values(
          v.events.map((e) => ({ sessionId: v.sessions[e.session]!, visitorId, name: e.name, path: e.path, props: e.props ?? {}, occurredAt: e.at })),
        );
      }
      const result = await computeFunnelSteps(steps, 7, range, "visitor");
      const expected = [0, 0, 0, 0];
      const start = new Date(Date.UTC(2025, 2, 1));
      const end = new Date(Date.UTC(2025, 2, 11));
      for (const v of Object.values(visitors)) {
        const reached = stepsReached(v.events, steps, 7, start, end);
        for (let i = 0; i < reached; i++) expected[i]! += 1;
      }
      expect(result.steps.map((st) => st.count)).toEqual(expected);
      expect(expected).toEqual([4, 3, 2, 1]);
      expect(result.entered).toBe(4);
      expect(result.completed).toBe(1);
      expect(result.overallConversion).toBeCloseTo(0.25);
      expect(result.steps[1]).toMatchObject({ dropOff: 1, conversionFromPrevious: 0.75 });
      expect(result.steps[3]?.conversionFromStart).toBeCloseTo(0.25);
    });

    it("can group by session instead of visitor, and evaluates saved funnels", async () => {
      const bySession = await computeFunnelSteps(steps, 7, range, "session");
      // "full" registers and applies in a second session, so per session nobody completes.
      expect(bySession.steps.map((st) => st.count)).toEqual([4, 3, 1, 0]);

      const admin = await staff("analytics.view", "analytics.configure");
      const saved = await service.saveFunnel(admin, {
        name: `Test funnel ${RUN}`,
        windowDays: 7,
        isActive: true,
        steps: steps.map((st) => ({ label: st.label, event: st.match.event, path: st.match.path, props: st.match.props })),
      });
      const evaluated = await computeFunnel(admin, saved.id, range);
      expect(evaluated.steps.map((st) => st.count)).toEqual([4, 3, 2, 1]);
      expect((await listFunnels(admin)).some((f) => f.id === saved.id)).toBe(true);

      const viewer = await staff();
      await expect(computeFunnel(viewer, saved.id, range)).rejects.toBeInstanceOf(ActionError);
      await expect(computeFunnelSteps([{ label: "x", match: {} }] as never, 7, range)).rejects.toBeInstanceOf(ActionError);
    });
  });

  describe("dashboards and roll-ups", () => {
    // Fixture data in April 2025.
    const range = { preset: "custom" as const, from: "2025-04-01", to: "2025-04-07", days: 7, previousFrom: "2025-03-25", previousTo: "2025-03-31", timeZone: "UTC" };
    const day = (d: number, h: number, m = 0) => new Date(Date.UTC(2025, 3, d, h, m));
    const sA = id("dashA");
    const sB = id("dashB");
    const sC = id("dashC");
    const vA = id("dva");
    const vB = id("dvb");

    it("loads fixture data", async () => {
      await db.insert(s.analyticsSessions).values([
        { id: sA, visitorId: vA, consentLevel: "analytics", startedAt: day(2, 9), lastSeenAt: day(2, 9, 5), landingPath: "/", exitPath: "/contact", utmSource: "facebook", utmMedium: "paid_social", utmCampaign: `spring-${RUN}`, deviceType: "mobile", browser: "Chrome", os: "Android", countryCode: "IN", isNewVisitor: true, pageViews: 3, events: 6, isBounce: false, durationSeconds: 300 },
        { id: sB, visitorId: vA, consentLevel: "analytics", startedAt: day(3, 9), lastSeenAt: day(3, 9), landingPath: "/jobs", exitPath: "/jobs", referrerDomain: "www.google.com", deviceType: "desktop", browser: "Firefox", os: "Windows", countryCode: "AE", pageViews: 1, events: 1, isBounce: true, durationSeconds: 0 },
        { id: sC, visitorId: vB, consentLevel: "analytics", startedAt: day(3, 12), lastSeenAt: day(3, 12, 1), landingPath: "/jobs", exitPath: "/jobs", deviceType: "desktop", browser: "Chrome", os: "Windows", isNewVisitor: true, pageViews: 2, events: 4, isBounce: false, durationSeconds: 60 },
      ]);
      await db.insert(s.analyticsEvents).values([
        { sessionId: sA, visitorId: vA, name: "page_view", path: "/", occurredAt: day(2, 9) },
        { sessionId: sA, visitorId: vA, name: "cta_click", path: "/", props: { cta: "hire_now", location: "hero" }, occurredAt: day(2, 9, 1) },
        { sessionId: sA, visitorId: vA, name: "page_view", path: "/contact", occurredAt: day(2, 9, 2) },
        { sessionId: sA, visitorId: vA, name: "form_started", path: "/contact", props: { formId: "contact" }, occurredAt: day(2, 9, 3) },
        { sessionId: sA, visitorId: vA, name: "form_submitted", path: "/contact", props: { formId: "contact" }, occurredAt: day(2, 9, 4) },
        { sessionId: sA, visitorId: vA, name: "contact_form_submitted", path: "/contact", occurredAt: day(2, 9, 5) },
        { sessionId: sB, visitorId: vA, name: "page_view", path: "/jobs", props: { category: "welding", overseas: "1" }, occurredAt: day(3, 9) },
        { sessionId: sC, visitorId: vB, name: "page_view", path: "/jobs", props: { type: "internship" }, occurredAt: day(3, 12) },
        { sessionId: sC, visitorId: vB, name: "job_search", path: "/jobs", props: { category: "fabrication", filters: "type,country" }, occurredAt: day(3, 12, 0) },
        { sessionId: sC, visitorId: vB, name: "form_started", path: "/jobs", props: { formId: "job_alert" }, occurredAt: day(3, 12, 1) },
        { sessionId: null, visitorId: null, name: "application_submitted", source: "server", path: "/jobs/x", occurredAt: day(4, 8) },
      ]);
      await db.insert(s.analyticsHeatmapPoints).values([
        { path: "/", viewportWidthBucket: "mobile", xPct: 503, yPx: 610, docHeight: 2400, selector: "main > a[cta:hire_now]", kind: "click", occurredAt: day(2, 9, 1) },
        { path: "/", viewportWidthBucket: "mobile", xPct: 507, yPx: 620, docHeight: 2400, selector: "main > a[cta:hire_now]", kind: "click", occurredAt: day(2, 9, 1) },
        { path: "/", viewportWidthBucket: "mobile", xPct: 507, yPx: 620, docHeight: 2400, selector: "main > a[cta:hire_now]", kind: "rage_click", occurredAt: day(2, 9, 1) },
        { path: "/", viewportWidthBucket: "desktop", xPct: 100, yPx: 100, docHeight: 1800, selector: null, kind: "dead_click", occurredAt: day(2, 9, 1) },
      ]);
      await db.insert(s.analyticsScrollDepth).values([
        { sessionId: sA, path: "/", maxDepthPct: 75, occurredAt: day(2, 9, 1) },
        { sessionId: sC, path: "/", maxDepthPct: 25, occurredAt: day(3, 12) },
      ]);
    });

    it("requires analytics.view", async () => {
      const nobody = await staff();
      await expect(queries.getAnalyticsOverview(nobody, range)).rejects.toMatchObject({ code: "forbidden" });
      await expect(behaviour.getHeatmap(nobody, range, { path: "/", viewport: "mobile" })).rejects.toBeInstanceOf(ActionError);
      const viewer = await staff("analytics.view");
      await expect(queries.getAnalyticsOverview(viewer, { ...range, from: "2025-04-07", to: "2025-04-01" })).rejects.toMatchObject({ code: "invalid_range" });
    });

    it("computes the overview, series and breakdowns", async () => {
      const viewer = await staff("analytics.view");
      const overview = await queries.getAnalyticsOverview(viewer, range);
      expect(overview.current).toMatchObject({ sessions: 3, visitors: 2, newVisitors: 2, pageViews: 6, conversions: 2 });
      expect(overview.current.bounceRate).toBeCloseTo(1 / 3);
      expect(overview.current.avgSessionDuration).toBeCloseTo(120);
      expect(overview.current.conversionRate).toBeCloseTo(1 / 3);
      expect(overview.previous.sessions).toBe(0);
      expect(overview.change.sessions).toBeNull();

      const series = await queries.getAnalyticsTimeSeries(viewer, range);
      expect(series).toHaveLength(7);
      expect(series.find((p) => p.date === "2025-04-03")).toMatchObject({ sessions: 2, visitors: 2, pageViews: 3 });
      expect(series.find((p) => p.date === "2025-04-04")?.conversions).toBe(1);

      const pages = await queries.getTopPages(viewer, range);
      expect(pages.find((p) => p.path === "/jobs")).toMatchObject({ pageViews: 2, sessions: 2 });
      expect(pages.find((p) => p.path === "/")?.avgScrollDepth).toBe(50);
      const landing = await queries.getLandingPages(viewer, range);
      expect(landing.find((p) => p.path === "/jobs")).toMatchObject({ sessions: 2, bounceRate: 0.5 });
      const exits = await queries.getExitPages(viewer, range);
      expect(exits.find((p) => p.path === "/jobs")).toMatchObject({ exits: 2, pageViews: 2, exitRate: 1 });

      const sources = await queries.getTrafficSources(viewer, range);
      expect(sources.find((r) => r.source === "facebook")).toMatchObject({ medium: "paid_social", sessions: 1, conversions: 1 });
      expect(sources.find((r) => r.source === "www.google.com")?.medium).toBe("referral");
      expect(sources.find((r) => r.source === "(direct)")?.medium).toBe("(none)");
      expect((await queries.getReferrers(viewer, range))[0]).toMatchObject({ referrerDomain: "www.google.com", sessions: 1 });

      const tech = await queries.getTechBreakdown(viewer, range);
      expect(tech.devices.find((d) => d.value === "desktop")?.sessions).toBe(2);
      const countries = await queries.getCountryBreakdown(viewer, range);
      expect(countries.find((c) => c.countryCode === null)?.sessions).toBe(1);
      expect(countries.find((c) => c.countryCode === "IN")?.sessions).toBe(1);
    });

    it("reports campaigns with cost per acquisition", async () => {
      const admin = await staff("analytics.view", "analytics.configure");
      await db.insert(s.currencies).values({ code: "AED", name: "UAE dirham", symbol: "AED", minorUnits: 2 }).onConflictDoNothing();
      const saved = await service.saveCampaign(admin, { utmCampaign: `Spring-${RUN}`, name: "Spring hiring", channel: "paid_social", cost: 250.5, currency: "aed" } as never);
      expect(saved.created).toBe(true);
      await expect(service.saveCampaign(admin, { utmCampaign: `spring-${RUN}`, name: "Dup", channel: "email" } as never)).rejects.toBeInstanceOf(ActionError);
      const rows = await queries.getCampaignPerformance(admin, range);
      const spring = rows.find((r) => r.utmCampaign === `spring-${RUN}`);
      expect(spring).toMatchObject({ name: "Spring hiring", sessions: 1, conversions: 1, costMinor: 25050, currency: "AED", lifetimeConversionTotal: 1, costPerConversionMinor: 25050 });
      expect(spring?.costPerEventMinor.contact_form_submitted).toBe(25050);
      const audits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, saved.id), eq(s.auditLogs.action, "analytics.campaign_created")));
      expect(audits).toHaveLength(1);
      await service.deleteCampaign(admin, saved.id);
      await expect(service.deleteCampaign(admin, saved.id)).rejects.toMatchObject({ code: "not_found" });
    });

    it("reports events, forms, search, heatmaps and CTAs", async () => {
      const viewer = await staff("analytics.view");
      const counts = await behaviour.getEventCounts(viewer, range);
      expect(counts.find((c) => c.name === "page_view")).toMatchObject({ count: 4, isConversion: false, label: "Page view" });
      expect(counts.find((c) => c.name === "contact_form_submitted")?.isConversion).toBe(true);

      const list = await behaviour.listEvents(viewer, range, { name: "page_view" }, { page: 1, pageSize: 2, offset: 0 });
      expect(list.total).toBe(4);
      expect(list.items).toHaveLength(2);
      expect(list.items.every((e) => e.sessionId === null)).toBe(true);
      const withSessions = await staff("analytics.view", "analytics.sessions");
      const prefixed = await behaviour.listEvents(withSessions, range, { path: "/jo*" }, { page: 1, pageSize: 50, offset: 0 });
      expect(prefixed.items.length).toBe(5);
      expect(prefixed.items.some((e) => e.sessionId !== null)).toBe(true);

      const forms = await behaviour.getFormAnalytics(viewer, range);
      expect(forms.find((f) => f.formId === "contact")).toMatchObject({ started: 1, submitted: 1, completionRate: 1, abandonmentRate: 0 });
      expect(forms.find((f) => f.formId === "job_alert")).toMatchObject({ started: 1, submitted: 0, abandonmentRate: 1 });

      const search = await behaviour.getSearchAnalytics(viewer, range);
      expect(search.searches).toBe(1);
      expect(search.listingPageViews).toBe(2);
      expect(search.categories.map((c) => c.value).sort()).toEqual(["fabrication", "welding"]);
      expect(Object.fromEntries(search.filterKeys.map((k) => [k.key, k.count]))).toMatchObject({ type: 2, category: 1, overseas: 1, country: 1 });

      const heat = await behaviour.getHeatmap(viewer, range, { path: "/", viewport: "mobile" });
      expect(heat.totals).toEqual({ clicks: 2, rageClicks: 1, deadClicks: 0 });
      expect(heat.cells.find((c) => c.x === 500 && c.y === 600)?.count).toBe(3);
      expect(heat.topSelectors[0]).toMatchObject({ selector: "main > a[cta:hire_now]", clicks: 2, rageClicks: 1 });
      expect(heat.docHeight).toBe(2400);
      expect(heat.scroll).toMatchObject({ sessions: 2, avgMaxDepth: 50 });
      expect(heat.scroll.reach.find((r) => r.depth === 75)?.share).toBeCloseTo(0.5);
      const clicksOnly = await behaviour.getHeatmap(viewer, range, { path: "/", viewport: "mobile", kind: "rage_click" });
      expect(clicksOnly.cells.reduce((a, c) => a + c.count, 0)).toBe(1);
      expect((await behaviour.listHeatmapPages(viewer, range, { viewport: "desktop" }))[0]).toMatchObject({ path: "/", clicks: 1 });

      const ctas = await behaviour.getCtaPerformance(viewer, range);
      expect(ctas.find((c) => c.cta === "hire_now")).toMatchObject({ clicks: 1, sessions: 1, convertedSessions: 1, conversionRate: 1, locations: ["hero"] });
    });

    it("aggregates daily metrics idempotently", async () => {
      const first = await aggregateDailyMetrics(["2025-04-03", "2025-04-02", "bad-date"], "UTC");
      expect(first.map((d) => d.date)).toEqual(["2025-04-02", "2025-04-03"]);
      const again = await aggregateDailyMetrics(["2025-04-03"], "UTC");
      expect(again[0]?.rows).toBe(first[1]?.rows);
      const value = async (date: string, metric: string, dimension: string, dimensionValue: string) => {
        const [row] = await db
          .select()
          .from(s.analyticsDailyMetrics)
          .where(
            and(
              eq(s.analyticsDailyMetrics.date, date),
              eq(s.analyticsDailyMetrics.metric, metric as never),
              eq(s.analyticsDailyMetrics.dimension, dimension as never),
              eq(s.analyticsDailyMetrics.dimensionValue, dimensionValue),
            ),
          );
        return row?.value;
      };
      expect(await value("2025-04-03", "sessions", "all", "")).toBe(2);
      expect(await value("2025-04-03", "visitors", "all", "")).toBe(2);
      expect(await value("2025-04-03", "bounce_rate", "all", "")).toBe(0.5);
      expect(await value("2025-04-03", "sessions", "device", "desktop")).toBe(2);
      expect(await value("2025-04-03", "sessions", "source", "www.google.com")).toBe(1);
      expect(await value("2025-04-03", "page_views", "path", "/jobs")).toBe(2);
      expect(await value("2025-04-02", "conversions:contact_form_submitted", "all", "")).toBe(1);
      expect(await value("2025-04-02", "conversions:contact_form_submitted", "campaign", `spring-${RUN}`)).toBe(1);
      expect(await value("2025-04-02", "sessions", "country", "IN")).toBe(1);

      await aggregateDailyMetrics(["2025-04-04"], "UTC");
      expect(await value("2025-04-04", "conversions:application_submitted", "all", "")).toBe(1);
      expect(await value("2025-04-04", "sessions", "all", "")).toBe(0);

      const viewer = await staff("analytics.view");
      const series = await queries.getDailyMetricSeries(viewer, { metric: "sessions", from: "2025-04-01", to: "2025-04-04" });
      expect(series.map((p) => p.value)).toEqual([0, 1, 2, 0]);
    });

    it("opens a session timeline with audit and data-access logging", async () => {
      const viewer = await staff("analytics.view");
      await expect(sessions.getSessionTimeline(sA, viewer)).rejects.toMatchObject({ code: "forbidden" });
      const diagnostician = await staff("analytics.view", "analytics.sessions");
      const list = await sessions.listSessions(diagnostician, range, {}, { page: 1, pageSize: 10, offset: 0 });
      expect(list.total).toBe(3);
      const timeline = await sessions.getSessionTimeline(sA, diagnostician);
      expect(timeline.events.map((e) => e.name)).toEqual(["page_view", "cta_click", "page_view", "form_started", "form_submitted", "contact_form_submitted"]);
      expect(timeline.scroll).toHaveLength(1);
      expect(timeline.session.utm.campaign).toBe(`spring-${RUN}`);
      const access = await db.select().from(s.dataAccessLogs).where(and(eq(s.dataAccessLogs.subjectId, sA), eq(s.dataAccessLogs.actorUserId, diagnostician.user.id)));
      expect(access).toHaveLength(1);
      expect(access[0]).toMatchObject({ subjectType: "analytics_session", accessType: "view", dataCategory: "analytics" });
      const audits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, sA), eq(s.auditLogs.action, "analytics.session_viewed")));
      expect(audits).toHaveLength(1);
      await expect(sessions.getSessionTimeline("not a session id", diagnostician)).rejects.toMatchObject({ code: "not_found" });
    });

    it("exports CSV with analytics.export and audits it", async () => {
      const viewer = await staff("analytics.view");
      await expect(service.exportAnalyticsCsv(viewer, "events", range)).rejects.toMatchObject({ code: "forbidden" });
      const exporter = await staff("analytics.export");
      const events = await service.exportAnalyticsCsv(exporter, "events", range);
      expect(events.rows).toBe(11);
      expect(events.csv.split("\r\n")[0]).toBe("occurred_at,event,source,path,props,session_id");
      expect(events.csv).not.toContain("visitor");
      const sessionsCsv = await service.exportAnalyticsCsv(exporter, "sessions", range);
      expect(sessionsCsv.rows).toBe(3);
      expect(sessionsCsv.csv).not.toContain(vA);
      const metrics = await service.exportAnalyticsCsv(exporter, "daily_metrics", range);
      expect(metrics.rows).toBeGreaterThan(0);
      const audits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.actorUserId, exporter.user.id), eq(s.auditLogs.action, "analytics.exported")));
      expect(audits).toHaveLength(3);
    });
  });

  describe("funnel administration", () => {
    it("protects seeded funnels and audits changes", async () => {
      const admin = await staff("analytics.view", "analytics.configure");
      const [seeded] = await db.select().from(s.analyticsFunnels).where(eq(s.analyticsFunnels.key, "candidate_journey"));
      await expect(service.deleteFunnel(admin, seeded!.id)).rejects.toMatchObject({ code: "seeded_funnel" });
      await service.setFunnelActive(admin, seeded!.id, false);
      await service.setFunnelActive(admin, seeded!.id, false);
      expect((await db.select().from(s.analyticsFunnels).where(eq(s.analyticsFunnels.id, seeded!.id)))[0]?.isActive).toBe(false);
      await service.setFunnelActive(admin, seeded!.id, true);
      const toggles = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, seeded!.id), eq(s.auditLogs.actorUserId, admin.user.id)));
      expect(toggles.map((a) => a.action).sort()).toEqual(["analytics.funnel_activated", "analytics.funnel_deactivated"]);

      const created = await service.saveFunnel(admin, {
        name: `Disposable ${RUN}`,
        windowDays: 3,
        isActive: true,
        steps: [
          { label: "A", event: "page_view" },
          { label: "B", path: "/contact" },
        ],
      });
      await service.deleteFunnel(admin, created.id);
      expect(await db.select().from(s.analyticsFunnels).where(eq(s.analyticsFunnels.id, created.id))).toHaveLength(0);
      const viewer = await staff("analytics.view");
      await expect(service.saveFunnel(viewer, { name: "x", windowDays: 1, isActive: true, steps: [] } as never)).rejects.toMatchObject({ code: "forbidden" });
    });
  });

  describe("data-subject requests", () => {
    it("summarises and erases a user's analytics data across their visitor ids", async () => {
      const { summarizeAnalyticsForUser, eraseAnalyticsForUser } = await import("./dsar");
      const userId = await createUser();
      const visitor = id("dsarv");
      const signedIn = id("dsar1");
      const signedOut = id("dsar2");
      const stranger = id("dsar3");
      await db.insert(s.analyticsSessions).values([
        { id: signedIn, visitorId: visitor, userId, consentLevel: "analytics", countryCode: "IN", deviceType: "mobile", events: 2 },
        { id: signedOut, visitorId: visitor, consentLevel: "analytics", deviceType: "desktop", events: 1 },
        { id: stranger, visitorId: id("dsarx"), consentLevel: "analytics", events: 1 },
      ]);
      await db.insert(s.analyticsEvents).values([
        { sessionId: signedIn, visitorId: visitor, name: "page_view", path: "/talent" },
        { sessionId: signedIn, visitorId: visitor, name: "application_submitted", path: "/jobs/x" },
        { sessionId: signedOut, visitorId: visitor, name: "page_view", path: "/jobs" },
        { sessionId: stranger, name: "page_view", path: "/jobs" },
      ]);

      const analyst = await staff("analytics.view");
      await expect(summarizeAnalyticsForUser({ kind: "staff", staff: analyst }, userId)).rejects.toMatchObject({ code: "forbidden" });
      const officer = await staff("privacy.requests");
      const summary = await summarizeAnalyticsForUser({ kind: "staff", staff: officer }, userId);
      expect(summary).toMatchObject({ sessions: 2, events: 3, countries: ["IN"] });
      expect(summary.devices.sort()).toEqual(["desktop", "mobile"]);

      const erased = await eraseAnalyticsForUser({ kind: "system", reason: "DSR erasure test" }, userId);
      expect(erased).toEqual({ sessions: 2, events: 3 });
      expect(await sessionRow(signedIn)).toBeUndefined();
      expect(await sessionRow(signedOut)).toBeUndefined();
      expect(await sessionRow(stranger)).toBeDefined();
      const audits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, userId), eq(s.auditLogs.action, "analytics.subject_data_erased")));
      expect(audits).toHaveLength(1);
      await expect(eraseAnalyticsForUser({ kind: "system", reason: " " }, userId)).rejects.toMatchObject({ code: "invalid_actor" });
    });
  });

  describe("retention", () => {
    it("deletes raw data past the retention periods and keeps roll-ups", async () => {
      const now = new Date();
      const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
      const oldSession = id("oldsess");
      const keptSession = id("keptsess");
      await db.insert(s.analyticsSessions).values([
        { id: oldSession, consentLevel: "analytics", startedAt: daysAgo(400), lastSeenAt: daysAgo(400) },
        { id: keptSession, consentLevel: "analytics", startedAt: daysAgo(100), lastSeenAt: daysAgo(100) },
      ]);
      await db.insert(s.analyticsEvents).values([
        { sessionId: oldSession, name: "page_view", path: "/old", occurredAt: daysAgo(400) },
        { sessionId: keptSession, name: "page_view", path: `/retained-${RUN}`, occurredAt: daysAgo(100) },
      ]);
      await db.insert(s.analyticsHeatmapPoints).values([
        { path: `/heat-old-${RUN}`, viewportWidthBucket: "mobile", xPct: 1, yPx: 1, docHeight: 10, occurredAt: daysAgo(100) },
        { path: `/heat-new-${RUN}`, viewportWidthBucket: "mobile", xPct: 1, yPx: 1, docHeight: 10, occurredAt: new Date(now.getTime() - 3_600_000) },
      ]);
      const before = await db.select({ n: sql<number>`count(*)::int` }).from(s.analyticsDailyMetrics);

      const result = await runAnalyticsRetention({ eventsDays: 395, heatmapsDays: 90, sessionsDays: 395 }, now);
      expect(result.sessions).toBeGreaterThanOrEqual(1);
      expect(await sessionRow(oldSession)).toBeUndefined();
      expect(await sessionRow(keptSession)).toBeDefined();
      expect(await db.select().from(s.analyticsEvents).where(eq(s.analyticsEvents.path, `/retained-${RUN}`))).toHaveLength(1);
      expect(await db.select().from(s.analyticsHeatmapPoints).where(eq(s.analyticsHeatmapPoints.path, `/heat-old-${RUN}`))).toHaveLength(0);
      expect(await db.select().from(s.analyticsHeatmapPoints).where(eq(s.analyticsHeatmapPoints.path, `/heat-new-${RUN}`))).toHaveLength(1);
      const after = await db.select({ n: sql<number>`count(*)::int` }).from(s.analyticsDailyMetrics);
      expect(after[0]?.n).toBe(before[0]?.n);

      // A mistyped 0 never wipes recent data (minimum one day).
      await runAnalyticsRetention({ eventsDays: 0, heatmapsDays: 0, sessionsDays: 0 }, now);
      expect(await db.select().from(s.analyticsHeatmapPoints).where(eq(s.analyticsHeatmapPoints.path, `/heat-new-${RUN}`))).toHaveLength(1);
    });
  });
});
