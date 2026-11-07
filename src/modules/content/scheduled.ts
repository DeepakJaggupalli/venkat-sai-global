import "server-only";

import { and, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { cmsEntries, type CmsCollection } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { audit } from "@/modules/audit";
import { notifyStaff } from "@/modules/notifications";

import { getCollection } from "./collections";
import { entryLabel, lockDueEntry, publishVersionInTx, takeEntryOffline } from "./entries";
import { syncEntryUsages } from "./entry-content";
import { CONTENT_ADMIN_PATHS } from "./links";
import { statusAfterClearingSchedule } from "./versioning";

/**
 * Time-based CMS transitions, run by the `content.publish_scheduled` task every few minutes:
 *  1. publish pinned versions whose publishAt has passed (failures clear the schedule and alert publishers);
 *  2. archive entries whose unpublishAt has passed;
 *  3. archive consent-required entries whose time-limited consent has expired (and alert publishers).
 * Each entry is handled in its own transaction with `for update skip locked`, so concurrent runs never
 * double-process and one bad entry never blocks the others. Idempotent.
 */

const CONSENT_REQUIRED: CmsCollection[] = ["testimonials", "case_studies", "team_members"];
const STRUCTURAL: CmsCollection[] = ["site_settings", "homepage", "navigation"];

export type ScheduledEntriesResult = { published: number; failed: number; unpublished: number; consentExpired: number };

export async function processScheduledEntries(now: Date = new Date(), limit = 100): Promise<ScheduledEntriesResult> {
  const result: ScheduledEntriesResult = { published: 0, failed: 0, unpublished: 0, consentExpired: 0 };

  // 1. Scheduled publications.
  const duePublications = await db
    .select({ id: cmsEntries.id })
    .from(cmsEntries)
    .where(
      and(
        isNull(cmsEntries.deletedAt),
        inArray(cmsEntries.status, ["scheduled", "published"]),
        sql`${cmsEntries.scheduledVersion} is not null and ${cmsEntries.publishAt} <= ${now}`,
      ),
    )
    .orderBy(cmsEntries.publishAt)
    .limit(limit);
  for (const { id } of duePublications) {
    await db.transaction(async (tx) => {
      const entry = await lockDueEntry(id, tx);
      if (!entry || entry.scheduledVersion === null || !entry.publishAt || entry.publishAt.getTime() > now.getTime()) return;
      const version = entry.scheduledVersion;
      try {
        // Savepoint: a failed validation leaves the outer transaction usable for clearing the schedule.
        await tx.transaction(async (sp) => publishVersionInTx(entry, version, null, sp, now));
        result.published += 1;
      } catch (error) {
        if (!(error instanceof ActionError)) throw error;
        result.failed += 1;
        await tx
          .update(cmsEntries)
          .set({ scheduledVersion: null, publishAt: null, status: statusAfterClearingSchedule(entry) })
          .where(sql`${cmsEntries.id} = ${entry.id}`);
        await audit({
          action: "content.scheduled_publication_failed",
          entityType: "cms_entry",
          entityId: entry.id,
          actorType: "system",
          metadata: { version, reason: error.message },
          tx,
        });
        await notifyStaff(
          {
            event: "work.reminder",
            permission: "content.publish",
            data: { kindLabel: "scheduled publication", title: `Could not publish ${entryLabel(entry)}: ${error.message}`, dueAt: entry.publishAt.toISOString(), overdue: true },
            link: CONTENT_ADMIN_PATHS.entry(entry.collection, entry.id),
            dedupeKey: `content:scheduled-publication-failed:${entry.id}:${version}`,
          },
          { tx },
        );
      }
    });
  }

  // 2. Scheduled unpublishing (archive).
  const dueUnpublish = await db
    .select({ id: cmsEntries.id })
    .from(cmsEntries)
    .where(and(isNull(cmsEntries.deletedAt), sql`${cmsEntries.unpublishAt} is not null and ${cmsEntries.unpublishAt} <= ${now}`))
    .limit(limit);
  for (const { id } of dueUnpublish) {
    await db.transaction(async (tx) => {
      const entry = await lockDueEntry(id, tx);
      if (!entry || !entry.unpublishAt || entry.unpublishAt.getTime() > now.getTime()) return;
      if (STRUCTURAL.includes(entry.collection) || (entry.status !== "published" && entry.status !== "scheduled")) {
        await tx.update(cmsEntries).set({ unpublishAt: null }).where(sql`${cmsEntries.id} = ${entry.id}`);
        return;
      }
      await takeEntryOffline(entry, "archived", null, tx);
      await syncEntryUsages(entry.id, tx);
      result.unpublished += 1;
      await audit({ action: "content.entry_archived", entityType: "cms_entry", entityId: entry.id, actorType: "system", metadata: { reason: "Scheduled unpublish", at: entry.unpublishAt.toISOString() }, tx });
    });
  }

  // 3. Expired consent of featured people / organisations.
  const dueConsent = await db
    .select({ id: cmsEntries.id })
    .from(cmsEntries)
    .where(
      and(
        isNull(cmsEntries.deletedAt),
        inArray(cmsEntries.collection, CONSENT_REQUIRED),
        inArray(cmsEntries.status, ["published", "scheduled"]),
        sql`${cmsEntries.consentExpiresAt} is not null and ${cmsEntries.consentExpiresAt} <= ${now}`,
      ),
    )
    .limit(limit);
  for (const { id } of dueConsent) {
    await db.transaction(async (tx) => {
      const entry = await lockDueEntry(id, tx);
      if (!entry || !entry.consentExpiresAt || entry.consentExpiresAt.getTime() > now.getTime()) return;
      if (entry.status !== "published" && entry.status !== "scheduled") return;
      await takeEntryOffline(entry, "archived", null, tx);
      await syncEntryUsages(entry.id, tx);
      result.consentExpired += 1;
      await audit({ action: "content.consent_expired", entityType: "cms_entry", entityId: entry.id, actorType: "system", metadata: { expiredAt: entry.consentExpiresAt.toISOString() }, tx });
      await notifyStaff(
        {
          event: "work.reminder",
          permission: "content.publish",
          data: {
            kindLabel: "consent renewal",
            title: `${getCollection(entry.collection).singularLabel} taken offline (consent expired): ${entry.title}`,
            dueAt: entry.consentExpiresAt.toISOString(),
            overdue: true,
          },
          link: CONTENT_ADMIN_PATHS.entry(entry.collection, entry.id),
          dedupeKey: `content:consent-expired:${entry.id}:${entry.consentExpiresAt.toISOString()}`,
        },
        { tx },
      );
    });
  }

  if (result.failed) logger.warn("Some scheduled CMS publications failed validation", { failed: result.failed });
  return result;
}
