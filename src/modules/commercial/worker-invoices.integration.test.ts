/**
 * Per-worker invoices (travel agencies and companies) against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_t_invoices
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_t_invoices npx vitest run src/modules/commercial/worker-invoices --no-file-parallelism
 *   node scripts/test-db.mjs vsg_t_invoices --drop
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /\/vsg_(?:t|test|r)_[a-z0-9_]+/.test(process.env.DATABASE_URL ?? "");

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("worker invoices (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_t_* / vsg_r_* / vsg_test_* database", () => undefined);
    return;
  }

  const { and, eq, inArray } = await import("drizzle-orm");
  const { PDFDocument } = await import("pdf-lib");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { setSetting } = await import("@/modules/settings");
  const fx = await import("@/modules/organizations/testing");
  const schemas = await import("./schemas");
  const service = await import("./service");
  const { saveDraftInvoiceTx } = await import("./invoices");
  const { getInvoiceForStaff } = await import("./queries");
  const wi = await import("./worker-invoices");
  const { renderInvoicePdf } = await import("./worker-invoices-pdf");
  const { workerInvoiceFormSchema } = await import("./worker-invoices-schemas");

  type StaffCtx = ReturnType<typeof fx.staffContext>;
  let staff: StaffCtx;
  const run = randomUUID().slice(0, 8);
  let counter = 0;

  async function makeEmployer(kind: "travel_agency" | "direct_company", name: string) {
    counter += 1;
    const [org] = await db.insert(s.organizations).values({ type: "employer", employerKind: kind, name, slug: `wi-${run}-${counter}`, status: "verified", countryCode: "IN", phone: "+919000000001" }).returning();
    return org!;
  }

  async function addProfile(organizationId: string, currency = "INR") {
    return service.upsertBillingProfile(
      staff,
      schemas.billingProfileFormSchema.parse({ organizationId, legalName: "Buyer Travels Private Limited", billingEmail: `billing-${randomUUID().slice(0, 6)}@vsg-test.invalid`, addressLine1: "1 Beach Road", city: "Visakhapatnam", stateCode: "37", countryCode: "IN", currency }),
    );
  }

  async function worker(over: Partial<typeof s.cvSubmissions.$inferInsert> = {}) {
    counter += 1;
    const [row] = await db
      .insert(s.cvSubmissions)
      .values({ code: `VSG-CV-T${run}${counter}`, name: `Worker ${run} ${counter}`, phone: "+919700000000", tradeLabel: "TIG welder", status: "selected", consentToContact: true, statusChangedAt: new Date(), ...over })
      .returning();
    return row!;
  }

  const form = (input: Record<string, unknown>) => workerInvoiceFormSchema.parse(input);

  let agency: Awaited<ReturnType<typeof makeEmployer>>;
  let company: Awaited<ReturnType<typeof makeEmployer>>;

  beforeAll(async () => {
    await fx.seedReferenceData();
    await service.seedDefaultTaxRates();
    const staffUser = await fx.createUser({ isStaff: true, displayName: "Finance Staff" });
    staff = fx.staffContext(staffUser);
    const sellerDetails = { legalName: "Seller Test Entity", address: "Autonagar, Visakhapatnam", taxId: "37ABCDE1234F1Z5", stateCode: "37" };
    await setSetting("commercial.seller_details", sellerDetails as unknown as Parameters<typeof setSetting<"commercial.seller_details">>[1], staffUser.id);
    agency = await makeEmployer("travel_agency", `Gulf Travels ${run}`);
    company = await makeEmployer("direct_company", `Shutdown Contractors ${run}`);
    await addProfile(agency.id);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("lists only selected-onwards workers, filters by placement, requirement and passport last 4, and shows no phone numbers", async () => {
    const tag = randomUUID().slice(0, 6);
    const ravi = await worker({ name: `Ravi ${tag}`, status: "departed", passportNumberLast4: "4821" });
    const sita = await worker({ name: `Sita ${tag}`, status: "visa", placedOrganizationId: agency.id });
    await worker({ name: `Early ${tag}`, status: "trade_test" });
    await worker({ name: `Hold ${tag}`, status: "on_hold" });

    const byName = await wi.listInvoiceableWorkers(staff, { organizationId: agency.id, filters: { q: tag } });
    expect(byName.items.map((w) => w.name).sort()).toEqual([`Ravi ${tag}`, `Sita ${tag}`]);
    expect(byName.items[0]!.name).toBe(`Sita ${tag}`); // placed with the agency: first
    expect(JSON.stringify(byName)).not.toContain("+9197");

    const byPassport = await wi.listInvoiceableWorkers(staff, { organizationId: agency.id, filters: { q: "4821" } });
    expect(byPassport.items.map((w) => w.id)).toContain(ravi.id);

    const placedOnly = await wi.listInvoiceableWorkers(staff, { organizationId: agency.id, filters: { q: tag, placed: true } });
    expect(placedOnly.items.map((w) => w.id)).toEqual([sita.id]);

    const included = await wi.listInvoiceableWorkers(staff, { organizationId: agency.id, filters: { q: "no-such-worker-xyz" }, includeIds: [ravi.id] });
    expect(included.items).toEqual([]);
    expect(included.included.map((w) => w.id)).toEqual([ravi.id]);
    // limit 0: only the preselected worker (before the organisation is chosen).
    const onlyPreselected = await wi.listInvoiceableWorkers(staff, { includeIds: [ravi.id], limit: 0 });
    expect(onlyPreselected).toMatchObject({ items: [], total: 0 });
    expect(onlyPreselected.included[0]).toMatchObject({ id: ravi.id, invoiceable: true, alreadyInvoiced: null });

    await expect(wi.listInvoiceableWorkers(fx.staffContext(staff.user, ["commercial.view"]), {})).rejects.toMatchObject({ code: "forbidden" });
  });

  it("saves a draft with one referenced line per worker, sets the placement, then issues it with GST", async () => {
    const a = await worker({ name: "Abdul Rahman", tradeLabel: "Pipe fitter" });
    const b = await worker({ name: "Bala Krishna", tradeLabel: "Electrician", placedOrganizationId: company.id });

    const saved = await wi.saveWorkerInvoice(staff, form({ organizationId: agency.id, currency: "INR", lines: [{ submissionId: a.id, amount: "15000" }, { submissionId: b.id, amount: "12,500.50" }], notes: "November batch", intent: "draft" }));
    expect(saved).toMatchObject({ issued: false, issueProblem: null });
    expect(saved.invoice).toMatchObject({ status: "draft", currency: "INR", organizationId: agency.id, code: null, subtotalMinor: 2_750_050, notes: "November batch" });
    // Preview tax: CGST 9 % + SGST 9 % within Andhra Pradesh, per line.
    expect(saved.invoice.taxMinor).toBe(135_000 * 2 + 112_505 * 2);

    const lines = await db.select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, saved.invoice.id));
    expect(lines.map((l) => [l.description, l.quantity, l.unitAmountMinor, l.referenceType, l.referenceId]).sort()).toEqual(
      [
        ["Recruitment service charge - Abdul Rahman (Pipe fitter)", 1, 1_500_000, "cv_submission", a.id],
        ["Recruitment service charge - Bala Krishna (Electrician)", 1, 1_250_050, "cv_submission", b.id],
      ].sort(),
    );
    const placed = await db.select({ id: s.cvSubmissions.id, org: s.cvSubmissions.placedOrganizationId }).from(s.cvSubmissions).where(inArray(s.cvSubmissions.id, [a.id, b.id]));
    expect(placed.every((p) => p.org === agency.id)).toBe(true);
    const placementAudits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "cv_submission.placed_organization_set"), inArray(s.auditLogs.entityId, [a.id, b.id])));
    expect(placementAudits).toHaveLength(2);

    // The manual editor may not replace referenced lines.
    await expect(service.saveDraftInvoice(staff, schemas.manualInvoiceSchema.parse({ id: saved.invoice.id, organizationId: agency.id, currency: "INR", lines: [{ description: "x", quantity: 1, unitAmount: "1" }] }))).rejects.toThrow(/Worker invoices/);

    // Edit the draft (drop one worker, change the amount) and issue it.
    const issued = await wi.saveWorkerInvoice(staff, form({ id: saved.invoice.id, organizationId: agency.id, currency: "INR", lines: [{ submissionId: a.id, amount: "16000" }], intent: "issue" }));
    expect(issued.issued).toBe(true);
    expect(issued.invoice.id).toBe(saved.invoice.id);
    expect(issued.invoice).toMatchObject({ status: "issued", subtotalMinor: 1_600_000, taxMinor: 288_000, totalMinor: 1_888_000, taxTreatment: "standard", placeOfSupply: "37" });
    expect(issued.invoice.code).toMatch(/^VSG\/\d{4}\/\d{6}$/);
    const issuedLines = await db.select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, issued.invoice.id));
    expect(issuedLines.map((l) => [l.referenceType, l.referenceId, l.taxes.map((t) => t.kind).sort()])).toEqual([["cv_submission", a.id, ["gst_cgst", "gst_sgst"]]]);
    const audit = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "commercial.worker_invoice_issued"), eq(s.auditLogs.entityId, issued.invoice.id)));
    expect(audit).toHaveLength(1);

    // Issued invoices cannot be edited here.
    await expect(wi.saveWorkerInvoice(staff, form({ id: issued.invoice.id, organizationId: agency.id, currency: "INR", lines: [{ submissionId: a.id, amount: "1" }] }))).rejects.toMatchObject({ code: "invalid_state" });

    // The staff list and the detail show the worker; the PDF renders.
    const list = await wi.listWorkerInvoices(staff, { q: "Abdul Rahman" }, { page: 1, pageSize: 20, offset: 0 });
    expect(list.items.find((i) => i.id === issued.invoice.id)?.workers.map((w) => w.name)).toEqual(["Abdul Rahman"]);
    const detail = await wi.getWorkerInvoice(staff, issued.invoice.id);
    expect(detail?.lines).toEqual([expect.objectContaining({ submissionId: a.id, amount: "16000.00" })]);
    const doc = await getInvoiceForStaff(staff, issued.invoice.id);
    const pdf = await PDFDocument.load(await renderInvoicePdf(doc!, { timeZone: "Asia/Kolkata" }));
    expect(pdf.getTitle()).toBe(`Tax invoice ${issued.invoice.code}`);
  });

  it("never bills a worker twice to the same organisation unless the earlier invoice is void", async () => {
    const w = await worker({ name: "Chandra Sekhar" });
    const first = await wi.saveWorkerInvoice(staff, form({ organizationId: agency.id, currency: "INR", lines: [{ submissionId: w.id, amount: "10000" }], intent: "issue" }));
    expect(first.issued).toBe(true);

    const again = wi.saveWorkerInvoice(staff, form({ organizationId: agency.id, currency: "INR", lines: [{ submissionId: w.id, amount: "10000" }], intent: "draft" }));
    await expect(again).rejects.toMatchObject({ code: "already_invoiced" });
    await expect(again).rejects.toThrow(new RegExp(`Chandra Sekhar \\(${first.invoice.code!.replace(/\//g, "\\/")}\\)`));

    // Another organisation may be billed for the same worker.
    const other = await wi.saveWorkerInvoice(staff, form({ organizationId: company.id, currency: "AED", lines: [{ submissionId: w.id, amount: "500" }], intent: "draft" }));
    expect(other.invoice.status).toBe("draft");
    // A draft counts too: a second draft for the company is refused.
    await expect(wi.saveWorkerInvoice(staff, form({ organizationId: company.id, currency: "AED", lines: [{ submissionId: w.id, amount: "500" }] }))).rejects.toThrow(/a draft invoice/);

    // After voiding the agency invoice, the worker can be billed to the agency again.
    await service.voidInvoice(staff, first.invoice.id, "Wrong amount entered");
    const rebilled = await wi.saveWorkerInvoice(staff, form({ organizationId: agency.id, currency: "INR", lines: [{ submissionId: w.id, amount: "11000" }], intent: "issue" }));
    expect(rebilled.issued).toBe(true);

    const picker = await wi.listInvoiceableWorkers(staff, { organizationId: agency.id, filters: { q: "Chandra Sekhar" } });
    expect(picker.items.find((i) => i.id === w.id)?.alreadyInvoiced).toMatchObject({ invoiceId: rebilled.invoice.id });
  });

  it("lets only one of two simultaneous invoices bill the same worker", async () => {
    const w = await worker({ name: "Dinesh Parallel" });
    const attempt = () => wi.saveWorkerInvoice(staff, form({ organizationId: agency.id, currency: "INR", lines: [{ submissionId: w.id, amount: "9000" }], intent: "draft" }));
    const results = await Promise.allSettled([attempt(), attempt(), attempt()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((x): x is PromiseRejectedResult => x.status === "rejected")) expect(r.reason).toMatchObject({ code: "already_invoiced" });
  });

  it("uses the chosen currency with its own decimals (never INR by default)", async () => {
    const w = await worker({ name: "Farooq Kuwait" });
    const kwd = await wi.saveWorkerInvoice(staff, form({ organizationId: agency.id, currency: "kwd", lines: [{ submissionId: w.id, amount: "125.375" }], intent: "draft" }));
    expect(kwd.invoice).toMatchObject({ currency: "KWD", subtotalMinor: 125_375 });
    const w2 = await worker({ name: "Ganesh Decimal" });
    await expect(wi.saveWorkerInvoice(staff, form({ organizationId: agency.id, currency: "INR", lines: [{ submissionId: w2.id, amount: "100.505" }] }))).rejects.toThrow(/at most 2 decimal places/);
    await expect(wi.saveWorkerInvoice(staff, form({ organizationId: agency.id, currency: "XXQ", lines: [{ submissionId: w2.id, amount: "100" }] }))).rejects.toThrow(/active currency/);
  });

  it("keeps the draft and explains when the organisation has no billing details, then issues once they are added", async () => {
    const buyer = await makeEmployer("direct_company", `No Profile Co ${run}`);
    const w = await worker({ name: "Hari Prasad" });
    const readiness = await wi.getWorkerInvoiceReadiness(staff, buyer.id);
    expect(readiness?.blockers.join(" ")).toMatch(/no billing details/);
    expect(readiness?.billingDefaults).toMatchObject({ legalName: buyer.name, billingPhone: "+919000000001" });

    const result = await wi.saveWorkerInvoice(staff, form({ organizationId: buyer.id, currency: "INR", lines: [{ submissionId: w.id, amount: "8000" }], intent: "issue" }));
    expect(result.issued).toBe(false);
    expect(result.issueProblem).toMatch(/billing details/);
    expect(result.invoice.status).toBe("draft");
    const [stored] = await db.select().from(s.invoices).where(eq(s.invoices.id, result.invoice.id));
    expect(stored?.status).toBe("draft");

    await addProfile(buyer.id, "INR");
    expect((await wi.getWorkerInvoiceReadiness(staff, buyer.id))?.blockers).toEqual([]);
    const issued = await wi.saveWorkerInvoice(staff, form({ id: result.invoice.id, organizationId: buyer.id, currency: "INR", lines: [{ submissionId: w.id, amount: "8000" }], intent: "issue" }));
    expect(issued).toMatchObject({ issued: true, issueProblem: null });
  });

  it("refuses workers before selection, non-employer organisations and staff without the invoice permission", async () => {
    const early = await worker({ name: "Early Applicant", status: "contacted" });
    await expect(wi.saveWorkerInvoice(staff, form({ organizationId: agency.id, currency: "INR", lines: [{ submissionId: early.id, amount: "100" }] }))).rejects.toMatchObject({ code: "worker_not_invoiceable" });

    const [partner] = await db.insert(s.organizations).values({ type: "recruitment_partner", name: `Partner ${run}`, slug: `wi-${run}-partner`, status: "verified" }).returning();
    const w = await worker({ name: "Ishaan Partner" });
    await expect(wi.saveWorkerInvoice(staff, form({ organizationId: partner!.id, currency: "INR", lines: [{ submissionId: w.id, amount: "100" }] }))).rejects.toThrow(/travel agencies and companies/);

    const viewer = fx.staffContext(staff.user, ["commercial.view"]);
    await expect(wi.saveWorkerInvoice(viewer, form({ organizationId: agency.id, currency: "INR", lines: [{ submissionId: w.id, amount: "100" }] }))).rejects.toMatchObject({ code: "forbidden" });
    // Generic drafts without worker lines cannot be edited from the worker screen.
    const manual = await db.transaction((tx) => saveDraftInvoiceTx(tx, staff.user.id, { organizationId: agency.id, currency: "INR", lines: [{ description: "Trade test", quantity: 1, unitAmount: "100" }], taxTreatment: "auto" }));
    await expect(wi.saveWorkerInvoice(staff, form({ id: manual.id, organizationId: agency.id, currency: "INR", lines: [{ submissionId: w.id, amount: "100" }] }))).rejects.toThrow(/not a worker invoice/);
  });

  it("shows an organisation only its own issued worker invoices (never drafts)", async () => {
    const owner = await fx.createUser({ displayName: "Agency Owner" });
    await db.insert(s.organizationMembers).values({ organizationId: agency.id, userId: owner.id, roleId: await fx.templateRoleId("employer", "owner"), status: "active" });
    const ctx = await fx.memberContext<"employer">(owner, agency.id);
    const w = await worker({ name: "Jaya Draft" });
    const draft = await wi.saveWorkerInvoice(staff, form({ organizationId: agency.id, currency: "INR", lines: [{ submissionId: w.id, amount: "100" }] }));

    const mine = await wi.listOrgWorkerInvoices(ctx, { page: 1, pageSize: 50, offset: 0 });
    expect(mine.items.length).toBeGreaterThan(0);
    expect(mine.items.every((i) => i.organizationId === agency.id && i.status !== "draft")).toBe(true);
    expect(mine.items.some((i) => i.id === draft.invoice.id)).toBe(false);
    expect(mine.items.every((i) => i.workers.length > 0)).toBe(true);

    const outsider = await fx.createUser({ displayName: "Company Owner" });
    await db.insert(s.organizationMembers).values({ organizationId: company.id, userId: outsider.id, roleId: await fx.templateRoleId("employer", "owner"), status: "active" });
    const theirs = await wi.listOrgWorkerInvoices(await fx.memberContext<"employer">(outsider, company.id), { page: 1, pageSize: 50, offset: 0 });
    expect(theirs.items.every((i) => i.organizationId === company.id)).toBe(true);

    // Deleting a draft goes through the invoice service.
    await wi.deleteWorkerInvoiceDraft(staff, draft.invoice.id);
    expect(await db.select().from(s.invoices).where(eq(s.invoices.id, draft.invoice.id))).toEqual([]);
  });
});
