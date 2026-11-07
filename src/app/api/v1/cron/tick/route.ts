import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { defaultWorkerId, processUntil, recoverStaleTasks } from "@/server/tasks/processor";
import { enqueueRecurringTasks } from "@/server/tasks/scheduler";

/**
 * GET|POST /api/v1/cron/tick — serverless replacement for `npm run worker`.
 * Called every 5 minutes by Vercel Cron (vercel.json), or by any scheduler, with
 * `Authorization: Bearer <CRON_SECRET>`. Runs the recurring-task scheduler, recovers stale tasks,
 * then processes due tasks until ~45 s have elapsed. Returns a JSON summary.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BUDGET_MS = 45_000;

/** Constant-time comparison that does not leak the secret's length (compares SHA-256 digests). */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b) && provided.length === expected.length;
}

async function tick(request: Request): Promise<Response> {
  const secret = env().CRON_SECRET;
  if (!secret) {
    logger.error("Cron tick called but CRON_SECRET is not configured");
    return Response.json({ ok: false, error: "Cron is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || !secretMatches(token, secret)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store", "WWW-Authenticate": "Bearer" } });
  }

  const started = Date.now();
  const deadline = started + BUDGET_MS;
  try {
    const scheduled = await enqueueRecurringTasks();
    const recovered = await recoverStaleTasks();
    const processed = await processUntil({ deadline, concurrency: 4, workerId: defaultWorkerId("cron") });
    const body = {
      ok: true,
      scheduled: { enqueued: scheduled.enqueued, alreadyScheduled: scheduled.alreadyScheduled.length, skippedNoHandler: scheduled.skippedNoHandler },
      recovered,
      processed,
      durationMs: Date.now() - started,
    };
    logger.info("Cron tick finished", { enqueued: scheduled.enqueued.length, ...processed, recovered });
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("Cron tick failed", { error });
    return Response.json({ ok: false, error: "Tick failed. See server logs." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET(request: Request): Promise<Response> {
  return tick(request);
}

export async function POST(request: Request): Promise<Response> {
  return tick(request);
}
