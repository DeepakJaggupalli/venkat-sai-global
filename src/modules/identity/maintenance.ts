import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

/**
 * Housekeeping for the "identity.cleanup" task (hourly, see src/server/tasks/schedule.ts):
 * expired sessions, and verification codes / links that expired or were used more than
 * TOKEN_RETENTION_DAYS ago (kept a week for abuse investigation, then removed).
 */
export const TOKEN_RETENTION_DAYS = 7;

export type IdentityCleanupResult = { sessions: number; verificationTokens: number };

export async function cleanupIdentityData(now: Date = new Date()): Promise<IdentityCleanupResult> {
  const cutoff = new Date(now.getTime() - TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const sessionResult = await db.execute<{ count: string }>(sql`
    with deleted as (delete from sessions where expires_at < ${now} returning 1)
    select count(*)::text as count from deleted
  `);
  const tokenResult = await db.execute<{ count: string }>(sql`
    with deleted as (
      delete from verification_tokens
      where expires_at < ${cutoff} or (consumed_at is not null and consumed_at < ${cutoff})
      returning 1
    )
    select count(*)::text as count from deleted
  `);
  return {
    sessions: Number(sessionResult.rows[0]?.count ?? 0),
    verificationTokens: Number(tokenResult.rows[0]?.count ?? 0),
  };
}
