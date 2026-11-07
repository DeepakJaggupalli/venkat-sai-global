import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { backgroundJobs, devOutbox, JOB_STATUSES } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { env } from "@/lib/env";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit } from "@/modules/audit";
import { getSetting } from "@/modules/settings";
import { enqueueTask, taskQueueStats } from "@/server/tasks/queue";
import { taskHandlers } from "@/server/tasks/registry";
import { RECURRING_TASKS } from "@/server/tasks/schedule";

import { getIntegrationStatuses } from "../../settings/integrations/_lib/integration-status";

/** System monitor reads and maintenance actions (system.jobs / system.dev_outbox). */

export type JobStatus = (typeof JOB_STATUSES)[number];

export type TaskRow = {
  id: number;
  type: string;
  queue: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  /** Payload keys only: values can hold single-use links or personal data. */
  payloadKeys: string[];
};

export async function queueOverview() {
  const [stats, [overdue], lastRuns, recentFailures] = await Promise.all([
    taskQueueStats(),
    db
      .select({ oldest: sql<Date | null>`min(${backgroundJobs.runAt})`, value: count() })
      .from(backgroundJobs)
      .where(and(eq(backgroundJobs.status, "queued"), lt(backgroundJobs.runAt, sql`now() - interval '10 minutes'`))),
    db
      .select({ type: backgroundJobs.type, lastCompleted: sql<Date | null>`max(${backgroundJobs.completedAt})`, lastStatus: sql<string | null>`(array_agg(${backgroundJobs.status} order by ${backgroundJobs.createdAt} desc))[1]` })
      .from(backgroundJobs)
      .where(inArray(backgroundJobs.type, RECURRING_TASKS.map((t) => t.type)))
      .groupBy(backgroundJobs.type),
    db
      .select({ value: count() })
      .from(backgroundJobs)
      .where(and(inArray(backgroundJobs.status, ["failed", "dead"]), sql`${backgroundJobs.createdAt} > now() - interval '24 hours'`)),
  ]);
  const byType = new Map(lastRuns.map((r) => [r.type, r]));
  return {
    counts: Object.fromEntries(JOB_STATUSES.map((s) => [s, stats[s] ?? 0])) as Record<JobStatus, number>,
    overdueCount: overdue?.value ?? 0,
    oldestOverdue: overdue?.oldest ? new Date(overdue.oldest) : null,
    failures24h: recentFailures[0]?.value ?? 0,
    recurring: RECURRING_TASKS.map((t) => ({
      ...t,
      hasHandler: Boolean(taskHandlers[t.type]),
      lastCompleted: byType.get(t.type)?.lastCompleted ? new Date(byType.get(t.type)!.lastCompleted!) : null,
      lastStatus: byType.get(t.type)?.lastStatus ?? null,
    })),
  };
}

export async function listTasks(f: { status?: JobStatus; type?: string }, page: PageQuery): Promise<Paginated<TaskRow>> {
  const where = and(f.status ? eq(backgroundJobs.status, f.status) : undefined, f.type ? eq(backgroundJobs.type, f.type) : undefined);
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: backgroundJobs.id,
        type: backgroundJobs.type,
        queue: backgroundJobs.queue,
        status: backgroundJobs.status,
        attempts: backgroundJobs.attempts,
        maxAttempts: backgroundJobs.maxAttempts,
        runAt: backgroundJobs.runAt,
        createdAt: backgroundJobs.createdAt,
        completedAt: backgroundJobs.completedAt,
        lockedBy: backgroundJobs.lockedBy,
        lastError: backgroundJobs.lastError,
        payloadKeys: sql<string[]>`coalesce((select array_agg(k order by k) from jsonb_object_keys(${backgroundJobs.payload}) k), '{}')`,
      })
      .from(backgroundJobs)
      .where(where)
      .orderBy(f.status === "queued" ? asc(backgroundJobs.runAt) : desc(backgroundJobs.createdAt), desc(backgroundJobs.id))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(backgroundJobs).where(where),
  ]);
  return paginated(rows, total?.value ?? 0, page);
}

export async function taskTypes(): Promise<string[]> {
  const rows = await db.selectDistinct({ t: backgroundJobs.type }).from(backgroundJobs).orderBy(asc(backgroundJobs.type)).limit(300);
  return [...new Set([...rows.map((r) => r.t), ...Object.keys(taskHandlers)])].sort();
}

/** Put failed / dead tasks back in the queue now (attempts reset so they get a full retry budget). */
export async function retryTasks(ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = await db
    .update(backgroundJobs)
    .set({ status: "queued", runAt: new Date(), attempts: 0, lockedAt: null, lockedBy: null, completedAt: null })
    .where(and(inArray(backgroundJobs.id, ids), inArray(backgroundJobs.status, ["failed", "dead"])))
    .returning({ id: backgroundJobs.id, type: backgroundJobs.type });
  if (rows.length) await audit({ action: "system.tasks_retried", entityType: "background_job", metadata: { ids: rows.map((r) => r.id), types: [...new Set(rows.map((r) => r.type))] } });
  return rows.length;
}

export async function retryAllDead(type?: string): Promise<number> {
  const rows = await db
    .update(backgroundJobs)
    .set({ status: "queued", runAt: new Date(), attempts: 0, lockedAt: null, lockedBy: null, completedAt: null })
    .where(and(eq(backgroundJobs.status, "dead"), type ? eq(backgroundJobs.type, type) : undefined))
    .returning({ id: backgroundJobs.id });
  if (rows.length) await audit({ action: "system.tasks_retried", entityType: "background_job", metadata: { count: rows.length, type: type ?? null, bulk: true } });
  return rows.length;
}

/** Delete finished tasks (dead, failed or succeeded). Queued and running tasks are never deleted here. */
export async function deleteTasks(ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = await db
    .delete(backgroundJobs)
    .where(and(inArray(backgroundJobs.id, ids), inArray(backgroundJobs.status, ["dead", "failed", "succeeded"])))
    .returning({ id: backgroundJobs.id, type: backgroundJobs.type });
  if (rows.length) await audit({ action: "system.tasks_deleted", entityType: "background_job", metadata: { ids: rows.map((r) => r.id), types: [...new Set(rows.map((r) => r.type))] } });
  return rows.length;
}

/** Enqueue a recurring task now (deduplicated per minute so double clicks do not queue twice). */
export async function runRecurringNow(type: string): Promise<boolean> {
  const def = RECURRING_TASKS.find((t) => t.type === type);
  if (!def) throw new ActionError("Unknown recurring task.");
  if (!taskHandlers[type]) throw new ActionError("This task has no handler yet.");
  const bucket = Math.floor(Date.now() / 60_000);
  const id = await enqueueTask(type, {}, { dedupeKey: `manual:${type}:${bucket}` });
  await audit({ action: "system.task_run_now", entityType: "background_job", entityId: id ? String(id) : null, metadata: { type, queued: Boolean(id) } });
  return Boolean(id);
}

// ---------------------------------------------------------------------------
// Dev outbox
// ---------------------------------------------------------------------------

export async function listOutbox(f: { channel?: "email" | "sms" | "whatsapp"; to?: string }, page: PageQuery) {
  const where = and(f.channel ? eq(devOutbox.channel, f.channel) : undefined, f.to ? ilike(devOutbox.to, `%${f.to.replace(/[%_\\]/g, "")}%`) : undefined);
  const [rows, [total]] = await Promise.all([
    db
      .select({ id: devOutbox.id, channel: devOutbox.channel, to: devOutbox.to, subject: devOutbox.subject, bodyText: devOutbox.bodyText, createdAt: devOutbox.createdAt })
      .from(devOutbox)
      .where(where)
      .orderBy(desc(devOutbox.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(devOutbox).where(where),
  ]);
  return paginated(rows, total?.value ?? 0, page);
}

export async function clearOutbox(): Promise<number> {
  const rows = await db.delete(devOutbox).returning({ id: devOutbox.id });
  await audit({ action: "system.dev_outbox_cleared", entityType: "dev_outbox", metadata: { count: rows.length } });
  return rows.length;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function databaseHealth(): Promise<{ ok: boolean; latencyMs: number; version: string | null; sizeBytes: number | null }> {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    const latencyMs = Date.now() - started;
    const res = await db.execute<{ version: string; size: string | null }>(sql`select current_setting('server_version') as version, pg_database_size(current_database())::text as size`);
    const row = res.rows[0];
    return { ok: true, latencyMs, version: row?.version ?? null, sizeBytes: row?.size ? Number(row.size) : null };
  } catch {
    return { ok: false, latencyMs: Date.now() - started, version: null, sizeBytes: null };
  }
}

export type ConfigWarning = { level: "warning" | "danger" | "info"; title: string; detail: string; href?: string };

/** Configuration problems worth fixing, from settings and environment presence (never secret values). */
export async function configurationWarnings(queue: { overdueCount: number }): Promise<ConfigWarning[]> {
  const e = env();
  const prod = e.NODE_ENV === "production";
  const out: ConfigWarning[] = [];
  const require2fa = await getSetting("security.require_staff_2fa");
  if (prod && !require2fa) out.push({ level: "danger", title: "Staff two-factor authentication is not required", detail: "Turn it on before handling real candidate data.", href: "/admin/settings/security" });
  if (prod && /localhost|127\.0\.0\.1/.test(e.APP_URL)) out.push({ level: "danger", title: "APP_URL points to localhost", detail: "Links in e-mails and OAuth callbacks will be wrong. Set APP_URL to the public address." });
  for (const s of getIntegrationStatuses()) {
    if (s.state === "incomplete") out.push({ level: "warning", title: `${s.name} is only partly configured`, detail: s.detail, href: "/admin/settings/integrations" });
    if (prod && s.state === "development" && (s.id === "email" || s.id === "sms")) out.push({ level: "danger", title: `${s.name} is in development mode in production`, detail: "Sign-in codes and notifications are not delivered to people.", href: "/admin/settings/integrations" });
    if (prod && s.id === "storage" && s.provider === "Local disk") out.push({ level: "warning", title: "Files are stored on local disk", detail: "Use S3-compatible or Vercel Blob storage when hosting on more than one server or on serverless platforms.", href: "/admin/settings/integrations" });
    if (prod && s.id === "clamav" && s.state === "not_configured") out.push({ level: "info", title: "Uploads are not scanned for malware", detail: "Configure ClamAV to scan résumés and documents.", href: "/admin/settings/integrations" });
  }
  if (queue.overdueCount > 0) out.push({ level: "warning", title: `${queue.overdueCount} task${queue.overdueCount === 1 ? " is" : "s are"} waiting more than 10 minutes`, detail: "The worker or cron job may not be running. Check `npm run worker` or the cron schedule calling /api/v1/cron/tick.", href: "/admin/system/tasks?status=queued" });
  return out;
}
