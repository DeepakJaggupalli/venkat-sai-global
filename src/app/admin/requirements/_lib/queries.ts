import "server-only";

import { and, desc, eq, isNull, or, type SQL } from "drizzle-orm";

import type { SelectOption } from "@/components/shared/types";
import { db } from "@/db";
import { jobs, organizations } from "@/db/schema";
import { humanize } from "@/lib/format";

/**
 * Job picker for linking requirement roles: the requirement's employer jobs, its own jobs and
 * Venkat Sai-managed jobs (callers hold requirements.manage + jobs.view). Read-only.
 */
export async function listJobOptionsForRequirement(requirementId: string, organizationId: string | null): Promise<SelectOption[]> {
  const scope: SQL[] = [eq(jobs.requirementId, requirementId), eq(jobs.managedByVenkatSai, true)];
  if (organizationId) scope.push(eq(jobs.organizationId, organizationId));
  const rows = await db
    .select({ id: jobs.id, code: jobs.code, title: jobs.title, status: jobs.status })
    .from(jobs)
    .where(and(isNull(jobs.deletedAt), or(...scope)))
    .orderBy(desc(jobs.createdAt))
    .limit(200);
  return rows.map((j) => ({ value: j.id, label: j.title, description: `${j.code} · ${humanize(j.status)}`, keywords: [j.code] }));
}

/** Verified recruitment partners for the assignment shortcut. */
export async function listVerifiedPartnerOptions(): Promise<SelectOption[]> {
  const rows = await db
    .select({ id: organizations.id, name: organizations.name, city: organizations.city, country: organizations.countryCode })
    .from(organizations)
    .where(and(eq(organizations.type, "recruitment_partner"), eq(organizations.status, "verified"), isNull(organizations.deletedAt)))
    .orderBy(organizations.name)
    .limit(300);
  return rows.map((r) => ({ value: r.id, label: r.name, description: [r.city, r.country].filter(Boolean).join(", ") || undefined }));
}
