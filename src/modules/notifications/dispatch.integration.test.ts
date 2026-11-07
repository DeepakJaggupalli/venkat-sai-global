/**
 * Integration tests for the notification engine against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_opsnotif
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_opsnotif'; npx vitest run src/modules/notifications
 * Messaging transports are replaced by a capturing fake; feature flags are passed explicitly.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

const outbox = vi.hoisted(() => ({
  sent: [] as { channel: "email" | "sms" | "whatsapp"; to: string; subject?: string; text: string; html?: string; headers?: Record<string, string> }[],
  failEmailTo: new Set<string>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

vi.mock("@/modules/messaging", () => ({
  sendEmail: async (m: { to: string; subject: string; text: string; html: string; headers?: Record<string, string> }) => {
    if (outbox.failEmailTo.has(m.to)) return { ok: false, provider: "test", error: "Mailbox unavailable" };
    outbox.sent.push({ channel: "email", to: m.to, subject: m.subject, text: m.text, html: m.html, headers: m.headers });
    return { ok: true, provider: "test", providerMessageId: randomUUID() };
  },
  sendSms: async (m: { to: string; body: string }) => {
    outbox.sent.push({ channel: "sms", to: m.to, text: m.body });
    return { ok: true, provider: "test" };
  },
  sendWhatsApp: async (m: { to: string; templateName: string; variables: string[] }) => {
    outbox.sent.push({ channel: "whatsapp", to: m.to, subject: m.templateName, text: m.variables.join("|") });
    return { ok: true, provider: "test" };
  },
}));

describe.skipIf(!enabled)("notification engine (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }

  const { and, eq, inArray, sql } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const dispatch = await import("./dispatch");
  const service = await import("./service");
  const queries = await import("./queries");
  const { createUnsubscribeToken } = await import("./unsubscribe");

  const FLAGS = { email: true, sms: false, whatsapp: false };
  const ALL = { email: true, sms: true, whatsapp: true };
  const run = randomUUID().slice(0, 8);
  const createdUsers: string[] = [];
  const createdOrgs: string[] = [];
  const createdRoles: string[] = [];

  async function makeUser(opts: { verified?: boolean; phone?: boolean; status?: "active" | "suspended"; staff?: boolean; locale?: string } = {}) {
    const email = `n-${randomUUID()}@vsg-test.invalid`;
    const [u] = await db
      .insert(s.users)
      .values({
        displayName: `Test person ${createdUsers.length + 1}`,
        email,
        emailVerifiedAt: opts.verified === false ? null : new Date(),
        phone: opts.phone ? `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}` : null,
        phoneVerifiedAt: opts.phone ? new Date() : null,
        status: opts.status ?? "active",
        isStaff: opts.staff ?? false,
        locale: opts.locale ?? "en",
      })
      .returning();
    createdUsers.push(u!.id);
    return u!;
  }

  const deliveriesFor = (dispatchKey: string) => db.select().from(s.notificationDeliveries).where(eq(s.notificationDeliveries.dedupeKey, dispatchKey));
  const inAppFor = (userId: string, dispatchKey: string) =>
    db.select().from(s.notifications).where(and(eq(s.notifications.userId, userId), eq(s.notifications.dedupeKey, dispatchKey)));

  await db.insert(s.languages).values({ code: "en", name: "English" }).onConflictDoNothing();

  beforeEach(() => {
    outbox.sent.length = 0;
    outbox.failEmailTo.clear();
  });

  afterAll(async () => {
    // Only remove what this file created: other test files may be using the same database concurrently.
    if (createdUsers.length) {
      await db.execute(
        sql`delete from background_jobs where type = 'notifications.retry_delivery' and (payload->>'deliveryId')::uuid in (select id from notification_deliveries where user_id in ${sql.raw(`(${createdUsers.map((id) => `'${id}'`).join(",")})`)})`,
      );
      await db.delete(s.notificationDeliveries).where(inArray(s.notificationDeliveries.userId, createdUsers));
      await db.delete(s.notificationTemplates).where(sql`${s.notificationTemplates.eventKey} = 'job.approved'`);
      await db.delete(s.organizationMembers).where(inArray(s.organizationMembers.userId, createdUsers));
      await db.delete(s.userRoles).where(inArray(s.userRoles.userId, createdUsers));
    }
    if (createdOrgs.length) await db.delete(s.organizations).where(inArray(s.organizations.id, createdOrgs));
    if (createdRoles.length) await db.delete(s.roles).where(inArray(s.roles.id, createdRoles));
    if (createdUsers.length) await db.delete(s.users).where(inArray(s.users.id, createdUsers));
    await db.execute(sql`delete from background_jobs where dedupe_key = ${`notify:queue-${run}`}`);
    await pool.end();
  });

  it("writes the in-app notification, sends the email with an unsubscribe link and logs both deliveries", async () => {
    const user = await makeUser();
    const key = `t1-${run}`;
    const summary = await dispatch.dispatchNotification(
      { event: "application.status_changed", recipients: [{ userId: user.id }], data: { jobTitle: "Pipe fitter", code: "VSG-APP-000001", status: "Shortlisted" }, link: "/talent/applications/1" },
      { dispatchKey: key, flags: FLAGS },
    );
    expect(summary).toMatchObject({ recipients: 1, delivered: 1, sent: 1, failed: 0 });

    const [notification] = await inAppFor(user.id, key);
    expect(notification).toMatchObject({ category: "applications", link: "/talent/applications/1" });
    expect(notification!.title).toBe("Update on your application: Pipe fitter");

    const rows = await deliveriesFor(key);
    expect(rows.map((r) => [r.channel, r.status]).sort()).toEqual([
      ["email", "sent"],
      ["in_app", "delivered"],
    ]);
    const email = rows.find((r) => r.channel === "email")!;
    expect(email.recipient).not.toContain(user.email!.split("@")[0]);
    expect(email.notificationId).toBe(notification!.id);

    expect(outbox.sent).toHaveLength(1);
    expect(outbox.sent[0]!.html).toContain("/notifications/unsubscribe?token=");
    expect(outbox.sent[0]!.html).toContain("/talent/applications/1");
    // RFC 8058 one-click headers point at the token-authenticated POST endpoint.
    expect(outbox.sent[0]!.headers).toEqual({
      "List-Unsubscribe": expect.stringMatching(/^<https?:\/\/[^>]+\/api\/v1\/notifications\/unsubscribe\?token=[^>]+>$/),
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("sends no List-Unsubscribe headers for mandatory events or raw email recipients", async () => {
    const user = await makeUser();
    await dispatch.dispatchNotification({ event: "account.password_changed", recipients: [{ userId: user.id }], data: {} }, { dispatchKey: `t1b-${run}`, flags: FLAGS });
    await dispatch.dispatchNotification(
      { event: "enquiry.received", recipients: [{ email: `guest-${randomUUID()}@vsg-test.invalid` }], channels: ["email"], data: { forStaff: false, code: "VSG-ENQ-000001" } },
      { dispatchKey: `t1c-${run}`, flags: FLAGS },
    );
    expect(outbox.sent).toHaveLength(2);
    expect(outbox.sent.every((m) => m.headers === undefined)).toBe(true);
  });

  it("removes a secret invitation link from the stored task payload once it has been dispatched", async () => {
    const { notify } = await import("./index");
    const { tasks } = await import("./tasks");
    const invitee = `invitee-${randomUUID()}@vsg-test.invalid`;
    const key = `invite-${run}`;
    const link = `/invite/${"A1b2C3d4".repeat(5)}xyz`;
    await notify({ event: "org.invitation", recipients: [{ email: invitee }], data: { organizationName: "Test Employer", roleName: "Recruiter" }, link, dedupeKey: key });
    const [job] = await db.select().from(s.backgroundJobs).where(eq(s.backgroundJobs.dedupeKey, `notify:${key}`));
    try {
      expect(job!.payload).toMatchObject({ link });
      await tasks["notifications.dispatch"]!(job!.payload, { taskId: job!.id, attempt: 1, log: () => undefined });
      expect(outbox.sent.find((m) => m.to === invitee)?.html).toContain(link);
      const [after] = await db.select({ payload: s.backgroundJobs.payload }).from(s.backgroundJobs).where(eq(s.backgroundJobs.id, job!.id));
      expect(after!.payload).not.toHaveProperty("link");
      expect(after!.payload).toMatchObject({ event: "org.invitation", recipients: [{ email: invitee }] });
    } finally {
      await db.delete(s.backgroundJobs).where(eq(s.backgroundJobs.id, job!.id));
    }
  });

  it("is idempotent when the same dispatch runs again", async () => {
    const user = await makeUser();
    const key = `t2-${run}`;
    const payload = { event: "job.approved", recipients: [{ userId: user.id }], data: { jobTitle: "Welder" }, link: "/employer/jobs/1" };
    await dispatch.dispatchNotification(payload, { dispatchKey: key, flags: FLAGS });
    const again = await dispatch.dispatchNotification(payload, { dispatchKey: key, flags: FLAGS });
    expect(again).toMatchObject({ delivered: 0, sent: 0, existing: 2 });
    expect(await inAppFor(user.id, key)).toHaveLength(1);
    expect(await deliveriesFor(key)).toHaveLength(2);
    expect(outbox.sent).toHaveLength(1);
  });

  it("honours opt-outs except for mandatory events", async () => {
    const user = await makeUser();
    await service.setPreferences(user.id, [{ category: "applications", channel: "email", enabled: false }]);
    const k1 = `t3a-${run}`;
    await dispatch.dispatchNotification({ event: "application.status_changed", recipients: [{ userId: user.id }], data: {} }, { dispatchKey: k1, flags: FLAGS });
    const rows = await deliveriesFor(k1);
    expect(rows.find((r) => r.channel === "email")).toMatchObject({ status: "skipped", skipReason: "opted_out" });
    expect(rows.find((r) => r.channel === "in_app")).toMatchObject({ status: "delivered" });

    const k2 = `t3b-${run}`;
    await dispatch.dispatchNotification({ event: "application.submitted", recipients: [{ userId: user.id }], data: { jobTitle: "Welder" } }, { dispatchKey: k2, flags: FLAGS });
    expect((await deliveriesFor(k2)).find((r) => r.channel === "email")).toMatchObject({ status: "sent" });
  });

  it("skips unverified emails (except mandatory account messages) and inactive accounts", async () => {
    const unverified = await makeUser({ verified: false });
    const suspended = await makeUser({ status: "suspended" });
    const k1 = `t4a-${run}`;
    await dispatch.dispatchNotification({ event: "job.approved", recipients: [{ userId: unverified.id }, { userId: suspended.id }] }, { dispatchKey: k1, flags: FLAGS });
    const rows = await deliveriesFor(k1);
    expect(rows.find((r) => r.userId === unverified.id && r.channel === "email")).toMatchObject({ status: "skipped", skipReason: "no_address" });
    expect(rows.find((r) => r.userId === suspended.id && r.channel === "in_app")).toMatchObject({ status: "skipped", skipReason: "recipient_inactive" });

    const k2 = `t4b-${run}`;
    await dispatch.dispatchNotification({ event: "account.security_alert", recipients: [{ userId: unverified.id }], data: { summary: "New sign-in." } }, { dispatchKey: k2, flags: FLAGS });
    expect((await deliveriesFor(k2)).find((r) => r.channel === "email")).toMatchObject({ status: "sent" });
  });

  it("sends to raw email recipients without in-app rows or unsubscribe links, and logs disabled channels", async () => {
    const key = `t5-${run}`;
    const address = `guest-${run}@vsg-test.invalid`;
    await dispatch.dispatchNotification(
      { event: "enquiry.received", recipients: [{ email: address, name: "Guest" }], channels: ["email", "sms"], data: { code: "VSG-ENQ-000009", forStaff: false } },
      { dispatchKey: key, flags: FLAGS },
    );
    const rows = await deliveriesFor(key);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: "email", status: "sent", userId: null });
    expect(outbox.sent[0]!.subject).toBe("We received your enquiry VSG-ENQ-000009");
    expect(outbox.sent[0]!.html).not.toContain("unsubscribe?token");

    const phoneKey = `t5b-${run}`;
    await dispatch.dispatchNotification({ event: "enquiry.received", recipients: [{ phone: "+919876500001" }], channels: ["email", "sms"], data: { code: "X" } }, { dispatchKey: phoneKey, flags: FLAGS });
    expect(await deliveriesFor(phoneKey)).toEqual([expect.objectContaining({ channel: "sms", status: "skipped", skipReason: "channel_disabled" })]);
  });

  it("sends SMS when the flag is on and skips WhatsApp without consent", async () => {
    const user = await makeUser({ phone: true });
    const key = `t6-${run}`;
    await dispatch.dispatchNotification(
      { event: "interview.scheduled", recipients: [{ userId: user.id }], channels: ["sms", "whatsapp"], data: { jobTitle: "Rigger", startsAt: "2026-11-20T04:30:00.000Z" } },
      { dispatchKey: key, flags: ALL },
    );
    const rows = await deliveriesFor(key);
    expect(rows.find((r) => r.channel === "sms")).toMatchObject({ status: "sent" });
    expect(rows.find((r) => r.channel === "whatsapp")).toMatchObject({ status: "skipped", skipReason: "no_consent" });
    expect(outbox.sent.find((m) => m.channel === "sms")!.text).toContain("Rigger");
  });

  it("records failures, schedules a retry with backoff and completes it later", async () => {
    const user = await makeUser();
    outbox.failEmailTo.add(user.email!);
    const key = `t7-${run}`;
    const payload = { event: "job.approved", recipients: [{ userId: user.id }], data: { jobTitle: "Electrician" } };
    const summary = await dispatch.dispatchNotification(payload, { dispatchKey: key, flags: FLAGS });
    expect(summary.failed).toBe(1);
    const failed = (await deliveriesFor(key)).find((r) => r.channel === "email")!;
    expect(failed).toMatchObject({ status: "failed", attempts: 1, lastError: "Mailbox unavailable" });

    const [task] = await db.select().from(s.backgroundJobs).where(eq(s.backgroundJobs.dedupeKey, `notifications.retry:${failed.id}:1`));
    expect(task).toBeDefined();
    expect(task!.runAt.getTime()).toBeGreaterThan(Date.now() + 30_000);

    outbox.failEmailTo.clear();
    expect(await dispatch.retryDelivery(task!.payload, { flags: FLAGS })).toBe("sent");
    const [after] = await db.select().from(s.notificationDeliveries).where(eq(s.notificationDeliveries.id, failed.id));
    expect(after).toMatchObject({ status: "sent", attempts: 2, lastError: null });
    expect(await dispatch.retryDelivery(task!.payload, { flags: FLAGS })).toBe("noop");
  });

  it("uses an active database template override and records its version", async () => {
    const user = await makeUser();
    const [template] = await db
      .insert(s.notificationTemplates)
      .values({ eventKey: "job.approved", channel: "in_app", locale: "en", subject: "Approved: {{jobTitle}}", body: "Custom body for {{jobTitle}}.", version: 3 })
      .onConflictDoUpdate({
        target: [s.notificationTemplates.eventKey, s.notificationTemplates.channel, s.notificationTemplates.locale],
        set: { subject: "Approved: {{jobTitle}}", body: "Custom body for {{jobTitle}}.", version: 3, isActive: true },
      })
      .returning();
    const key = `t8-${run}`;
    await dispatch.dispatchNotification({ event: "job.approved", recipients: [{ userId: user.id }], data: { jobTitle: "Fabricator" }, channels: ["in_app"] }, { dispatchKey: key, flags: FLAGS });
    const [n] = await inAppFor(user.id, key);
    expect(n).toMatchObject({ title: "Approved: Fabricator", body: "Custom body for Fabricator." });
    expect((await deliveriesFor(key))[0]).toMatchObject({ templateId: template!.id, templateVersion: 3 });
    // Leave no active override behind for later tests (the delivery keeps the template id until then).
    await db.update(s.notificationTemplates).set({ isActive: false }).where(eq(s.notificationTemplates.id, template!.id));
  });

  it("fans out to staff holding a permission (super admins included) and to organisation members", async () => {
    const staffWithPerm = await makeUser({ staff: true });
    const staffWithout = await makeUser({ staff: true });
    const superAdmin = await makeUser({ staff: true });
    const notStaff = await makeUser();
    const roles = await db
      .insert(s.roles)
      .values([
        { scope: "platform", key: `leads-${run}`, name: "Leads", permissions: ["leads.view"] },
        { scope: "platform", key: `other-${run}`, name: "Other", permissions: ["jobs.view"] },
      ])
      .returning();
    createdRoles.push(...roles.map((r) => r.id));
    let [sa] = await db.select().from(s.roles).where(and(eq(s.roles.scope, "platform"), eq(s.roles.key, "super_admin")));
    if (!sa) {
      [sa] = await db.insert(s.roles).values({ scope: "platform", key: "super_admin", name: "Super Admin", permissions: [] }).returning();
      createdRoles.push(sa!.id);
    }
    await db.insert(s.userRoles).values([
      { userId: staffWithPerm.id, roleId: roles[0]!.id },
      { userId: staffWithout.id, roleId: roles[1]!.id },
      { userId: superAdmin.id, roleId: sa!.id },
      { userId: notStaff.id, roleId: roles[0]!.id },
    ]);
    const staffIds = await dispatch.resolveStaffRecipients("leads.view");
    expect(staffIds).toEqual(expect.arrayContaining([staffWithPerm.id, superAdmin.id]));
    expect(staffIds).not.toContain(staffWithout.id);
    expect(staffIds).not.toContain(notStaff.id);

    const [org] = await db.insert(s.organizations).values({ type: "employer", name: `Org ${run}`, slug: `org-${run}` }).returning();
    createdOrgs.push(org!.id);
    const orgRoles = await db
      .insert(s.roles)
      .values([
        { scope: "employer", key: `req-${run}`, name: "Req", permissions: ["employer.requirements.manage"] },
        { scope: "employer", key: `view-${run}`, name: "View", permissions: ["employer.dashboard"] },
      ])
      .returning();
    createdRoles.push(...orgRoles.map((r) => r.id));
    const m1 = await makeUser();
    const m2 = await makeUser();
    await db.insert(s.organizationMembers).values([
      { organizationId: org!.id, userId: m1.id, roleId: orgRoles[0]!.id },
      { organizationId: org!.id, userId: m2.id, roleId: orgRoles[1]!.id },
    ]);
    expect(await dispatch.resolveOrganizationRecipients(org!.id, "employer.requirements.manage")).toEqual([m1.id]);
    expect((await dispatch.resolveOrganizationRecipients(org!.id)).sort()).toEqual([m1.id, m2.id].sort());

    const key = `t9-${run}`;
    await dispatch.dispatchToOrganization(
      { event: "requirement.status_changed", organizationId: org!.id, permission: "employer.requirements.manage", data: { code: "VSG-REQ-1", title: "T", status: "Approved" } },
      { dispatchKey: key, flags: FLAGS },
    );
    const [n] = await inAppFor(m1.id, key);
    expect(n).toMatchObject({ organizationId: org!.id });
    expect(await inAppFor(m2.id, key)).toHaveLength(0);
  });

  it("applies one-click unsubscribe tokens and then skips that category by email", async () => {
    const user = await makeUser();
    const token = createUnsubscribeToken({ userId: user.id, category: "job_alerts" });
    expect(await service.unsubscribeWithToken(token)).toMatchObject({ category: "job_alerts", alreadyUnsubscribed: false });
    expect(await service.unsubscribeWithToken(token)).toMatchObject({ alreadyUnsubscribed: true });
    const [pref] = await db.select().from(s.notificationPreferences).where(eq(s.notificationPreferences.userId, user.id));
    expect(pref).toMatchObject({ category: "job_alerts", channel: "email", enabled: false, source: "unsubscribe_link" });

    const key = `t10-${run}`;
    await dispatch.dispatchNotification({ event: "job.alert_digest", recipients: [{ userId: user.id }], data: { count: 2 } }, { dispatchKey: key, flags: FLAGS });
    expect((await deliveriesFor(key)).find((r) => r.channel === "email")).toMatchObject({ status: "skipped", skipReason: "opted_out" });
  });

  it("runs notify() payloads through the task handlers once per dedupe key", async () => {
    const { notify } = await import("./index");
    const { tasks } = await import("./tasks");
    const user = await makeUser();
    const key = `queue-${run}`;
    await notify({ event: "job.approved", recipients: [{ userId: user.id }], data: { jobTitle: "Queue test" }, channels: ["in_app"], dedupeKey: key });
    await notify({ event: "job.approved", recipients: [{ userId: user.id }], data: { jobTitle: "Queue test" }, channels: ["in_app"], dedupeKey: key });
    const jobs = await db.select().from(s.backgroundJobs).where(eq(s.backgroundJobs.dedupeKey, `notify:${key}`));
    expect(jobs).toHaveLength(1);
    const ctx = { taskId: jobs[0]!.id, attempt: 1, log: () => undefined };
    await tasks["notifications.dispatch"]!(jobs[0]!.payload, ctx);
    await tasks["notifications.dispatch"]!(jobs[0]!.payload, ctx);
    const rows = await inAppFor(user.id, key);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Job published: Queue test");
  });

  it("scopes inbox reads and writes to the owner and builds the preference matrix", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const key = `t11-${run}`;
    await dispatch.dispatchNotification({ event: "job.approved", recipients: [{ userId: owner.id }], channels: ["in_app"] }, { dispatchKey: key, flags: FLAGS });
    const [n] = await inAppFor(owner.id, key);
    expect(await service.markRead(other.id, [n!.id])).toBe(0);
    expect(await queries.unreadCount(owner.id)).toBe(1);
    expect(await service.markRead(owner.id, [n!.id])).toBe(1);
    expect(await queries.unreadCount(owner.id)).toBe(0);
    expect(await service.archive(owner.id, [n!.id])).toBe(1);
    expect((await queries.listNotifications(owner.id, {}, { page: 1, pageSize: 20, offset: 0 })).total).toBe(0);
    expect((await queries.listNotifications(owner.id, { filter: "archived" }, { page: 1, pageSize: 20, offset: 0 })).total).toBe(1);
    const summary = await queries.getNotificationSummary(owner.id);
    expect(summary).toEqual({ unreadCount: 0, items: [] });

    await service.setPreferences(owner.id, [
      { category: "job_alerts", channel: "email", enabled: false },
      { category: "account", channel: "email", enabled: true },
    ]);
    const stored = await db.select().from(s.notificationPreferences).where(eq(s.notificationPreferences.userId, owner.id));
    expect(stored).toEqual([expect.objectContaining({ category: "job_alerts", channel: "email", enabled: false })]);
    const matrix = await queries.getPreferenceMatrix(owner.id);
    expect(matrix.categories.map((c) => c.category)).not.toContain("billing");
    const alerts = matrix.categories.find((c) => c.category === "job_alerts")!.cells.find((c) => c.channel === "email")!;
    expect(alerts).toMatchObject({ enabled: false, defaultEnabled: true, customised: true });
    const account = matrix.categories.find((c) => c.category === "account")!.cells.find((c) => c.channel === "email")!;
    expect(account.lockedEvents).toContain("Password changed");
  });
});
