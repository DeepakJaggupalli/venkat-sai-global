import "server-only";

import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db, type DbOrTx } from "@/db";
import { candidateProfiles, candidateSkills } from "@/db/schema";
import { enqueueTask } from "@/server/tasks/queue";
import type { TaskHandlers } from "@/server/tasks/types";

import { refreshCandidateDerived } from "./derived";

/**
 * Background task handlers owned by the candidates module.
 * Task type names must be prefixed with "candidates." (see src/server/tasks/schedule.ts for recurring ones).
 *
 *  - candidates.refresh_derived { candidateId } — recompute completeness, search text and
 *    verification level of one profile (e.g. the training module published an assessment result).
 *  - candidates.refresh_skill { skillId, afterId? } — a skill was renamed or its synonyms changed:
 *    refresh every profile listing it, 200 at a time (continues itself until done).
 *  - candidates.refresh_category { categoryId, afterId? } — a job category was renamed: refresh every
 *    profile that prefers it (category names feed preferredRolesText).
 */
const BATCH = 200;

const candidatePayload = z.object({ candidateId: z.uuid() });
const skillPayload = z.object({ skillId: z.uuid(), afterId: z.uuid().optional() });

/** Queue a derived-columns refresh for a profile (deduplicated while one is pending). */
export async function enqueueCandidateRefresh(candidateId: string, tx?: DbOrTx): Promise<void> {
  await enqueueTask("candidates.refresh_derived", { candidateId }, { tx, dedupeKey: `candidates.refresh_derived:${candidateId}:${Math.floor(Date.now() / 60_000)}` });
}

/** Queue a refresh of every profile that lists a skill (after a taxonomy edit). */
export async function enqueueSkillRefresh(skillId: string, tx?: DbOrTx): Promise<void> {
  await enqueueTask("candidates.refresh_skill", { skillId }, { tx, dedupeKey: `candidates.refresh_skill:${skillId}:${Math.floor(Date.now() / 60_000)}` });
}

/** Queue a refresh of every profile that prefers a job category (after the category was renamed). */
export async function enqueueCategoryRefresh(categoryId: string, tx?: DbOrTx): Promise<void> {
  await enqueueTask("candidates.refresh_category", { categoryId }, { tx, dedupeKey: `candidates.refresh_category:${categoryId}:${Math.floor(Date.now() / 60_000)}` });
}

const categoryPayload = z.object({ categoryId: z.uuid(), afterId: z.uuid().optional() });

export const tasks: TaskHandlers = {
  "candidates.refresh_derived": async (payload) => {
    const { candidateId } = candidatePayload.parse(payload);
    const [exists] = await db.select({ id: candidateProfiles.id }).from(candidateProfiles).where(eq(candidateProfiles.id, candidateId)).limit(1);
    if (!exists) return; // deleted since — nothing to do
    await db.transaction((tx) => refreshCandidateDerived(candidateId, tx));
  },

  "candidates.refresh_skill": async (payload, ctx) => {
    const { skillId, afterId } = skillPayload.parse(payload);
    const rows = await db
      .selectDistinct({ candidateId: candidateSkills.candidateId })
      .from(candidateSkills)
      .innerJoin(candidateProfiles, eq(candidateProfiles.id, candidateSkills.candidateId))
      .where(and(eq(candidateSkills.skillId, skillId), isNull(candidateProfiles.deletedAt), afterId ? gt(candidateSkills.candidateId, afterId) : undefined))
      .orderBy(asc(candidateSkills.candidateId))
      .limit(BATCH);
    for (const { candidateId } of rows) {
      await db.transaction((tx) => refreshCandidateDerived(candidateId, tx));
    }
    if (rows.length === BATCH) {
      const last = rows[rows.length - 1]!.candidateId;
      await enqueueTask("candidates.refresh_skill", { skillId, afterId: last }, { dedupeKey: `candidates.refresh_skill:${skillId}:after:${last}` });
    }
    ctx.log("candidates.refresh_skill", { skillId, refreshed: rows.length, continued: rows.length === BATCH });
  },

  "candidates.refresh_category": async (payload, ctx) => {
    const { categoryId, afterId } = categoryPayload.parse(payload);
    const rows = await db
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .where(
        and(
          isNull(candidateProfiles.deletedAt),
          sql`${candidateProfiles.preferredCategoryIds} @> array[${categoryId}]::uuid[]`,
          afterId ? gt(candidateProfiles.id, afterId) : undefined,
        ),
      )
      .orderBy(asc(candidateProfiles.id))
      .limit(BATCH);
    for (const { id } of rows) await db.transaction((tx) => refreshCandidateDerived(id, tx));
    if (rows.length === BATCH) {
      const last = rows[rows.length - 1]!.id;
      await enqueueTask("candidates.refresh_category", { categoryId, afterId: last }, { dedupeKey: `candidates.refresh_category:${categoryId}:after:${last}` });
    }
    ctx.log("candidates.refresh_category", { categoryId, refreshed: rows.length });
  },
};

/** Refresh several profiles now (used by tests and admin tooling). */
export async function refreshCandidates(candidateIds: string[]): Promise<number> {
  if (!candidateIds.length) return 0;
  const existing = await db.select({ id: candidateProfiles.id }).from(candidateProfiles).where(inArray(candidateProfiles.id, candidateIds));
  for (const { id } of existing) await db.transaction((tx) => refreshCandidateDerived(id, tx));
  return existing.length;
}
