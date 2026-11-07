import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { messageThreadParticipants, users } from "@/db/schema";

/**
 * The viewer's own participant row (mute flag and read position) — not exposed by getThread().
 * Only call after getThread() has authorised the viewer for this thread. Null when the viewer reads
 * through their organisation or staff permission without being a participant.
 */
export async function getOwnParticipantState(threadId: string, userId: string): Promise<{ isMuted: boolean; lastReadAt: Date | null } | null> {
  const [row] = await db
    .select({ isMuted: messageThreadParticipants.isMuted, lastReadAt: messageThreadParticipants.lastReadAt, removedAt: messageThreadParticipants.removedAt })
    .from(messageThreadParticipants)
    .where(and(eq(messageThreadParticipants.threadId, threadId), eq(messageThreadParticipants.userId, userId)))
    .limit(1);
  if (!row || row.removedAt) return null;
  return { isMuted: row.isMuted, lastReadAt: row.lastReadAt };
}

/** Which of these message authors are Venkat Sai staff (for the "Venkat Sai" badge). */
export async function staffAuthorIds(userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Set();
  const rows = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), eq(users.isStaff, true)));
  return new Set(rows.map((r) => r.id));
}
