import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { cmsEntries, organizations } from "@/db/schema";
import { createEntry, unpublishEntry } from "@/modules/content/service";
import { createEntrySchema } from "@/modules/content/schemas";
import type { StaffContext } from "@/modules/identity/authz";
import { setOrganizationPublic } from "@/modules/organizations/service";

import type { SeedLog } from "./e2e-helpers";

/**
 * E2E seed block for the public website specs (ui-public-marketing, ui-public-content). Local database only
 * (see e2e-guard.ts).
 *
 *  - A draft industry page (never published) for the CMS preview checks: the public URL must 404, a valid
 *    signed preview token must open it with the preview ribbon and noindex, and a tampered, expired or
 *    other-entry token must not. If a run published it, it is taken offline again.
 *  - The public pages of the verified E2E employer and E2E institution are switched on (through the service,
 *    as the E2E Super Admin) so /employers/<slug> and /institutions/<slug> can be checked. The "other"
 *    organisations stay private, so their slugs must 404.
 */

const DRAFT_INDUSTRY = {
  slug: "e2e-draft-industry",
  title: "E2E draft industry (preview only)",
  summary: "Draft industry page used by the automated CMS preview tests. Never published.",
};

export async function seedPublicQa(input: { staff: StaffContext; publicOrgIds: string[]; log: SeedLog }): Promise<Record<string, string>> {
  const { staff, log } = input;
  const out: Record<string, string> = {};
  for (const orgId of input.publicOrgIds) {
    await setOrganizationPublic(staff, orgId, true);
    const [org] = await db.select({ slug: organizations.slug, type: organizations.type }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (org?.type === "employer") out.E2E_PUBLIC_EMPLOYER_SLUG = org.slug;
    if (org?.type === "institution") out.E2E_PUBLIC_INSTITUTION_SLUG = org.slug;
    log(`  public page on: ${org?.type} ${org?.slug}`);
  }

  const [existing] = await db
    .select({ id: cmsEntries.id, status: cmsEntries.status })
    .from(cmsEntries)
    .where(and(eq(cmsEntries.collection, "industries"), eq(cmsEntries.slug, DRAFT_INDUSTRY.slug), eq(cmsEntries.locale, "en"), isNull(cmsEntries.deletedAt)))
    .limit(1);
  let id = existing?.id;
  if (!id) {
    const created = await createEntry(
      staff,
      createEntrySchema.parse({
        collection: "industries",
        locale: "en",
        title: DRAFT_INDUSTRY.title,
        slug: DRAFT_INDUSTRY.slug,
        summary: DRAFT_INDUSTRY.summary,
        data: { overview: "<p>E2E draft content. Only visible through a signed preview link.</p>", typicalRoles: ["Test welder"], skillsInDemand: ["Test skill"] },
        tags: ["e2e-test"],
        note: "E2E test content. Safe to delete.",
      }),
    );
    id = created.id;
  } else if (existing.status === "published" || existing.status === "scheduled") {
    await unpublishEntry(staff, id, "E2E seed: keep the preview fixture unpublished");
  }
  log(`  cms industries/${DRAFT_INDUSTRY.slug} (draft)`);
  return { ...out, E2E_DRAFT_INDUSTRY_ID: id, E2E_DRAFT_INDUSTRY_SLUG: DRAFT_INDUSTRY.slug };
}
