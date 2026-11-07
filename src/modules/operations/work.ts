import "server-only";

import { and, eq, isNull, lte, inArray, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { internalNotes, organizations, tasks, users } from "@/db/schema";
import type { InternalNoteVisibility, StaffTaskStatus } from "@/db/schema/operations";
import { ActionError } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { audit } from "@/modules/audit";
import { staffCan, type OrgContext, type StaffContext } from "@/modules/identity/authz";
import { notify } from "@/modules/notifications";

import { canTransition, NOTE_ENTITY_TYPES, ORG_NOTE_ENTITY_TYPES, STAFF_TASK_STATUS_LABELS, STAFF_TASK_TRANSITIONS, type NoteEntityType } from "./constants";
import { ENTITY_STAFF_PERMISSION, entityExists, organizationOwnsEntity } from "./entities";
import { leadsWithDueFollowUps } from "./leads";
import { staffLeadHref, staffRelatedHref } from "./links";
import type { InternalNoteInput, StaffTaskInput, StaffTaskUpdateInput } from "./schemas";

/**
 * Internal staff tasks (any staff member; editing limited to the creator, the assignee and super admins),
 * polymorphic internal notes (staff-only or organisation-internal) and the reminder sweep.
 */

export type StaffTaskRow = typeof tasks.$inferSelect;
export type InternalNoteRow = typeof internalNotes.$inferSelect;

async function assertActiveStaffUser(userId: string, tx: DbOrTx = db): Promise<{ id: string; displayName: string }> {
  const [row] = await tx
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isStaff, true), eq(users.status, "active")))
    .limit(1);
  if (!row) throw new ActionError("Choose an active team member.", { fieldErrors: { assignedToUserId: ["Not an active team member"] } });
  return row;
}

function isNoteEntityType(value: string): value is NoteEntityType {
  return (NOTE_ENTITY_TYPES as readonly string[]).includes(value);
}

async function validateRelated(tx: DbOrTx, ctx: StaffContext, relatedType?: string | null, relatedId?: string | null): Promise<void> {
  if (!relatedType && !relatedId) return;
  if (!relatedType || !relatedId || !isNoteEntityType(relatedType)) throw new ActionError("Choose what this is about.", { fieldErrors: { relatedId: ["Invalid record"] } });
  const permission = ENTITY_STAFF_PERMISSION[relatedType];
  if (permission && !staffCan(ctx, permission)) throw new ActionError("You do not have access to that record.", { code: "forbidden" });
  if (!(await entityExists(tx, relatedType, relatedId))) throw new ActionError("The linked record could not be found.", { fieldErrors: { relatedId: ["Not found"] } });
}

async function validateOrganization(tx: DbOrTx, organizationId?: string | null): Promise<void> {
  if (!organizationId) return;
  const [org] = await tx.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, organizationId), isNull(organizations.deletedAt))).limit(1);
  if (!org) throw new ActionError("Organisation not found.", { fieldErrors: { organizationId: ["Choose an organisation"] } });
}

// ---------------------------------------------------------------------------
// Staff tasks
// ---------------------------------------------------------------------------

async function loadTaskForUpdate(tx: DbOrTx, id: string): Promise<StaffTaskRow> {
  const [row] = await tx.select().from(tasks).where(eq(tasks.id, id)).for("update").limit(1);
  if (!row) throw new ActionError("Task not found.");
  return row;
}

function assertTaskEditor(ctx: StaffContext, task: StaffTaskRow): void {
  if (ctx.isSuperAdmin || task.createdByUserId === ctx.user.id || task.assignedToUserId === ctx.user.id) return;
  throw new ActionError("Only the person who created or owns this task can change it.", { code: "forbidden" });
}

async function notifyTaskAssignee(tx: DbOrTx, ctx: StaffContext, task: Pick<StaffTaskRow, "id" | "title" | "dueAt" | "priority" | "relatedType" | "relatedId">, assigneeId: string): Promise<void> {
  if (assigneeId === ctx.user.id) return;
  await notify(
    {
      event: "work.assigned",
      recipients: [{ userId: assigneeId }],
      data: { kindLabel: "task", title: task.title, assignedBy: ctx.user.displayName, dueAt: task.dueAt?.toISOString() ?? null, priority: task.priority },
      link: staffRelatedHref(task.relatedType, task.relatedId),
    },
    { tx },
  );
}

/** Create an internal task (optionally assigned and linked to a record the creator can see). */
export async function createStaffTask(ctx: StaffContext, input: StaffTaskInput): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const assignee = input.assignedToUserId ? await assertActiveStaffUser(input.assignedToUserId, tx) : null;
    await validateRelated(tx, ctx, input.relatedType, input.relatedId);
    await validateOrganization(tx, input.organizationId);
    const [task] = await tx
      .insert(tasks)
      .values({
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        dueAt: input.dueAt ?? null,
        assignedToUserId: assignee?.id ?? null,
        createdByUserId: ctx.user.id,
        organizationId: input.organizationId ?? null,
        relatedType: input.relatedType ?? null,
        relatedId: input.relatedId ?? null,
      })
      .returning();
    await audit({ action: "task.created", entityType: "task", entityId: task!.id, organizationId: task!.organizationId, metadata: { assignedToUserId: assignee?.id ?? null, relatedType: task!.relatedType }, actorUserId: ctx.user.id, actorType: "staff", tx });
    if (assignee) await notifyTaskAssignee(tx, ctx, task!, assignee.id);
    return { id: task!.id };
  });
}

/** Edit a task (creator, assignee or super admin). Changing the due date re-arms the reminder. */
export async function updateStaffTask(ctx: StaffContext, input: StaffTaskUpdateInput): Promise<void> {
  await db.transaction(async (tx) => {
    const task = await loadTaskForUpdate(tx, input.id);
    assertTaskEditor(ctx, task);
    if (input.relatedType !== undefined || input.relatedId !== undefined) {
      await validateRelated(tx, ctx, input.relatedType ?? task.relatedType, input.relatedId ?? task.relatedId);
    }
    if (input.organizationId !== undefined) await validateOrganization(tx, input.organizationId);
    const patch: Partial<typeof tasks.$inferInsert> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description ?? null;
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.dueAt !== undefined) {
      patch.dueAt = input.dueAt ?? null;
      patch.reminderSentAt = null;
    }
    if (input.organizationId !== undefined) patch.organizationId = input.organizationId ?? null;
    if (input.relatedType !== undefined) patch.relatedType = input.relatedType ?? null;
    if (input.relatedId !== undefined) patch.relatedId = input.relatedId ?? null;
    if (!Object.keys(patch).length && input.assignedToUserId === undefined) return;
    if (Object.keys(patch).length) await tx.update(tasks).set(patch).where(eq(tasks.id, input.id));
    await audit({ action: "task.updated", entityType: "task", entityId: input.id, metadata: { fields: Object.keys(patch) }, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
  if (input.assignedToUserId !== undefined) await assignStaffTask(ctx, input.id, input.assignedToUserId ?? null);
}

/** Assign / unassign a task; the new assignee is notified. */
export async function assignStaffTask(ctx: StaffContext, id: string, assigneeUserId: string | null): Promise<void> {
  await db.transaction(async (tx) => {
    const task = await loadTaskForUpdate(tx, id);
    assertTaskEditor(ctx, task);
    const assignee = assigneeUserId ? await assertActiveStaffUser(assigneeUserId, tx) : null;
    if (task.assignedToUserId === (assignee?.id ?? null)) return;
    await tx.update(tasks).set({ assignedToUserId: assignee?.id ?? null, reminderSentAt: null }).where(eq(tasks.id, id));
    await audit({ action: "task.assigned", entityType: "task", entityId: id, metadata: { from: task.assignedToUserId, to: assignee?.id ?? null }, actorUserId: ctx.user.id, actorType: "staff", tx });
    if (assignee) await notifyTaskAssignee(tx, ctx, task, assignee.id);
  });
}

/** Move a task (STAFF_TASK_TRANSITIONS); "done" stamps who completed it and when. */
export async function setStaffTaskStatus(ctx: StaffContext, id: string, status: StaffTaskStatus): Promise<void> {
  await db.transaction(async (tx) => {
    const task = await loadTaskForUpdate(tx, id);
    assertTaskEditor(ctx, task);
    if (!canTransition(STAFF_TASK_TRANSITIONS, task.status, status)) {
      throw new ActionError(`A task cannot move from ${STAFF_TASK_STATUS_LABELS[task.status]} to ${STAFF_TASK_STATUS_LABELS[status]}.`);
    }
    const done = status === "done";
    await tx
      .update(tasks)
      .set({ status, completedAt: done ? new Date() : null, completedByUserId: done ? ctx.user.id : null })
      .where(eq(tasks.id, id));
    await audit({ action: "task.status_changed", entityType: "task", entityId: id, metadata: { from: task.status, to: status }, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

export async function completeStaffTask(ctx: StaffContext, id: string): Promise<void> {
  await setStaffTaskStatus(ctx, id, "done");
}

// ---------------------------------------------------------------------------
// Internal notes
// ---------------------------------------------------------------------------

export type NoteActor = { kind: "staff"; ctx: StaffContext } | { kind: "org"; ctx: OrgContext };

async function assertNoteAccess(tx: DbOrTx, actor: NoteActor, entityType: NoteEntityType, entityId: string): Promise<void> {
  if (actor.kind === "staff") {
    const permission = ENTITY_STAFF_PERMISSION[entityType];
    if (permission && !staffCan(actor.ctx, permission)) throw new ActionError("You do not have access to this record.", { code: "forbidden" });
    if (!(await entityExists(tx, entityType, entityId))) throw new ActionError("Record not found.");
    return;
  }
  if (!ORG_NOTE_ENTITY_TYPES.includes(entityType)) throw new ActionError("Notes cannot be added to this record.", { code: "forbidden" });
  if (!(await organizationOwnsEntity(tx, entityType, entityId, actor.ctx.organization.id))) throw new ActionError("Record not found.");
}

/**
 * Add a note. Staff notes default to "staff" visibility; staff may also write organisation-internal notes
 * (organizationId required). Organisation members always write "org_internal" notes for their own
 * organisation, only on records their organisation is party to. Notes never reach candidates.
 */
export async function addInternalNote(actor: NoteActor, input: InternalNoteInput): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    await assertNoteAccess(tx, actor, input.entityType, input.entityId);
    let visibility: InternalNoteVisibility = input.visibility;
    let organizationId: string | null = input.organizationId ?? null;
    if (actor.kind === "org") {
      visibility = "org_internal";
      organizationId = actor.ctx.organization.id;
    } else if (visibility === "org_internal") {
      if (!organizationId) throw new ActionError("Choose the organisation this note belongs to.", { fieldErrors: { organizationId: ["Required for organisation notes"] } });
      await validateOrganization(tx, organizationId);
    }
    const authorUserId = actor.ctx.user.id;
    const [note] = await tx
      .insert(internalNotes)
      .values({ entityType: input.entityType, entityId: input.entityId, organizationId, authorUserId, body: input.body, visibility, pinned: input.pinned })
      .returning({ id: internalNotes.id });
    await audit({
      action: "note.created",
      entityType: input.entityType,
      entityId: input.entityId,
      organizationId,
      metadata: { noteId: note!.id, visibility },
      actorUserId: authorUserId,
      actorType: actor.kind === "staff" ? "staff" : "user",
      tx,
    });
    return { id: note!.id };
  });
}

async function loadNoteForActor(tx: DbOrTx, actor: NoteActor, id: string): Promise<InternalNoteRow> {
  const [note] = await tx.select().from(internalNotes).where(and(eq(internalNotes.id, id), isNull(internalNotes.deletedAt))).for("update").limit(1);
  if (!note) throw new ActionError("Note not found.");
  if (actor.kind === "org" && (note.visibility !== "org_internal" || note.organizationId !== actor.ctx.organization.id)) throw new ActionError("Note not found.");
  if (!isNoteEntityType(note.entityType)) throw new ActionError("Note not found.");
  await assertNoteAccess(tx, actor, note.entityType, note.entityId);
  return note;
}

/** Edit (author only) or pin / unpin (anyone who can see the note) an internal note. */
export async function updateInternalNote(actor: NoteActor, id: string, input: { body?: string; pinned?: boolean }): Promise<void> {
  await db.transaction(async (tx) => {
    const note = await loadNoteForActor(tx, actor, id);
    if (input.body !== undefined && note.authorUserId !== actor.ctx.user.id) throw new ActionError("Only the author can edit this note.", { code: "forbidden" });
    const patch: Partial<typeof internalNotes.$inferInsert> = {};
    if (input.body !== undefined) patch.body = input.body;
    if (input.pinned !== undefined) patch.pinned = input.pinned;
    if (!Object.keys(patch).length) return;
    await tx.update(internalNotes).set(patch).where(eq(internalNotes.id, id));
    await audit({ action: "note.updated", entityType: note.entityType, entityId: note.entityId, organizationId: note.organizationId, metadata: { noteId: id, fields: Object.keys(patch) }, actorUserId: actor.ctx.user.id, actorType: actor.kind === "staff" ? "staff" : "user", tx });
  });
}

/** Soft-delete a note (its author, a super admin, or an organisation owner for their organisation's notes). */
export async function deleteInternalNote(actor: NoteActor, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const note = await loadNoteForActor(tx, actor, id);
    const allowed =
      note.authorUserId === actor.ctx.user.id || (actor.kind === "staff" && actor.ctx.isSuperAdmin) || (actor.kind === "org" && actor.ctx.isOwner);
    if (!allowed) throw new ActionError("Only the author can delete this note.", { code: "forbidden" });
    await tx.update(internalNotes).set({ deletedAt: new Date() }).where(eq(internalNotes.id, id));
    await audit({ action: "note.deleted", entityType: note.entityType, entityId: note.entityId, organizationId: note.organizationId, metadata: { noteId: id }, actorUserId: actor.ctx.user.id, actorType: actor.kind === "staff" ? "staff" : "user", tx });
  });
}

export type InternalNoteView = {
  id: string;
  body: string;
  visibility: InternalNoteVisibility;
  organizationId: string | null;
  pinned: boolean;
  authorUserId: string | null;
  authorName: string | null;
  isOwn: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Notes on an entity visible to the actor (staff: all; organisation members: their organisation's notes). */
export async function listInternalNotes(actor: NoteActor, entityType: NoteEntityType, entityId: string): Promise<InternalNoteView[]> {
  await assertNoteAccess(db, actor, entityType, entityId);
  const conditions = [eq(internalNotes.entityType, entityType), eq(internalNotes.entityId, entityId), isNull(internalNotes.deletedAt)];
  if (actor.kind === "org") conditions.push(eq(internalNotes.visibility, "org_internal"), eq(internalNotes.organizationId, actor.ctx.organization.id));
  const rows = await db
    .select({
      id: internalNotes.id,
      body: internalNotes.body,
      visibility: internalNotes.visibility,
      organizationId: internalNotes.organizationId,
      pinned: internalNotes.pinned,
      authorUserId: internalNotes.authorUserId,
      authorName: users.displayName,
      createdAt: internalNotes.createdAt,
      updatedAt: internalNotes.updatedAt,
    })
    .from(internalNotes)
    .leftJoin(users, eq(users.id, internalNotes.authorUserId))
    .where(and(...conditions))
    .orderBy(sql`${internalNotes.pinned} desc`, sql`${internalNotes.createdAt} desc`)
    .limit(200);
  return rows.map((r) => ({ ...r, authorName: r.authorName ?? null, isOwn: r.authorUserId === actor.ctx.user.id }));
}

// ---------------------------------------------------------------------------
// Reminders (background task "operations.reminders")
// ---------------------------------------------------------------------------

/** Remind assignees of tasks due within the hour (once per due time) and of lead follow-ups that are due. */
export async function runOperationsReminders(now: Date = new Date()): Promise<{ tasks: number; leads: number }> {
  const horizon = new Date(now.getTime() + 60 * 60 * 1000);
  const dueTasks = await db
    .select()
    .from(tasks)
    .where(and(inArray(tasks.status, ["todo", "in_progress"]), isNull(tasks.reminderSentAt), lte(tasks.dueAt, horizon), sql`${tasks.assignedToUserId} is not null`))
    .limit(500);
  let taskCount = 0;
  for (const task of dueTasks) {
    try {
      await db.transaction(async (tx) => {
        const claimed = await tx
          .update(tasks)
          .set({ reminderSentAt: now })
          .where(and(eq(tasks.id, task.id), isNull(tasks.reminderSentAt)))
          .returning({ id: tasks.id });
        if (!claimed.length || !task.assignedToUserId || !task.dueAt) return;
        await notify(
          {
            event: "work.reminder",
            recipients: [{ userId: task.assignedToUserId }],
            data: { kindLabel: "task", title: task.title, dueAt: task.dueAt.toISOString(), overdue: task.dueAt.getTime() < now.getTime() },
            link: staffRelatedHref(task.relatedType, task.relatedId),
            dedupeKey: `task-reminder:${task.id}:${task.dueAt.toISOString()}`,
          },
          { tx },
        );
        taskCount += 1;
      });
    } catch (error) {
      logger.error("Task reminder failed", { taskId: task.id, error });
    }
  }

  const followUps = await leadsWithDueFollowUps(now);
  let leadCount = 0;
  for (const lead of followUps) {
    if (!lead.assignedToUserId || !lead.nextFollowUpAt) continue;
    await notify({
      event: "work.reminder",
      recipients: [{ userId: lead.assignedToUserId }],
      data: { kindLabel: "lead follow-up", title: lead.organizationName ? `${lead.name} (${lead.organizationName})` : lead.name, code: lead.code, dueAt: lead.nextFollowUpAt.toISOString(), overdue: lead.nextFollowUpAt.getTime() < now.getTime() },
      link: staffLeadHref(lead.id),
      dedupeKey: `lead-follow-up:${lead.id}:${lead.nextFollowUpAt.toISOString()}`,
    });
    leadCount += 1;
  }
  return { tasks: taskCount, leads: leadCount };
}
