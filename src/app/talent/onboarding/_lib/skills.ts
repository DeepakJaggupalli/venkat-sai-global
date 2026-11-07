import "server-only";

import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { candidateSkills } from "@/db/schema";

/** Skill ids already on the candidate's profile (primary first), for pre-filling the onboarding picker. */
export async function listOwnSkillIds(candidateId: string): Promise<string[]> {
  const rows = await db
    .select({ skillId: candidateSkills.skillId })
    .from(candidateSkills)
    .where(eq(candidateSkills.candidateId, candidateId))
    .orderBy(desc(candidateSkills.isPrimary), asc(candidateSkills.createdAt));
  return rows.map((r) => r.skillId);
}
