import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: Date; count: number };

/**
 * Fixed-window rate limiter backed by PostgreSQL (works across serverless instances).
 *
 *   const rl = await rateLimit(`otp:send:${phone}`, 5, 60 * 15);
 *   if (!rl.allowed) throw new ActionError("Too many attempts. Try again later.");
 *
 * Suggested keys: "login:<identifier>", "login-ip:<ipHash>", "otp:send:<target>",
 * "otp:verify:<target>", "enquiry:<ipHash>", "collect:<ipHash>".
 */
/**
 * Local end-to-end runs only: many browser tests share 127.0.0.1, so per-IP limits would block them.
 * Never effective in a production build or on Vercel, whatever the environment says.
 */
function rateLimitsDisabledForE2E(): boolean {
  return process.env.E2E_DISABLE_RATE_LIMITS === "1" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  if (rateLimitsDisabledForE2E()) return { allowed: true, remaining: limit, resetAt: new Date(Date.now() + windowSeconds * 1000), count: 0 };
  const interval = `${Math.max(1, Math.floor(windowSeconds))} seconds`;
  const result = await db.execute<{ count: number; expires_at: Date | string }>(sql`
    insert into rate_limit_buckets (key, count, window_started_at, expires_at)
    values (${key}, 1, now(), now() + ${interval}::interval)
    on conflict (key) do update set
      count = case when rate_limit_buckets.expires_at <= now() then 1 else rate_limit_buckets.count + 1 end,
      window_started_at = case when rate_limit_buckets.expires_at <= now() then now() else rate_limit_buckets.window_started_at end,
      expires_at = case when rate_limit_buckets.expires_at <= now() then now() + ${interval}::interval else rate_limit_buckets.expires_at end
    returning count, expires_at
  `);
  const row = result.rows[0];
  const count = Number(row?.count ?? 1);
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: new Date(row?.expires_at ?? Date.now() + windowSeconds * 1000),
    count,
  };
}

/** Reset a bucket (e.g. after a successful login). */
export async function resetRateLimit(key: string): Promise<void> {
  await db.execute(sql`delete from rate_limit_buckets where key = ${key}`);
}
