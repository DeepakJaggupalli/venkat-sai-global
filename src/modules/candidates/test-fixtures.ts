/**
 * TEST-ONLY helpers for the candidates and jobs integration tests (isolated vsg_test_* databases).
 * Never import from application code. Reference rows are inserted idempotently by natural key so the
 * suites can run repeatedly against the same database.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  applicationWorkflows,
  countries,
  currencies,
  educationLevels,
  files,
  industries,
  jobCategories,
  languages,
  organizations,
  skills,
  users,
  workflowStages,
} from "@/db/schema";
import type { FilePurpose, OrgStatus, OrgType } from "@/db/schema/_constants";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import type { SessionUser } from "@/modules/identity/session";

export const RUN = randomUUID().slice(0, 8);

export type ReferenceData = {
  industryId: string;
  weldingCategoryId: string;
  pipeWeldingCategoryId: string;
  financeCategoryId: string;
  skills: { gtaw: string; smaw: string; fcaw: string; tally: string };
  education: { tenth: string; iti: string; degree: string };
};

async function upsertBySlug<T extends { id: string }>(select: () => Promise<T[]>, insert: () => Promise<unknown>): Promise<T> {
  const found = await select();
  if (found[0]) return found[0];
  await insert();
  const created = await select();
  if (!created[0]) throw new Error("fixture insert failed");
  return created[0];
}

export async function seedReferenceData(): Promise<ReferenceData> {
  await db
    .insert(currencies)
    .values([
      { code: "INR", name: "Indian rupee", symbol: "₹", minorUnits: 2 },
      { code: "QAR", name: "Qatari riyal", symbol: "QAR", minorUnits: 2 },
      { code: "AED", name: "UAE dirham", symbol: "AED", minorUnits: 2 },
      { code: "USD", name: "US dollar", symbol: "$", minorUnits: 2 },
    ])
    .onConflictDoNothing();
  await db
    .insert(countries)
    .values([
      { code: "IN", name: "India", isDestination: false },
      { code: "QA", name: "Qatar", isDestination: true },
      { code: "AE", name: "United Arab Emirates", isDestination: true },
    ])
    .onConflictDoNothing();
  await db
    .insert(languages)
    .values([
      { code: "en", name: "English" },
      { code: "hi", name: "Hindi" },
      { code: "te", name: "Telugu" },
    ])
    .onConflictDoNothing();

  const industry = await upsertBySlug(
    () => db.select({ id: industries.id }).from(industries).where(eq(industries.slug, "test-oil-gas")),
    () => db.insert(industries).values({ slug: "test-oil-gas", name: "Oil and gas (test)" }).onConflictDoNothing(),
  );
  const category = (slug: string, name: string, parentId: string | null = null) =>
    upsertBySlug(
      () => db.select({ id: jobCategories.id }).from(jobCategories).where(eq(jobCategories.slug, slug)),
      () => db.insert(jobCategories).values({ slug, name, parentId }).onConflictDoNothing(),
    );
  const welding = await category("test-welding", "Welding and fabrication");
  const pipeWelding = await category("test-pipe-welding", "Pipe welding", welding.id);
  const finance = await category("test-finance", "Finance and accounts");
  const skill = (slug: string, name: string, synonyms: string[], category: "trade" | "software") =>
    upsertBySlug(
      () => db.select({ id: skills.id }).from(skills).where(eq(skills.slug, slug)),
      () => db.insert(skills).values({ slug, name, synonyms, category }).onConflictDoNothing(),
    );
  const gtaw = await skill("test-gtaw", "GTAW", ["TIG welding"], "trade");
  const smaw = await skill("test-smaw", "SMAW", ["Stick welding"], "trade");
  const fcaw = await skill("test-fcaw", "FCAW", ["Flux-cored welding"], "trade");
  const tally = await skill("test-tally", "Tally", ["Tally ERP"], "software");
  const level = (key: string, name: string, rank: number) =>
    upsertBySlug(
      () => db.select({ id: educationLevels.id }).from(educationLevels).where(eq(educationLevels.key, key)),
      () => db.insert(educationLevels).values({ key, name, rank }).onConflictDoNothing(),
    );
  const tenth = await level("test-10th", "Secondary (10th)", 10);
  const iti = await level("test-iti", "ITI certificate", 20);
  const degree = await level("test-degree", "Bachelor's degree", 40);
  return {
    industryId: industry.id,
    weldingCategoryId: welding.id,
    pipeWeldingCategoryId: pipeWelding.id,
    financeCategoryId: finance.id,
    skills: { gtaw: gtaw.id, smaw: smaw.id, fcaw: fcaw.id, tally: tally.id },
    education: { tenth: tenth.id, iti: iti.id, degree: degree.id },
  };
}

export async function createTestUser(opts: { name?: string; staff?: boolean; verified?: boolean } = {}): Promise<SessionUser> {
  const email = `user-${RUN}-${randomUUID().slice(0, 8)}@vsg-test.invalid`;
  const [row] = await db
    .insert(users)
    .values({ email, displayName: opts.name ?? "Test User", isStaff: opts.staff ?? false, emailVerifiedAt: opts.verified === false ? null : new Date(), phone: null })
    .returning();
  return {
    id: row!.id,
    email: row!.email,
    phone: row!.phone,
    emailVerifiedAt: row!.emailVerifiedAt,
    phoneVerifiedAt: row!.phoneVerifiedAt,
    displayName: row!.displayName,
    avatarFileId: null,
    status: row!.status,
    isStaff: row!.isStaff,
    locale: row!.locale,
    timezone: null,
    hasPassword: false,
    twoFactorEnabled: false,
  };
}

export async function staffContext(...permissions: string[]): Promise<StaffContext> {
  const user = await createTestUser({ name: "Staff Member", staff: true });
  return { user, roleKeys: ["test"], permissions: new Set(permissions), isSuperAdmin: false };
}

export async function createOrganization(type: OrgType, opts: { status?: OrgStatus; name?: string; countryCode?: string } = {}): Promise<typeof organizations.$inferSelect> {
  const slug = `test-org-${RUN}-${randomUUID().slice(0, 8)}`;
  const [org] = await db
    .insert(organizations)
    .values({ type, name: opts.name ?? `Test ${type} ${slug.slice(-4)}`, slug, status: opts.status ?? "verified", countryCode: opts.countryCode ?? "IN", isPublic: true })
    .returning();
  return org!;
}

export async function orgContext<T extends OrgType>(orgType: T, organization: typeof organizations.$inferSelect, permissions: string[]): Promise<OrgContext<T>> {
  const user = await createTestUser({ name: "Org Member" });
  return {
    orgType,
    user,
    sessionId: "test-session",
    organization,
    membership: { id: randomUUID(), status: "active", jobTitle: null, department: null },
    role: { id: randomUUID(), key: "test", name: "Test" },
    permissions: new Set(permissions),
    isOwner: false,
  };
}

export async function createFileRow(ownerUserId: string, purpose: FilePurpose, opts: { organizationId?: string | null; name?: string } = {}): Promise<typeof files.$inferSelect> {
  const [row] = await db
    .insert(files)
    .values({
      storageDriver: "local",
      storageKey: `test/${RUN}/${randomUUID()}`,
      originalName: opts.name ?? "document.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      sha256: "0".repeat(64),
      purpose,
      ownerUserId,
      organizationId: opts.organizationId ?? null,
      scanStatus: "clean",
    })
    .returning();
  return row!;
}

/** A platform workflow with one "submitted" stage, for application fixtures. */
export async function createWorkflow(): Promise<{ workflowId: string; stageId: string }> {
  const [workflow] = await db.insert(applicationWorkflows).values({ key: `test-${RUN}-${randomUUID().slice(0, 6)}`, name: "Test workflow" }).returning();
  const [stage] = await db
    .insert(workflowStages)
    .values({ workflowId: workflow!.id, key: "submitted", name: "Submitted", category: "applied", candidateLabel: "Submitted", sortOrder: 0 })
    .returning();
  return { workflowId: workflow!.id, stageId: stage!.id };
}
