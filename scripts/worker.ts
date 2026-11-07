/**
 * Background worker for VM / container deployments (serverless hosts use /api/v1/cron/tick).
 *
 *   npm run worker
 *
 *  - every 60 s: enqueue recurring tasks (src/server/tasks/schedule.ts) and recover stale tasks
 *  - every 2 s:  claim and run due tasks (drains continuously while work is available)
 *  - WORKER_CONCURRENCY (default 4) tasks run in parallel; several workers may run side by side
 *  - SIGINT / SIGTERM: stop claiming, let running tasks finish (max WORKER_SHUTDOWN_TIMEOUT_MS,
 *    default 30 s), close the database pool and exit. A second signal exits immediately.
 */
import Module from "node:module";
import path from "node:path";

const root = path.resolve(__dirname, "..");

/**
 * The worker runs with `--conditions=react-server` (so `server-only` imports are allowed), but
 * plain Node then resolves `next/navigation` to its client build, which needs client React APIs.
 * Point it at the react-server build Next.js itself uses for server code (redirect, notFound,
 * forbidden, unstable_rethrow).
 */
function aliasReactServerNavigation(): void {
  const target = require.resolve("next/dist/client/components/navigation.react-server.js");
  const loader = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
  const original = loader._resolveFilename;
  loader._resolveFilename = function resolve(this: unknown, request: string, ...rest: unknown[]): string {
    if (request === "next/navigation" || request === "next/navigation.js") return target;
    return original.call(this, request, ...rest);
  };
}
aliasReactServerNavigation();

const SCHEDULER_INTERVAL_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

async function main(): Promise<void> {
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(root, process.env.NODE_ENV !== "production", { info: () => undefined, error: console.error });
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local (or set it in the environment).");
    process.exitCode = 1;
    return;
  }

  const { logger } = await import("@/lib/logger");
  const { pool } = await import("@/db");
  const { defaultWorkerId, processDueTasks, recoverStaleTasks } = await import("@/server/tasks/processor");
  const { enqueueRecurringTasks } = await import("@/server/tasks/scheduler");

  const concurrency = intFromEnv("WORKER_CONCURRENCY", 4, 1, 50);
  const shutdownTimeoutMs = intFromEnv("WORKER_SHUTDOWN_TIMEOUT_MS", 30_000, 1_000, 10 * 60_000);
  const workerId = defaultWorkerId("worker");

  let stopping = false;
  const sleepers = new Set<() => void>();
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        sleepers.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      sleepers.add(done);
    });

  const onSignal = (signal: NodeJS.Signals) => {
    if (stopping) {
      logger.warn("Second shutdown signal received; exiting immediately", { signal });
      process.exit(1);
    }
    stopping = true;
    logger.info("Shutdown requested; finishing running tasks", { signal, workerId });
    for (const wake of [...sleepers]) wake();
    setTimeout(() => {
      logger.error("Worker did not stop in time; exiting", { shutdownTimeoutMs });
      process.exit(1);
    }, shutdownTimeoutMs).unref();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const schedulerLoop = async () => {
    while (!stopping) {
      try {
        await enqueueRecurringTasks();
        await recoverStaleTasks();
      } catch (error) {
        logger.error("Scheduler run failed", { error });
      }
      await sleep(SCHEDULER_INTERVAL_MS);
    }
  };

  const processorLoop = async () => {
    while (!stopping) {
      try {
        const summary = await processDueTasks({ workerId, concurrency });
        if (summary.claimed > 0) {
          logger.debug("Processed tasks", { ...summary });
          continue; // keep draining while there is work
        }
      } catch (error) {
        logger.error("Task processing round failed", { error });
      }
      await sleep(POLL_INTERVAL_MS);
    }
  };

  logger.info("Worker started", { workerId, concurrency, pid: process.pid });
  await Promise.all([schedulerLoop(), processorLoop()]);
  await pool.end().catch(() => undefined);
  logger.info("Worker stopped", { workerId });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
