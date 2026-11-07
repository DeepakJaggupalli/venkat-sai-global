import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { PlatformPermission } from "@/config/permissions";
import type { DbOrTx } from "@/db";
import { jobCategories, jobLocations, jobs, jobSkills, skills } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { slugify } from "@/lib/http";
import { runQueries } from "@/modules/candidates/db-utils";
import { buildSearchText } from "@/modules/candidates/profile-rules";
import { orgCan, staffCan } from "@/modules/identity/authz";
import { getSetting } from "@/modules/settings";

import type { JobActor, JobRow } from "./types";

/** What an actor wants to do with a job (maps to staff permissions; employers may only manage). */
export type JobCapability = "view" | "manage" | "approve" | "feature";

const STAFF_PERMISSION: Record<JobCapability, PlatformPermission> = {
  view: "jobs.view",
  manage: "jobs.manage",
  approve: "jobs.approve",
  feature: "jobs.feature",
};

export const isUuid = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function actorUserId(actor: JobActor): string {
  return actor.ctx.user.id;
}

export function actorAudit(actor: JobActor): { actorUserId: string; actorType: "user" | "staff" } {
  return { actorUserId: actor.ctx.user.id, actorType: actor.kind === "staff" ? "staff" : "user" };
}

export function assertCapability(actor: JobActor, capability: JobCapability): void {
  if (actor.kind === "staff") {
    if (!staffCan(actor.ctx, STAFF_PERMISSION[capability])) throw new ActionError("You do not have permission to do this.", { code: "forbidden" });
    return;
  }
  const allowed = capability === "view" ? orgCan(actor.ctx, ["employer.jobs.view", "employer.jobs.manage"], "any") : capability === "manage" && orgCan(actor.ctx, "employer.jobs.manage");
  if (!allowed) throw new ActionError("You do not have permission to do this.", { code: "forbidden" });
}

/**
 * Authorise and lock (FOR UPDATE) a job inside a transaction. Employers only reach their own
 * organisation's jobs; deleted jobs are never returned. Not-yours and missing look the same.
 */
export async function lockJob(actor: JobActor, jobId: string, tx: DbOrTx, capability: JobCapability = "manage"): Promise<JobRow> {
  assertCapability(actor, capability);
  if (!isUuid(jobId)) throw new ActionError("Job not found.", { code: "not_found" });
  await tx.execute(sql`select id from jobs where id = ${jobId} for update`);
  const [job] = await tx.select().from(jobs).where(and(eq(jobs.id, jobId), isNull(jobs.deletedAt))).limit(1);
  if (!job || (actor.kind === "employer" && job.organizationId !== actor.ctx.organization.id)) {
    throw new ActionError("Job not found.", { code: "not_found" });
  }
  return job;
}

/** URL slug: title + city + the job code's number (unique because codes are). */
export function buildJobSlug(title: string, city: string | null | undefined, code: string): string {
  const number = code.replace(/^.*-/, "").toLowerCase();
  const base = slugify(`${title} ${city ?? ""}`, 70) || "job";
  return `${base}-${number}`;
}

/** Is the work location outside the platform's home country (settings: platform.home_country)? */
export async function computeIsOverseas(countryCodes: (string | null | undefined)[]): Promise<boolean> {
  const home = (await getSetting("platform.home_country")).toUpperCase();
  return countryCodes.some((code) => Boolean(code) && code!.toUpperCase() !== home);
}

/** Recompute denormalised search columns (skill names + synonyms, category name) and the overseas flag. */
export async function refreshJobDerived(jobId: string, tx: DbOrTx): Promise<void> {
  const [job] = await tx.select({ jobCategoryId: jobs.jobCategoryId, countryCode: jobs.countryCode }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return;
  const [skillRows, category, locations] = await runQueries(
    tx,
    () =>
      tx
        .select({ name: skills.name, synonyms: skills.synonyms })
        .from(jobSkills)
        .innerJoin(skills, eq(skills.id, jobSkills.skillId))
        .where(eq(jobSkills.jobId, jobId))
        .orderBy(jobSkills.sortOrder),
    () => (job.jobCategoryId ? tx.select({ name: jobCategories.name }).from(jobCategories).where(eq(jobCategories.id, job.jobCategoryId)).limit(1) : Promise.resolve([] as { name: string }[])),
    () => tx.select({ countryCode: jobLocations.countryCode }).from(jobLocations).where(eq(jobLocations.jobId, jobId)),
  );
  await tx
    .update(jobs)
    .set({
      skillsText: buildSearchText(skillRows.flatMap((s) => [s.name, ...s.synonyms])),
      categoryNameCache: category[0]?.name ?? null,
      isOverseas: await computeIsOverseas([job.countryCode, ...locations.map((l) => l.countryCode)]),
    })
    .where(eq(jobs.id, jobId));
}

/** Skills must exist, be active and approved. */
export async function assertJobSkills(ids: string[], tx: DbOrTx): Promise<void> {
  if (!ids.length) return;
  const rows = await tx.select({ id: skills.id }).from(skills).where(and(inArray(skills.id, ids), eq(skills.isActive, true), eq(skills.status, "approved")));
  if (rows.length !== new Set(ids).size) throw new ActionError("Choose skills from the list.", { fieldErrors: { skills: ["Choose skills from the list"] } });
}
