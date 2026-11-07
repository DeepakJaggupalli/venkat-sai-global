import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { candidateSkills, users } from "@/db/schema";

import { parseContactMethod, type ContactMethod } from "./contact-method";

/**
 * Route-private reads for /talent/profile that the candidates module does not expose (reported as
 * cross-module needs). Every query is scoped to the signed-in candidate / user passed in.
 */

/** credentialId → skill ids the credential evidences (candidate_skills.credentialId). */
export async function listCredentialSkillLinks(candidateId: string): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ credentialId: candidateSkills.credentialId, skillId: candidateSkills.skillId })
    .from(candidateSkills)
    .where(and(eq(candidateSkills.candidateId, candidateId), isNotNull(candidateSkills.credentialId)));
  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.credentialId) continue;
    map.set(row.credentialId, [...(map.get(row.credentialId) ?? []), row.skillId]);
  }
  return map;
}

export async function getPreferredContactMethod(userId: string): Promise<ContactMethod | null> {
  const [row] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1);
  return parseContactMethod(row?.preferences);
}
