import "server-only";

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { candidateLanguages, candidatePreferredLocations, candidateSkills } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";

import { auditContext, lockCandidateTarget } from "./actor";
import { CANDIDATE_LIMITS } from "./constants";
import { refreshCandidateDerived } from "./derived";
import { assertCountries, assertLanguages, assertSkills } from "./refs";
import type { LanguagesInput, PreferredLocationsInput, SkillItemInput, SkillsInput } from "./schemas";
import type { CandidateActor, CandidateSkillRow } from "./types";

/**
 * Skills (curated taxonomy ids), languages and preferred work locations.
 * A candidate can change level / years / primary flag of any skill, but never its source or
 * verification: verified skills come only from Venkat Sai assessments or verified credentials.
 */

/** Replace the whole skills list (the profile skills editor). Existing verification is kept for skills that stay. */
export async function replaceCandidateSkills(actor: CandidateActor, input: SkillsInput): Promise<CandidateSkillRow[]> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const ids = input.skills.map((s) => s.skillId);
    await assertSkills(ids, "skills", tx);

    const existing = await tx.select().from(candidateSkills).where(eq(candidateSkills.candidateId, target.candidateId));
    const byId = new Map(existing.map((row) => [row.skillId, row]));
    for (const item of input.skills) {
      const row = byId.get(item.skillId);
      const values = { level: item.level ?? null, yearsExperience: item.yearsExperience ?? null, isPrimary: item.isPrimary };
      if (row) {
        if (row.level !== values.level || row.yearsExperience !== values.yearsExperience || row.isPrimary !== values.isPrimary) {
          await tx.update(candidateSkills).set(values).where(eq(candidateSkills.id, row.id));
        }
      } else {
        await tx.insert(candidateSkills).values({ ...values, candidateId: target.candidateId, skillId: item.skillId, source: "self", verified: false });
      }
    }
    const removed = existing.filter((row) => !ids.includes(row.skillId));
    if (removed.length) {
      await tx
        .delete(candidateSkills)
        .where(and(eq(candidateSkills.candidateId, target.candidateId), ids.length ? notInArray(candidateSkills.skillId, ids) : sql`true`));
    }
    if (target.onBehalf || removed.some((row) => row.verified)) {
      await audit({
        action: "candidate.skills_updated",
        entityType: "candidate",
        entityId: target.candidateId,
        metadata: { count: ids.length, removedVerifiedSkillIds: removed.filter((r) => r.verified).map((r) => r.skillId), onBehalf: target.onBehalf },
        ...auditContext(target),
        tx,
      });
    }
    await refreshCandidateDerived(target.candidateId, tx);
    return tx.select().from(candidateSkills).where(eq(candidateSkills.candidateId, target.candidateId));
  });
}

/** Add one skill, or update its level / years / primary flag. */
export async function upsertCandidateSkill(actor: CandidateActor, item: SkillItemInput): Promise<CandidateSkillRow> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    await assertSkills([item.skillId], "skillId", tx);
    const existing = await tx.select().from(candidateSkills).where(eq(candidateSkills.candidateId, target.candidateId));
    const current = existing.find((row) => row.skillId === item.skillId);
    if (!current && existing.length >= CANDIDATE_LIMITS.skills) throw new ActionError(`You can add up to ${CANDIDATE_LIMITS.skills} skills.`);
    if (item.isPrimary && !current?.isPrimary && existing.filter((row) => row.isPrimary).length >= CANDIDATE_LIMITS.primarySkills) {
      throw new ActionError(`Mark at most ${CANDIDATE_LIMITS.primarySkills} skills as primary.`, { fieldErrors: { isPrimary: ["Too many primary skills"] } });
    }
    const values = { level: item.level ?? null, yearsExperience: item.yearsExperience ?? null, isPrimary: item.isPrimary };
    const [row] = current
      ? await tx.update(candidateSkills).set(values).where(eq(candidateSkills.id, current.id)).returning()
      : await tx.insert(candidateSkills).values({ ...values, candidateId: target.candidateId, skillId: item.skillId, source: "self", verified: false }).returning();
    await refreshCandidateDerived(target.candidateId, tx);
    return row!;
  });
}

export async function removeCandidateSkill(actor: CandidateActor, skillId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const removed = await tx
      .delete(candidateSkills)
      .where(and(eq(candidateSkills.candidateId, target.candidateId), eq(candidateSkills.skillId, skillId)))
      .returning({ verified: candidateSkills.verified });
    if (!removed.length) throw new ActionError("This skill is not on your profile.", { code: "not_found" });
    if (target.onBehalf || removed[0]!.verified) {
      await audit({ action: "candidate.skill_removed", entityType: "candidate", entityId: target.candidateId, metadata: { skillId, wasVerified: removed[0]!.verified, onBehalf: target.onBehalf }, ...auditContext(target), tx });
    }
    await refreshCandidateDerived(target.candidateId, tx);
  });
}

/** Replace the languages list. */
export async function replaceCandidateLanguages(actor: CandidateActor, input: LanguagesInput): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const codes = input.languages.map((l) => l.languageCode);
    await assertLanguages(codes, "languages", tx);
    const existing = await tx.select().from(candidateLanguages).where(eq(candidateLanguages.candidateId, target.candidateId));
    const byCode = new Map(existing.map((row) => [row.languageCode, row]));
    for (const item of input.languages) {
      const values = { proficiency: item.proficiency, canRead: item.canRead, canWrite: item.canWrite, canSpeak: item.canSpeak };
      const row = byCode.get(item.languageCode);
      if (row) await tx.update(candidateLanguages).set(values).where(eq(candidateLanguages.id, row.id));
      else await tx.insert(candidateLanguages).values({ ...values, candidateId: target.candidateId, languageCode: item.languageCode });
    }
    const removedIds = existing.filter((row) => !codes.includes(row.languageCode)).map((row) => row.id);
    if (removedIds.length) await tx.delete(candidateLanguages).where(inArray(candidateLanguages.id, removedIds));
    await refreshCandidateDerived(target.candidateId, tx);
  });
}

/** Replace the preferred work locations (priority follows the list order, 1 = most preferred). */
export async function replacePreferredLocations(actor: CandidateActor, input: PreferredLocationsInput): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    await assertCountries(
      input.locations.map((l) => l.countryCode),
      "locations",
      tx,
    );
    // Replace the child list in one transaction (the place index is a coalesce expression index,
    // so ON CONFLICT cannot target it — docs/SCHEMA_NOTES.md §2).
    await tx.delete(candidatePreferredLocations).where(eq(candidatePreferredLocations.candidateId, target.candidateId));
    if (input.locations.length) {
      await tx.insert(candidatePreferredLocations).values(
        input.locations.map((location, index) => ({
          candidateId: target.candidateId,
          countryCode: location.countryCode,
          stateRegion: location.stateRegion ?? null,
          city: location.city ?? null,
          priority: index + 1,
        })),
      );
    }
    await refreshCandidateDerived(target.candidateId, tx);
  });
}
