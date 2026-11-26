import "server-only";

import { and, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { applications, bookingSlots, candidateCredentials, candidateDocuments, cvSubmissions, jobCategories, slotBookings } from "@/db/schema";
import type { BookingSlotKind, BookingSlotStatus, SlotBookingStatus } from "@/db/schema/bookings";
import type { CvSubmissionStatus } from "@/db/schema/cv-submissions";

import { addDaysIso, addMonthsIso, DOCUMENT_WARNING_DAYS, expiryState, lastMonthKeys, PASSPORT_WARNING_MONTHS, type ExpiryState } from "./dashboard";

/**
 * Reads for the People Portal home that no module exposes yet. Every query is scoped to the signed-in candidate:
 * their candidate id, their user id, or their phone number ONLY once it is verified (the same rule the documents
 * expiry task uses to link a website CV to an account). Nothing here returns another person's data.
 */

/** The account fields that decide what the phone number may unlock. */
export type PhoneOwner = { id: string; phone: string | null; phoneVerifiedAt: Date | null };

/** The verified phone number of the account, or null (an unverified number links nothing). */
export function verifiedPhone(user: Pick<PhoneOwner, "phone" | "phoneVerifiedAt">): string | null {
  return user.phone && user.phoneVerifiedAt ? user.phone : null;
}

export type LinkedCvSubmission = {
  id: string;
  code: string;
  tradeLabel: string;
  requirementTitle: string | null;
  status: CvSubmissionStatus;
  /** Note written for the candidate by staff (the same text the public /status page shows). */
  candidateNote: string | null;
  createdAt: Date;
  /** Last stage change (or when it was received). */
  updatedAt: Date;
};

/**
 * CVs sent through the website "Send your CV" form (or added by staff) with the account's verified phone number,
 * latest activity first. Empty when the phone number is missing or not verified.
 */
export async function listLinkedCvSubmissions(user: PhoneOwner, limit = 3): Promise<LinkedCvSubmission[]> {
  const phone = verifiedPhone(user);
  if (!phone) return [];
  const activity = sql<Date>`coalesce(${cvSubmissions.statusChangedAt}, ${cvSubmissions.createdAt})`;
  const rows = await db
    .select({
      id: cvSubmissions.id,
      code: cvSubmissions.code,
      tradeLabel: cvSubmissions.tradeLabel,
      requirementTitle: cvSubmissions.requirementTitle,
      status: cvSubmissions.status,
      candidateNote: cvSubmissions.candidateNote,
      createdAt: cvSubmissions.createdAt,
      statusChangedAt: cvSubmissions.statusChangedAt,
    })
    .from(cvSubmissions)
    .where(eq(cvSubmissions.phone, phone))
    .orderBy(desc(activity), desc(cvSubmissions.id))
    .limit(limit);
  return rows.map(({ statusChangedAt, ...r }) => ({ ...r, updatedAt: statusChangedAt ?? r.createdAt }));
}

export type OwnBooking = {
  id: string;
  code: string;
  status: SlotBookingStatus;
  seats: number;
  slot: { code: string; kind: BookingSlotKind; title: string; trade: string; date: string; startTime: string; venue: string; status: BookingSlotStatus; instructions: string | null };
  /** Booked, slot not cancelled, date today or later. */
  upcoming: boolean;
};

/**
 * Trade test and training bookings made while signed in, or with the account's verified phone number. Upcoming ones
 * first (soonest first), then past ones (latest first).
 */
export async function listOwnBookings(user: PhoneOwner, opts: { limit?: number; today: string }): Promise<{ items: OwnBooking[]; upcoming: number }> {
  const phone = verifiedPhone(user);
  const owner: SQL = phone ? or(eq(slotBookings.userId, user.id), eq(slotBookings.phone, phone))! : eq(slotBookings.userId, user.id);
  const rows = await db
    .select({
      id: slotBookings.id,
      code: slotBookings.code,
      status: slotBookings.status,
      seats: slotBookings.seats,
      slot: {
        code: bookingSlots.code,
        kind: bookingSlots.kind,
        title: bookingSlots.title,
        trade: bookingSlots.trade,
        date: bookingSlots.date,
        startTime: bookingSlots.startTime,
        venue: bookingSlots.venue,
        status: bookingSlots.status,
        instructions: bookingSlots.instructions,
      },
    })
    .from(slotBookings)
    .innerJoin(bookingSlots, eq(bookingSlots.id, slotBookings.slotId))
    .where(owner)
    .orderBy(desc(bookingSlots.date), desc(bookingSlots.startTime), desc(slotBookings.id))
    .limit(50);
  const items: OwnBooking[] = rows.map((r) => ({ ...r, upcoming: r.status === "booked" && r.slot.status !== "cancelled" && r.slot.date >= opts.today }));
  const upcoming = items.filter((b) => b.upcoming).sort((a, b) => a.slot.date.localeCompare(b.slot.date) || a.slot.startTime.localeCompare(b.slot.startTime));
  const past = items.filter((b) => !b.upcoming);
  return { items: [...upcoming, ...past].slice(0, opts.limit ?? 4), upcoming: upcoming.length };
}

/** Applications sent per calendar month (India time) over the last `months` months, as "YYYY-MM" → count. */
export async function countOwnApplicationsByMonth(candidateId: string, opts: { months?: number; now?: Date } = {}): Promise<{ month: string; value: number }[]> {
  const keys = lastMonthKeys(opts.months ?? 6, opts.now);
  const since = new Date(`${keys[0]}-01T00:00:00+05:30`);
  const month = sql<string>`to_char(date_trunc('month', ${applications.createdAt} at time zone 'Asia/Kolkata'), 'YYYY-MM')`;
  const rows = await db
    .select({ month, value: sql<number>`count(*)::int` })
    .from(applications)
    .where(and(eq(applications.candidateId, candidateId), gte(applications.createdAt, since)))
    .groupBy(month);
  return rows.map((r) => ({ month: r.month, value: Number(r.value) }));
}

export type DocumentReminder = {
  id: string;
  kind: "passport" | "document" | "credential";
  /** Document name as the candidate typed it (null = use the document type wording). */
  title: string | null;
  /** candidate_documents.documentType / candidate_credentials.credentialType (null for the passport). */
  type: string | null;
  expiresOn: string;
  state: ExpiryState;
};

/**
 * The candidate's own passport, documents and licences that have expired or expire soon (passport within 6 months,
 * the rest within 60 days), soonest first. Expired items are included so the candidate can renew them.
 */
export async function listOwnDocumentReminders(candidate: { id: string; passportExpiry: string | null }, today: string): Promise<DocumentReminder[]> {
  const passportLimit = addMonthsIso(today, PASSPORT_WARNING_MONTHS);
  const documentLimit = addDaysIso(today, DOCUMENT_WARNING_DAYS);
  const [documents, credentials] = await Promise.all([
    db
      .select({ id: candidateDocuments.id, title: candidateDocuments.title, type: candidateDocuments.documentType, expiresOn: candidateDocuments.expiresAt })
      .from(candidateDocuments)
      .where(and(eq(candidateDocuments.candidateId, candidate.id), isNull(candidateDocuments.deletedAt), lte(candidateDocuments.expiresAt, documentLimit)))
      .limit(20),
    db
      .select({ id: candidateCredentials.id, title: candidateCredentials.name, type: candidateCredentials.credentialType, expiresOn: candidateCredentials.expiresAt })
      .from(candidateCredentials)
      .where(and(eq(candidateCredentials.candidateId, candidate.id), isNull(candidateCredentials.deletedAt), lte(candidateCredentials.expiresAt, documentLimit)))
      .limit(20),
  ]);
  const reminders: DocumentReminder[] = [];
  const passportState = expiryState(candidate.passportExpiry, today, passportLimit);
  if (passportState && candidate.passportExpiry) {
    reminders.push({ id: `passport-${candidate.id}`, kind: "passport", title: null, type: null, expiresOn: candidate.passportExpiry, state: passportState });
  }
  for (const [kind, list] of [
    ["document", documents],
    ["credential", credentials],
  ] as const) {
    for (const row of list) {
      const state = expiryState(row.expiresOn, today, documentLimit);
      if (state && row.expiresOn) reminders.push({ id: row.id, kind, title: row.title?.trim() || null, type: row.type, expiresOn: row.expiresOn, state });
    }
  }
  return reminders.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
}

/** Names of the candidate's preferred job categories (trade words for matching requirement posters). */
export async function listCategoryNames(ids: readonly string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({ name: jobCategories.name })
    .from(jobCategories)
    .where(inArray(jobCategories.id, [...ids].slice(0, 20)));
  return rows.map((r) => r.name);
}
