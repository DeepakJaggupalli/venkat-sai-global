/**
 * Integration tests for the commercial module against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_commercial
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_commercial'; npx vitest run src/modules/commercial
 * One file on purpose: the tests toggle global settings (commercial.enforce_limits), so they must not run in parallel.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

// Webhook secrets must be set before env() is first read (it is cached).
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_rzp_test";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_stripe_test";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("commercial module (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }

  const { and, asc, eq, sql } = await import("drizzle-orm");
  const { createHmac } = await import("node:crypto");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { setSetting } = await import("@/modules/settings");
  const fx = await import("@/modules/organizations/testing");
  const schemas = await import("./schemas");
  const service = await import("./service");
  const { checkEntitlement, consumeEntitlement, EntitlementError } = await import("./entitlements");
  const { getCreditBalance } = await import("./credits");
  const { createPendingGatewayPaymentTx } = await import("./payments");
  const { decideApproval } = await import("@/modules/approvals/service");
  const queries = await import("./queries");

  type StaffCtx = ReturnType<typeof fx.staffContext>;
  let staff: StaffCtx;
  const run = randomUUID().slice(0, 8);
  let slugCounter = 0;

  async function makeOrg(type: "employer" | "recruitment_partner" | "institution", name = `Test org ${slugCounter + 1}`) {
    slugCounter += 1;
    const [org] = await db.insert(s.organizations).values({ type, name, slug: `c-${run}-${slugCounter}`, status: "verified", countryCode: "IN" }).returning();
    return org!;
  }

  async function addMember(org: { id: string; type: "employer" | "recruitment_partner" | "institution" }, roleKey = "owner") {
    const user = await fx.createUser({ displayName: "Billing Owner" });
    await db.insert(s.organizationMembers).values({ organizationId: org.id, userId: user.id, roleId: await fx.templateRoleId(org.type, roleKey), status: "active" });
    return fx.memberContext(user, org.id);
  }

  async function profile(actor: Parameters<typeof service.upsertBillingProfile>[0], input: { countryCode: string; stateCode?: string; currency: string; taxId?: string; organizationId?: string }) {
    return service.upsertBillingProfile(
      actor,
      schemas.billingProfileFormSchema.parse({
        organizationId: input.organizationId,
        legalName: "Test Buyer Private Limited",
        billingEmail: `billing-${randomUUID().slice(0, 6)}@vsg-test.invalid`,
        addressLine1: "1 Test Street",
        city: "Test City",
        stateCode: input.stateCode,
        countryCode: input.countryCode,
        taxId: input.taxId,
        taxIdType: input.taxId && input.countryCode !== "IN" ? "vat" : undefined,
        currency: input.currency,
      }),
    );
  }

  async function enforce(on: boolean) {
    await setSetting("commercial.enforce_limits", on, staff.user.id);
  }

  async function plan(input: { audience: "employer" | "recruitment_partner" | "institution"; kind?: "base" | "add_on"; trialDays?: number; features?: { key: string; limit: number | null; period?: "none" | "month" | "year"; reset?: "none" | "reset" | "rollover" }[]; price?: { currency: string; interval: "month" | "quarter" | "year" | "one_time"; amount: string; taxInclusive?: boolean } }) {
    slugCounter += 1;
    const created = await service.createPlan(
      staff,
      schemas.planFormSchema.parse({ key: `p_${run}_${slugCounter}`, name: `Plan ${slugCounter}`, audience: input.audience, kind: input.kind ?? "base", isActive: "on", isPublic: "on", trialDays: input.trialDays ?? 0 }),
    );
    for (const f of input.features ?? []) {
      await service.setPlanFeature(
        staff,
        schemas.planFeatureFormSchema.parse({
          planId: created.id,
          entitlementKey: f.key,
          unlimited: f.limit === null ? "on" : undefined,
          limitValue: f.limit === null ? undefined : f.limit,
          period: f.period ?? "none",
          resetPolicy: f.reset ?? (f.period && f.period !== "none" ? "reset" : "none"),
        }),
      );
    }
    let priceId: string | undefined;
    if (input.price) {
      const price = await service.addPlanPrice(staff, schemas.planPriceFormSchema.parse({ planId: created.id, ...input.price, taxInclusive: input.price.taxInclusive ? "on" : undefined }));
      priceId = price.id;
    }
    return { plan: created, priceId };
  }

  beforeAll(async () => {
    await fx.seedReferenceData();
    await service.seedDefaultTaxRates();
    const staffUser = await fx.createUser({ isStaff: true, displayName: "Finance Staff" });
    staff = fx.staffContext(staffUser);
    // The settings catalogue types this value as its literal default; any seller details are valid at runtime.
    const sellerDetails = { legalName: "Seller Test Entity", address: "Test Road, Visakhapatnam", taxId: "37ABCDE1234F1Z5", stateCode: "37" };
    await setSetting("commercial.seller_details", sellerDetails as unknown as Parameters<typeof setSetting<"commercial.seller_details">>[1], staffUser.id);
    await enforce(false);
  });

  afterAll(async () => {
    await enforce(false);
    await pool.end();
  });

  // -------------------------------------------------------------------------
  describe("seed", () => {
    it("seeds India GST rates for SAC 9985 once, unconfirmed", async () => {
      const again = await service.seedDefaultTaxRates();
      expect(again).toEqual({ inserted: 0, existing: 3 });
      const rows = await db.select().from(s.taxRates).where(and(eq(s.taxRates.countryCode, "IN"), eq(s.taxRates.taxCode, "9985")));
      expect(rows.map((r) => [r.kind, r.rateBasisPoints]).sort()).toEqual([
        ["gst_cgst", 900],
        ["gst_igst", 1800],
        ["gst_sgst", 900],
      ]);
      expect(rows.every((r) => r.confirmedAt === null && r.notes?.includes("Finance must confirm"))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe("invoices, GST and offline payments", () => {
    it("issues an intra-state GST invoice with frozen snapshots and a Rule 46 number, then takes partial and full payments", async () => {
      const org = await makeOrg("employer");
      const member = await addMember(org);
      await profile(member, { countryCode: "IN", stateCode: "37", currency: "INR", taxId: "37AAAAA0000A1Z5" });
      const draft = await service.saveDraftInvoice(staff, schemas.manualInvoiceSchema.parse({ organizationId: org.id, currency: "INR", lines: [{ description: "Recruitment services", quantity: 1, unitAmount: "1000.00" }] }));
      expect(draft).toMatchObject({ status: "draft", code: null, subtotalMinor: 100_000, taxMinor: 18_000, totalMinor: 118_000 });

      const issued = await service.issueInvoice(staff, draft.id);
      expect(issued.code).toMatch(/^VSG\/\d{4}\/\d{6}$/);
      expect(issued.code!.length).toBeLessThanOrEqual(16);
      expect(issued).toMatchObject({ status: "issued", placeOfSupply: "37", taxTreatment: "standard", totalMinor: 118_000 });
      expect(issued.buyerSnapshot).toMatchObject({ legalName: "Test Buyer Private Limited", stateCode: "37", taxId: "37AAAAA0000A1Z5" });
      expect(issued.sellerSnapshot).toMatchObject({ legalName: "Seller Test Entity", taxId: "37ABCDE1234F1Z5", countryCode: "IN" });
      const lines = await db.select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, draft.id));
      expect(lines[0]!.taxes.map((t) => [t.kind, t.amountMinor])).toEqual([
        ["gst_cgst", 9_000],
        ["gst_sgst", 9_000],
      ]);
      expect(lines[0]!.taxCode).toBe("9985");

      // Issued invoices are immutable.
      await expect(service.saveDraftInvoice(staff, schemas.manualInvoiceSchema.parse({ id: draft.id, organizationId: org.id, currency: "INR", lines: [{ description: "x", quantity: 1, unitAmount: "1" }] }))).rejects.toThrow(/Only draft invoices/);

      // Edits of the billing profile never change the issued snapshot.
      await profile(member, { countryCode: "IN", stateCode: "36", currency: "INR" });
      const [reloaded] = await db.select().from(s.invoices).where(eq(s.invoices.id, draft.id));
      expect(reloaded!.buyerSnapshot!.stateCode).toBe("37");

      const pay = (amount: string, ref: string) =>
        service.recordOfflinePayment(staff, schemas.offlinePaymentSchema.parse({ invoiceId: draft.id, provider: "bank_transfer", amount, currency: "INR", externalReference: ref, receivedAt: new Date().toISOString().slice(0, 10) }));
      await pay("500.00", `UTR-${run}-1`);
      let [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, draft.id));
      expect(inv).toMatchObject({ status: "partially_paid", amountPaidMinor: 50_000 });
      await expect(pay("1000.00", `UTR-${run}-2`)).rejects.toThrow(/outstanding/);
      await expect(pay("1.00", `UTR-${run}-1`)).rejects.toThrow(/already recorded/);
      await pay("680.00", `UTR-${run}-3`);
      [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, draft.id));
      expect(inv).toMatchObject({ status: "paid", amountPaidMinor: 118_000 });
      expect(inv!.paidAt).not.toBeNull();

      const jobs = await db.execute<{ n: string }>(sql`select count(*)::text as n from background_jobs where type = 'notifications.dispatch_org' and payload->>'event' = 'billing.payment_received' and payload->>'organizationId' = ${org.id}`);
      expect(Number(jobs.rows[0]!.n)).toBe(2);
    });

    it("charges IGST inter-state, zero-rates exports, and keeps each currency's minor units (KWD 3, JPY 0)", async () => {
      const inter = await makeOrg("employer");
      await profile(staff, { organizationId: inter.id, countryCode: "IN", stateCode: "36", currency: "INR" });
      const d1 = await service.saveDraftInvoice(staff, schemas.manualInvoiceSchema.parse({ organizationId: inter.id, currency: "INR", lines: [{ description: "Trade test", quantity: 2, unitAmount: "999.99" }] }));
      const i1 = await service.issueInvoice(staff, d1.id);
      expect(i1).toMatchObject({ placeOfSupply: "36", subtotalMinor: 199_998, taxMinor: 36_000, totalMinor: 235_998 });

      const kuwait = await makeOrg("employer");
      await profile(staff, { organizationId: kuwait.id, countryCode: "KW", currency: "KWD" });
      const d2 = await service.saveDraftInvoice(staff, schemas.manualInvoiceSchema.parse({ organizationId: kuwait.id, currency: "KWD", lines: [{ description: "Manpower supply", quantity: 1, unitAmount: "12.345" }] }));
      const i2 = await service.issueInvoice(staff, d2.id);
      expect(i2).toMatchObject({ taxTreatment: "export", placeOfSupply: "KW", subtotalMinor: 12_345, taxMinor: 0, totalMinor: 12_345 });
      await expect(service.saveDraftInvoice(staff, schemas.manualInvoiceSchema.parse({ organizationId: kuwait.id, currency: "KWD", lines: [{ description: "x", quantity: 1, unitAmount: "1.2345" }] }))).rejects.toThrow(/3 decimal/);

      const japan = await makeOrg("employer");
      await profile(staff, { organizationId: japan.id, countryCode: "JP", currency: "JPY" });
      const d3 = await service.saveDraftInvoice(staff, schemas.manualInvoiceSchema.parse({ organizationId: japan.id, currency: "JPY", lines: [{ description: "Placement fee", quantity: 1, unitAmount: "150000" }] }));
      const i3 = await service.issueInvoice(staff, d3.id);
      expect(i3).toMatchObject({ taxTreatment: "export", totalMinor: 150_000 });
      // A payment in another currency is refused (never mixed).
      await expect(
        service.recordOfflinePayment(staff, schemas.offlinePaymentSchema.parse({ invoiceId: d3.id, provider: "bank_transfer", amount: "1000", currency: "INR", externalReference: `X-${run}`, receivedAt: "2026-11-01" })),
      ).rejects.toThrow(/in JPY/);
    });

    it("refuses to issue without billing details, and applies / reverses coupons atomically", async () => {
      const bare = await makeOrg("employer");
      const draft = await service.saveDraftInvoice(staff, schemas.manualInvoiceSchema.parse({ organizationId: bare.id, currency: "INR", lines: [{ description: "Service", quantity: 1, unitAmount: "100" }] }));
      await expect(service.issueInvoice(staff, draft.id)).rejects.toThrow(/billing details/);
      await profile(staff, { organizationId: bare.id, countryCode: "IN", stateCode: "37", currency: "INR" });

      const coupon = await service.saveCoupon(staff, schemas.couponFormSchema.parse({ code: `TEN${run}`.toUpperCase(), discountType: "percent", percentOff: 10, maxRedemptions: 1, isActive: "on" }));
      await service.applyCouponToDraft(staff, draft.id, coupon.code);
      const issued = await service.issueInvoice(staff, draft.id);
      expect(issued).toMatchObject({ subtotalMinor: 10_000, discountMinor: 1_000, taxMinor: 1_620, totalMinor: 10_620 });
      let [c] = await db.select().from(s.coupons).where(eq(s.coupons.id, coupon.id));
      expect(c!.redeemedCount).toBe(1);

      const second = await service.saveDraftInvoice(staff, schemas.manualInvoiceSchema.parse({ organizationId: bare.id, currency: "INR", lines: [{ description: "Service", quantity: 1, unitAmount: "100" }] }));
      await expect(service.applyCouponToDraft(staff, second.id, coupon.code)).rejects.toThrow(/redemption limit/);

      await expect(service.voidInvoice(staff, draft.id, "no")).rejects.toThrow(/reason/);
      const voided = await service.voidInvoice(staff, draft.id, "Raised in error");
      expect(voided).toMatchObject({ status: "void", voidReason: "Raised in error" });
      [c] = await db.select().from(s.coupons).where(eq(s.coupons.id, coupon.id));
      expect(c!.redeemedCount).toBe(0);
      await service.applyCouponToDraft(staff, second.id, coupon.code);
    });
  });

  // -------------------------------------------------------------------------
  describe("entitlements", () => {
    it("with enforcement OFF everything is allowed and consumption is still recorded", async () => {
      await enforce(false);
      const org = await makeOrg("employer");
      expect(await checkEntitlement(org.id, "candidate_unlocks")).toMatchObject({ allowed: true });
      await consumeEntitlement(org.id, "candidate_unlocks", { reference: { type: "profile_unlock", id: randomUUID() } });
      const ref = { type: "profile_unlock", id: randomUUID() };
      await consumeEntitlement(org.id, "candidate_unlocks", { reference: ref });
      await consumeEntitlement(org.id, "candidate_unlocks", { reference: ref }); // idempotent
      expect(await getCreditBalance(org.id, "candidate_unlocks")).toBe(-2);
    });

    it("with enforcement ON: no plan → blocked with a reason; counted limits use live data; credits gate consumption", async () => {
      await enforce(true);
      try {
        const org = await makeOrg("employer");
        const none = await checkEntitlement(org.id, "job_posts");
        expect(none.allowed).toBe(false);
        expect(none.reason).toMatch(/does not have an active plan/);

        const { plan: p } = await plan({ audience: "employer", features: [{ key: "job_posts", limit: 1 }, { key: "team_seats", limit: 2 }, { key: "candidate_unlocks", limit: 2, period: "month" }] });
        const started = await service.startSubscription(staff, schemas.startSubscriptionSchema.parse({ organizationId: org.id, planId: p.id }));
        expect(started.subscription.status).toBe("active");
        expect(started.invoice).toBeNull();

        expect(await checkEntitlement(org.id, "job_posts")).toMatchObject({ allowed: true, limit: 1, used: 0, remaining: 1, planName: p.name });
        const [job] = await db.insert(s.jobs).values({ code: `JOB-${run}-1`, slug: `job-${run}-1`, title: "Welder", organizationId: org.id, status: "published", publishedAt: new Date() }).returning();
        const full = await checkEntitlement(org.id, "job_posts");
        expect(full).toMatchObject({ allowed: false, used: 1, remaining: 0 });
        expect(full.reason).toMatch(/includes 1 job post/);
        // Publishing the same job again (reference excluded from the count) is allowed; another one is not.
        await consumeEntitlement(org.id, "job_posts", { reference: { type: "job", id: job!.id } });
        await expect(consumeEntitlement(org.id, "job_posts", { reference: { type: "job", id: randomUUID() } })).rejects.toBeInstanceOf(EntitlementError);

        // Credits: 2 per month granted at subscription start.
        expect(await getCreditBalance(org.id, "candidate_unlocks")).toBe(2);
        await consumeEntitlement(org.id, "candidate_unlocks", { reference: { type: "profile_unlock", id: randomUUID() } });
        await consumeEntitlement(org.id, "candidate_unlocks", { reference: { type: "profile_unlock", id: randomUUID() } });
        const out = await checkEntitlement(org.id, "candidate_unlocks");
        expect(out).toMatchObject({ allowed: false, remaining: 0, used: 2, limit: 2 });
        expect(out.reason).toMatch(/no candidate unlock credits left/);
        await expect(consumeEntitlement(org.id, "candidate_unlocks", { reference: { type: "profile_unlock", id: randomUUID() } })).rejects.toThrow(/no candidate unlock credits/);
        const low = await db.execute<{ n: string }>(sql`select count(*)::text as n from background_jobs where type = 'notifications.dispatch_org' and payload->>'event' = 'billing.credits_low' and payload->>'organizationId' = ${org.id}`);
        expect(Number(low.rows[0]!.n)).toBe(1);

        // Not included in the plan.
        const reports = await checkEntitlement(org.id, "analytics_reports");
        expect(reports.allowed).toBe(false);
        expect(reports.reason).toMatch(/does not include advanced reports/);

        // A staff adjustment adds credits; removals cannot go below zero.
        await service.adjustCredits(staff, { organizationId: org.id, entitlementKey: "candidate_unlocks", delta: 3, note: "Goodwill credits" });
        expect(await getCreditBalance(org.id, "candidate_unlocks")).toBe(3);
        await expect(service.adjustCredits(staff, { organizationId: org.id, entitlementKey: "candidate_unlocks", delta: -4, note: "Correction" })).rejects.toThrow(/Only 3 credits/);
        await expect(service.adjustCredits(staff, { organizationId: org.id, entitlementKey: "job_posts", delta: 3, note: "Not allowed" })).rejects.toThrow(/counted from live data/);
      } finally {
        await enforce(false);
      }
    });

    it("never lets concurrent consumption take a credit balance below zero", async () => {
      await enforce(true);
      try {
        const org = await makeOrg("employer");
        const { plan: p } = await plan({ audience: "employer", features: [{ key: "candidate_unlocks", limit: 5, period: "month" }] });
        await service.startSubscription(staff, schemas.startSubscriptionSchema.parse({ organizationId: org.id, planId: p.id }));
        expect(await getCreditBalance(org.id, "candidate_unlocks")).toBe(5);
        const attempts = Array.from({ length: 12 }, () => consumeEntitlement(org.id, "candidate_unlocks", { reference: { type: "profile_unlock", id: randomUUID() } }));
        const results = await Promise.allSettled(attempts);
        const ok = results.filter((r) => r.status === "fulfilled").length;
        const rejected = results.filter((r) => r.status === "rejected");
        expect(ok).toBe(5);
        expect(rejected).toHaveLength(7);
        expect(rejected.every((r) => r.status === "rejected" && r.reason instanceof EntitlementError)).toBe(true);
        const ledger = await db.select().from(s.creditLedger).where(and(eq(s.creditLedger.organizationId, org.id), eq(s.creditLedger.entitlementKey, "candidate_unlocks"))).orderBy(asc(s.creditLedger.seq));
        expect(ledger.map((l) => l.seq)).toEqual(ledger.map((_, i) => i + 1));
        expect(ledger.every((l) => l.balanceAfter >= 0)).toBe(true);
        expect(ledger.at(-1)!.balanceAfter).toBe(0);
      } finally {
        await enforce(false);
      }
    });

    it("sells credit packs: invoice first, credits on payment, overdraft written off", async () => {
      const org = await makeOrg("employer");
      const member = await addMember(org);
      await profile(member, { countryCode: "IN", stateCode: "37", currency: "INR" });
      await consumeEntitlement(org.id, "candidate_unlocks", { reference: { type: "profile_unlock", id: randomUUID() } }); // unenforced usage → -1
      const { priceId } = await plan({ audience: "employer", kind: "add_on", features: [{ key: "candidate_unlocks", limit: 10, period: "year" }], price: { currency: "INR", interval: "one_time", amount: "1180.00", taxInclusive: true } });
      const invoice = await service.purchaseCreditPack(member, { planPriceId: priceId! });
      expect(invoice).toMatchObject({ status: "issued", totalMinor: 118_000, taxMinor: 18_000 });
      expect(await getCreditBalance(org.id, "candidate_unlocks")).toBe(-1);
      await service.recordOfflinePayment(staff, schemas.offlinePaymentSchema.parse({ invoiceId: invoice.id, provider: "upi_manual", amount: "1180", currency: "INR", externalReference: `UPI-${run}`, receivedAt: "2026-11-02" }));
      expect(await getCreditBalance(org.id, "candidate_unlocks")).toBe(10);
      const entries = await db.select().from(s.creditLedger).where(and(eq(s.creditLedger.organizationId, org.id), eq(s.creditLedger.entitlementKey, "candidate_unlocks"))).orderBy(asc(s.creditLedger.seq));
      expect(entries.map((e) => [e.reason, e.delta])).toEqual([
        ["consumption", -1],
        ["adjustment", 1],
        ["purchase", 10],
      ]);
      expect(entries[2]!.expiresAt).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("subscriptions", () => {
    it("activates on payment, renews with reminders and invoices, goes past due and expires after the grace period", async () => {
      const org = await makeOrg("employer");
      const member = await addMember(org);
      await profile(member, { countryCode: "IN", stateCode: "37", currency: "INR" });
      const { plan: p, priceId } = await plan({ audience: "employer", features: [{ key: "candidate_unlocks", limit: 4, period: "month" }], price: { currency: "INR", interval: "month", amount: "2000.00" } });
      const started = await service.startSubscription(member, schemas.startSubscriptionSchema.parse({ planId: p.id, planPriceId: priceId }));
      expect(started.subscription.status).toBe("pending");
      expect(started.invoice).toMatchObject({ status: "issued", totalMinor: 236_000 });
      expect(await getCreditBalance(org.id, "candidate_unlocks")).toBe(0);
      await expect(service.startSubscription(member, schemas.startSubscriptionSchema.parse({ planId: p.id, planPriceId: priceId }))).resolves.toBeDefined(); // replaces the pending one
      const [replaced] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.id, started.subscription.id));
      expect(replaced!.status).toBe("cancelled");
      const [firstInvoice] = await db.select().from(s.invoices).where(eq(s.invoices.id, started.invoice!.id));
      expect(firstInvoice!.status).toBe("void");

      const pending = (await db.select().from(s.subscriptions).where(and(eq(s.subscriptions.organizationId, org.id), eq(s.subscriptions.status, "pending"))))[0]!;
      const [inv] = await db.select().from(s.invoices).where(eq(s.invoices.subscriptionId, pending.id));
      await service.recordOfflinePayment(staff, schemas.offlinePaymentSchema.parse({ invoiceId: inv!.id, provider: "bank_transfer", amount: "2360", currency: "INR", externalReference: `UTR-SUB-${run}`, receivedAt: "2026-11-03" }));
      let [sub] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.id, pending.id));
      expect(sub!.status).toBe("active");
      expect(await getCreditBalance(org.id, "candidate_unlocks")).toBe(4);

      const end = sub!.currentPeriodEnd!;
      const day = 86_400_000;
      // 6 days before the end: 7-day reminder + renewal invoice due on the period end.
      let summary = await service.processSubscriptionRenewals(new Date(end.getTime() - 6 * day));
      expect(summary.errors).toBe(0);
      const renewal = (await db.select().from(s.invoices).where(and(eq(s.invoices.subscriptionId, pending.id), eq(s.invoices.servicePeriodStart, end))))[0]!;
      expect(renewal).toMatchObject({ status: "issued", totalMinor: 236_000 });
      expect(renewal.dueAt!.getTime()).toBe(end.getTime());
      const reminders = await db.execute<{ n: string }>(sql`select count(*)::text as n from background_jobs where payload->>'event' = 'billing.renewal_due' and payload->>'organizationId' = ${org.id}`);
      expect(Number(reminders.rows[0]!.n)).toBe(1);
      // Running again the same day does nothing new.
      await service.processSubscriptionRenewals(new Date(end.getTime() - 6 * day + 3600_000));
      expect((await db.select().from(s.invoices).where(and(eq(s.invoices.subscriptionId, pending.id), eq(s.invoices.servicePeriodStart, end)))).length).toBe(1);

      // Period end without payment → past due (period advanced, still live).
      summary = await service.processSubscriptionRenewals(new Date(end.getTime() + 3600_000));
      [sub] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.id, pending.id));
      expect(sub).toMatchObject({ status: "past_due" });
      expect(sub!.currentPeriodStart.getTime()).toBe(end.getTime());

      // After the 7-day grace period → expired, unpaid renewal voided, allowance closed.
      summary = await service.processSubscriptionRenewals(new Date(end.getTime() + 8 * day));
      [sub] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.id, pending.id));
      expect(sub).toMatchObject({ status: "expired" });
      const [voided] = await db.select().from(s.invoices).where(eq(s.invoices.id, renewal.id));
      expect(voided!.status).toBe("void");
      expect(await getCreditBalance(org.id, "candidate_unlocks")).toBe(0);
    });

    it("renews when the renewal invoice is paid, honours cancel-at-period-end, and changes plans without proration", async () => {
      const org = await makeOrg("employer");
      const member = await addMember(org);
      await profile(member, { countryCode: "IN", stateCode: "37", currency: "INR" });
      const basic = await plan({ audience: "employer", price: { currency: "INR", interval: "month", amount: "0" } });
      const pro = await plan({ audience: "employer", features: [{ key: "candidate_search", limit: null }], price: { currency: "INR", interval: "year", amount: "10000" } });
      const started = await service.startSubscription(member, schemas.startSubscriptionSchema.parse({ planId: basic.plan.id, planPriceId: basic.priceId }));
      expect(started.subscription.status).toBe("active"); // free price

      const change = await service.changePlan(member, schemas.changePlanSchema.parse({ subscriptionId: started.subscription.id, planId: pro.plan.id, planPriceId: pro.priceId }));
      expect(change.subscription.status).toBe("pending");
      expect(change.invoice!.notes).toMatch(/not prorated/);
      let [old] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.id, started.subscription.id));
      expect(old!.status).toBe("active"); // still live until the new plan is paid
      await service.recordOfflinePayment(staff, schemas.offlinePaymentSchema.parse({ invoiceId: change.invoice!.id, provider: "cheque", amount: "11800", currency: "INR", externalReference: `CHQ-${run}`, receivedAt: "2026-11-04" }));
      [old] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.id, started.subscription.id));
      expect(old).toMatchObject({ status: "cancelled" });
      expect(old!.cancellationReason).toMatch(/Replaced by plan change/);
      const [next] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.id, change.subscription.id));
      expect(next!.status).toBe("active");

      const cancelled = await service.cancelSubscription(member, { subscriptionId: next!.id, reason: "Budget" });
      expect(cancelled.cancelAtPeriodEnd).toBe(true);
      await expect(service.cancelSubscription(member, { subscriptionId: next!.id, immediately: true })).rejects.toThrow(/end of the paid period/);
      await service.processSubscriptionRenewals(new Date(next!.currentPeriodEnd!.getTime() + 60_000));
      const [ended] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.id, next!.id));
      expect(ended).toMatchObject({ status: "cancelled" });
      expect(ended!.endedAt!.getTime()).toBe(next!.currentPeriodEnd!.getTime());
    });

    it("starts trials once per plan and applies approved subscription exceptions", async () => {
      const org = await makeOrg("institution");
      const member = await addMember(org);
      await profile(member, { countryCode: "IN", stateCode: "37", currency: "INR" });
      const t = await plan({ audience: "institution", trialDays: 14, features: [{ key: "courses", limit: 3 }], price: { currency: "INR", interval: "month", amount: "500" } });
      const started = await service.startSubscription(member, schemas.startSubscriptionSchema.parse({ planId: t.plan.id, planPriceId: t.priceId }));
      expect(started.subscription.status).toBe("trialing");
      expect(started.invoice).toBeNull();
      const trialEnd = started.subscription.trialEndsAt!;
      const request = await service.requestSubscriptionException(staff, schemas.subscriptionExceptionSchema.parse({ subscriptionId: started.subscription.id, kind: "extend_trial", days: 7, reason: "Onboarding took longer than planned" }));
      await decideApproval({ requestId: request.approvalId, decision: "approved", ctx: staff });
      const [sub] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.id, started.subscription.id));
      expect(sub!.trialEndsAt!.getTime()).toBe(trialEnd.getTime() + 7 * 86_400_000);
      expect(sub!.currentPeriodEnd!.getTime()).toBe(trialEnd.getTime() + 7 * 86_400_000);
    });
  });

  // -------------------------------------------------------------------------
  describe("refunds", () => {
    it("goes through approval, completes manually with a credit note and updates payment and invoice", async () => {
      const org = await makeOrg("employer");
      await profile(staff, { organizationId: org.id, countryCode: "IN", stateCode: "37", currency: "INR", taxId: "37BBBBB1111B1Z5" });
      const d = await service.saveDraftInvoice(staff, schemas.manualInvoiceSchema.parse({ organizationId: org.id, currency: "INR", lines: [{ description: "Placement", quantity: 1, unitAmount: "10000" }] }));
      const issued = await service.issueInvoice(staff, d.id);
      const payment = await service.recordOfflinePayment(staff, schemas.offlinePaymentSchema.parse({ invoiceId: d.id, provider: "bank_transfer", amount: "11800", currency: "INR", externalReference: `UTR-RF-${run}`, receivedAt: "2026-11-05" }));
      await expect(service.requestRefund(staff, schemas.refundRequestSchema.parse({ paymentId: payment.id, amount: "20000", reason: "Duplicate charge reported" }))).rejects.toThrow(/At most/);
      const refund = await service.requestRefund(staff, schemas.refundRequestSchema.parse({ paymentId: payment.id, amount: "5900", reason: "Partial service not delivered" }));
      expect(refund.status).toBe("requested");
      expect(refund.approvalRequestId).not.toBeNull();
      await decideApproval({ requestId: refund.approvalRequestId!, decision: "approved", ctx: staff });
      await service.completeManualRefund(staff, { refundId: refund.id, reference: `NEFT-${run}`, processedAt: new Date() });
      const [r] = await db.select().from(s.refunds).where(eq(s.refunds.id, refund.id));
      expect(r!.status).toBe("completed");
      const [p] = await db.select().from(s.payments).where(eq(s.payments.id, payment.id));
      expect(p).toMatchObject({ status: "partially_refunded", amountRefundedMinor: 590_000 });
      const [note] = await db.select().from(s.invoices).where(eq(s.invoices.id, r!.creditNoteInvoiceId!));
      expect(note).toMatchObject({ documentType: "credit_note", originalInvoiceId: issued.id, totalMinor: 590_000, subtotalMinor: 500_000, taxMinor: 90_000 });
      expect(note!.code).toMatch(/^VSGC\/\d{4}\/\d{6}$/);
      const [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, d.id));
      expect(inv).toMatchObject({ status: "paid", amountRefundedMinor: 590_000 });
      const processed = await db.execute<{ n: string }>(sql`select count(*)::text as n from background_jobs where payload->>'event' = 'billing.refund_processed' and payload->>'organizationId' = ${org.id}`);
      expect(Number(processed.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  describe("webhooks", () => {
    async function openInvoice(amount: string) {
      const org = await makeOrg("employer");
      await profile(staff, { organizationId: org.id, countryCode: "IN", stateCode: "37", currency: "INR" });
      const d = await service.saveDraftInvoice(staff, schemas.manualInvoiceSchema.parse({ organizationId: org.id, currency: "INR", lines: [{ description: "Service", quantity: 1, unitAmount: amount }] }));
      return service.issueInvoice(staff, d.id);
    }

    it("Razorpay: verifies the signature, records the payment once, ignores replays and rejects forgeries", async () => {
      const invoice = await openInvoice("100");
      const orderId = `order_${run}`;
      await db.transaction((tx) => createPendingGatewayPaymentTx(tx, { provider: "razorpay", invoiceId: invoice.id, organizationId: invoice.organizationId, payerUserId: null, currency: "INR", amountMinor: invoice.totalMinor, providerOrderId: orderId }));
      const body = JSON.stringify({ entity: "event", event: "payment.captured", payload: { payment: { entity: { id: `pay_${run}`, order_id: orderId, amount: invoice.totalMinor, currency: "INR", status: "captured", method: "upi" } } } });
      const signature = createHmac("sha256", "whsec_rzp_test").update(body).digest("hex");
      const headers = new Headers({ "x-razorpay-signature": signature, "x-razorpay-event-id": `evt_${run}` });
      const first = await service.handleRazorpayWebhook(body, headers);
      expect(first).toEqual({ status: 200, body: { received: true, outcome: "processed" } });
      const [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, invoice.id));
      expect(inv!.status).toBe("paid");
      const replay = await service.handleRazorpayWebhook(body, headers);
      expect(replay.body).toMatchObject({ duplicate: true });
      const paid = await db.select().from(s.payments).where(eq(s.payments.invoiceId, invoice.id));
      expect(paid.filter((p) => p.status === "succeeded")).toHaveLength(1);
      expect(paid[0]).toMatchObject({ providerPaymentId: `pay_${run}`, method: "upi" });

      const forged = await service.handleRazorpayWebhook(body.replace("captured", "failed"), headers);
      expect(forged.status).toBe(400);
      const stored = await db.select().from(s.paymentWebhookEvents).where(eq(s.paymentWebhookEvents.provider, "razorpay"));
      expect(stored.filter((e) => e.eventId === `evt_${run}`)).toHaveLength(1);
    });

    it("Stripe: checkout.session.completed within tolerance pays the invoice; stale or tampered events are rejected", async () => {
      const invoice = await openInvoice("250");
      const sessionId = `cs_test_${run}`;
      await db.transaction((tx) => createPendingGatewayPaymentTx(tx, { provider: "stripe", invoiceId: invoice.id, organizationId: invoice.organizationId, payerUserId: null, currency: "INR", amountMinor: invoice.totalMinor, providerOrderId: sessionId }));
      const body = JSON.stringify({ id: `evt_st_${run}`, type: "checkout.session.completed", data: { object: { id: sessionId, payment_status: "paid", payment_intent: `pi_${run}`, amount_total: invoice.totalMinor, currency: "inr" } } });
      const t = Math.floor(Date.now() / 1000);
      const sign = (ts: number, payload: string) => `t=${ts},v1=${createHmac("sha256", "whsec_stripe_test").update(`${ts}.${payload}`).digest("hex")}`;
      const stale = await service.handleStripeWebhook(body, new Headers({ "stripe-signature": sign(t - 600, body) }));
      expect(stale.status).toBe(400);
      const tampered = await service.handleStripeWebhook(body.replace("paid", "unpaid"), new Headers({ "stripe-signature": sign(t, body) }));
      expect(tampered.status).toBe(400);
      const ok = await service.handleStripeWebhook(body, new Headers({ "stripe-signature": sign(t, body) }));
      expect(ok).toEqual({ status: 200, body: { received: true, outcome: "processed" } });
      const [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, invoice.id));
      expect(inv!.status).toBe("paid");
      const replay = await service.handleStripeWebhook(body, new Headers({ "stripe-signature": sign(t, body) }));
      expect(replay.body).toMatchObject({ duplicate: true });
      const [payment] = await db.select().from(s.payments).where(eq(s.payments.providerOrderId, sessionId));
      expect(payment).toMatchObject({ status: "succeeded", providerPaymentId: `pi_${run}` });

      // payment_intent.payment_failed on another checkout marks it failed.
      const other = await openInvoice("300");
      const pending = await db.transaction((tx) => createPendingGatewayPaymentTx(tx, { provider: "stripe", invoiceId: other.id, organizationId: other.organizationId, payerUserId: null, currency: "INR", amountMinor: other.totalMinor, providerOrderId: `cs_test_fail_${run}` }));
      const failBody = JSON.stringify({ id: `evt_fail_${run}`, type: "payment_intent.payment_failed", data: { object: { id: `pi_fail_${run}`, metadata: { paymentId: pending.id }, last_payment_error: { message: "Your card was declined." } } } });
      const failed = await service.handleStripeWebhook(failBody, new Headers({ "stripe-signature": sign(Math.floor(Date.now() / 1000), failBody) }));
      expect(failed.status).toBe(200);
      const [fp] = await db.select().from(s.payments).where(eq(s.payments.id, pending.id));
      expect(fp).toMatchObject({ status: "failed", failureReason: "Your card was declined." });
    });
  });

  // -------------------------------------------------------------------------
  describe("partner settlements", () => {
    it("computes fees from attributed placements and agreement terms, goes through approval and payout; partners see only their own", async () => {
      const employer = await makeOrg("employer");
      const partner = await makeOrg("recruitment_partner", "Partner Agency");
      const otherPartner = await makeOrg("recruitment_partner", "Other Agency");
      const partnerMember = await addMember(partner);
      const otherMember = await addMember(otherPartner);
      await db.insert(s.partnerAgreements).values({
        organizationId: partner.id,
        version: "2026.1",
        title: "Partner agreement",
        termsSnapshot: "<p>Terms</p>",
        termsSha256: "a".repeat(64),
        commercialTerms: { feeModel: "flat_per_placement", currency: "INR", amountMinor: 500_000, payableAfterJoiningDays: 30 },
        status: "active",
        acceptedAt: new Date(),
      });
      const [wf] = await db.insert(s.applicationWorkflows).values({ key: `wf-${run}`, name: "Test workflow" }).returning();
      const [stage] = await db.insert(s.workflowStages).values({ workflowId: wf!.id, key: "joined", name: "Joined", category: "joined", candidateLabel: "Joined", isTerminal: true }).returning();
      const [job] = await db.insert(s.jobs).values({ code: `JOB-${run}-S`, slug: `job-${run}-s`, title: "Pipe welder", organizationId: employer.id }).returning();
      async function placement(n: number, joinedOn: string | null, status: "joined" | "pending_joining") {
        const { candidateId } = await fx.createCandidate();
        const [app] = await db.insert(s.applications).values({ code: `APP-${run}-${n}`, jobId: job!.id, candidateId, currentStageId: stage!.id, workflowId: wf!.id, source: "partner", partnerOrganizationId: partner.id }).returning();
        const [pl] = await db.insert(s.placements).values({ code: `PLC-${run}-${n}`, applicationId: app!.id, candidateId, jobId: job!.id, organizationId: employer.id, partnerOrganizationId: partner.id, placedOn: "2026-08-01", joinedOn, status }).returning();
        return pl!;
      }
      const eligible = await placement(1, "2026-08-15", "joined");
      const tooRecent = await placement(2, "2026-10-20", "joined");
      const notJoined = await placement(3, null, "pending_joining");

      const result = await service.computeSettlementDrafts(staff, { partnerOrganizationId: partner.id, periodStart: "2026-10-01", periodEnd: "2026-10-31" });
      expect(result.settlements).toHaveLength(1);
      expect(result.settlements[0]).toMatchObject({ currency: "INR", amountMinor: 500_000, linesAdded: 1 });
      expect(result.skipped.find((x) => x.placementId === tooRecent.id)?.reason).toMatch(/Payable from 2026-11-19/);
      expect(result.skipped.find((x) => x.placementId === notJoined.id)?.reason).toMatch(/not joined/);
      const settlementId = result.settlements[0]!.id;

      // Computing again does not settle the same placement twice.
      const again = await service.computeSettlementDrafts(staff, { partnerOrganizationId: partner.id, periodStart: "2026-10-01", periodEnd: "2026-10-31" });
      expect(again.settlements).toHaveLength(0);

      await service.addSettlementLine(staff, { settlementId, kind: "deduction", description: "Replacement cost recovery", amount: "1000" });
      await service.updateSettlementDraft(staff, { settlementId, withholdingTax: "200" });
      await expect(service.addSettlementLine(staff, { settlementId, kind: "deduction", description: "Too much", amount: "999999" })).rejects.toThrow(/Deductions cannot exceed/);
      const submitted = await service.submitSettlement(staff, settlementId);
      expect(submitted).toMatchObject({ status: "pending_approval", amountMinor: 400_000, withholdingTaxMinor: 20_000 });
      expect(await queries.getSettlementDetail(otherMember, settlementId)).toBeNull();
      const forPartner = await queries.getSettlementDetail(partnerMember, settlementId);
      expect(forPartner).toMatchObject({ netPayableMinor: 380_000, internalNotes: null });
      expect((await queries.listPartnerSettlements(otherMember, { page: 1, pageSize: 20, offset: 0 })).items).toHaveLength(0);

      await decideApproval({ requestId: submitted.approvalRequestId!, decision: "approved", ctx: staff });
      const paid = await service.markSettlementPaid(staff, { settlementId, paymentReference: `UTR-STL-${run}`, paidAt: new Date() });
      expect(paid).toMatchObject({ status: "paid", paymentReference: `UTR-STL-${run}` });
      const disputed = await service.disputeSettlement(partnerMember, { settlementId, reason: "The deduction was not agreed with us." });
      expect(disputed.status).toBe("disputed");
      await expect(service.disputeSettlement(otherMember, { settlementId, reason: "Not ours to dispute at all." })).rejects.toThrow(/not found/);
      const resolved = await service.resolveSettlementDispute(staff, { settlementId, outcome: "paid", note: "Deduction explained to the partner." });
      expect(resolved.status).toBe("paid");
      void eligible;
    });
  });
});
