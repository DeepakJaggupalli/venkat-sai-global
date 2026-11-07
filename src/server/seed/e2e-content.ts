import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { cmsEntries, planPrices, plans } from "@/db/schema";
import { addPlanPrice, createPlan, setPlanFeature } from "@/modules/commercial/service";
import { planFeatureFormSchema, planFormSchema, planPriceFormSchema } from "@/modules/commercial/schemas";
import { createEntry, publishEntry } from "@/modules/content/service";
import { createEntrySchema } from "@/modules/content/schemas";
import type { StaffContext } from "@/modules/identity/authz";
import { getSetting, setSetting } from "@/modules/settings";

import { isoDay, type SeedLog } from "./e2e-helpers";

/**
 * Commercial and CMS fixtures for the local-only E2E seed. Everything is labelled as test data; no prices,
 * statistics, testimonials or logos are presented as real.
 */

/** Seller details with test values, so invoices and purchase dialogs can render (local database only). */
export async function ensureSellerDetails(adminUserId: string): Promise<void> {
  const current = await getSetting("commercial.seller_details");
  await setSetting(
    "commercial.seller_details",
    {
      ...current,
      legalName: "Venkat Sai Global (E2E test seller)",
      address: "E2E test address, Auto Nagar, Visakhapatnam, Andhra Pradesh, India",
      addressLine1: "E2E test address, Auto Nagar",
      city: "Visakhapatnam",
      postalCode: "530012",
      stateRegion: "Andhra Pradesh",
      stateCode: "37",
      countryCode: "IN",
      taxId: "",
      email: "billing@e2e.venkatsai.test",
      phone: "+910000000000",
      paymentInstructions: "E2E test data: no real bank details.",
    },
    adminUserId,
  );
}

type PlanSpec = { key: string; name: string; currency: string; amount: string };

const PLAN_SPECS: readonly PlanSpec[] = [
  { key: "e2e_employer_inr", name: "E2E Employer Plan (INR, test)", currency: "INR", amount: "4999.00" },
  { key: "e2e_employer_usd", name: "E2E Employer Plan (USD, test)", currency: "USD", amount: "79.00" },
];

/** Public, priced employer plans in INR and in USD (multi-currency checks). Returns plan ids by key. */
export async function ensureEmployerPlans(staff: StaffContext, log: SeedLog): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const [index, spec] of PLAN_SPECS.entries()) {
    const [existing] = await db.select().from(plans).where(eq(plans.key, spec.key)).limit(1);
    const plan =
      existing ??
      (await createPlan(
        staff,
        planFormSchema.parse({
          key: spec.key,
          name: spec.name,
          description: "Test plan used by automated end-to-end tests.",
          audience: "employer",
          kind: "base",
          isPublic: true,
          isActive: true,
          contactSalesOnly: false,
          sortOrder: 900 + index,
          highlights: ["Test plan: 5 job posts a month"],
        }),
      ));
    const [price] = await db
      .select({ id: planPrices.id })
      .from(planPrices)
      .where(and(eq(planPrices.planId, plan.id), eq(planPrices.currency, spec.currency), eq(planPrices.interval, "month"), eq(planPrices.isActive, true)))
      .limit(1);
    if (!price) {
      await addPlanPrice(staff, planPriceFormSchema.parse({ planId: plan.id, currency: spec.currency, interval: "month", amount: spec.amount, taxInclusive: false }));
      await setPlanFeature(staff, planFeatureFormSchema.parse({ planId: plan.id, entitlementKey: "job_posts", unlimited: false, limitValue: 5, period: "month", resetPolicy: "reset" }));
    }
    ids[spec.key] = plan.id;
    log(`  plan ${spec.key} (${spec.currency})`);
  }
  return ids;
}

type EntrySpec = { collection: string; slug: string; title: string; summary: string; data: Record<string, unknown> };

const TEST_NOTE = "E2E test content. Safe to delete; never shown on a production site.";

function entrySpecs(now: Date): EntrySpec[] {
  const today = isoDay(0, now);
  return [
    {
      collection: "industries",
      slug: "e2e-test-industry",
      title: "E2E test industry",
      summary: "Test industry page used by automated end-to-end tests.",
      data: { overview: `<p>${TEST_NOTE}</p>`, typicalRoles: ["Test welder"], skillsInDemand: ["Test skill"] },
    },
    {
      collection: "destinations",
      slug: "e2e-test-destination",
      title: "E2E test destination",
      summary: "Test destination guide used by automated end-to-end tests.",
      data: {
        countryCode: "AE",
        region: "gcc",
        overview: `<p>${TEST_NOTE}</p>`,
        guidance: {
          employmentGuidance: "<p>Test guidance. Not advice.</p>",
          reviewedAt: today,
          reviewedBy: "E2E test reviewer (automated tests)",
          sources: [{ title: "eMigrate (Government of India)", url: "https://emigrate.gov.in/", accessedAt: today }],
          disclaimer: "Test content for automated tests. This guidance is general information, not legal or immigration advice.",
        },
      },
    },
    {
      collection: "faqs",
      slug: "e2e-test-faq",
      title: "Is this an E2E test question?",
      summary: "",
      data: { answer: `<p>Yes. ${TEST_NOTE}</p>`, audience: "general", topic: "Testing" },
    },
    {
      collection: "news",
      slug: "e2e-test-news",
      title: "E2E test news item",
      summary: "Test news item used by automated end-to-end tests.",
      data: { category: "news", body: `<p>${TEST_NOTE}</p>`, author: "E2E test author" },
    },
  ];
}

/**
 * Published test entries for the collections the production seed leaves as drafts (industry, destination,
 * FAQ, news). Site settings, homepage, services and the legal pages (incl. data-rights) are already published
 * by `npm run db:seed`.
 */
export async function ensureCmsContent(staff: StaffContext, log: SeedLog, now = new Date()): Promise<void> {
  for (const spec of entrySpecs(now)) {
    const [existing] = await db
      .select({ id: cmsEntries.id, status: cmsEntries.status })
      .from(cmsEntries)
      .where(and(eq(cmsEntries.collection, spec.collection as never), eq(cmsEntries.slug, spec.slug), eq(cmsEntries.locale, "en"), isNull(cmsEntries.deletedAt)))
      .limit(1);
    let id = existing?.id;
    if (!id) {
      const created = await createEntry(
        staff,
        createEntrySchema.parse({ collection: spec.collection, locale: "en", title: spec.title, slug: spec.slug, summary: spec.summary || undefined, data: spec.data, tags: ["e2e-test"], note: TEST_NOTE }),
      );
      id = created.id;
    }
    if (existing?.status !== "published") await publishEntry(staff, { id });
    log(`  cms ${spec.collection}/${spec.slug}`);
  }
}
