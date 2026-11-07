import "server-only";

import { and, count, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { applications, candidateSkills } from "@/db/schema";

/**
 * Small read helpers for People Portal pages that the recruitment / candidates modules do not expose yet
 * (reported as cross-module needs). Every query is scoped to the caller's own candidate id.
 */

/** The caller's application to one job (any status), for "View your application" links. */
export async function findOwnApplicationForJob(candidateId: string, jobId: string): Promise<{ id: string; code: string; status: string } | null> {
  const [row] = await db
    .select({ id: applications.id, code: applications.code, status: applications.status })
    .from(applications)
    .where(and(eq(applications.candidateId, candidateId), eq(applications.jobId, jobId)))
    .limit(1);
  return row ?? null;
}

/** Applications of the caller grouped by derived status (dashboard). */
export async function countOwnApplicationsByStatus(candidateId: string): Promise<Record<string, number>> {
  const rows = await db.select({ status: applications.status, value: count() }).from(applications).where(eq(applications.candidateId, candidateId)).groupBy(applications.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.value)]));
}

/** Skill verification progress of the caller: how many listed skills are verified. */
export async function countOwnSkills(candidateId: string): Promise<{ total: number; verified: number }> {
  const rows = await db.select({ verified: candidateSkills.verified, value: count() }).from(candidateSkills).where(eq(candidateSkills.candidateId, candidateId)).groupBy(candidateSkills.verified);
  const total = rows.reduce((sum, r) => sum + Number(r.value), 0);
  const verified = Number(rows.find((r) => r.verified)?.value ?? 0);
  return { total, verified };
}

/** Which of these jobs the caller applied to (id → application id). */
export async function ownApplicationIdsForJobs(candidateId: string, jobIds: string[]): Promise<Map<string, string>> {
  if (!jobIds.length) return new Map();
  const rows = await db
    .select({ jobId: applications.jobId, id: applications.id })
    .from(applications)
    .where(and(eq(applications.candidateId, candidateId), inArray(applications.jobId, jobIds)));
  return new Map(rows.map((r) => [r.jobId, r.id]));
}
