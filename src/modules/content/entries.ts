import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { cmsEntries, cmsEntryVersions, logoPermissions, type CmsCollection, type CmsEntryStatus } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { cancelApprovalsForEntity, submitForApproval } from "@/modules/approvals/service";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";

import { fixedSlugFor, getCollection, publicPathFor } from "./collections";
import { isSingletonCollection } from "./constants";
import {
  assertPublishable,
  assertSlugAvailable,
  claimSlug,
  contentColumns,
  entrySearchText,
  prepareEntryContent,
  syncEntryUsages,
  uniqueSlugFor,
  versionContent,
} from "./entry-content";
import { assertStaff, dateFromCalendar, isUniqueViolation, rethrowConstraint } from "./internal";
import { previewUrl } from "./links";
import { prepareEvidenceFile } from "./media";
import { signPreviewToken } from "./preview";
import type {
  CreateEntryInput,
  EntryConsentInput,
  PublishEntryInput,
  RequestPublicationInput,
  RollbackEntryInput,
  ScheduleEntryInput,
  UpdateEntryInput,
} from "./schemas";
import type { CmsEntryRow, CmsEntryVersionRow, PreviewLink, PublishOutcome } from "./types";
import {
  canEdit,
  canPublish,
  canRollback,
  canScheduleUnpublish,
  canSchedulePublication,
  canTakeOffline,
  consentAllowsPublication,
  rowMirrorsLatest,
  sameContent,
  scheduleAfterPublish,
  sortOrdersFor,
  statusAfterClearingSchedule,
  statusAfterSchedule,
  type TransitionCheck,
  type VersionContent,
} from "./versioning";

/**
 * CMS entry services (staff only). Permissions: content.edit — create, edit, duplicate, request publication,
 * consent evidence, delete never-published drafts; content.publish — publish, schedule, unpublish, archive,
 * roll back, reorder, feature, delete published content. Every write runs in a transaction on a row lock and
 * is audited. See versioning.ts for the model.
 */

type Tx = DbOrTx;

/** Singletons the site cannot work without: they are edited and republished, never taken offline or deleted. */
const STRUCTURAL_SINGLETONS: readonly CmsCollection[] = ["site_settings", "homepage", "navigation"];

const APPROVAL_TYPES = ["content_publication", "testimonial", "case_study"] as const;

function check(result: TransitionCheck): void {
  if (!result.ok) throw new ActionError(result.reason);
}

async function lockEntry(id: string, tx: Tx, opts: { includeDeleted?: boolean } = {}): Promise<CmsEntryRow> {
  const locked = await tx.execute<{ id: string }>(sql`select id from cms_entries where id = ${id} for update`);
  if (!locked.rows.length) throw new ActionError("This content entry could not be found.");
  const [entry] = await tx.select().from(cmsEntries).where(eq(cmsEntries.id, id)).limit(1);
  if (!entry || (entry.deletedAt && !opts.includeDeleted)) throw new ActionError("This content entry could not be found.");
  return entry;
}

async function getVersionRow(entryId: string, version: number, tx: Tx): Promise<CmsEntryVersionRow> {
  const [row] = await tx
    .select()
    .from(cmsEntryVersions)
    .where(and(eq(cmsEntryVersions.entryId, entryId), eq(cmsEntryVersions.version, version)))
    .limit(1);
  if (!row) throw new ActionError("That version does not exist.");
  return row;
}

async function insertVersion(entryId: string, version: number, content: VersionContent, note: string | null, actorUserId: string | null, tx: Tx): Promise<void> {
  try {
    await tx.insert(cmsEntryVersions).values({ entryId, version, ...contentColumns(content), note, createdByUserId: actorUserId });
  } catch (error) {
    rethrowConstraint(error);
  }
}

function entryLabel(entry: Pick<CmsEntryRow, "collection" | "title">): string {
  return `${getCollection(entry.collection).singularLabel}: ${entry.title}`;
}

/** Row update that takes an entry offline (unpublish → draft, archive → archived): the row mirrors the latest version again. */
async function takeOffline(entry: CmsEntryRow, status: CmsEntryStatus, actorUserId: string | null, tx: Tx): Promise<void> {
  const latest = versionContent(await getVersionRow(entry.id, entry.currentVersion, tx));
  if (latest.slug !== entry.slug) await claimSlug(entry.collection, entry.locale, latest.slug, entry.id, tx);
  await tx
    .update(cmsEntries)
    .set({
      ...contentColumns(latest),
      searchText: entrySearchText(entry.collection, latest),
      status,
      publishedVersion: null,
      scheduledVersion: null,
      publishAt: null,
      unpublishAt: null,
      updatedByUserId: actorUserId ?? entry.updatedByUserId,
    })
    .where(eq(cmsEntries.id, entry.id));
}

async function cancelEntryApprovals(entryId: string, actorUserId: string | null, note: string, tx: Tx): Promise<void> {
  for (const type of APPROVAL_TYPES) await cancelApprovalsForEntity(type, entryId, actorUserId, note, tx);
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

/** Create a draft (version 1). Singletons get their fixed slug and can exist once per language. */
export async function createEntry(ctx: StaffContext, input: CreateEntryInput): Promise<{ id: string; slug: string; version: number }> {
  assertStaff(ctx, "content.edit");
  try {
    return await db.transaction(async (tx) => {
      const fixed = fixedSlugFor(input.collection);
      let slug: string;
      if (fixed) {
        const [existing] = await tx
          .select({ id: cmsEntries.id })
          .from(cmsEntries)
          .where(and(eq(cmsEntries.collection, input.collection), eq(cmsEntries.locale, input.locale), eq(cmsEntries.slug, fixed)))
          .limit(1);
        if (existing) throw new ActionError(`${getCollection(input.collection).label} already exists in this language. Edit it instead.`);
        slug = fixed;
      } else if (input.slug) {
        await claimSlug(input.collection, input.locale, input.slug, null, tx);
        slug = input.slug;
      } else {
        slug = await uniqueSlugFor(input.collection, input.locale, input.title, tx);
      }
      const content = await prepareEntryContent(input.collection, { ...input, slug }, tx);
      const [entry] = await tx
        .insert(cmsEntries)
        .values({
          collection: input.collection,
          locale: input.locale,
          ...contentColumns(content),
          searchText: entrySearchText(input.collection, content),
          status: "draft",
          currentVersion: 1,
          createdByUserId: ctx.user.id,
          updatedByUserId: ctx.user.id,
        })
        .returning({ id: cmsEntries.id });
      await insertVersion(entry!.id, 1, content, input.note ?? "Created", ctx.user.id, tx);
      await syncEntryUsages(entry!.id, tx);
      await audit({
        action: "content.entry_created",
        entityType: "cms_entry",
        entityId: entry!.id,
        actorUserId: ctx.user.id,
        metadata: { collection: input.collection, slug, locale: input.locale },
        tx,
      });
      return { id: entry!.id, slug, version: 1 };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/**
 * Save a new version. Live entries keep serving their published version until the new one is published;
 * entries that are not live mirror the new version on the row. Identical content creates no version.
 * `expectedVersion` (the version the editor loaded) guards against overwriting someone else's save.
 */
export async function updateEntry(ctx: StaffContext, input: UpdateEntryInput): Promise<{ version: number; changed: boolean }> {
  assertStaff(ctx, "content.edit");
  try {
    return await db.transaction(async (tx) => {
      const entry = await lockEntry(input.id, tx);
      check(canEdit(entry));
      if (input.expectedVersion !== undefined && input.expectedVersion !== entry.currentVersion) {
        throw new ActionError("Someone else saved a newer version of this entry. Reload to see their changes before saving.", { code: "version_conflict" });
      }
      const latest = versionContent(await getVersionRow(entry.id, entry.currentVersion, tx));
      const slug = fixedSlugFor(entry.collection) ?? input.slug ?? latest.slug;
      const content = await prepareEntryContent(entry.collection, { ...input, slug }, tx, entry.id);
      if (sameContent(content, latest)) return { version: entry.currentVersion, changed: false };
      const version = entry.currentVersion + 1;
      const mirror = rowMirrorsLatest(entry);
      if (slug !== entry.slug) {
        if (mirror) await claimSlug(entry.collection, entry.locale, slug, entry.id, tx);
        else await assertSlugAvailable(entry.collection, entry.locale, slug, entry.id, tx);
      }
      await insertVersion(entry.id, version, content, input.note ?? null, ctx.user.id, tx);
      await tx
        .update(cmsEntries)
        .set({
          currentVersion: version,
          updatedByUserId: ctx.user.id,
          ...(mirror ? { ...contentColumns(content), searchText: entrySearchText(entry.collection, content) } : {}),
        })
        .where(eq(cmsEntries.id, entry.id));
      await syncEntryUsages(entry.id, tx);
      await audit({
        action: "content.entry_updated",
        entityType: "cms_entry",
        entityId: entry.id,
        actorUserId: ctx.user.id,
        metadata: { collection: entry.collection, version, live: !mirror },
        tx,
      });
      return { version, changed: true };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

// ---------------------------------------------------------------------------
// Publication
// ---------------------------------------------------------------------------

/**
 * Make `version` live on the locked entry (no permission check: callers authorise). Validates the version for
 * publication, copies it onto the row and keeps only a schedule that pins a newer version.
 */
export async function publishVersionInTx(entry: CmsEntryRow, version: number, actorUserId: string | null, tx: Tx, now: Date = new Date()): Promise<void> {
  check(canPublish(entry, version));
  const content = versionContent(await getVersionRow(entry.id, version, tx));
  await assertPublishable(entry, content, now, tx);
  if (content.slug !== entry.slug) await claimSlug(entry.collection, entry.locale, content.slug, entry.id, tx);
  await tx
    .update(cmsEntries)
    .set({
      ...contentColumns(content),
      searchText: entrySearchText(entry.collection, content),
      status: "published",
      publishedVersion: version,
      publishedAt: entry.publishedAt ?? now,
      publishedByUserId: actorUserId,
      ...scheduleAfterPublish(entry, version),
    })
    .where(eq(cmsEntries.id, entry.id));
  await syncEntryUsages(entry.id, tx);
  await audit({
    action: "content.entry_published",
    entityType: "cms_entry",
    entityId: entry.id,
    actorUserId,
    actorType: actorUserId ? undefined : "system",
    metadata: { collection: entry.collection, slug: content.slug, version },
    tx,
  });
}

/** Pin `version` for publication at `publishAt` on the locked entry (callers authorise). */
async function scheduleVersionInTx(entry: CmsEntryRow, version: number, publishAt: Date, actorUserId: string | null, tx: Tx, now: Date = new Date()): Promise<void> {
  check(canSchedulePublication(entry, version, publishAt, now));
  const content = versionContent(await getVersionRow(entry.id, version, tx));
  // Validate now so problems surface when scheduling, not at 3 a.m. (re-checked when the task publishes).
  await assertPublishable(entry, content, now, tx);
  if (content.slug !== entry.slug) await assertSlugAvailable(entry.collection, entry.locale, content.slug, entry.id, tx);
  await tx
    .update(cmsEntries)
    .set({ status: statusAfterSchedule(entry), scheduledVersion: version, publishAt, updatedByUserId: actorUserId ?? entry.updatedByUserId })
    .where(eq(cmsEntries.id, entry.id));
  await syncEntryUsages(entry.id, tx);
  await audit({
    action: "content.entry_scheduled",
    entityType: "cms_entry",
    entityId: entry.id,
    actorUserId,
    metadata: { collection: entry.collection, version, publishAt: publishAt.toISOString() },
    tx,
  });
}

async function submitPublicationRequest(
  entry: CmsEntryRow,
  version: number,
  publishAt: Date | null,
  note: string | null,
  actorUserId: string,
  tx: Tx,
): Promise<{ outcome: "submitted_for_approval"; approvalId: string; approvalCode: string }> {
  const definition = getCollection(entry.collection);
  check(canPublish(entry, version));
  const content = versionContent(await getVersionRow(entry.id, version, tx));
  await assertPublishable(entry, content, new Date(), tx);
  if (publishAt && publishAt.getTime() <= Date.now()) throw new ActionError("Choose a publication time in the future.");
  const type = definition.approvalType ?? "content_publication";
  const request = await submitForApproval(
    {
      type,
      entityType: "cms_entry",
      entityId: entry.id,
      title: `${definition.singularLabel}: ${content.title}`,
      summary: note ?? (definition.consentRequired ? "Check the recorded consent and evidence before approving." : null),
      payload: { entryId: entry.id, collection: entry.collection, version, publishAt: publishAt?.toISOString() ?? null },
      submittedByUserId: actorUserId,
    },
    tx,
  );
  await audit({
    action: "content.publication_requested",
    entityType: "cms_entry",
    entityId: entry.id,
    actorUserId,
    metadata: { collection: entry.collection, version, approvalId: request.id, type },
    tx,
  });
  return { outcome: "submitted_for_approval", approvalId: request.id, approvalCode: request.code };
}

/**
 * Publish a version (default: the latest). Testimonials and case studies always go to the approval centre
 * instead (second check of the consent evidence); the outcome says which happened.
 */
export async function publishEntry(ctx: StaffContext, input: PublishEntryInput): Promise<PublishOutcome> {
  assertStaff(ctx, "content.publish");
  try {
    return await db.transaction(async (tx) => {
      const entry = await lockEntry(input.id, tx);
      const version = input.version ?? entry.currentVersion;
      if (getCollection(entry.collection).approvalType) {
        return submitPublicationRequest(entry, version, null, input.note ?? null, ctx.user.id, tx);
      }
      await publishVersionInTx(entry, version, ctx.user.id, tx);
      await cancelApprovalsForEntity("content_publication", entry.id, ctx.user.id, "Published directly", tx);
      return { outcome: "published" as const, version };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Editors without content.publish ask for publication (optionally at a time); reviewers decide in the approval centre. */
export async function requestPublication(ctx: StaffContext, input: RequestPublicationInput): Promise<PublishOutcome> {
  assertStaff(ctx, "content.edit");
  try {
    return await db.transaction(async (tx) => {
      const entry = await lockEntry(input.id, tx);
      return submitPublicationRequest(entry, input.version ?? entry.currentVersion, input.publishAt ?? null, input.note ?? null, ctx.user.id, tx);
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

export type ScheduleResult = {
  status: CmsEntryStatus;
  scheduledVersion: number | null;
  publishAt: Date | null;
  unpublishAt: Date | null;
  approval: { id: string; code: string } | null;
};

/**
 * Set or clear the publication time (pinning a version) and/or the automatic unpublish time.
 * `null` clears a value; `undefined` leaves it. Scheduling a testimonial or case study goes to approval.
 */
export async function scheduleEntry(ctx: StaffContext, input: ScheduleEntryInput): Promise<ScheduleResult> {
  assertStaff(ctx, "content.publish");
  try {
    return await db.transaction(async (tx) => {
      let entry = await lockEntry(input.id, tx);
      const now = new Date();
      const definition = getCollection(entry.collection);
      let approval: ScheduleResult["approval"] = null;

      // Each statement must satisfy cms_entries_window_chk: clear a changing unpublish time first, set the
      // publication time, then the new unpublish time (validated against the new publication time).
      if (input.unpublishAt !== undefined && entry.unpublishAt !== null) {
        await tx.update(cmsEntries).set({ unpublishAt: null }).where(eq(cmsEntries.id, entry.id));
        entry = { ...entry, unpublishAt: null };
      }

      if (input.publishAt === null) {
        await tx
          .update(cmsEntries)
          .set({ scheduledVersion: null, publishAt: null, status: statusAfterClearingSchedule(entry), updatedByUserId: ctx.user.id })
          .where(eq(cmsEntries.id, entry.id));
        await audit({ action: "content.schedule_cleared", entityType: "cms_entry", entityId: entry.id, actorUserId: ctx.user.id, tx });
      } else if (input.publishAt instanceof Date) {
        const version = input.version ?? entry.currentVersion;
        if (definition.approvalType) {
          const result = await submitPublicationRequest(entry, version, input.publishAt, null, ctx.user.id, tx);
          approval = { id: result.approvalId, code: result.approvalCode };
        } else {
          await scheduleVersionInTx(entry, version, input.publishAt, ctx.user.id, tx, now);
        }
      }

      if (input.unpublishAt !== undefined) {
        entry = await lockEntry(input.id, tx);
        if (input.unpublishAt !== null && STRUCTURAL_SINGLETONS.includes(entry.collection)) {
          throw new ActionError(`${definition.label} cannot be unpublished automatically.`);
        }
        if (input.unpublishAt !== null) check(canScheduleUnpublish(entry, input.unpublishAt, now, entry.publishAt));
        await tx.update(cmsEntries).set({ unpublishAt: input.unpublishAt, updatedByUserId: ctx.user.id }).where(eq(cmsEntries.id, entry.id));
        await audit({
          action: "content.unpublish_scheduled",
          entityType: "cms_entry",
          entityId: entry.id,
          actorUserId: ctx.user.id,
          metadata: { unpublishAt: input.unpublishAt?.toISOString() ?? null },
          tx,
        });
      }

      const [after] = await tx.select().from(cmsEntries).where(eq(cmsEntries.id, input.id)).limit(1);
      return {
        status: after!.status,
        scheduledVersion: after!.scheduledVersion,
        publishAt: after!.publishAt,
        unpublishAt: after!.unpublishAt,
        approval,
      };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Take a live (or scheduled) entry offline as a draft; its latest version becomes the editable state. */
export async function unpublishEntry(ctx: StaffContext, entryId: string, reason?: string | null): Promise<void> {
  assertStaff(ctx, "content.publish");
  await db.transaction(async (tx) => {
    const entry = await lockEntry(entryId, tx);
    if (STRUCTURAL_SINGLETONS.includes(entry.collection)) throw new ActionError(`${getCollection(entry.collection).label} cannot be unpublished. Edit and republish it instead.`);
    check(canTakeOffline(entry));
    await takeOffline(entry, "draft", ctx.user.id, tx);
    await cancelEntryApprovals(entry.id, ctx.user.id, "Unpublished", tx);
    await syncEntryUsages(entry.id, tx);
    await audit({ action: "content.entry_unpublished", entityType: "cms_entry", entityId: entry.id, actorUserId: ctx.user.id, metadata: { reason: reason ?? null }, tx });
  });
}

/** Archive (retire) an entry: offline, schedules cleared, kept with its history. */
export async function archiveEntry(ctx: StaffContext, entryId: string, reason?: string | null): Promise<void> {
  assertStaff(ctx, "content.publish");
  await db.transaction(async (tx) => {
    const entry = await lockEntry(entryId, tx);
    if (STRUCTURAL_SINGLETONS.includes(entry.collection)) throw new ActionError(`${getCollection(entry.collection).label} cannot be archived.`);
    if (entry.status === "archived") return;
    await takeOffline(entry, "archived", ctx.user.id, tx);
    await cancelEntryApprovals(entry.id, ctx.user.id, "Archived", tx);
    await syncEntryUsages(entry.id, tx);
    await audit({ action: "content.entry_archived", entityType: "cms_entry", entityId: entry.id, actorUserId: ctx.user.id, metadata: { reason: reason ?? null }, tx });
  });
}

/** Restore an archived entry, or one from the bin, as a draft. */
export async function restoreEntry(ctx: StaffContext, entryId: string): Promise<void> {
  assertStaff(ctx, "content.edit");
  await db.transaction(async (tx) => {
    const entry = await lockEntry(entryId, tx, { includeDeleted: true });
    if (!entry.deletedAt && entry.status !== "archived") throw new ActionError("Only archived or deleted entries can be restored.");
    await assertSlugAvailable(entry.collection, entry.locale, entry.slug, entry.id, tx);
    await tx.update(cmsEntries).set({ deletedAt: null, status: "draft", updatedByUserId: ctx.user.id }).where(eq(cmsEntries.id, entry.id));
    await syncEntryUsages(entry.id, tx);
    await audit({
      action: "content.entry_restored",
      entityType: "cms_entry",
      entityId: entry.id,
      actorUserId: ctx.user.id,
      metadata: { fromBin: Boolean(entry.deletedAt), slug: entry.slug },
      tx,
    });
  });
}

/**
 * Move an entry to the bin (soft delete). Never-published drafts need content.edit; anything that was
 * published needs content.publish. Singletons cannot be deleted.
 */
export async function softDeleteEntry(ctx: StaffContext, entryId: string, reason?: string | null): Promise<void> {
  assertStaff(ctx, "content.edit");
  await db.transaction(async (tx) => {
    const entry = await lockEntry(entryId, tx);
    if (isSingletonCollection(entry.collection)) throw new ActionError(`${getCollection(entry.collection).label} cannot be deleted.`);
    if (entry.publishedAt || entry.status !== "draft") assertStaff(ctx, "content.publish", "Only staff who can publish may delete content that has been published or scheduled.");
    if (entry.status !== "archived" || entry.publishedVersion !== null) await takeOffline(entry, "archived", ctx.user.id, tx);
    await tx.update(cmsEntries).set({ deletedAt: new Date(), status: "archived" }).where(eq(cmsEntries.id, entry.id));
    await cancelEntryApprovals(entry.id, ctx.user.id, "Deleted", tx);
    await syncEntryUsages(entry.id, tx);
    await audit({
      action: "content.entry_deleted",
      entityType: "cms_entry",
      entityId: entry.id,
      actorUserId: ctx.user.id,
      metadata: { collection: entry.collection, slug: entry.slug, reason: reason ?? null },
      tx,
    });
  });
}

/**
 * Restore an old version: its content becomes a NEW version (history is never rewritten). With `publish`, the
 * restored version is published at once (testimonials / case studies go to approval).
 */
export async function rollbackEntry(ctx: StaffContext, input: RollbackEntryInput): Promise<{ version: number; outcome: PublishOutcome | null }> {
  assertStaff(ctx, "content.publish");
  try {
    return await db.transaction(async (tx) => {
      const entry = await lockEntry(input.id, tx);
      check(canRollback(entry, input.version));
      const old = versionContent(await getVersionRow(entry.id, input.version, tx));
      const slug = fixedSlugFor(entry.collection) ?? old.slug;
      const content = await prepareEntryContent(entry.collection, { ...old, slug }, tx, entry.id);
      const version = entry.currentVersion + 1;
      const mirror = rowMirrorsLatest(entry);
      if (slug !== entry.slug) {
        if (mirror) await claimSlug(entry.collection, entry.locale, slug, entry.id, tx);
        else await assertSlugAvailable(entry.collection, entry.locale, slug, entry.id, tx);
      }
      await insertVersion(entry.id, version, content, `Restored version ${input.version}`, ctx.user.id, tx);
      await tx
        .update(cmsEntries)
        .set({
          currentVersion: version,
          updatedByUserId: ctx.user.id,
          ...(mirror ? { ...contentColumns(content), searchText: entrySearchText(entry.collection, content) } : {}),
        })
        .where(eq(cmsEntries.id, entry.id));
      await audit({
        action: "content.entry_rolled_back",
        entityType: "cms_entry",
        entityId: entry.id,
        actorUserId: ctx.user.id,
        metadata: { restoredVersion: input.version, newVersion: version },
        tx,
      });
      let outcome: PublishOutcome | null = null;
      if (input.publish) {
        const fresh = await lockEntry(entry.id, tx);
        if (getCollection(entry.collection).approvalType) {
          outcome = await submitPublicationRequest(fresh, version, null, `Restore version ${input.version}`, ctx.user.id, tx);
        } else {
          await publishVersionInTx(fresh, version, ctx.user.id, tx);
          outcome = { outcome: "published", version };
        }
      }
      await syncEntryUsages(entry.id, tx);
      return { version, outcome };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Copy an entry's latest version into a new draft. Consent evidence and logo permissions are never copied. */
export async function duplicateEntry(ctx: StaffContext, input: { id: string; title?: string; locale?: string }): Promise<{ id: string; slug: string }> {
  assertStaff(ctx, "content.edit");
  try {
    return await db.transaction(async (tx) => {
      const source = await lockEntry(input.id, tx);
      if (isSingletonCollection(source.collection)) throw new ActionError(`${getCollection(source.collection).label} cannot be duplicated.`);
      const latest = versionContent(await getVersionRow(source.id, source.currentVersion, tx));
      const locale = input.locale ?? source.locale;
      const title = input.title?.trim() || `${latest.title} (copy)`;
      const slug = await uniqueSlugFor(source.collection, locale, locale === source.locale ? `${latest.slug}-copy` : latest.slug, tx);
      const content = await prepareEntryContent(source.collection, { ...latest, title, slug }, tx);
      const [entry] = await tx
        .insert(cmsEntries)
        .values({
          collection: source.collection,
          locale,
          ...contentColumns(content),
          searchText: entrySearchText(source.collection, content),
          status: "draft",
          currentVersion: 1,
          sortOrder: source.sortOrder + 1,
          createdByUserId: ctx.user.id,
          updatedByUserId: ctx.user.id,
        })
        .returning({ id: cmsEntries.id });
      await insertVersion(entry!.id, 1, content, `Duplicated from "${latest.title}" (version ${source.currentVersion})`, ctx.user.id, tx);
      await syncEntryUsages(entry!.id, tx);
      await audit({
        action: "content.entry_duplicated",
        entityType: "cms_entry",
        entityId: entry!.id,
        actorUserId: ctx.user.id,
        metadata: { sourceId: source.id, collection: source.collection },
        tx,
      });
      return { id: entry!.id, slug };
    });
  } catch (error) {
    if (isUniqueViolation(error, "cms_entries_collection_slug_locale_uq")) throw new ActionError("Could not find a free slug for the copy. Try again.");
    rethrowConstraint(error);
  }
}

/** Set the manual order of entries in a collection (ids in display order). */
export async function reorderEntries(ctx: StaffContext, input: { collection: CmsCollection; ids: string[] }): Promise<void> {
  assertStaff(ctx, "content.publish");
  const ids = [...new Set(input.ids)];
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: cmsEntries.id })
      .from(cmsEntries)
      .where(and(inArray(cmsEntries.id, ids), eq(cmsEntries.collection, input.collection), isNull(cmsEntries.deletedAt)));
    if (rows.length !== ids.length) throw new ActionError("Some entries could not be found in this collection. Reload and try again.");
    for (const [id, sortOrder] of sortOrdersFor(ids)) {
      await tx.update(cmsEntries).set({ sortOrder }).where(eq(cmsEntries.id, id));
    }
    await audit({ action: "content.entries_reordered", entityType: "cms_collection", entityId: null, actorUserId: ctx.user.id, metadata: { collection: input.collection, count: ids.length }, tx });
  });
}

/** Feature or unfeature an entry (takes effect on the live site immediately). */
export async function setEntryFeatured(ctx: StaffContext, entryId: string, featured: boolean): Promise<void> {
  assertStaff(ctx, "content.publish");
  await db.transaction(async (tx) => {
    const entry = await lockEntry(entryId, tx);
    if (entry.isFeatured === featured) return;
    await tx.update(cmsEntries).set({ isFeatured: featured }).where(eq(cmsEntries.id, entry.id));
    await audit({ action: featured ? "content.entry_featured" : "content.entry_unfeatured", entityType: "cms_entry", entityId: entry.id, actorUserId: ctx.user.id, tx });
  });
}

// ---------------------------------------------------------------------------
// Consent and logo permission
// ---------------------------------------------------------------------------

/**
 * Record the consent of the person or organisation featured. Withdrawal (or an expiry date already passed)
 * takes a live entry offline (archived) in the same update. Other non-obtained statuses are refused while a
 * consent-required entry is live or scheduled.
 */
export async function updateEntryConsent(ctx: StaffContext, input: EntryConsentInput): Promise<{ status: CmsEntryStatus; takenOffline: boolean }> {
  assertStaff(ctx, "content.edit");
  try {
    return await db.transaction(async (tx) => {
      const entry = await lockEntry(input.id, tx);
      const definition = getCollection(entry.collection);
      const consentFileId = input.consentFileId !== undefined ? await prepareEvidenceFile(input.consentFileId, ctx.user.id, tx) : entry.consentFileId;
      const obtainedAt = input.consentObtainedAt ? dateFromCalendar(input.consentObtainedAt) : input.consentStatus === "obtained" ? entry.consentObtainedAt : null;
      const expiresAt = dateFromCalendar(input.consentExpiresAt);
      if (input.consentStatus === "obtained") {
        if (!obtainedAt) throw new ActionError("Enter the date consent was obtained.", { fieldErrors: { consentObtainedAt: ["Required when consent is obtained"] } });
        if (!consentFileId && !input.consentNotes?.trim()) {
          throw new ActionError("Upload the signed consent or note where the evidence is kept.", { fieldErrors: { consentNotes: ["Evidence is required"] } });
        }
      }
      const live = entry.status === "published" || entry.status === "scheduled";
      const nowMs = Date.now();
      const stillAllowed = consentAllowsPublication({ consentStatus: input.consentStatus, consentExpiresAt: expiresAt }, new Date(nowMs));
      const takeDown = live && (input.consentStatus === "withdrawn" || (definition.consentRequired && input.consentStatus === "obtained" && !stillAllowed));
      if (live && definition.consentRequired && !stillAllowed && !takeDown) {
        throw new ActionError("This entry is live. Unpublish it first, or mark the consent as withdrawn to take it offline now.");
      }
      if (takeDown) {
        await takeOffline(entry, "archived", ctx.user.id, tx);
        await cancelEntryApprovals(entry.id, ctx.user.id, "Consent withdrawn or expired", tx);
      }
      await tx
        .update(cmsEntries)
        .set({
          consentStatus: input.consentStatus,
          consentNotes: input.consentNotes ?? null,
          consentFileId,
          consentObtainedAt: obtainedAt,
          consentExpiresAt: expiresAt,
          updatedByUserId: ctx.user.id,
        })
        .where(eq(cmsEntries.id, entry.id));
      await syncEntryUsages(entry.id, tx);
      await audit({
        action: input.consentStatus === "withdrawn" ? "content.consent_withdrawn" : "content.consent_updated",
        entityType: "cms_entry",
        entityId: entry.id,
        actorUserId: ctx.user.id,
        metadata: { from: entry.consentStatus, to: input.consentStatus, takenOffline: takeDown, hasEvidenceFile: Boolean(consentFileId) },
        tx,
      });
      return { status: takeDown ? "archived" : entry.status, takenOffline: takeDown };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Link (or unlink) the logo permission of a client_logos entry. A live logo cannot lose its permission. */
export async function setEntryLogoPermission(ctx: StaffContext, input: { id: string; logoPermissionId: string | null }): Promise<void> {
  assertStaff(ctx, "content.edit");
  try {
    await db.transaction(async (tx) => {
      const entry = await lockEntry(input.id, tx);
      if (entry.collection !== "client_logos") throw new ActionError("Only client logo entries take a logo permission.");
      if (input.logoPermissionId) {
        const [permission] = await tx.select({ id: logoPermissions.id }).from(logoPermissions).where(eq(logoPermissions.id, input.logoPermissionId)).limit(1);
        if (!permission) throw new ActionError("That logo permission no longer exists.");
      } else if (entry.status === "published" || entry.status === "scheduled") {
        throw new ActionError("A published logo needs its permission. Unpublish the logo first.");
      }
      await tx.update(cmsEntries).set({ logoPermissionId: input.logoPermissionId, updatedByUserId: ctx.user.id }).where(eq(cmsEntries.id, entry.id));
      await audit({ action: "content.logo_permission_linked", entityType: "cms_entry", entityId: entry.id, actorUserId: ctx.user.id, metadata: { logoPermissionId: input.logoPermissionId }, tx });
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

// ---------------------------------------------------------------------------
// Preview links
// ---------------------------------------------------------------------------

/** A signed, short-lived preview link for one entry (a pinned version or "latest"). */
export async function createPreviewLink(
  ctx: StaffContext,
  input: { id: string; version?: number | "latest"; ttlMinutes?: number },
): Promise<PreviewLink> {
  assertStaff(ctx, "content.view");
  const [entry] = await db
    .select({ id: cmsEntries.id, collection: cmsEntries.collection, currentVersion: cmsEntries.currentVersion, deletedAt: cmsEntries.deletedAt })
    .from(cmsEntries)
    .where(eq(cmsEntries.id, input.id))
    .limit(1);
  if (!entry || entry.deletedAt) throw new ActionError("This content entry could not be found.");
  const version = input.version ?? "latest";
  if (version !== "latest" && (version < 1 || version > entry.currentVersion)) throw new ActionError("That version does not exist.");
  const content = await getVersionRow(entry.id, version === "latest" ? entry.currentVersion : version, db);
  const { token, expiresAt } = signPreviewToken({ entryId: entry.id, version, ttlMinutes: input.ttlMinutes });
  const path = publicPathFor(entry.collection, content.slug);
  await audit({
    action: "content.preview_link_created",
    entityType: "cms_entry",
    entityId: entry.id,
    actorUserId: ctx.user.id,
    metadata: { version, expiresAt: expiresAt.toISOString() },
  });
  return { token, url: path ? previewUrl(path, token) : null, expiresAt, version };
}

// ---------------------------------------------------------------------------
// Approvals and background processing (no actor permission checks: callers are trusted)
// ---------------------------------------------------------------------------

/** Apply an approved publication request (testimonial, case_study, content_publication). Runs in the decision transaction. */
export async function applyApprovedPublication(
  payload: { entryId: string; version: number; publishAt: Date | null },
  actorUserId: string,
  tx: Tx,
): Promise<"published" | "scheduled"> {
  const entry = await lockEntry(payload.entryId, tx);
  const now = new Date();
  if (payload.publishAt && payload.publishAt.getTime() > now.getTime()) {
    await scheduleVersionInTx(entry, payload.version, payload.publishAt, actorUserId, tx, now);
    return "scheduled";
  }
  await publishVersionInTx(entry, payload.version, actorUserId, tx, now);
  return "published";
}

/** Lock a due entry without waiting (concurrent task runs skip it). */
export async function lockDueEntry(id: string, tx: Tx): Promise<CmsEntryRow | null> {
  const locked = await tx.execute<{ id: string }>(sql`select id from cms_entries where id = ${id} and deleted_at is null for update skip locked`);
  if (!locked.rows.length) return null;
  const [entry] = await tx.select().from(cmsEntries).where(eq(cmsEntries.id, id)).limit(1);
  return entry ?? null;
}

export { takeOffline as takeEntryOffline, entryLabel };
