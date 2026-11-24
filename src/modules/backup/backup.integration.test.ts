/**
 * Business data backup (workbook, masking, caps, daily email, download logging, settings) against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_t_backup
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_t_backup npx vitest run src/modules/backup --no-file-parallelism
 *   node scripts/test-db.mjs vsg_t_backup --drop
 * (Throwaway databases named vsg_t_*, vsg_test_* or vsg_r_* — never the main one.)
 */
import { randomUUID } from "node:crypto";

import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { EmailMessage } from "@/modules/messaging";

const enabled = /\/vsg_(?:t|test|r)_[a-z0-9_]+(\?|$)/.test(process.env.DATABASE_URL ?? "");

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

// Capture every email (the real dev transport still stores it in the dev outbox) so the attachment can be opened.
const mail = vi.hoisted(() => ({ sent: [] as EmailMessage[], failNext: null as string | null }));
vi.mock("@/modules/messaging", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/modules/messaging")>();
  return {
    ...real,
    sendEmail: async (m: EmailMessage) => {
      mail.sent.push(m);
      if (mail.failNext) {
        const error = mail.failNext;
        mail.failNext = null;
        return { ok: false as const, provider: "smtp", error };
      }
      return real.sendEmail(m);
    },
  };
});

async function open(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return wb;
}

/** Cells of the row whose column `header` equals `value`, keyed by header. */
function findRow(ws: ExcelJS.Worksheet, header: string, value: string): Record<string, unknown> | null {
  // values is 1-based (index 0 is empty), so a header's index is its column number.
  const headers = (ws.getRow(3).values as unknown[]).map((v) => String(v ?? ""));
  const col = headers.indexOf(header);
  if (col < 1) throw new Error(`No column "${header}" in ${ws.name}`);
  for (let r = 4; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (String(row.getCell(col).value ?? "") === value) return Object.fromEntries(headers.flatMap((h, i) => (h ? [[h, row.getCell(i).value]] : [])));
  }
  return null;
}

describe.skipIf(!enabled)("business data backup (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_t_* or vsg_test_* database", () => undefined);
    return;
  }

  const { and, desc, eq, inArray, sql } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { encryptField } = await import("@/lib/crypto");
  const { setSetting } = await import("@/modules/settings");
  const service = await import("./service");
  const { BACKUP_DAILY_TASK } = await import("./schemas");
  const { staffContext } = await import("@/modules/candidates/test-fixtures");

  const RUN = randomUUID().slice(0, 6).toUpperCase();
  const tag = (prefix: string) => `${prefix}-${RUN}`;
  const phone = () => `+9197${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  // Scheduler buckets unique to this run (a far-future day), so re-running against the same database never meets a
  // day the once-per-day guard already used.
  const BASE_DAY = Date.UTC(2100 + Math.floor(Math.random() * 800), Math.floor(Math.random() * 12), 1);
  const runAt = (day: number) => new Date(BASE_DAY + day * 86_400_000 + 5_000).toISOString();
  const keyOf = (iso: string) => iso.slice(0, 10);
  const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const SHEETS = [
    "CV submissions",
    "Requirement posters",
    "Job applications",
    "Manpower requests",
    "Booking dates",
    "Bookings",
    "Referrers",
    "Referral payouts",
    "Worker reviews",
    "Leads",
    "Enquiries",
    "Organisations",
    "Resume requests",
  ];
  let cvPhone = "";
  // Settings this suite changes; restored afterwards so other suites sharing the database see their usual values.
  const TOUCHED_SETTINGS = ["backup.daily_email_enabled", "backup.daily_email_to", "notifications.business_inbox_email"];
  let savedSettings: (typeof s.platformSettings.$inferSelect)[] = [];

  beforeAll(async () => {
    savedSettings = await db.select().from(s.platformSettings).where(inArray(s.platformSettings.key, TOUCHED_SETTINGS));
    await db.insert(s.currencies).values({ code: "AED", name: "UAE dirham", symbol: "AED", minorUnits: 2 }).onConflictDoNothing();
    await db.insert(s.countries).values([{ code: "QA", name: "Qatar", isDestination: true }, { code: "IN", name: "India", isDestination: false }]).onConflictDoNothing();

    const [poster] = await db
      .insert(s.cmsEntries)
      .values({
        collection: "requirement_posts",
        slug: `pipe-welders-qatar-${RUN.toLowerCase()}`,
        title: `Pipe welders for Qatar ${RUN}`,
        status: "published",
        publishedAt: new Date(),
        publishedVersion: 1,
        currentVersion: 1,
        data: { countryCode: "QA", trades: [{ trade: "TIG welder" }, { trade: "Pipe fitter" }] },
      })
      .returning();
    const [agency] = await db.insert(s.organizations).values({ type: "employer", employerKind: "travel_agency", name: `Gulf Travels ${RUN}`, slug: `gulf-travels-${RUN.toLowerCase()}`, status: "verified", email: "ops@gulf-travels.invalid", phone: "+97140000000", countryCode: "QA" }).returning();
    await db.insert(s.organizations).values({ type: "employer", employerKind: "direct_company", name: `Demo Company ${RUN}`, slug: `demo-company-${RUN.toLowerCase()}`, status: "verified", metadata: { demoAccount: true } });
    cvPhone = phone();
    const [cv] = await db
      .insert(s.cvSubmissions)
      .values({
        code: tag("VSG-CV-B"),
        name: "Ravi Kumar Reddy",
        phone: cvPhone,
        email: "ravi.kumar@vsg-test.invalid",
        tradeLabel: "TIG welder",
        experienceYears: 8,
        experienceAbroadYears: 5,
        experienceIndiaYears: 3,
        preferredCountryCode: "QA",
        hasPassport: true,
        passportNumberEncrypted: encryptField("Z1234567"),
        passportNumberLast4: "4567",
        passportExpiry: "2028-01-31",
        candidateNotes: "=HYPERLINK(\"http://evil\")",
        staffRemarks: "Strong 6G welder",
        requirementEntryId: poster!.id,
        requirementTitle: poster!.title,
        status: "departed",
        referralCode: tag("R").replace(/-/g, ""),
        placedOrganizationId: agency!.id,
        consentToContact: true,
      })
      .returning();
    await db.insert(s.cvSubmissions).values({ code: tag("VSG-CV-C"), name: "Second Candidate", phone: phone(), tradeLabel: "Electrician", consentToContact: true });

    const [slot] = await db
      .insert(s.bookingSlots)
      .values({ code: tag("VSG-SLT"), kind: "trade_test", title: "6G pipe welding test", trade: "Pipe welder 6G", date: "2026-12-05", startTime: "09:30", venue: "Autonagar office", capacity: 10, bookedSeats: 2 })
      .returning();
    await db.insert(s.slotBookings).values({ code: tag("VSG-BKG"), slotId: slot!.id, name: "Agency contact", phone: phone(), trade: "Pipe welder", organizationName: "Gulf Travels", seats: 2, consentToContact: true });

    const [referrer] = await db.insert(s.referrers).values({ code: tag("R").replace(/-/g, ""), name: "Suresh Babu", phone: phone() }).returning();
    await db.insert(s.referralPayouts).values({ cvSubmissionId: cv!.id, referrerId: referrer!.id, amountMinor: 150_000, currency: "AED", note: "UPI ref 4521" });
    await db.insert(s.workerReviews).values({ cvSubmissionId: cv!.id, displayName: "Ravi R.", trade: "TIG welder", countryCode: "QA", rating: 5, body: "Good team.", consentToPublish: true, status: "pending" });
    await db.insert(s.leads).values({ code: tag("VSG-LEAD"), type: "employer", source: "whatsapp", name: "Lead person", phone: phone(), estimatedValueMinor: 500_000, estimatedValueCurrency: "AED" });
    await db.insert(s.enquiries).values({ code: tag("VSG-ENQ"), name: "Enquiry person", phone: phone(), message: "Need 20 welders" });
    await db.insert(s.requirementRequests).values({ code: tag("VSG-REQ"), source: "public_form", title: "20 welders for Doha", contactName: "HR manager", contactPhone: phone(), totalPositions: 20, countryCode: "QA", submittedAt: new Date() });
    await db.insert(s.resumeRequests).values({ code: tag("VSG-RES"), name: "Resume person", phone: phone(), details: {}, passportNumberEncrypted: encryptField("K7654321"), passportNumberLast4: "4321", consentToContact: true });

    await setSetting("backup.daily_email_enabled", true, null);
    await setSetting("backup.daily_email_to", "", null);
    await setSetting("notifications.business_inbox_email", "owner@vsg-test.invalid", null);
  });

  beforeEach(() => {
    mail.failNext = null;
  });

  afterAll(async () => {
    await db.delete(s.platformSettings).where(inArray(s.platformSettings.key, TOUCHED_SETTINGS));
    if (savedSettings.length) await db.insert(s.platformSettings).values(savedSettings);
    await pool.end();
  });

  it("builds one sheet per area with the CV columns in the agreed order, passports masked by default", async () => {
    const backup = await service.buildBackupWorkbook({ fullPassport: false });
    expect(backup.filename).toMatch(/^venkat-sai-full-backup-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(backup.sheets.map((x) => x.sheetName)).toEqual(SHEETS);

    const wb = await open(backup.bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(SHEETS);
    const cvSheet = wb.getWorksheet("CV submissions")!;
    expect((cvSheet.getRow(3).values as unknown[]).slice(1, 19)).toEqual([
      "S.No",
      "Name",
      "Trade",
      "Passport No",
      "Exp Abroad (yrs)",
      "Exp India (yrs)",
      "Email",
      "Phone",
      "Applied for",
      "Status",
      "Source",
      "Applied on",
      "Preferred country",
      "Passport expiry",
      "Candidate notes",
      "Staff remarks",
      "Code",
      "Total exp (yrs)",
    ]);
    const cv = findRow(cvSheet, "Code", tag("VSG-CV-B"))!;
    expect(cv).toMatchObject({
      Name: "Ravi Kumar Reddy",
      Trade: "TIG welder",
      "Passport No": "XXXX4567",
      "Exp Abroad (yrs)": 5,
      "Exp India (yrs)": 3,
      Email: "ravi.kumar@vsg-test.invalid",
      Phone: cvPhone,
      "Applied for": `Pipe welders for Qatar ${RUN}`,
      Source: "Website",
      "Preferred country": "Qatar",
      "Passport expiry": "2028-01-31",
      "Candidate notes": "'=HYPERLINK(\"http://evil\")",
      "Staff remarks": "Strong 6G welder",
      "Placed with": `Gulf Travels ${RUN}`,
      "CV file": "No",
    });
    // Nothing in the masked workbook carries the full passport numbers.
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((cell) => expect(String(cell.value)).not.toMatch(/Z1234567|K7654321/))));

    const poster = findRow(wb.getWorksheet("Requirement posters")!, "Title", `Pipe welders for Qatar ${RUN}`)!;
    expect(poster).toMatchObject({ Country: "Qatar", Trades: "TIG welder, Pipe fitter", Applicants: 1 });
    expect(String(poster["Web link"])).toContain(`/requirements/pipe-welders-qatar-${RUN.toLowerCase()}`);
    expect(findRow(wb.getWorksheet("Booking dates")!, "Code", tag("VSG-SLT"))).toMatchObject({ Date: "2026-12-05", Seats: 10, Booked: 2 });
    expect(findRow(wb.getWorksheet("Bookings")!, "Booking code", tag("VSG-BKG"))).toMatchObject({ Seats: 2, "Company / agency": "Gulf Travels", "Date code": tag("VSG-SLT") });
    expect(findRow(wb.getWorksheet("Referrers")!, "Code", tag("R").replace(/-/g, ""))).toMatchObject({ Name: "Suresh Babu", "People who sent a CV": 1 });
    const payout = findRow(wb.getWorksheet("Referral payouts")!, "CV reference", tag("VSG-CV-B"))!;
    expect(payout).toMatchObject({ Currency: "AED", Note: "UPI ref 4521" });
    expect(String(payout["Amount paid"])).toContain("1,500");
    expect(findRow(wb.getWorksheet("Worker reviews")!, "CV reference", tag("VSG-CV-B"))).toMatchObject({ Stars: 5, "Allowed on website": "Yes" });
    expect(findRow(wb.getWorksheet("Leads")!, "Code", tag("VSG-LEAD"))).toMatchObject({ "Came from": "WhatsApp" });
    expect(findRow(wb.getWorksheet("Enquiries")!, "Code", tag("VSG-ENQ"))).toMatchObject({ Message: "Need 20 welders" });
    expect(findRow(wb.getWorksheet("Manpower requests")!, "Code", tag("VSG-REQ"))).toMatchObject({ "Workers needed": 20, Country: "Qatar" });
    const realOrg = findRow(wb.getWorksheet("Organisations")!, "Name", `Gulf Travels ${RUN}`)!;
    expect(realOrg).toMatchObject({ Type: "Travel agency", Phone: "+97140000000" });
    expect(realOrg["Demo account"] ?? "").toBe("");
    expect(findRow(wb.getWorksheet("Organisations")!, "Name", `Demo Company ${RUN}`)).toMatchObject({ Type: "Company / HR", "Demo account": "Yes (for testing)" });
    expect(findRow(wb.getWorksheet("Resume requests")!, "Code", tag("VSG-RES"))).toMatchObject({ "Passport No": "XXXX4321", Price: "Price on request" });
    expect(String(wb.getWorksheet("Job applications")!.getCell("A1").value)).toContain("Venkat Sai");
  });

  it("includes full passport numbers only when asked, and caps each sheet with a visible note", async () => {
    const full = await open((await service.buildBackupWorkbook({ fullPassport: true })).bytes);
    expect(findRow(full.getWorksheet("CV submissions")!, "Code", tag("VSG-CV-B"))!["Passport No"]).toBe("Z1234567");
    expect(findRow(full.getWorksheet("Resume requests")!, "Code", tag("VSG-RES"))!["Passport No"]).toBe("K7654321");

    const capped = await service.buildBackupWorkbook({ fullPassport: false, maxRowsPerSheet: 1 });
    const cvSummary = capped.sheets.find((x) => x.sheetName === "CV submissions")!;
    expect(cvSummary).toMatchObject({ rows: 1, truncated: true });
    expect(cvSummary.total).toBeGreaterThanOrEqual(2);
    const ws = (await open(capped.bytes)).getWorksheet("CV submissions")!;
    expect(String(ws.getCell("A2").value)).toContain(`Showing the first 1 of ${cvSummary.total.toLocaleString("en-IN")} rows`);
    expect(ws.rowCount).toBe(4);
  });

  it("emails the daily backup once per day with passports masked, then respects the switch and the address", async () => {
    mail.sent.length = 0;
    const scheduledFor = runAt(0);
    const outcome = await service.runDailyBackupEmail({ scheduledFor });
    expect(outcome).toMatchObject({ status: "sent", to: "owner@vsg-test.invalid", attached: true, provider: "dev", runKey: keyOf(runAt(0)) });
    expect(mail.sent).toHaveLength(1);
    const message = mail.sent[0]!;
    expect(message.subject).toMatch(/^Daily backup of your business data, /);
    expect(message.text).toContain("CV submissions:");
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments![0]).toMatchObject({ contentType: XLSX });
    expect(message.attachments![0]!.filename).toMatch(/^venkat-sai-full-backup-.*\.xlsx$/);
    const attached = await open(message.attachments![0]!.content);
    expect(findRow(attached.getWorksheet("CV submissions")!, "Code", tag("VSG-CV-B"))!["Passport No"]).toBe("XXXX4567");

    // The dev outbox keeps the attachment's name and size, never its bytes.
    const [outbox] = await db.select().from(s.devOutbox).where(eq(s.devOutbox.to, "owner@vsg-test.invalid")).orderBy(desc(s.devOutbox.createdAt)).limit(1);
    const meta = outbox!.metadata as { attachments?: { filename: string; sizeBytes: number; contentType: string }[] };
    expect(meta.attachments?.[0]).toMatchObject({ contentType: XLSX, sizeBytes: message.attachments![0]!.content.byteLength });
    expect(JSON.stringify(outbox!.metadata)).not.toContain("UEsDB"); // no base64 zip bytes

    const [logged] = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "backup.emailed"), sql`${s.auditLogs.metadata}->>'runKey' = ${keyOf(runAt(0))}`));
    expect(logged).toMatchObject({ actorType: "system" });
    expect(logged!.metadata).toMatchObject({ trigger: "daily", attached: true, transport: "dev" });
    expect(String((logged!.metadata as { to: string }).to)).not.toBe("owner@vsg-test.invalid");

    // A retry or "Run now" the same day sends nothing again.
    expect(await service.runDailyBackupEmail({ scheduledFor })).toMatchObject({ status: "already_sent" });
    expect(mail.sent).toHaveLength(1);

    // Its own address wins over the business inbox.
    await setSetting("backup.daily_email_to", "backup-box@vsg-test.invalid", null);
    expect(await service.runDailyBackupEmail({ scheduledFor: runAt(1) })).toMatchObject({ status: "sent", to: "backup-box@vsg-test.invalid" });

    await setSetting("backup.daily_email_enabled", false, null);
    expect(await service.runDailyBackupEmail({ scheduledFor: runAt(2) })).toEqual({ status: "disabled" });

    await setSetting("backup.daily_email_enabled", true, null);
    await setSetting("backup.daily_email_to", "", null);
    await setSetting("notifications.business_inbox_email", "", null);
    expect(await service.runDailyBackupEmail({ scheduledFor: runAt(2) })).toEqual({ status: "no_recipient" });
    await setSetting("notifications.business_inbox_email", "owner@vsg-test.invalid", null);
    expect(mail.sent).toHaveLength(2);
  });

  it("records a failed send and throws so the task queue retries", async () => {
    mail.failNext = "SMTP 535: Invalid login";
    await expect(service.runDailyBackupEmail({ scheduledFor: runAt(3) })).rejects.toThrow(/Invalid login/);
    const [failed] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "backup.email_failed")).orderBy(desc(s.auditLogs.id)).limit(1);
    expect(failed!.metadata).toMatchObject({ trigger: "daily", runKey: keyOf(runAt(3)), provider: "smtp", error: "SMTP 535: Invalid login" });
    // The retry goes through (the failure did not mark the day as sent).
    expect(await service.runDailyBackupEmail({ scheduledFor: runAt(3) })).toMatchObject({ status: "sent" });

    const owner = await staffContext("settings.security");
    const overview = await service.getBackupOverview(owner);
    expect(overview.lastSent).not.toBeNull();
    expect(overview.lastFailure).toBeNull(); // the retry succeeded after the failure
    expect(overview.sheets.map((x) => x.sheetName)).toEqual(SHEETS);
    expect(overview.sheets.find((x) => x.key === "cv_submissions")!.rows).toBeGreaterThanOrEqual(2);
  });

  it("is registered with the task queue and runs from the scheduler payload", async () => {
    const { taskHandlers } = await import("@/server/tasks/registry");
    expect(typeof taskHandlers[BACKUP_DAILY_TASK]).toBe("function");
    mail.sent.length = 0;
    const log = vi.fn();
    await taskHandlers[BACKUP_DAILY_TASK]!({ scheduledFor: runAt(4) }, { taskId: 1, attempt: 1, log });
    expect(mail.sent).toHaveLength(1);
    expect(log).toHaveBeenCalledWith("Daily backup email finished", expect.objectContaining({ status: "sent", attached: true }));
  });

  it("lets only the Super Admin download, logs it, and shows full passports only with the documents permission", async () => {
    const owner = await staffContext("settings.security", "candidates.view_documents", "candidates.view_contact");
    const backup = await service.downloadFullBackup(owner);
    expect(findRow((await open(backup.bytes)).getWorksheet("CV submissions")!, "Code", tag("VSG-CV-B"))!["Passport No"]).toBe("Z1234567");
    const [access] = await db.select().from(s.dataAccessLogs).where(and(eq(s.dataAccessLogs.actorUserId, owner.user.id), eq(s.dataAccessLogs.subjectId, "full_backup")));
    expect(access).toMatchObject({ accessType: "export", dataCategory: "identity", subjectType: "export" });
    expect(access!.metadata).toMatchObject({ fullPassportNumbers: true, fullPhoneNumbers: true });
    const [audited] = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "export.downloaded"), eq(s.auditLogs.actorUserId, owner.user.id)));
    expect(audited!.metadata).toMatchObject({ list: "full_backup", fullPassportNumbers: true });

    // settings.security without the documents and contact permissions: masked passports, phones and emails.
    const limited = await staffContext("settings.security");
    const masked = findRow((await open((await service.downloadFullBackup(limited)).bytes)).getWorksheet("CV submissions")!, "Code", tag("VSG-CV-B"))!;
    expect(masked["Passport No"]).toBe("XXXX4567");
    expect(masked.Phone).not.toBe(cvPhone);
    expect(masked.Email).not.toBe("ravi.kumar@vsg-test.invalid");

    // An Administrator-style role (everything but the security permission) is refused.
    const admin = await staffContext("settings.manage", "candidates.view", "candidates.view_documents", "candidates.export");
    await expect(service.downloadFullBackup(admin)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.emailBackupNow(admin)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.saveBackupSettings(admin, { dailyEmail: false, emailTo: "x@vsg-test.invalid" })).rejects.toMatchObject({ code: "forbidden" });

    const activity = await service.listBackupActivity(20);
    expect(activity.some((a) => a.kind === "downloaded" && a.fullPassportNumbers)).toBe(true);
    expect(activity.some((a) => a.kind === "emailed")).toBe(true);
  });

  it("saves the daily email settings (audited) and keeps the generic settings form away from them", async () => {
    const owner = await staffContext("settings.security");
    expect(await service.saveBackupSettings(owner, { dailyEmail: false, emailTo: "backup-box@vsg-test.invalid" })).toEqual({ changed: 2 });
    expect(await service.getBackupSettings()).toMatchObject({ dailyEmail: false, emailTo: "backup-box@vsg-test.invalid", recipient: { email: "backup-box@vsg-test.invalid", source: "backup" } });
    expect(await service.saveBackupSettings(owner, { dailyEmail: false, emailTo: "backup-box@vsg-test.invalid" })).toEqual({ changed: 0 });
    const changes = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "settings.updated"), eq(s.auditLogs.actorUserId, owner.user.id)));
    expect(changes.map((c) => c.entityId).sort()).toEqual(["backup.daily_email_enabled", "backup.daily_email_to"]);

    const manual = await service.emailBackupNow(owner);
    expect(manual).toMatchObject({ status: "sent", to: "backup-box@vsg-test.invalid" });
    const [manualLog] = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "backup.emailed"), eq(s.auditLogs.actorUserId, owner.user.id)));
    expect(manualLog).toMatchObject({ actorType: "staff" });
    expect(manualLog!.metadata).toMatchObject({ trigger: "manual" });

    const { editPermissionFor } = await import("@/app/admin/settings/_lib/settings-admin");
    expect(editPermissionFor("Backup")).toBe("settings.security");
    expect(editPermissionFor("Security")).toBe("settings.security");
    // The daily backup falls back to the business inbox: changing it needs the same permission as the backup address.
    expect(editPermissionFor("Notifications")).toBe("settings.security");
    expect(editPermissionFor("Recruitment")).toBe("settings.manage");

    await setSetting("backup.daily_email_enabled", true, null);
    await setSetting("backup.daily_email_to", "", null);
  });
});
