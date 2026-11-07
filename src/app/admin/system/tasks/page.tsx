import type { Metadata } from "next";
import { ListChecks, Play, RotateCcw, Trash2 } from "lucide-react";
import { z } from "zod";

import { ActionButton } from "@/components/admin/action-button";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { JOB_STATUSES } from "@/db/schema";
import { env } from "@/lib/env";
import { humanize } from "@/lib/format";
import { parsePage, withParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { anyDevTransport } from "../../settings/integrations/_lib/integration-status";
import { deleteTasksAction, retryAllDeadAction, retryTasksAction, runRecurringNowAction } from "../actions";
import { SystemNav } from "../_components/system-nav";
import { listTasks, queueOverview, taskTypes } from "../_lib/system";

export const metadata: Metadata = { title: "Task queue" };

type SP = Record<string, string | string[] | undefined>;
const STATUS_TONE = { queued: "info", running: "brand", succeeded: "success", failed: "warning", dead: "danger" } as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireStaff("system.jobs");
  const tz = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const sp = await searchParams;
  const status = z.enum(JOB_STATUSES).optional().catch(undefined).parse(sp.status);
  const type = z.string().trim().max(100).optional().catch(undefined).parse(typeof sp.type === "string" ? sp.type : undefined);
  const page = parsePage(sp, { defaultSize: 50, maxSize: 100 });
  const [result, types, overview] = await Promise.all([listTasks({ status, type }, page), taskTypes(), queueOverview()]);
  const typeOptions = types.map((t) => ({ value: t, label: t }));
  const showOutbox = staffCan(ctx, "system.dev_outbox") && anyDevTransport();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Task queue"
        description="Background work such as notifications, file scanning and search refreshes. Failed tasks retry automatically with back-off; dead tasks gave up and need attention."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "System", href: "/admin/system" }, { label: "Task queue" }]}
        actions={
          overview.counts.dead > 0 ? (
            <ActionButton
              action={retryAllDeadAction.bind(null, { type })}
              icon={<RotateCcw aria-hidden className="size-4" />}
              confirm={{ title: type ? `Retry every dead “${type}” task?` : "Retry every dead task?", description: "They are queued again with a fresh retry budget. Fix the cause first, or they will fail again.", confirmLabel: "Retry all" }}
            >
              Retry dead tasks
            </ActionButton>
          ) : null
        }
      />
      <SystemNav showOutbox={showOutbox} />

      <LinkTabs
        label="Task status"
        items={[
          { href: withParams("/admin/system/tasks", sp, { status: null, page: null }), label: "All", match: "exact" },
          ...JOB_STATUSES.map((s) => ({ href: withParams("/admin/system/tasks", sp, { status: s, page: null }), label: humanize(s), count: overview.counts[s], match: "exact" as const })),
        ]}
      />

      <FilterScope>
        <FilterBar paramKeys={["type"]}>
          <FilterSelect param="type" label="Task type" allLabel="All task types" options={typeOptions} />
        </FilterBar>
        <FilterChips filters={[{ param: "type", label: "Type", options: typeOptions }]} />
        <FilterPendingRegion>
          <DataTable
            caption="Background tasks"
            rows={result.items}
            getRowId={(r) => String(r.id)}
            columns={[
              {
                id: "task",
                header: "Task",
                primary: true,
                cell: (r) => (
                  <div className="min-w-0">
                    <p className="font-medium">
                      <code>{r.type}</code> <span className="text-xs text-muted-foreground">#{r.id}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{r.payloadKeys.length ? `Payload: ${r.payloadKeys.join(", ")}` : "No payload"}</p>
                  </div>
                ),
              },
              { id: "status", header: "Status", cell: (r) => <StatusBadge tone={STATUS_TONE[r.status]} size="sm">{humanize(r.status)}</StatusBadge> },
              { id: "attempts", header: "Attempts", align: "right", cell: (r) => `${r.attempts} / ${r.maxAttempts}` },
              {
                id: "when",
                header: "Run at / finished",
                hideOnMobile: true,
                cell: (r) => (
                  <span className="text-sm">
                    <DateText value={r.completedAt ?? r.runAt} mode="datetime" timeZone={tz} />
                  </span>
                ),
              },
              {
                id: "error",
                header: "Last error",
                cell: (r) =>
                  r.lastError ? (
                    <details className="max-w-md">
                      <summary className="cursor-pointer truncate text-sm text-danger-strong">{r.lastError.split("\n")[0]!.slice(0, 120)}</summary>
                      <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-subtle p-2 text-xs">{r.lastError}</pre>
                    </details>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
              },
              {
                id: "actions",
                header: "Actions",
                align: "right",
                cell: (r) =>
                  r.status === "failed" || r.status === "dead" || r.status === "succeeded" ? (
                    <span className="flex justify-end gap-2">
                      {r.status !== "succeeded" ? (
                        <ActionButton action={retryTasksAction.bind(null, { ids: [r.id] })} icon={<RotateCcw aria-hidden className="size-3.5" />} testId={`retry-${r.id}`}>
                          Retry<span className="sr-only"> task {r.id}</span>
                        </ActionButton>
                      ) : null}
                      <ActionButton
                        action={deleteTasksAction.bind(null, { ids: [r.id] })}
                        variant="ghost"
                        icon={<Trash2 aria-hidden className="size-3.5" />}
                        confirm={{ title: `Delete task #${r.id}?`, description: "The record and its error are removed. This cannot be undone.", confirmLabel: "Delete", destructive: true }}
                      >
                        <span className="sr-only">Delete task {r.id}</span>
                      </ActionButton>
                    </span>
                  ) : null,
              },
            ]}
            empty={<EmptyState icon={<ListChecks />} title={status ? `No ${humanize(status).toLowerCase()} tasks` : "The queue is empty"} description="Tasks appear here when the platform schedules background work." />}
            footer={<Pagination pathname="/admin/system/tasks" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="tasks" />}
          />
        </FilterPendingRegion>
      </FilterScope>

      <SectionCard title="Run a recurring task now" description="Queues one run immediately in addition to the schedule. Useful after fixing a failure or to test a change." flush>
        <ul className="divide-y">
          {overview.recurring.map((t) => (
            <li key={t.type} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 text-sm">
                <span className="block font-medium">{t.description}</span>
                <span className="text-xs text-muted-foreground">
                  <code>{t.type}</code> · every {t.everyMinutes >= 1440 ? `${t.everyMinutes / 1440} day${t.everyMinutes === 1440 ? "" : "s"}` : t.everyMinutes >= 60 ? `${t.everyMinutes / 60} hour${t.everyMinutes === 60 ? "" : "s"}` : `${t.everyMinutes} minutes`}
                  {t.lastStatus ? ` · last ${humanize(t.lastStatus).toLowerCase()}` : ""}
                </span>
              </span>
              {t.hasHandler ? (
                <ActionButton action={runRecurringNowAction.bind(null, { type: t.type })} icon={<Play aria-hidden className="size-3.5" />} testId={`run-${t.type}`}>
                  Run now<span className="sr-only"> {t.description}</span>
                </ActionButton>
              ) : (
                <StatusBadge tone="warning" size="sm">No handler</StatusBadge>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
