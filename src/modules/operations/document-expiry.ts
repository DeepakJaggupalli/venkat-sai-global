import "server-only";

import { and, between, eq, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { candidateCredentials, candidateDocuments, candidateProfiles, cvSubmissions, documentExpiryAlerts, users, type DocumentExpiryItemType } from "@/db/schema";
import { absoluteUrl } from "@/lib/env";
import { notify, notifyStaff } from "@/modules/notifications";

import { notifyBusinessInbox } from "./business-inbox";
import { CV_SUBMISSIONS_ADMIN_PATH, isoDatePlusMonths, PASSPORT_EXPIRY_WARNING_MONTHS } from "./cv-submissions";

/**
 * documents.expiry_alerts (daily, src/server/tasks/schedule.ts).
 *
 * Finds passports expiring within 6 months (CV submissions and candidate profiles) and candidate documents /
 * credentials expiring within 30 days. Each item alerts once per threshold (6, 3 or 1 month before; documents only
 * at 1 month): document_expiry_alerts holds what was sent, keyed by item, expiry date and threshold, so a renewed
 * document (new date) alerts again. New alerts go out as ONE staff digest (candidates.manage, in-app, plus the
 * business inbox email) and one notification per candidate who has an account (profile owner, or a verified account
 * with the CV submission's phone number). Nothing is sent when there is nothing new.
 */

export const DOCUMENT_EXPIRY_WARNING_DAYS = 30;
const THRESHOLDS = [1, 3, 6] as const;
const DIGEST_MAX_LINES = 50;

type Threshold = (typeof THRESHOLDS)[number];

export type ExpiringItem = {
  itemType: DocumentExpiryItemType;
  itemId: string;
  expiresOn: string;
  /** "passport", "certificate", … (candidate wording). */
  document: string;
  /** Who it belongs to, for the staff digest (name, and the CV reference for submissions). */
  who: string;
  /** Account to notify (null = no account). */
  userId: string | null;
  adminPath: string;
};

export type DocumentExpirySummary = { found: number; newAlerts: number; staffDigest: boolean; candidateAlerts: number };

/** Smallest threshold (months) the date falls within, or null when it is past or further away than 6 months. */
export function expiryThreshold(expiresOn: string, now: Date): Threshold | null {
  if (expiresOn < isoDatePlusMonths(0, now)) return null;
  return THRESHOLDS.find((m) => expiresOn <= isoDatePlusMonths(m, now)) ?? null;
}

function humanise(value: string): string {
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Everything within its alert window today (not yet filtered by what was already sent). */
export async function findExpiringItems(now: Date = new Date()): Promise<ExpiringItem[]> {
  const today = isoDatePlusMonths(0, now);
  const passportLimit = isoDatePlusMonths(PASSPORT_EXPIRY_WARNING_MONTHS, now);
  const documentLimit = new Date(Date.parse(`${today}T00:00:00Z`) + DOCUMENT_EXPIRY_WARNING_DAYS * 86_400_000).toISOString().slice(0, 10);

  const [cvRows, profileRows, documentRows, credentialRows] = await Promise.all([
    db
      .select({ id: cvSubmissions.id, code: cvSubmissions.code, name: cvSubmissions.name, expiresOn: cvSubmissions.passportExpiry, userId: users.id })
      .from(cvSubmissions)
      .leftJoin(users, and(eq(users.phone, cvSubmissions.phone), sql`${users.phoneVerifiedAt} is not null`, eq(users.status, "active")))
      .where(and(between(cvSubmissions.passportExpiry, today, passportLimit), ne(cvSubmissions.status, "not_suitable"))),
    db
      .select({ id: candidateProfiles.id, userId: candidateProfiles.userId, name: users.displayName, expiresOn: candidateProfiles.passportExpiry })
      .from(candidateProfiles)
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .where(and(isNull(candidateProfiles.deletedAt), between(candidateProfiles.passportExpiry, today, passportLimit))),
    db
      .select({ id: candidateDocuments.id, kind: candidateDocuments.documentType, title: candidateDocuments.title, expiresOn: candidateDocuments.expiresAt, candidateId: candidateProfiles.id, userId: candidateProfiles.userId, name: users.displayName })
      .from(candidateDocuments)
      .innerJoin(candidateProfiles, and(eq(candidateProfiles.id, candidateDocuments.candidateId), isNull(candidateProfiles.deletedAt)))
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .where(and(isNull(candidateDocuments.deletedAt), between(candidateDocuments.expiresAt, today, documentLimit))),
    db
      .select({ id: candidateCredentials.id, title: candidateCredentials.name, expiresOn: candidateCredentials.expiresAt, candidateId: candidateProfiles.id, userId: candidateProfiles.userId, name: users.displayName })
      .from(candidateCredentials)
      .innerJoin(candidateProfiles, and(eq(candidateProfiles.id, candidateCredentials.candidateId), isNull(candidateProfiles.deletedAt)))
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .where(and(isNull(candidateCredentials.deletedAt), between(candidateCredentials.expiresAt, today, documentLimit))),
  ]);

  // One account per CV submission at most (a phone number could in theory match more than one row).
  const cvSeen = new Set<string>();
  return [
    ...cvRows.flatMap((r): ExpiringItem[] => {
      if (cvSeen.has(r.id) || !r.expiresOn) return [];
      cvSeen.add(r.id);
      return [{ itemType: "cv_submission_passport", itemId: r.id, expiresOn: r.expiresOn, document: "passport", who: `${r.name} (CV ${r.code})`, userId: r.userId, adminPath: `${CV_SUBMISSIONS_ADMIN_PATH}/${r.id}` }];
    }),
    ...profileRows.map((r): ExpiringItem => ({ itemType: "candidate_passport", itemId: r.id, expiresOn: r.expiresOn!, document: "passport", who: r.name, userId: r.userId, adminPath: `/admin/candidates/${r.id}` })),
    ...documentRows.map((r): ExpiringItem => ({
      itemType: "candidate_document",
      itemId: r.id,
      expiresOn: r.expiresOn!,
      document: (r.title?.trim() || humanise(r.kind)).toLowerCase(),
      who: r.name,
      userId: r.userId,
      adminPath: `/admin/candidates/${r.candidateId}`,
    })),
    ...credentialRows.map((r): ExpiringItem => ({ itemType: "candidate_credential", itemId: r.id, expiresOn: r.expiresOn!, document: r.title, who: r.name, userId: r.userId, adminPath: `/admin/candidates/${r.candidateId}` })),
  ];
}

const PERIOD: Record<Threshold, string> = { 1: "1 month", 3: "3 months", 6: "6 months" };

export async function runDocumentExpiryAlerts(now: Date = new Date()): Promise<DocumentExpirySummary> {
  const found = await findExpiringItems(now);
  const due = found.flatMap((item) => {
    const threshold = item.itemType === "candidate_document" || item.itemType === "candidate_credential" ? 1 : expiryThreshold(item.expiresOn, now);
    return threshold ? [{ item, threshold }] : [];
  });
  const summary: DocumentExpirySummary = { found: found.length, newAlerts: 0, staffDigest: false, candidateAlerts: 0 };
  if (!due.length) return summary;

  const today = isoDatePlusMonths(0, now);
  await db.transaction(async (tx) => {
    // Claim the alerts first: rows that already exist were sent on an earlier day and are skipped.
    const inserted = await tx
      .insert(documentExpiryAlerts)
      .values(due.map(({ item, threshold }) => ({ itemType: item.itemType, itemId: item.itemId, expiresOn: item.expiresOn, thresholdMonths: threshold })))
      .onConflictDoNothing()
      .returning({ itemType: documentExpiryAlerts.itemType, itemId: documentExpiryAlerts.itemId, thresholdMonths: documentExpiryAlerts.thresholdMonths });
    const fresh = new Set(inserted.map((r) => `${r.itemType}:${r.itemId}:${r.thresholdMonths}`));
    const alerts = due.filter(({ item, threshold }) => fresh.has(`${item.itemType}:${item.itemId}:${threshold}`));
    summary.newAlerts = alerts.length;
    if (!alerts.length) return;

    const lines = alerts
      .slice(0, DIGEST_MAX_LINES)
      .map(({ item, threshold }) => `${humanise(item.document)}, ${item.who}: expires ${item.expiresOn} (${PERIOD[threshold]}) ${absoluteUrl(item.adminPath)}`);
    if (alerts.length > DIGEST_MAX_LINES) lines.push(`… and ${alerts.length - DIGEST_MAX_LINES} more`);
    const data = { count: alerts.length, items: lines.join("\n") };
    const link = `${CV_SUBMISSIONS_ADMIN_PATH}?expiring=1`;
    await notifyStaff({ event: "documents.expiry_digest", permission: "candidates.manage", data: { ...data, forStaff: true }, link, channels: ["in_app"], dedupeKey: `documents.expiry_digest:${today}` }, { tx });
    await notifyBusinessInbox({ event: "documents.expiry_digest", data, link }, tx);
    summary.staffDigest = true;

    for (const { item, threshold } of alerts) {
      if (!item.userId) continue;
      await notify(
        {
          event: "documents.expiring",
          recipients: [{ userId: item.userId }],
          data: { document: item.document, expiresOn: item.expiresOn, period: PERIOD[threshold] },
          link: "/talent/profile",
          dedupeKey: `documents.expiring:${item.itemType}:${item.itemId}:${item.expiresOn}:${threshold}`,
        },
        { tx },
      );
      // TODO(whatsapp): send the same reminder on WhatsApp here once the WhatsApp channel is approved (template
      // "documents.expiring"); CV submissions without an account would be reached on their phone number this way.
      summary.candidateAlerts += 1;
    }
  });
  return summary;
}
