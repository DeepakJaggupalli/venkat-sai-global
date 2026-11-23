import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Organisation sign-up (company / travel agency / recruitment partner / institution) against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_signup  →  DATABASE_URL=…/vsg_test_signup npx vitest run src/modules/identity/organization-signup
 * The real services run with an in-memory cookie jar (next/headers mocked) and a capturing message transport.
 */
const env = vi.hoisted(() => {
  const url = process.env.DATABASE_URL;
  let name = "";
  try {
    name = url ? new URL(url).pathname.replace(/^\//, "") : "";
  } catch {
    name = "";
  }
  if (!url) process.env.DATABASE_URL = "postgres://unused:unused@127.0.0.1:1/unused";
  return { integration: name.startsWith("vsg_test_") };
});

const browser = vi.hoisted(() => {
  const store = new Map<string, string>();
  const state = { ip: "203.0.113.9" };
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
  return { store, state, jar };
});

const outbox = vi.hoisted(() => ({ messages: [] as { to: string; text: string }[] }));

vi.mock("@/modules/analytics/server", () => ({ trackServer: async () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => browser.jar,
  headers: async () => new Headers({ "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0", "x-forwarded-for": browser.state.ip, host: "localhost:3000" }),
}));
vi.mock("@/modules/messaging", () => ({
  sendEmail: async (m: { to: string; text: string }) => {
    outbox.messages.push({ to: m.to, text: m.text });
    return { ok: true, provider: "test" };
  },
  sendSms: async (m: { to: string; body: string }) => {
    outbox.messages.push({ to: m.to, text: m.body });
    return { ok: true, provider: "test" };
  },
  sendWhatsApp: async () => ({ ok: true, provider: "test" }),
}));

import { db, pool } from "@/db";
import { companyProfiles, featureFlags, organizationMembers, organizations, partnerLicences, partnerProfiles, roles, users } from "@/db/schema";

import { organizationSignUpSchema } from "./schemas";
import { completeSignupVerification, registerAccount } from "./service";

const PASSWORD = "harbour-violet-tiger-73";
const email = () => `org-signup-${randomUUID()}@example.test`;
const lastCodeTo = (to: string) => {
  const message = [...outbox.messages].reverse().find((m) => m.to === to);
  if (!message) throw new Error(`No message to ${to}`);
  return message.text.match(/\b(\d{6})\b/)![1]!;
};

const form = (overrides: Record<string, unknown>) => ({
  countryCode: "IN",
  stateRegion: "Telangana",
  city: "Hyderabad",
  displayName: "Ravi Kumar",
  designation: "Managing Director",
  phone: "+91 98765 43210",
  password: PASSWORD,
  acceptTerms: "on",
  acceptPrivacy: "on",
  ...overrides,
});

describe("organisation sign-up form validation", () => {
  it("reports each missing organisation and login field", () => {
    const result = organizationSignUpSchema.safeParse({ intent: "partner", acceptTerms: "on", acceptPrivacy: "on" });
    expect(result.success).toBe(false);
    const fields = new Set(result.error!.issues.map((issue) => String(issue.path[0])));
    for (const field of ["orgName", "businessType", "countryCode", "city", "displayName", "designation", "email", "phone", "password"]) {
      expect(fields, field).toContain(field);
    }
  });

  it("accepts a website without https:// and rejects an unknown business type", () => {
    const ok = organizationSignUpSchema.parse(form({ intent: "employer", orgName: "Acme Builders", email: "hr@acme.example", websiteUrl: "acme.example" }));
    expect(ok.organization.details.websiteUrl).toBe("https://acme.example");
    expect(ok.organization).toMatchObject({ type: "employer", employerKind: "direct_company" });
    const bad = organizationSignUpSchema.safeParse(form({ intent: "institution", orgName: "City ITI", email: "x@iti.example", businessType: "agency" }));
    expect(bad.success).toBe(false);
    expect(bad.error!.issues.map((issue) => issue.path[0])).toContain("businessType");
  });
});

describe.skipIf(!env.integration)("organisation sign-up (integration)", () => {
  beforeAll(async () => {
    const { seedReferenceData } = await import("@/modules/organizations/testing");
    await seedReferenceData();
    await db
      .insert(featureFlags)
      .values({ key: "auth.email_otp", enabled: true, name: "auth.email_otp", category: "Authentication" })
      .onConflictDoUpdate({ target: featureFlags.key, set: { enabled: true } });
  });
  beforeEach(() => {
    browser.store.clear();
    browser.state.ip = `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;
  });
  afterAll(async () => {
    await pool.end();
  });

  async function ownedOrganizations(userId: string) {
    return db
      .select({ org: organizations, member: organizationMembers, role: roles })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
      .where(eq(organizationMembers.userId, userId));
  }

  it("travel agency: creates the user, then the agency with the person as owner when the email is verified", async () => {
    const address = email();
    await registerAccount(
      organizationSignUpSchema.parse(
        form({ intent: "travel_agency", orgName: "Sky Route Travels", email: address, websiteUrl: "skyroute.example", registrationNumber: "36ABCDE1234F1Z5", companySize: "11_50" }),
      ),
    );
    const [pending] = await db.select().from(users).where(eq(users.email, address));
    expect(pending).toMatchObject({ status: "pending_verification", displayName: "Ravi Kumar" });
    expect(await ownedOrganizations(pending!.id)).toHaveLength(0);

    const next = await completeSignupVerification(lastCodeTo(address));
    expect(next).toBe("/agency");

    const owned = await ownedOrganizations(pending!.id);
    expect(owned).toHaveLength(1);
    const [{ org, member, role }] = owned as [(typeof owned)[number]];
    expect(org).toMatchObject({
      type: "employer",
      employerKind: "travel_agency",
      status: "draft",
      name: "Sky Route Travels",
      countryCode: "IN",
      stateRegion: "Telangana",
      city: "Hyderabad",
      websiteUrl: "https://skyroute.example",
      registrationNumber: "36ABCDE1234F1Z5",
      email: address,
      phone: "+919876543210",
    });
    expect(role.key).toBe("owner");
    expect(member).toMatchObject({ status: "active", jobTitle: "Managing Director" });
    const [profile] = await db.select().from(companyProfiles).where(eq(companyProfiles.organizationId, org.id));
    expect(profile?.companySize).toBe("11_50");
    const [activated] = await db.select().from(users).where(eq(users.id, pending!.id));
    expect(activated!.status).toBe("active");
    expect((activated!.preferences as Record<string, unknown>).pendingOrganization).toBeUndefined();
  });

  it("recruitment partner: creates a recruitment_partner organisation with its business type and a pending licence", async () => {
    const address = email();
    await registerAccount(
      organizationSignUpSchema.parse(form({ intent: "partner", orgName: "Deccan Manpower Services", email: address, businessType: "agency", licenceNumber: "B-0123/AP/PER/1000+/5/9999/2026" })),
    );
    const [pending] = await db.select().from(users).where(eq(users.email, address));
    const next = await completeSignupVerification(lastCodeTo(address));
    expect(next).toBe("/recruiter");

    const [owned] = await ownedOrganizations(pending!.id);
    expect(owned?.org).toMatchObject({ type: "recruitment_partner", employerKind: null, status: "draft", name: "Deccan Manpower Services", phone: "+919876543210" });
    expect(owned?.role.key).toBe("owner");
    expect(owned?.member.jobTitle).toBe("Managing Director");
    const [profile] = await db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, owned!.org.id));
    expect(profile?.businessType).toBe("agency");
    const licences = await db.select().from(partnerLicences).where(eq(partnerLicences.organizationId, owned!.org.id));
    expect(licences).toHaveLength(1);
    expect(licences[0]).toMatchObject({ licenceType: "india_recruiting_agent", licenceNumber: "B-0123/AP/PER/1000+/5/9999/2026", verificationStatus: "pending" });
  });

  it("does not create an organisation for an address that already has an account", async () => {
    const address = email();
    const [existing] = await db.insert(users).values({ email: address, emailVerifiedAt: new Date(), displayName: "Owner", status: "active" }).returning();
    await registerAccount(organizationSignUpSchema.parse(form({ intent: "institution", orgName: "Nizam ITI", email: address, businessType: "iti" })));
    expect(await ownedOrganizations(existing!.id)).toHaveLength(0);
    const [after] = await db.select().from(users).where(eq(users.id, existing!.id));
    expect((after!.preferences as Record<string, unknown> | null)?.pendingOrganization).toBeUndefined();
  });
});
