import "server-only";

import { and, desc, eq, inArray, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { applicationNotes, users, type ApplicationNoteVisibility } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";

import { assertOrg, assertStaff, assertUuid, loadApplicationScope, type ApplicationScope } from "./access";
import { actorOrganizationId, auditActorType } from "./actors";
import { forbiddenError, notFoundError } from "./errors";
import { applicationNoteSchema, updateApplicationNoteSchema } from "./schemas";
import type { EmployerActor, PartnerActor, RecruitmentActor, StaffActor } from "./types";

/**
 * Internal notes on applications — never shown to candidates. Visibility decides who besides
 * Venkat Sai staff can read a note:
 *  - staff_only: staff;
 *  - staff_and_employer: staff + the employer that owns the job (employers always write this);
 *  - staff_and_partner: staff + the partner credited with the application (partners always write this).
 */

export type ApplicationNoteView = {
  id: string;
  applicationId: string;
  body: string;
  visibility: ApplicationNoteVisibility;
  isPinned: boolean;
  authorUserId: string | null;
  authorName: string | null;
  authorOrganizationId: string | null;
  /** "venkat_sai" for staff notes, else the author's organisation. */
  authorParty: "venkat_sai" | "employer" | "partner";
  canEdit: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type NoteActor = StaffActor | EmployerActor | PartnerActor;

/** Visibility a party may write and the visibilities it may read. */
export function noteVisibilityFor(kind: NoteActor["kind"]): { write: readonly ApplicationNoteVisibility[]; read: readonly ApplicationNoteVisibility[] } {
  switch (kind) {
    case "staff":
      return { write: ["staff_only", "staff_and_employer", "staff_and_partner"], read: ["staff_only", "staff_and_employer", "staff_and_partner"] };
    case "employer":
      return { write: ["staff_and_employer"], read: ["staff_and_employer"] };
    case "partner":
      return { write: ["staff_and_partner"], read: ["staff_and_partner"] };
  }
}

function assertNoteAccess(actor: NoteActor, scope: ApplicationScope, mode: "read" | "write"): void {
  switch (actor.kind) {
    case "staff":
      assertStaff(actor.ctx, mode === "read" ? ["recruitment.view", "recruitment.manage"] : ["recruitment.manage"], "any");
      return;
    case "employer":
      assertOrg(actor.ctx, mode === "read" ? ["employer.pipeline.view"] : ["employer.pipeline.manage"], "any");
      if (scope.job.organizationId !== actor.ctx.organization.id || !scope.sharedWithEmployerAt) throw notFoundError("Application");
      return;
    case "partner":
      assertOrg(actor.ctx, mode === "read" ? ["partner.submissions.view"] : ["partner.candidates.submit"], "any");
      if (scope.partnerOrganizationId !== actor.ctx.organization.id) throw notFoundError("Application");
      return;
  }
}

export async function addApplicationNote(actor: NoteActor, input: { applicationId: string; body: string; visibility?: ApplicationNoteVisibility }): Promise<{ id: string }> {
  const data = applicationNoteSchema.parse(input);
  return db.transaction(async (tx) => {
    const scope = await loadApplicationScope(data.applicationId, tx);
    if (!scope) throw notFoundError("Application");
    assertNoteAccess(actor, scope, "write");
    const allowed = noteVisibilityFor(actor.kind).write;
    const visibility = actor.kind === "staff" ? data.visibility : allowed[0]!;
    if (!allowed.includes(visibility)) throw forbiddenError();
    if (visibility === "staff_and_partner" && !scope.partnerOrganizationId) {
      throw new ActionError("This application has no recruitment partner to share the note with.", { fieldErrors: { visibility: ["No partner on this application"] } });
    }
    const [row] = await tx
      .insert(applicationNotes)
      .values({ applicationId: scope.id, authorUserId: actor.ctx.user.id, authorOrganizationId: actorOrganizationId(actor), visibility, body: data.body })
      .returning({ id: applicationNotes.id });
    await audit({
      action: "application.note_added",
      entityType: "application",
      entityId: scope.id,
      organizationId: scope.job.organizationId,
      actorUserId: actor.ctx.user.id,
      actorType: auditActorType(actor),
      metadata: { noteId: row!.id, visibility },
      tx,
    });
    return { id: row!.id };
  });
}

async function loadNoteForChange(actor: NoteActor, noteId: string) {
  assertUuid(noteId, "Note");
  const [note] = await db.select().from(applicationNotes).where(eq(applicationNotes.id, noteId)).limit(1);
  if (!note) throw notFoundError("Note");
  const scope = await loadApplicationScope(note.applicationId);
  if (!scope) throw notFoundError("Note");
  assertNoteAccess(actor, scope, "write");
  if (!noteVisibilityFor(actor.kind).read.includes(note.visibility)) throw notFoundError("Note");
  return { note, scope };
}

/** Edit your own note's text; staff may also pin / unpin any note. */
export async function updateApplicationNote(actor: NoteActor, input: { noteId: string; body?: string; isPinned?: boolean }): Promise<void> {
  const data = updateApplicationNoteSchema.parse(input);
  const { note, scope } = await loadNoteForChange(actor, data.noteId);
  const set: Partial<typeof applicationNotes.$inferInsert> = {};
  if (data.body !== undefined) {
    if (note.authorUserId !== actor.ctx.user.id) throw forbiddenError("You can only edit your own notes.");
    set.body = data.body;
  }
  if (data.isPinned !== undefined) {
    if (actor.kind !== "staff") throw forbiddenError("Only Venkat Sai staff can pin notes.");
    set.isPinned = data.isPinned;
  }
  if (!Object.keys(set).length) return;
  await db.update(applicationNotes).set(set).where(eq(applicationNotes.id, note.id));
  await audit({
    action: "application.note_updated",
    entityType: "application",
    entityId: scope.id,
    organizationId: scope.job.organizationId,
    actorUserId: actor.ctx.user.id,
    actorType: auditActorType(actor),
    metadata: { noteId: note.id, pinned: data.isPinned },
  });
}

/** Delete your own note (staff with recruitment.manage may delete any note). */
export async function deleteApplicationNote(actor: NoteActor, noteId: string): Promise<void> {
  const { note, scope } = await loadNoteForChange(actor, noteId);
  if (note.authorUserId !== actor.ctx.user.id && actor.kind !== "staff") throw forbiddenError("You can only delete your own notes.");
  await db.delete(applicationNotes).where(eq(applicationNotes.id, note.id));
  await audit({
    action: "application.note_deleted",
    entityType: "application",
    entityId: scope.id,
    organizationId: scope.job.organizationId,
    actorUserId: actor.ctx.user.id,
    actorType: auditActorType(actor),
    metadata: { noteId: note.id, visibility: note.visibility },
  });
}

/** Notes the actor may read, pinned first then newest first. Candidates never see notes. */
export async function listApplicationNotes(actor: RecruitmentActor, applicationId: string): Promise<ApplicationNoteView[]> {
  if (actor.kind === "candidate") return [];
  const scope = await loadApplicationScope(applicationId);
  if (!scope) throw notFoundError("Application");
  if (actor.kind === "system") throw forbiddenError();
  assertNoteAccess(actor, scope, "read");
  const visibilities = noteVisibilityFor(actor.kind).read;
  const where: SQL[] = [eq(applicationNotes.applicationId, scope.id), inArray(applicationNotes.visibility, [...visibilities])];
  // Partners only see partner-visible notes written by staff or by themselves.
  if (actor.kind === "partner") {
    where.push(or(eq(applicationNotes.authorOrganizationId, actor.ctx.organization.id), eq(applicationNotes.visibility, "staff_and_partner"))!);
  }
  const rows = await db
    .select({ note: applicationNotes, authorName: users.displayName, authorIsStaff: users.isStaff })
    .from(applicationNotes)
    .leftJoin(users, eq(users.id, applicationNotes.authorUserId))
    .where(and(...where))
    .orderBy(desc(applicationNotes.isPinned), desc(applicationNotes.createdAt))
    .limit(500);
  return rows.map(({ note, authorName }) => ({
    id: note.id,
    applicationId: note.applicationId,
    body: note.body,
    visibility: note.visibility,
    isPinned: note.isPinned,
    authorUserId: note.authorUserId,
    authorName,
    authorOrganizationId: note.authorOrganizationId,
    authorParty: !note.authorOrganizationId ? "venkat_sai" : note.authorOrganizationId === scope.partnerOrganizationId ? "partner" : "employer",
    canEdit: note.authorUserId === actor.ctx.user.id,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }));
}
