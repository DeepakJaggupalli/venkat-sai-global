import { sql } from "drizzle-orm";

import { db } from "@/db";
import { logger } from "@/lib/logger";

import packageJson from "../../../../../package.json";

/**
 * GET /api/v1/health — liveness/readiness probe for load balancers, uptime monitors and the
 * Playwright smoke test. Pings the database with a timeout. Never exposes configuration,
 * secrets or internal error details.
 *   200 { status: "ok", version, uptimeSeconds, time, checks: { database: { status: "ok", latencyMs } } }
 *   503 { status: "error", …, checks: { database: { status: "error", latencyMs } } }
 */
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3000;

async function pingDatabase(): Promise<{ status: "ok" | "error"; latencyMs: number }> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Database ping timed out after ${DB_TIMEOUT_MS} ms`)), DB_TIMEOUT_MS);
      }),
    ]);
    return { status: "ok", latencyMs: Date.now() - started };
  } catch (error) {
    logger.error("Health check: database unavailable", { error });
    return { status: "error", latencyMs: Date.now() - started };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET(): Promise<Response> {
  const database = await pingDatabase();
  const ok = database.status === "ok";
  return Response.json(
    {
      status: ok ? "ok" : "error",
      version: packageJson.version,
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString(),
      checks: { database },
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
