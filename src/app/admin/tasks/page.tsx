import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { z } from "zod";

import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { AssignSelect } from "@/components/admin/assign-select";
import { PRIORITY_OPTIONS, PriorityBadge } from "@/components/admin/priority-badge";
import { listStaffOptions } from "@/components/admin/queries";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { humanize } from "@/lib/format";
import { parsePage } from "@/lib/http";
import { requireStaff } from "@/modules/identity/authz";
import { createStaffTaskAction, assignStaffTaskAction, setStaffTaskStatusAction, updateStaffTaskAction } from "@/modules/operations/admin-actions";
import { STAFF_TASK_STATUS_LABELS, STAFF_TASK_TRANSITIONS } from "@/modules/operations/constants";
import { staffRelatedHref } from "@/modules/operations/links";
import { getStaffTask, listStaffTasks, myTaskCounts, type StaffTaskListFilters } from "@/modules/operations/queries";

export const metadata: Metadata = { title: "My tasks" };

type SP = Record<string, string | string[] | undefined>;

const filtersSchema = z.object({
  view: z.enum(["mine", "created", "team", "overdue"]).catch("mine").default("mine"),
  status: z.enum(["open", "todo", "in_progress", "done", "cancelled", "all"]).catch("open").default("open"),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().catch(undefined),
  task: z.uuid().optional().catch(undefined),
});

const statusTone = { todo: "neutral", in_progress: "info", done: "success", cancelled: "neutral" } as const;
/** Open task past its due time (server render time). */
function isOverdue(t: { status: string; dueAt: Date | null }): boolean {
  return (t.status === "todo" || t.status === "in_progress") && !!t.dueAt && t.dueAt.getTime() < Date.now();
}

const TRANSITION_LABEL: Record<string, string> = { in_progress: "Start", done: "Mark done", todo: "Reopen", cancelled: "Cancel" };

export default async function StaffTasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireStaff();
  const sp = await searchParams;
  const f = filtersSchema.parse({ view: sp.view, status: sp.status, priority: sp.priority, task: sp.task });
  const page = parsePage(sp, { defaultSize: 25 });

  const listFilters: StaffTaskListFilters = {
    scope: f.view === "created" ? "created" : f.view === "team" ? "all" : f.view === "overdue" ? "mine" : "mine",
    status: f.view === "overdue" ? undefined : f.status === "all" ? undefined : f.status,
    priority: f.priority,
    due: f.view === "overdue" ? "overdue" : undefined,
  };
  const [result, counts, staff, selected] = await Promise.all([
    listStaffTasks(ctx, listFilters, page),
    myTaskCounts(ctx),
    listStaffOptions(),
    f.task ? getStaffTask(ctx, f.task) : Promise.resolve(null),
  ]);
  const closeHref = `/admin/tasks${f.view !== "mine" ? `?view=${f.view}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My tasks"
        description="Work items and reminders for you and the team. Due reminders are sent automatically."
        meta={
          <span className="text-sm text-muted-foreground">
            {counts.open} open · {counts.overdue} overdue
          </span>
        }
        actions={
          <ResponsiveDialog
            title="New task"
            description="Tasks are internal. Assign one to a colleague or leave it with yourself."
            trigger={<Button data-testid="new-task">New task</Button>}
          >
            <ActionForm
              action={createStaffTaskAction}
              testId="new-task-form"
              fields={[
                { name: "title", label: "Task", required: true },
                { name: "description", label: "Details", kind: "textarea", optional: true },
                { name: "priority", label: "Priority", kind: "select", options: PRIORITY_OPTIONS, defaultValue: "normal" },
                { name: "dueAt", label: "Due", kind: "datetime-local", optional: true },
                { name: "assignedToUserId", label: "Assign to", kind: "search-select", options: staff, defaultValue: ctx.user.id, allowClear: true },
              ]}
              submitLabel="Create task"
              pendingLabel="Creating…"
              resetOnSuccess
            />
          </ResponsiveDialog>
        }
      />

      <LinkTabs
        label="Task views"
        items={[
          { href: "/admin/tasks", label: "Assigned to me", count: counts.open },
          { href: "/admin/tasks?view=overdue", label: "Overdue", count: counts.overdue },
          { href: "/admin/tasks?view=created", label: "Created by me" },
          { href: "/admin/tasks?view=team", label: "Team" },
        ]}
      />

      {selected ? (
        <SectionCard
          title={selected.title}
          description={`Created by ${selected.createdByName ?? "a former staff member"}`}
          action={{ label: "Close", href: closeHref, variant: "ghost" }}
          id="task-detail"
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <ActionForm
              action={updateStaffTaskAction}
              hidden={{ id: selected.id }}
              columns={2}
              fields={[
                { name: "title", label: "Task", required: true, defaultValue: selected.title, wide: true },
                { name: "description", label: "Details", kind: "textarea", optional: true, defaultValue: selected.description },
                { name: "priority", label: "Priority", kind: "select", options: PRIORITY_OPTIONS, defaultValue: selected.priority },
                { name: "dueAt", label: "Due", kind: "datetime-local", optional: true, defaultValue: selected.dueAt?.toISOString() ?? null },
              ]}
              submitLabel="Save task"
            />
            <div className="space-y-4">
              <AssignSelect action={assignStaffTaskAction} recordId={selected.id} options={staff} current={selected.assignedToUserId} />
              {selected.relatedType && selected.relatedId ? (
                <p className="text-sm">
                  Related {humanize(selected.relatedType).toLowerCase()}:{" "}
                  <Link className="text-teal-strong underline underline-offset-4" href={staffRelatedHref(selected.relatedType, selected.relatedId)}>
                    open record
                  </Link>
                </p>
              ) : null}
            </div>
          </div>
        </SectionCard>
      ) : null}

      <FilterBar paramKeys={["status", "priority"]}>
        {f.view !== "overdue" ? (
          <FilterSelect
            param="status"
            label="Status"
            allLabel="Open"
            options={[
              ...Object.entries(STAFF_TASK_STATUS_LABELS).map(([value, label]) => ({ value, label })),
              { value: "all", label: "Any status" },
            ]}
          />
        ) : null}
        <FilterSelect param="priority" label="Priority" allLabel="Any priority" options={PRIORITY_OPTIONS} />
      </FilterBar>

      <DataTable
        caption="Tasks"
        rows={result.items}
        getRowId={(t) => t.id}
        columns={[
          {
            id: "title",
            header: "Task",
            primary: true,
            cell: (t) => (
              <div className="min-w-0">
                <Link href={`/admin/tasks?task=${t.id}${f.view !== "mine" ? `&view=${f.view}` : ""}`} className="font-medium text-foreground hover:underline">
                  {t.title}
                </Link>
                {t.relatedType && t.relatedId ? (
                  <p className="text-xs text-muted-foreground">
                    <Link href={staffRelatedHref(t.relatedType, t.relatedId)} className="underline underline-offset-2">
                      Related {humanize(t.relatedType).toLowerCase()}
                    </Link>
                  </p>
                ) : null}
              </div>
            ),
          },
          { id: "priority", header: "Priority", cell: (t) => <PriorityBadge priority={t.priority} /> },
          {
            id: "due",
            header: "Due",
            nowrap: true,
            cell: (t) =>
              t.dueAt ? (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <DateText value={t.dueAt} mode="datetime" />
                  {isOverdue(t) ? (
                    <StatusBadge tone="danger" size="sm">
                      Overdue
                    </StatusBadge>
                  ) : null}
                </span>
              ) : (
                <span className="text-muted-foreground">No due date</span>
              ),
          },
          { id: "assignee", header: "Assignee", hideOnMobile: true, cell: (t) => t.assigneeName ?? <span className="text-muted-foreground">Unassigned</span> },
          { id: "status", header: "Status", cell: (t) => <StatusBadge tone={statusTone[t.status]} size="sm">{STAFF_TASK_STATUS_LABELS[t.status]}</StatusBadge> },
          {
            id: "actions",
            header: <span className="sr-only">Actions</span>,
            align: "right",
            cell: (t) => (
              <span className="flex flex-wrap justify-end gap-1.5">
                {STAFF_TASK_TRANSITIONS[t.status]
                  .filter((s) => s !== "cancelled")
                  .map((s) => (
                    <ActionButton key={s} action={setStaffTaskStatusAction.bind(null, { id: t.id, status: s })} variant={s === "done" ? "default" : "outline"}>
                      {TRANSITION_LABEL[s]}
                      <span className="sr-only">: {t.title}</span>
                    </ActionButton>
                  ))}
              </span>
            ),
          },
        ]}
        empty={
          <EmptyState
            icon={<ClipboardCheck />}
            title={f.view === "overdue" ? "Nothing overdue" : "No tasks here"}
            description={f.view === "team" ? "Tasks the team creates appear here." : "Create a task to keep track of follow-ups and reminders."}
          />
        }
        footer={
          <Pagination pathname="/admin/tasks" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="tasks" />
        }
      />
    </div>
  );
}
