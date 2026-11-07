import "server-only";

import { and, asc, count, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import {
  candidateCredentials,
  candidateEducation,
  candidateExperience,
  candidateLanguages,
  candidateSkills,
  educationLevels,
  jobs,
  languages,
  requirementRequests,
  skills,
  talentListItems,
  talentLists,
  users,
  type TalentListKind,
} from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";

import { assertOrg, assertOrgActive, assertStaff, assertUuid } from "./access";
import { actorOrganizationId, auditActorType } from "./actors";
import { loadCardRows, loadOrgRelations, toCandidateCard, type CandidateCard, type CardViewer } from "./candidate-cards";
import { forbiddenError, notFoundError } from "./errors";
import {
  compareCandidatesSchema,
  talentListItemUpdateSchema,
  talentListItemsSchema,
  talentListSchema,
  updateTalentListSchema,
  type TalentListInput,
  type UpdateTalentListInput,
} from "./schemas";
import type { BulkResult, EmployerActor, StaffActor } from "./types";
import { isDiscoverableByOrg } from "./visibility";

/**
 * Talent lists: employer shortlists, saved candidates, projects and talent pools (organisation
 * lists), plus Venkat Sai staff lists (no organisation). Private lists are visible to their creator;
 * shared lists to the whole organisation (or all staff). Adding a candidate requires that the
 * organisation may see them (discoverable, applied to its jobs, or unlocked); membership never
 * reveals contact details.
 */

export type TalentListActor = StaffActor | EmployerActor;

type ListRow = typeof talentLists.$inferSelect;

export type TalentListSummary = {
  id: string;
  name: string;
  description: string | null;
  kind: TalentListKind;
  jobId: string | null;
  requirementId: string | null;
  isShared: boolean;
  archivedAt: Date | null;
  createdByUserId: string | null;
  createdByName: string | null;
  itemCount: number;
  updatedAt: Date;
  /** The actor created the list (may delete it). */
  isOwn: boolean;
};

export type TalentListItemView = {
  candidate: CandidateCard;
  note: string | null;
  stage: string | null;
  sortOrder: number;
  addedAt: Date;
  addedByName: string | null;
};

export type TalentListDetail = TalentListSummary & {
  items: TalentListItemView[];
  /** Members the organisation can no longer see (the candidate hid the profile or blocked the organisation). */
  unavailableCount: number;
};

export type TalentCompareRow = {
  candidate: CandidateCard;
  skillDetails: { name: string; level: string | null; yearsExperience: number | null; verified: boolean }[];
  languages: { name: string; proficiency: string }[];
  highestEducation: { level: string | null; qualification: string | null } | null;
  verifiedCredentialCount: number;
  recentRoles: { jobTitle: string; months: number | null; isCurrent: boolean }[];
  note: string | null;
  stage: string | null;
};

function assertListPermission(actor: TalentListActor, mode: "read" | "write"): void {
  if (actor.kind === "staff") {
    assertStaff(actor.ctx, mode === "read" ? ["candidates.view", "recruitment.view"] : ["candidates.manage", "recruitment.manage"], "any");
    return;
  }
  assertOrg(actor.ctx, "employer.candidates.lists");
  if (mode === "write") assertOrgActive(actor.ctx);
}

/** Lists the actor may see: same scope (organisation / staff), and shared or own. */
function visibleListCondition(actor: TalentListActor): SQL {
  const scope = actor.kind === "employer" ? eq(talentLists.organizationId, actor.ctx.organization.id) : isNull(talentLists.organizationId);
  return and(scope, or(eq(talentLists.isShared, true), eq(talentLists.createdByUserId, actor.ctx.user.id)))!;
}

async function loadList(actor: TalentListActor, listId: string, tx: DbOrTx = db): Promise<ListRow> {
  assertUuid(listId, "Talent list");
  const [list] = await tx
    .select()
    .from(talentLists)
    .where(and(eq(talentLists.id, listId), visibleListCondition(actor)))
    .limit(1);
  if (!list) throw notFoundError("Talent list");
  return list;
}

async function validateListLinks(actor: TalentListActor, input: { jobId?: string | null; requirementId?: string | null }, tx: DbOrTx): Promise<void> {
  if (input.jobId) {
    const [job] = await tx.select({ organizationId: jobs.organizationId }).from(jobs).where(and(eq(jobs.id, input.jobId), isNull(jobs.deletedAt))).limit(1);
    if (!job || (actor.kind === "employer" && job.organizationId !== actor.ctx.organization.id)) throw notFoundError("Job");
  }
  if (input.requirementId) {
    const [requirement] = await tx.select({ organizationId: requirementRequests.organizationId }).from(requirementRequests).where(eq(requirementRequests.id, input.requirementId)).limit(1);
    if (!requirement || (actor.kind === "employer" && requirement.organizationId !== actor.ctx.organization.id)) throw notFoundError("Requirement");
  }
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export async function createTalentList(actor: TalentListActor, input: TalentListInput): Promise<{ id: string }> {
  assertListPermission(actor, "write");
  const data = talentListSchema.parse(input);
  return db.transaction(async (tx) => {
    await validateListLinks(actor, data, tx);
    const [row] = await tx
      .insert(talentLists)
      .values({
        organizationId: actorOrganizationId(actor),
        kind: data.kind,
        name: data.name,
        description: data.description,
        jobId: data.jobId,
        requirementId: data.requirementId,
        createdByUserId: actor.ctx.user.id,
        isShared: data.isShared,
      })
      .returning({ id: talentLists.id });
    await audit({
      action: "talent_list.created",
      entityType: "talent_list",
      entityId: row!.id,
      organizationId: actorOrganizationId(actor),
      actorUserId: actor.ctx.user.id,
      actorType: auditActorType(actor),
      metadata: { name: data.name, kind: data.kind, isShared: data.isShared },
      tx,
    });
    return { id: row!.id };
  });
}

export async function updateTalentList(actor: TalentListActor, input: UpdateTalentListInput): Promise<void> {
  assertListPermission(actor, "write");
  const data = updateTalentListSchema.parse(input);
  await db.transaction(async (tx) => {
    const list = await loadList(actor, data.listId, tx);
    await validateListLinks(actor, { jobId: data.jobId ?? null, requirementId: data.requirementId ?? null }, tx);
    if (data.isShared !== undefined && list.createdByUserId !== actor.ctx.user.id) throw forbiddenError("Only the list's creator can change who sees it.");
    const set: Partial<typeof talentLists.$inferInsert> = {};
    if (data.name !== undefined) set.name = data.name;
    if (data.description !== undefined) set.description = data.description;
    if (data.kind !== undefined) set.kind = data.kind;
    if (data.jobId !== undefined) set.jobId = data.jobId;
    if (data.requirementId !== undefined) set.requirementId = data.requirementId;
    if (data.isShared !== undefined) set.isShared = data.isShared;
    if (data.archived !== undefined) set.archivedAt = data.archived ? new Date() : null;
    if (!Object.keys(set).length) return;
    await tx.update(talentLists).set(set).where(eq(talentLists.id, list.id));
    await audit({
      action: "talent_list.updated",
      entityType: "talent_list",
      entityId: list.id,
      organizationId: list.organizationId,
      actorUserId: actor.ctx.user.id,
      actorType: auditActorType(actor),
      metadata: { fields: Object.keys(set) },
      tx,
    });
  });
}

/** Delete a list (its creator, the organisation owner, or staff with write access for staff lists). */
export async function deleteTalentList(actor: TalentListActor, listId: string): Promise<void> {
  assertListPermission(actor, "write");
  const list = await loadList(actor, listId);
  const mayDelete = list.createdByUserId === actor.ctx.user.id || (actor.kind === "employer" && actor.ctx.isOwner) || actor.kind === "staff";
  if (!mayDelete) throw forbiddenError("Only the list's creator can delete it.");
  await db.delete(talentLists).where(eq(talentLists.id, list.id));
  await audit({
    action: "talent_list.deleted",
    entityType: "talent_list",
    entityId: list.id,
    organizationId: list.organizationId,
    actorUserId: actor.ctx.user.id,
    actorType: auditActorType(actor),
    metadata: { name: list.name },
  });
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Add candidates the organisation may see (per candidate result; already-listed candidates count as success). */
export async function addCandidatesToList(actor: TalentListActor, input: { listId: string; candidateIds: string[]; note?: string | null }): Promise<BulkResult[]> {
  assertListPermission(actor, "write");
  const data = talentListItemsSchema.parse(input);
  return db.transaction(async (tx) => {
    const list = await loadList(actor, data.listId, tx);
    if (list.archivedAt) throw new ActionError("This list is archived.", { code: "list_archived" });
    const ids = [...new Set(data.candidateIds)];
    const rows = await loadCardRows(ids, tx);
    const byId = new Map(rows.map((r) => [r.candidateId, r]));
    const relations = actor.kind === "employer" ? await loadOrgRelations(actor.ctx.organization.id, ids, tx) : null;
    const results: BulkResult[] = [];
    const toInsert: string[] = [];
    for (const id of ids) {
      const row = byId.get(id);
      let visible = Boolean(row && !row.deletedAt);
      if (visible && actor.kind === "employer" && row) {
        const relation = relations!.get(id)!;
        visible =
          isDiscoverableByOrg({ visibility: row.visibility, deletedAt: row.deletedAt }, row.privacy, { id: actor.ctx.organization.id, status: actor.ctx.organization.status }) ||
          relation.hasSharedApplication ||
          relation.hasActiveUnlock;
      }
      if (!visible) results.push({ id, ok: false, error: "Candidate not found." });
      else {
        toInsert.push(id);
        results.push({ id, ok: true });
      }
    }
    if (toInsert.length) {
      const [last] = await tx.select({ value: sql<number>`coalesce(max(${talentListItems.sortOrder}), 0)` }).from(talentListItems).where(eq(talentListItems.listId, list.id));
      const base = Number(last?.value ?? 0);
      await tx
        .insert(talentListItems)
        .values(toInsert.map((candidateId, i) => ({ listId: list.id, candidateId, addedByUserId: actor.ctx.user.id, note: data.note, sortOrder: base + (i + 1) * 10 })))
        .onConflictDoNothing({ target: [talentListItems.listId, talentListItems.candidateId] });
      await tx.update(talentLists).set({ updatedAt: new Date() }).where(eq(talentLists.id, list.id));
      await audit({
        action: "talent_list.candidates_added",
        entityType: "talent_list",
        entityId: list.id,
        organizationId: list.organizationId,
        actorUserId: actor.ctx.user.id,
        actorType: auditActorType(actor),
        metadata: { candidateIds: toInsert },
        tx,
      });
    }
    return results;
  });
}

export async function removeCandidateFromList(actor: TalentListActor, input: { listId: string; candidateId: string }): Promise<void> {
  assertListPermission(actor, "write");
  assertUuid(input.candidateId, "Candidate");
  const list = await loadList(actor, input.listId);
  const removed = await db
    .delete(talentListItems)
    .where(and(eq(talentListItems.listId, list.id), eq(talentListItems.candidateId, input.candidateId)))
    .returning({ id: talentListItems.id });
  if (!removed.length) return;
  await db.update(talentLists).set({ updatedAt: new Date() }).where(eq(talentLists.id, list.id));
  await audit({
    action: "talent_list.candidate_removed",
    entityType: "talent_list",
    entityId: list.id,
    organizationId: list.organizationId,
    actorUserId: actor.ctx.user.id,
    actorType: auditActorType(actor),
    metadata: { candidateId: input.candidateId },
  });
}

/** Update the list owner's private note, free-form project stage or order of a list member. */
export async function updateTalentListItem(actor: TalentListActor, input: { listId: string; candidateId: string; note?: string | null; stage?: string | null; sortOrder?: number }): Promise<void> {
  assertListPermission(actor, "write");
  const data = talentListItemUpdateSchema.parse(input);
  const list = await loadList(actor, data.listId);
  const set: Partial<typeof talentListItems.$inferInsert> = {};
  if (data.note !== undefined) set.note = data.note;
  if (data.stage !== undefined) set.stage = data.stage;
  if (data.sortOrder !== undefined) set.sortOrder = data.sortOrder;
  if (!Object.keys(set).length) return;
  const updated = await db
    .update(talentListItems)
    .set(set)
    .where(and(eq(talentListItems.listId, list.id), eq(talentListItems.candidateId, data.candidateId)))
    .returning({ id: talentListItems.id });
  if (!updated.length) throw notFoundError("List member");
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export async function listTalentLists(actor: TalentListActor, opts: { includeArchived?: boolean; jobId?: string } = {}): Promise<TalentListSummary[]> {
  assertListPermission(actor, "read");
  const where: SQL[] = [visibleListCondition(actor)];
  if (!opts.includeArchived) where.push(isNull(talentLists.archivedAt));
  if (opts.jobId) {
    assertUuid(opts.jobId, "Job");
    where.push(eq(talentLists.jobId, opts.jobId));
  }
  const itemCount = sql<number>`(select count(*)::int from ${talentListItems} where ${talentListItems.listId} = ${talentLists.id})`;
  const rows = await db
    .select({ list: talentLists, createdByName: users.displayName, itemCount })
    .from(talentLists)
    .leftJoin(users, eq(users.id, talentLists.createdByUserId))
    .where(and(...where))
    .orderBy(desc(talentLists.updatedAt))
    .limit(500);
  return rows.map((r) => toSummary(r.list, r.createdByName, Number(r.itemCount), actor));
}

function toSummary(list: ListRow, createdByName: string | null, itemCount: number, actor: TalentListActor): TalentListSummary {
  return {
    id: list.id,
    name: list.name,
    description: list.description,
    kind: list.kind,
    jobId: list.jobId,
    requirementId: list.requirementId,
    isShared: list.isShared,
    archivedAt: list.archivedAt,
    createdByUserId: list.createdByUserId,
    createdByName,
    itemCount,
    updatedAt: list.updatedAt,
    isOwn: list.createdByUserId === actor.ctx.user.id,
  };
}

/** Load member rows the actor may still see, as cards (masked as privacy settings require). */
async function visibleMembers(actor: TalentListActor, listId: string, candidateFilter?: readonly string[]) {
  const where: SQL[] = [eq(talentListItems.listId, listId)];
  if (candidateFilter) where.push(inArray(talentListItems.candidateId, [...candidateFilter]));
  const items = await db
    .select({ item: talentListItems, addedByName: users.displayName })
    .from(talentListItems)
    .leftJoin(users, eq(users.id, talentListItems.addedByUserId))
    .where(and(...where))
    .orderBy(asc(talentListItems.sortOrder), asc(talentListItems.createdAt))
    .limit(1000);
  const ids = items.map((i) => i.item.candidateId);
  const rows = await loadCardRows(ids);
  const byId = new Map(rows.map((r) => [r.candidateId, r]));
  const viewer: CardViewer = actor.kind === "employer" ? { kind: "organization", organizationId: actor.ctx.organization.id } : { kind: "staff" };
  const relations = actor.kind === "employer" ? await loadOrgRelations(actor.ctx.organization.id, ids) : null;
  const visible: (TalentListItemView & { candidateId: string })[] = [];
  let unavailable = 0;
  for (const { item, addedByName } of items) {
    const row = byId.get(item.candidateId);
    if (!row || row.deletedAt) {
      unavailable += 1;
      continue;
    }
    const relation = relations?.get(item.candidateId) ?? { hasSharedApplication: false, hasActiveUnlock: false };
    if (actor.kind === "employer") {
      const allowed =
        isDiscoverableByOrg({ visibility: row.visibility, deletedAt: row.deletedAt }, row.privacy, { id: actor.ctx.organization.id, status: actor.ctx.organization.status }) ||
        relation.hasSharedApplication ||
        relation.hasActiveUnlock;
      if (!allowed || row.privacy.blockedOrganizationIds.includes(actor.ctx.organization.id)) {
        unavailable += 1;
        continue;
      }
    }
    visible.push({
      candidateId: item.candidateId,
      candidate: toCandidateCard(row, viewer, relation),
      note: item.note,
      stage: item.stage,
      sortOrder: item.sortOrder,
      addedAt: item.createdAt,
      addedByName,
    });
  }
  return { visible, unavailable };
}

export async function getTalentList(actor: TalentListActor, listId: string): Promise<TalentListDetail> {
  assertListPermission(actor, "read");
  const list = await loadList(actor, listId);
  const [creator] = list.createdByUserId ? await db.select({ name: users.displayName }).from(users).where(eq(users.id, list.createdByUserId)).limit(1) : [];
  const [total] = await db.select({ value: count() }).from(talentListItems).where(eq(talentListItems.listId, list.id));
  const { visible, unavailable } = await visibleMembers(actor, list.id);
  return {
    ...toSummary(list, creator?.name ?? null, total?.value ?? 0, actor),
    items: visible.map((v) => ({ candidate: v.candidate, note: v.note, stage: v.stage, sortOrder: v.sortOrder, addedAt: v.addedAt, addedByName: v.addedByName })),
    unavailableCount: unavailable,
  };
}

/** Side-by-side comparison of 2–4 list members (career facts only; nothing sensitive). */
export async function getTalentListCompareData(actor: TalentListActor, input: { listId: string; candidateIds: string[] }): Promise<TalentCompareRow[]> {
  assertListPermission(actor, "read");
  const data = compareCandidatesSchema.parse(input);
  const list = await loadList(actor, data.listId);
  const { visible } = await visibleMembers(actor, list.id, data.candidateIds);
  if (!visible.length) return [];
  const ids = visible.map((v) => v.candidateId);
  const [skillRows, languageRows, educationRows, credentialRows, experienceRows] = await Promise.all([
    db
      .select({ candidateId: candidateSkills.candidateId, name: skills.name, level: candidateSkills.level, yearsExperience: candidateSkills.yearsExperience, verified: candidateSkills.verified, isPrimary: candidateSkills.isPrimary })
      .from(candidateSkills)
      .innerJoin(skills, eq(skills.id, candidateSkills.skillId))
      .where(inArray(candidateSkills.candidateId, ids))
      .orderBy(desc(candidateSkills.isPrimary), desc(candidateSkills.verified), asc(skills.name)),
    db
      .select({ candidateId: candidateLanguages.candidateId, name: languages.name, proficiency: candidateLanguages.proficiency })
      .from(candidateLanguages)
      .innerJoin(languages, eq(languages.code, candidateLanguages.languageCode))
      .where(inArray(candidateLanguages.candidateId, ids)),
    db
      .select({ candidateId: candidateEducation.candidateId, level: educationLevels.name, rank: educationLevels.rank, qualification: candidateEducation.qualification })
      .from(candidateEducation)
      .leftJoin(educationLevels, eq(educationLevels.id, candidateEducation.educationLevelId))
      .where(inArray(candidateEducation.candidateId, ids))
      .orderBy(desc(sql`coalesce(${educationLevels.rank}, -1)`)),
    db
      .select({ candidateId: candidateCredentials.candidateId, value: count() })
      .from(candidateCredentials)
      .where(and(inArray(candidateCredentials.candidateId, ids), eq(candidateCredentials.verificationStatus, "verified"), isNull(candidateCredentials.deletedAt)))
      .groupBy(candidateCredentials.candidateId),
    db
      .select({
        candidateId: candidateExperience.candidateId,
        jobTitle: candidateExperience.jobTitle,
        startDate: candidateExperience.startDate,
        endDate: candidateExperience.endDate,
        isCurrent: candidateExperience.isCurrent,
      })
      .from(candidateExperience)
      .where(inArray(candidateExperience.candidateId, ids))
      .orderBy(desc(candidateExperience.isCurrent), desc(sql`coalesce(${candidateExperience.endDate}, ${candidateExperience.startDate})`)),
  ]);
  const monthsBetween = (start: string | null, end: string | null, isCurrent: boolean): number | null => {
    if (!start) return null;
    const s = new Date(`${start}T00:00:00Z`);
    const e = isCurrent || !end ? new Date() : new Date(`${end}T00:00:00Z`);
    return Math.max(0, (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()));
  };
  return visible.map((v) => {
    const education = educationRows.find((e) => e.candidateId === v.candidateId);
    return {
      candidate: v.candidate,
      skillDetails: skillRows
        .filter((s) => s.candidateId === v.candidateId)
        .slice(0, 12)
        .map(({ name, level, yearsExperience, verified }) => ({ name, level, yearsExperience, verified })),
      languages: languageRows.filter((l) => l.candidateId === v.candidateId).map(({ name, proficiency }) => ({ name, proficiency })),
      highestEducation: education ? { level: education.level, qualification: education.qualification } : null,
      verifiedCredentialCount: credentialRows.find((c) => c.candidateId === v.candidateId)?.value ?? 0,
      recentRoles: experienceRows
        .filter((e) => e.candidateId === v.candidateId)
        .slice(0, 3)
        .map((e) => ({ jobTitle: e.jobTitle, months: monthsBetween(e.startDate, e.endDate, e.isCurrent), isCurrent: e.isCurrent })),
      note: v.note,
      stage: v.stage,
    };
  });
}
