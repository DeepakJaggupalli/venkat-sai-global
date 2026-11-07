/**
 * Integration tests for the Command Centre settings / audit / system read models and services
 * (ui:admin-settings-system) against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_adminsettings
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_adminsettings'; npx vitest run src/app/admin/settings src/app/admin/audit src/app/admin/system
 */
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("admin settings and system (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  const { eq, inArray, like } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { PLATFORM_PERMISSIONS } = await import("@/config/permissions");
  const settingsAdmin = await import("./settings-admin");
  const roles = await import("../roles/_lib/roles");
  const taxQ = await import("../taxonomies/_lib/queries");
  const taxS = await import("../taxonomies/_lib/service");
  const wf = await import("../workflows/_lib/workflows");
  const auditQ = await import("../../audit/_lib/queries");
  const sys = await import("../../system/_lib/system");
  type StaffContext = import("@/modules/identity/authz").StaffContext;

  const run = randomUUID().slice(0, 6).toLowerCase();
  const [staff] = await db.insert(s.users).values({ email: `settings-${run}@example.test`, displayName: `Settings Admin ${run}`, isStaff: true, status: "active" }).returning();
  const superCtx: StaffContext = {
    user: { id: staff!.id, timezone: null } as StaffContext["user"],
    roleKeys: ["super_admin"],
    permissions: new Set(PLATFORM_PERMISSIONS.map((p) => p.key)),
    isSuperAdmin: true,
  };
  const limitedCtx: StaffContext = { ...superCtx, roleKeys: ["custom"], isSuperAdmin: false, permissions: new Set(["settings.view", "settings.roles", "settings.manage"]) };
  const createdRoleIds: string[] = [];
  const createdWorkflowIds: string[] = [];
  const taskIds: number[] = [];

  afterAll(async () => {
    if (createdRoleIds.length) await db.delete(s.roles).where(inArray(s.roles.id, createdRoleIds));
    if (createdWorkflowIds.length) await db.delete(s.applicationWorkflows).where(inArray(s.applicationWorkflows.id, createdWorkflowIds));
    if (taskIds.length) await db.delete(s.backgroundJobs).where(inArray(s.backgroundJobs.id, taskIds));
    await db.delete(s.skills).where(like(s.skills.slug, `%${run}%`));
    await db.delete(s.currencies).where(eq(s.currencies.code, "ZZX"));
    await db.delete(s.platformSettings).where(eq(s.platformSettings.key, "support.sla_hours_low"));
    await db.delete(s.users).where(eq(s.users.id, staff!.id));
    await pool.end();
  });

  it("saves a settings group, writes only changes and audits them", async () => {
    const first = await settingsAdmin.saveSettingGroup(superCtx, "Support", {
      "support.sla_hours_urgent": "4",
      "support.sla_hours_high": "8",
      "support.sla_hours_normal": "24",
      "support.sla_hours_low": "48",
    });
    expect(first.changed).toEqual(["support.sla_hours_low"]);
    const states = await settingsAdmin.loadSettingStates(["support.sla_hours_low"]);
    expect(states.get("support.sla_hours_low")).toMatchObject({ value: 48, isDefault: false });
    const [log] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, "support.sla_hours_low")).orderBy(s.auditLogs.id);
    expect(log?.metadata).toMatchObject({ from: "72", to: "48" });
    await expect(settingsAdmin.saveSettingGroup(limitedCtx, "Security", {})).rejects.toThrow(/permission/);
    await expect(settingsAdmin.saveSettingGroup(superCtx, "Support", { "support.sla_hours_low": "0" })).rejects.toThrow(/highlighted/);
  });

  it("creates, edits and deletes role templates with escalation and super admin guards", async () => {
    const { id } = await roles.createRoleTemplate(superCtx, { scope: "platform", name: `Auditor ${run}` });
    createdRoleIds.push(id);
    const res = await roles.updateRoleTemplate(superCtx, id, { name: `Auditor ${run}`, permissions: ["audit.view", "dashboard.view"] });
    expect(res.added.sort()).toEqual(["audit.view", "dashboard.view"]);
    await expect(roles.updateRoleTemplate(limitedCtx, id, { name: "x", permissions: ["audit.view", "users.roles"] })).rejects.toThrow(/hold yourself/);
    await expect(roles.updateRoleTemplate(superCtx, id, { name: "x", permissions: ["employer.dashboard"] })).rejects.toThrow(/do not apply/);
    const list = await roles.listRoleTemplates("platform");
    expect(list.find((r) => r.id === id)?.memberCount).toBe(0);
    const superRole = list.find((r) => r.key === "super_admin");
    if (superRole) await expect(roles.updateRoleTemplate(superCtx, superRole.id, { name: "x", permissions: [] })).rejects.toThrow(/Super Admin/);
    await roles.deleteRoleTemplate(superCtx, id);
    expect(await roles.getRoleTemplate(id)).toBeNull();
  });

  it("creates, edits, imports and exports taxonomy records", async () => {
    const created = await taxS.saveTaxonomyRecord("currencies", { code: "zzx", name: "Test currency", symbol: "Z", minorUnits: "2", isActive: "true" });
    expect(created).toEqual({ id: "ZZX", created: true });
    await expect(taxS.saveTaxonomyRecord("currencies", { code: "ZZX", name: "Dup", symbol: "Z", minorUnits: "2" })).rejects.toThrow(/highlighted/);
    const row = await taxQ.getTaxonomyValues("currencies", "ZZX");
    expect(row?.values).toMatchObject({ name: "Test currency", minorUnits: 2, isActive: true });

    const skill = await taxS.saveTaxonomyRecord("skills", { name: `Weld ${run}`, category: "trade", synonyms: "SMAW, stick", isActive: "true" });
    const csv = `slug,name,category,synonyms,status,active\nweld-${run},Weld ${run} renamed,trade,SMAW | arc,approved,yes\nnew-${run},New ${run},trade,,pending,\nbad-${run},Bad,unknown,,,\n`;
    const summary = await taxS.importTaxonomyCsv("skills", csv);
    expect(summary).toMatchObject({ created: 1, updated: 1, failed: 1 });
    expect(summary.errors[0]?.row).toBe(4);
    const refreshed = await taxQ.getTaxonomyValues("skills", skill.id);
    expect(refreshed?.values).toMatchObject({ name: `Weld ${run} renamed`, synonyms: "SMAW, arc" });
    const refreshTasks = await db.select().from(s.backgroundJobs).where(like(s.backgroundJobs.type, "%refresh_skill%"));
    expect(refreshTasks.length).toBeGreaterThan(0);

    const pending = await taxQ.listTaxonomy("skills", { status: "pending", q: run }, { page: 1, pageSize: 10, offset: 0 });
    expect(pending.items.map((r) => r.name)).toEqual([`New ${run}`]);
    await taxS.decideSkill(pending.items[0]!.id, "approved");
    expect((await taxQ.getTaxonomyValues("skills", pending.items[0]!.id))?.status).toBe("approved");

    await taxS.setTaxonomyActive("currencies", "ZZX", false);
    expect((await taxQ.getTaxonomyValues("currencies", "ZZX"))?.isActive).toBe(false);
    const exported = await taxQ.exportTaxonomyCsv("currencies");
    expect(exported.split("\r\n")[0]).toBe("code,name,symbol,minor_units,active");
    expect(exported).toContain("ZZX,Test currency,Z,2,no");
    const counts = await taxQ.taxonomyCounts();
    expect(counts.currencies).toBeGreaterThan(0);
  });

  it("edits workflow stages with ordering and retirement guards", async () => {
    let workflows = await wf.listPlatformWorkflows();
    if (!workflows.length) {
      const { seedDefaultWorkflow } = await import("@/modules/recruitment/seed");
      await seedDefaultWorkflow();
      workflows = await wf.listPlatformWorkflows();
    }
    const source = workflows.find((w) => w.isDefault) ?? workflows[0];
    if (!source) return; // seed not installed in this database
    const copy = await wf.duplicateWorkflow(superCtx, source.id, `Copy ${run}`);
    createdWorkflowIds.push(copy.id);
    const loaded = await wf.getPlatformWorkflow(copy.id);
    expect(loaded?.stages.length).toBe(source.stageCount);
    const added = await wf.saveStage(copy.id, undefined, { key: `trade_test_${run}`, category: "assessment", name: "Trade test", candidateLabel: "Trade test", notifyCandidate: true, isActive: true });
    const after = await wf.getPlatformWorkflow(copy.id);
    const idx = after!.stages.findIndex((st) => st.id === added.id);
    const prev = after!.stages[idx - 1];
    expect(prev && ["assessment", "screening", "applied"].includes(prev.category)).toBe(true);
    const accepted = after!.stages.find((st) => st.key === "offer_accepted");
    if (accepted) await expect(wf.saveStage(copy.id, accepted.id, { name: accepted.name, candidateLabel: accepted.candidateLabel, notifyCandidate: true, isActive: false })).rejects.toThrow(/stay active/);
    await wf.moveStage(copy.id, added.id, "up");
    await expect(wf.updateWorkflowDetails(superCtx, source.id, { name: source.name, isActive: false })).rejects.toThrow(source.isDefault ? /default/ : /.*/);
  });

  it("lists audit, security and data-access logs with filters", async () => {
    const tz = "Asia/Kolkata";
    // The filters are calendar dates in the staff time zone, so "today" must be today in that zone (not UTC).
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const res = await auditQ.listAuditLogs({ action: "settings.", from: today, to: today }, { page: 1, pageSize: 10, offset: 0 }, tz);
    expect(res.items.some((r) => r.entityId === "support.sla_hours_low")).toBe(true);
    const byActor = await auditQ.listAuditLogs({ actor: staff!.id }, { page: 1, pageSize: 5, offset: 0 }, tz);
    expect(byActor.total).toBeGreaterThanOrEqual(0);
    await auditQ.listSecurityEvents({ severity: "warning" }, { page: 1, pageSize: 5, offset: 0 }, tz);
    await auditQ.listDataAccessLogs({ accessType: "reveal", subject: "nobody" }, { page: 1, pageSize: 5, offset: 0 }, tz);
    expect(Array.isArray(await auditQ.auditEntityTypes())).toBe(true);
  });

  it("monitors, retries and deletes background tasks", async () => {
    const [dead] = await db.insert(s.backgroundJobs).values({ type: `test.dead_${run}`, payload: { secret: "x", id: 1 }, status: "dead", attempts: 5, lastError: "boom" }).returning({ id: s.backgroundJobs.id });
    taskIds.push(dead!.id);
    const list = await sys.listTasks({ status: "dead", type: `test.dead_${run}` }, { page: 1, pageSize: 10, offset: 0 });
    expect(list.items[0]).toMatchObject({ id: dead!.id, payloadKeys: ["id", "secret"], lastError: "boom" });
    expect(list.items[0]).not.toHaveProperty("payload");
    expect(await sys.retryTasks([dead!.id])).toBe(1);
    expect(await sys.deleteTasks([dead!.id])).toBe(0); // queued now: never deleted
    await db.update(s.backgroundJobs).set({ status: "succeeded" }).where(eq(s.backgroundJobs.id, dead!.id));
    expect(await sys.deleteTasks([dead!.id])).toBe(1);
    const overview = await sys.queueOverview();
    expect(overview.recurring.length).toBeGreaterThan(0);
    const queued = await sys.runRecurringNow("system.cleanup");
    const again = await sys.runRecurringNow("system.cleanup");
    expect(queued || again).toBe(true);
    expect(queued && again).toBe(false);
    const rows = await db.select({ id: s.backgroundJobs.id }).from(s.backgroundJobs).where(like(s.backgroundJobs.dedupeKey, "manual:system.cleanup:%"));
    taskIds.push(...rows.map((r) => r.id));
    const health = await sys.databaseHealth();
    expect(health.ok).toBe(true);
    expect(health.version).toBeTruthy();
    expect(Array.isArray(await sys.configurationWarnings(overview))).toBe(true);
  });
});
