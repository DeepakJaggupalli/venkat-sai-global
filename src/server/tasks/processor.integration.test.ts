/**
 * Integration tests for the PostgreSQL task queue. They only run against an isolated test
 * database (DATABASE_URL containing "vsg_test_"), e.g.:
 *   node scripts/test-db.mjs vsg_test_infra
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_infra'; npx vitest run src/server/tasks
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");
/** Dedicated queue so the tests never claim real tasks. */
const Q = "test";

describe.skipIf(!enabled)("task processor (PostgreSQL)", async () => {
  // Vitest still runs the factory of a skipped suite: do not touch the database then.
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  const { sql } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { enqueueTask } = await import("./queue");
  const { processDueTasks, processUntil, recoverStaleTasks } = await import("./processor");
  const { enqueueRecurringTasks } = await import("./scheduler");

  type Row = { id: number; status: string; attempts: number; last_error: string | null; run_at: Date; completed_at: Date | null; locked_by: string | null };
  const getTask = async (id: number): Promise<Row> => {
    const res = await db.execute<Row>(sql`select id, status, attempts, last_error, run_at, completed_at, locked_by from background_jobs where id = ${id}`);
    return res.rows[0]!;
  };

  const cleanup = () => db.execute(sql`delete from background_jobs where type like 'test.%'`);

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it("runs a due task and marks it succeeded", async () => {
    const seen: Record<string, unknown>[] = [];
    const id = await enqueueTask("test.echo", { hello: "world" }, { queue: Q });
    const summary = await processDueTasks({ handlers: { "test.echo": async (payload) => void seen.push(payload) }, workerId: "test-worker", queue: Q });
    expect(summary).toMatchObject({ claimed: 1, succeeded: 1, retried: 0, dead: 0 });
    expect(seen).toEqual([{ hello: "world" }]);
    const row = await getTask(id!);
    expect(row.status).toBe("succeeded");
    expect(row.attempts).toBe(1);
    expect(row.completed_at).not.toBeNull();
    expect(row.locked_by).toBeNull();
  });

  it("does not run tasks scheduled in the future", async () => {
    const id = await enqueueTask("test.later", {}, { runAt: new Date(Date.now() + 60_000), queue: Q });
    const summary = await processDueTasks({ handlers: { "test.later": async () => undefined }, queue: Q });
    expect(summary.claimed).toBe(0);
    expect((await getTask(id!)).status).toBe("queued");
  });

  it("retries a failing task with backoff, then marks it dead after maxAttempts", async () => {
    const id = await enqueueTask("test.fail", {}, { maxAttempts: 2, queue: Q });
    const handlers = {
      "test.fail": async () => {
        throw new Error("boom");
      },
    };
    const first = await processDueTasks({ handlers, queue: Q });
    expect(first).toMatchObject({ claimed: 1, retried: 1 });
    let row = await getTask(id!);
    expect(row.status).toBe("queued");
    expect(row.attempts).toBe(1);
    expect(row.last_error).toContain("boom");
    expect(new Date(row.run_at).getTime()).toBeGreaterThan(Date.now() + 10_000); // ≥ 15 s backoff for attempt 1

    await db.execute(sql`update background_jobs set run_at = now() where id = ${id}`);
    const second = await processDueTasks({ handlers, queue: Q });
    expect(second).toMatchObject({ claimed: 1, dead: 1 });
    row = await getTask(id!);
    expect(row.status).toBe("dead");
    expect(row.attempts).toBe(2);
    expect(row.completed_at).not.toBeNull();
  });

  it("marks unknown task types dead immediately", async () => {
    const id = await enqueueTask("test.unknown_type", {}, { queue: Q });
    const summary = await processDueTasks({ handlers: {}, queue: Q });
    expect(summary).toMatchObject({ claimed: 1, dead: 1 });
    const row = await getTask(id!);
    expect(row.status).toBe("dead");
    expect(row.last_error).toContain("No handler registered");
  });

  it("times out a hanging handler and schedules a retry", async () => {
    const id = await enqueueTask("test.hang", {}, { queue: Q });
    const summary = await processDueTasks({ handlers: { "test.hang": () => new Promise<void>(() => undefined) }, timeoutMs: 1000, queue: Q });
    expect(summary).toMatchObject({ claimed: 1, retried: 1 });
    expect((await getTask(id!)).last_error).toContain("TaskTimeoutError");
  });

  it("never lets two concurrent processors claim the same task (SKIP LOCKED)", async () => {
    const ids = await Promise.all(Array.from({ length: 6 }, (_, i) => enqueueTask("test.parallel", { i }, { queue: Q })));
    const runs: number[] = [];
    const handlers = {
      "test.parallel": async (payload: Record<string, unknown>) => {
        runs.push(Number(payload.i));
        await new Promise((r) => setTimeout(r, 50));
      },
    };
    const [a, b] = await Promise.all([
      processUntil({ handlers, concurrency: 2, deadline: Date.now() + 20_000, minRemainingMs: 0, workerId: "worker-a", queue: Q }),
      processUntil({ handlers, concurrency: 2, deadline: Date.now() + 20_000, minRemainingMs: 0, workerId: "worker-b", queue: Q }),
    ]);
    expect(a.succeeded + b.succeeded).toBe(6);
    expect([...runs].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    for (const id of ids) expect((await getTask(id!)).status).toBe("succeeded");
  });

  it("recovers tasks left running by a dead worker", async () => {
    const live = await enqueueTask("test.stale", {}, { maxAttempts: 3 });
    const exhausted = await enqueueTask("test.stale_exhausted", {}, { maxAttempts: 1 });
    await db.execute(sql`update background_jobs set status = 'running', attempts = 1, locked_at = now() - interval '20 minutes', locked_by = 'ghost' where id in (${live}, ${exhausted})`);
    const result = await recoverStaleTasks();
    expect(result.requeued).toBeGreaterThanOrEqual(1);
    expect(result.dead).toBeGreaterThanOrEqual(1);
    expect((await getTask(live!)).status).toBe("queued");
    expect((await getTask(exhausted!)).status).toBe("dead");
    expect((await getTask(live!)).last_error).toContain("Recovered");
  });

  it("enqueues each recurring task once per interval bucket", async () => {
    const tasks = [
      { type: "test.recurring", everyMinutes: 5, description: "test" },
      { type: "test.no_handler", everyMinutes: 5, description: "test" },
    ];
    const handlers = { "test.recurring": async () => undefined };
    const now = new Date("2026-11-07T10:02:00Z");
    const first = await enqueueRecurringTasks({ now, tasks, handlers });
    expect(first.enqueued).toEqual(["test.recurring"]);
    expect(first.skippedNoHandler).toEqual(["test.no_handler"]);
    const again = await enqueueRecurringTasks({ now: new Date("2026-11-07T10:04:59Z"), tasks, handlers });
    expect(again.alreadyScheduled).toEqual(["test.recurring"]);
    const next = await enqueueRecurringTasks({ now: new Date("2026-11-07T10:05:00Z"), tasks, handlers });
    expect(next.enqueued).toEqual(["test.recurring"]);
  });
});
