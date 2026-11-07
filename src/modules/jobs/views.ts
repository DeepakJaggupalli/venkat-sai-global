import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { rateLimit } from "@/lib/rate-limit";
import { classifyUserAgent, getRequestMeta } from "@/lib/request";

/**
 * Job view counting without cookies: a view counts at most once per viewer per 24 hours, where the
 * viewer is the signed-in user or, for visitors, the pseudonymised IP hash (never the raw IP). The
 * throttle uses rate_limit_buckets keys `job-view:<jobId>:u:<userId>` / `job-view:<jobId>:ip:<hash>`
 * (purged by system.cleanup). Crawlers are ignored. The counter update does not touch updated_at.
 */
export async function recordJobView(jobId: string, viewer: { userId?: string | null } = {}): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return false;
  const meta = await getRequestMeta().catch(() => null);
  if (classifyUserAgent(meta?.userAgent).deviceType === "bot") return false;
  const who = viewer.userId ? `u:${viewer.userId}` : meta?.ipHash ? `ip:${meta.ipHash}` : null;
  if (!who) return false;
  const throttle = await rateLimit(`job-view:${jobId}:${who}`, 1, 24 * 60 * 60);
  if (!throttle.allowed) return false;
  const result = await db.execute(sql`
    update jobs set view_count = view_count + 1
    where id = ${jobId} and status = 'published' and deleted_at is null`);
  return (result.rowCount ?? 0) > 0;
}
