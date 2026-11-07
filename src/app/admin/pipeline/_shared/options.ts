import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import type { SelectOption } from "@/components/shared/types";
import { db } from "@/db";
import { jobs, organizations, requirementRequests } from "@/db/schema";

/**
 * Picker options for Command Centre recruitment forms (codes and titles only — no personal data).
 * Every caller has already authorised a staff member for the area. Read-only.
 * Cross-module need: the jobs / operations modules do not expose light option lists.
 */

const ACTIVE_REQUIREMENT_STATUSES = ["approved", "sourcing", "in_progress", "partially_filled", "on_hold"] as const;

export async function requirementOptions(opts: { includeIds?: string[] } = {}): Promise<SelectOption[]> {
  const rows = await db
    .select({ id: requirementRequests.id, code: requirementRequests.code, title: requirementRequests.title, org: organizations.name })
    .from(requirementRequests)
    .leftJoin(organizations, eq(organizations.id, requirementRequests.organizationId))
    .where(inArray(requirementRequests.status, [...ACTIVE_REQUIREMENT_STATUSES]))
    .orderBy(desc(requirementRequests.createdAt))
    .limit(300);
  const out = rows.map((r) => ({ value: r.id, label: `${r.code} · ${r.title}`, description: r.org ?? undefined }));
  const missing = (opts.includeIds ?? []).filter((id) => !out.some((o) => o.value === id));
  if (missing.length) {
    const extra = await db.select({ id: requirementRequests.id, code: requirementRequests.code, title: requirementRequests.title }).from(requirementRequests).where(inArray(requirementRequests.id, missing));
    out.unshift(...extra.map((r) => ({ value: r.id, label: `${r.code} · ${r.title}`, description: undefined })));
  }
  return out;
}

/** Jobs that can receive applications now (published), newest first. */
export async function openJobOptions(opts: { requirementId?: string } = {}): Promise<SelectOption[]> {
  const rows = await db
    .select({ id: jobs.id, code: jobs.code, title: jobs.title, org: organizations.name, isOverseas: jobs.isOverseas })
    .from(jobs)
    .leftJoin(organizations, eq(organizations.id, jobs.organizationId))
    .where(and(eq(jobs.status, "published"), isNull(jobs.deletedAt), opts.requirementId ? eq(jobs.requirementId, opts.requirementId) : undefined))
    .orderBy(asc(jobs.title))
    .limit(500);
  return rows.map((r) => ({ value: r.id, label: `${r.title} (${r.code})`, description: [r.org ?? "Venkat Sai", r.isOverseas ? "Overseas" : null].filter(Boolean).join(" · ") }));
}

/** Jobs of any status for filters (bounded). */
export async function jobFilterOptions(): Promise<SelectOption[]> {
  const rows = await db
    .select({ id: jobs.id, code: jobs.code, title: jobs.title })
    .from(jobs)
    .where(and(isNull(jobs.deletedAt), inArray(jobs.status, ["published", "paused", "closed"])))
    .orderBy(desc(jobs.createdAt))
    .limit(300);
  return rows.map((r) => ({ value: r.id, label: `${r.title} (${r.code})` }));
}

/** Verified recruitment partners (names only). */
export async function partnerOptions(opts: { verifiedOnly?: boolean } = {}): Promise<SelectOption[]> {
  const rows = await db
    .select({ id: organizations.id, name: organizations.name, status: organizations.status })
    .from(organizations)
    .where(and(eq(organizations.type, "recruitment_partner"), isNull(organizations.deletedAt), opts.verifiedOnly ? eq(organizations.status, "verified") : undefined))
    .orderBy(asc(organizations.name))
    .limit(500);
  return rows.map((r) => ({ value: r.id, label: r.name, description: opts.verifiedOnly ? undefined : r.status }));
}
