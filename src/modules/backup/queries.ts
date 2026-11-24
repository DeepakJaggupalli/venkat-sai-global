import "server-only";

import { alias } from "drizzle-orm/pg-core";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  applications,
  bookingSlots,
  candidateProfiles,
  cmsEntries,
  countries,
  cvSubmissions,
  enquiries,
  jobs,
  leads,
  organizations,
  referralPayouts,
  referrers,
  requirementRequests,
  resumeRequests,
  slotBookings,
  users,
  workerReviews,
  workflowStages,
} from "@/db/schema";
import { tryDecryptField } from "@/lib/crypto";
import { hasDemoMarker } from "@/lib/demo-accounts";
import { absoluteUrl } from "@/lib/env";

import type {
  ApplicationBackupRow,
  BookingBackupRow,
  CvBackupRow,
  EnquiryBackupRow,
  LeadBackupRow,
  ManpowerRequestBackupRow,
  OrganisationBackupRow,
  PayoutBackupRow,
  PosterBackupRow,
  ReferrerBackupRow,
  ResumeRequestBackupRow,
  ReviewBackupRow,
  SlotBackupRow,
} from "./columns";

/**
 * Read-only queries behind the backup sheets: newest first, at most `limit` rows each, plus the total so the sheet
 * can say it was cut short. No authorisation here: the service is called by the Super Admin page (checked there)
 * and by the daily task. Passport numbers are decrypted only when `fullPassport` is true; the daily email never asks
 * for them. Soft-deleted posters and organisations are left out (they are gone from the business's point of view).
 */

export type Loaded<T> = { rows: T[]; total: number };
export type LoadOptions = { limit: number; fullPassport: boolean };

const POSTER_COLLECTION = "requirement_posts";

async function withTotal<T>(rows: Promise<T[]>, totals: Promise<{ value: number }[]>): Promise<Loaded<T>> {
  const [list, total] = await Promise.all([rows, totals]);
  return { rows: list, total: total[0]?.value ?? list.length };
}

function decrypt(fullPassport: boolean, encrypted: string | null): string | null {
  return fullPassport && encrypted ? tryDecryptField(encrypted) : null;
}

function tradeNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((t: unknown) => {
    const trade = t && typeof t === "object" ? (t as { trade?: unknown }).trade : null;
    return typeof trade === "string" && trade.trim() ? [trade.trim()] : [];
  });
}

export async function loadCvSubmissions(opts: LoadOptions): Promise<Loaded<CvBackupRow>> {
  const placed = alias(organizations, "placed_org");
  const loaded = await withTotal(
    db
      .select({
        code: cvSubmissions.code,
        name: cvSubmissions.name,
        phone: cvSubmissions.phone,
        email: cvSubmissions.email,
        tradeLabel: cvSubmissions.tradeLabel,
        experienceYears: cvSubmissions.experienceYears,
        experienceAbroadYears: cvSubmissions.experienceAbroadYears,
        experienceIndiaYears: cvSubmissions.experienceIndiaYears,
        countryName: countries.name,
        requirementTitle: cvSubmissions.requirementTitle,
        status: cvSubmissions.status,
        source: cvSubmissions.source,
        createdAt: cvSubmissions.createdAt,
        passportExpiry: cvSubmissions.passportExpiry,
        hasPassport: cvSubmissions.hasPassport,
        passportLast4: cvSubmissions.passportNumberLast4,
        passportEncrypted: cvSubmissions.passportNumberEncrypted,
        candidateNotes: cvSubmissions.candidateNotes,
        staffRemarks: cvSubmissions.staffRemarks,
        cvFileId: cvSubmissions.cvFileId,
        referralCode: cvSubmissions.referralCode,
        placedWith: placed.name,
      })
      .from(cvSubmissions)
      .leftJoin(countries, eq(countries.code, cvSubmissions.preferredCountryCode))
      .leftJoin(placed, eq(placed.id, cvSubmissions.placedOrganizationId))
      .orderBy(desc(cvSubmissions.createdAt), desc(cvSubmissions.id))
      .limit(opts.limit),
    db.select({ value: count() }).from(cvSubmissions),
  );
  return {
    total: loaded.total,
    rows: loaded.rows.map(({ passportEncrypted, cvFileId, ...r }) => ({ ...r, passportFull: decrypt(opts.fullPassport, passportEncrypted), hasCv: cvFileId !== null })),
  };
}

export async function loadPosters(opts: LoadOptions): Promise<Loaded<PosterBackupRow>> {
  const where = and(eq(cmsEntries.collection, POSTER_COLLECTION), isNull(cmsEntries.deletedAt));
  const loaded = await withTotal(
    db
      .select({
        title: cmsEntries.title,
        slug: cmsEntries.slug,
        status: cmsEntries.status,
        publishedAt: cmsEntries.publishedAt,
        createdAt: cmsEntries.createdAt,
        countryName: countries.name,
        countryCode: sql<string | null>`${cmsEntries.data}->>'countryCode'`,
        trades: sql<unknown>`${cmsEntries.data}->'trades'`,
        // Constant SQL with explicit table names (see loadReferrers).
        applicants: sql<number>`(select count(*)::int from cv_submissions c where c.requirement_entry_id = cms_entries.id)`,
      })
      .from(cmsEntries)
      .leftJoin(countries, sql`${countries.code} = ${cmsEntries.data}->>'countryCode'`)
      .where(where)
      .orderBy(desc(cmsEntries.createdAt), desc(cmsEntries.id))
      .limit(opts.limit),
    db.select({ value: count() }).from(cmsEntries).where(where),
  );
  return {
    total: loaded.total,
    rows: loaded.rows.map((r) => ({
      title: r.title,
      countryName: r.countryName ?? r.countryCode ?? null,
      trades: tradeNames(r.trades),
      status: r.status,
      publishedAt: r.publishedAt,
      applicants: Number(r.applicants) || 0,
      link: absoluteUrl(`/requirements/${r.slug}`),
      createdAt: r.createdAt,
    })),
  };
}

export async function loadApplications(opts: LoadOptions): Promise<Loaded<ApplicationBackupRow>> {
  const employer = alias(organizations, "employer_org");
  return withTotal(
    db
      .select({
        code: applications.code,
        candidateName: users.displayName,
        phone: users.phone,
        email: users.email,
        jobTitle: jobs.title,
        jobCode: jobs.code,
        company: employer.name,
        stage: workflowStages.name,
        status: applications.status,
        source: applications.source,
        createdAt: applications.createdAt,
      })
      .from(applications)
      .innerJoin(candidateProfiles, eq(candidateProfiles.id, applications.candidateId))
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(employer, eq(employer.id, jobs.organizationId))
      .leftJoin(workflowStages, eq(workflowStages.id, applications.currentStageId))
      .orderBy(desc(applications.createdAt), desc(applications.id))
      .limit(opts.limit),
    db.select({ value: count() }).from(applications),
  );
}

export async function loadManpowerRequests(opts: LoadOptions): Promise<Loaded<ManpowerRequestBackupRow>> {
  return withTotal(
    db
      .select({
        code: requirementRequests.code,
        title: requirementRequests.title,
        status: requirementRequests.status,
        source: requirementRequests.source,
        organizationName: sql<string | null>`coalesce(${requirementRequests.organizationName}, ${organizations.name})`,
        contactName: requirementRequests.contactName,
        contactPhone: requirementRequests.contactPhone,
        contactEmail: requirementRequests.contactEmail,
        countryName: countries.name,
        locations: requirementRequests.locations,
        totalPositions: requirementRequests.totalPositions,
        joiningBy: requirementRequests.joiningBy,
        createdAt: requirementRequests.createdAt,
      })
      .from(requirementRequests)
      .leftJoin(organizations, eq(organizations.id, requirementRequests.organizationId))
      .leftJoin(countries, eq(countries.code, requirementRequests.countryCode))
      .orderBy(desc(requirementRequests.createdAt), desc(requirementRequests.id))
      .limit(opts.limit),
    db.select({ value: count() }).from(requirementRequests),
  );
}

export async function loadSlots(opts: LoadOptions): Promise<Loaded<SlotBackupRow>> {
  return withTotal<SlotBackupRow>(
    db
      .select({
        code: bookingSlots.code,
        kind: bookingSlots.kind,
        title: bookingSlots.title,
        trade: bookingSlots.trade,
        date: bookingSlots.date,
        startTime: bookingSlots.startTime,
        endTime: bookingSlots.endTime,
        venue: bookingSlots.venue,
        capacity: bookingSlots.capacity,
        bookedSeats: bookingSlots.bookedSeats,
        status: bookingSlots.status,
        feeNote: bookingSlots.feeNote,
        cancelReason: bookingSlots.cancelReason,
        createdAt: bookingSlots.createdAt,
      })
      .from(bookingSlots)
      .orderBy(desc(bookingSlots.date), desc(bookingSlots.startTime), desc(bookingSlots.id))
      .limit(opts.limit),
    db.select({ value: count() }).from(bookingSlots),
  );
}

export async function loadBookings(opts: LoadOptions): Promise<Loaded<BookingBackupRow>> {
  return withTotal(
    db
      .select({
        code: slotBookings.code,
        name: slotBookings.name,
        phone: slotBookings.phone,
        email: slotBookings.email,
        trade: slotBookings.trade,
        organizationName: slotBookings.organizationName,
        seats: slotBookings.seats,
        status: slotBookings.status,
        source: slotBookings.source,
        notes: slotBookings.notes,
        slotCode: bookingSlots.code,
        slotTitle: bookingSlots.title,
        slotDate: bookingSlots.date,
        slotStartTime: bookingSlots.startTime,
        createdAt: slotBookings.createdAt,
      })
      .from(slotBookings)
      .innerJoin(bookingSlots, eq(bookingSlots.id, slotBookings.slotId))
      .orderBy(desc(bookingSlots.date), desc(slotBookings.createdAt), desc(slotBookings.id))
      .limit(opts.limit),
    db.select({ value: count() }).from(slotBookings),
  );
}

export async function loadReferrers(opts: LoadOptions): Promise<Loaded<ReferrerBackupRow>> {
  const loaded = await withTotal(
    db
      .select({
        code: referrers.code,
        name: referrers.name,
        phone: referrers.phone,
        email: referrers.email,
        status: referrers.status,
        // Constant SQL on purpose: in a single-table select Drizzle writes column references unqualified, and an
        // unqualified "code" inside this subquery would mean cv_submissions.code.
        referred: sql<number>`(select count(*)::int from cv_submissions c where c.referral_code = referrers.code)`,
        createdAt: referrers.createdAt,
      })
      .from(referrers)
      .orderBy(desc(referrers.createdAt), desc(referrers.id))
      .limit(opts.limit),
    db.select({ value: count() }).from(referrers),
  );
  return { total: loaded.total, rows: loaded.rows.map((r) => ({ ...r, referred: Number(r.referred) || 0 })) };
}

export async function loadPayouts(opts: LoadOptions): Promise<Loaded<PayoutBackupRow>> {
  return withTotal(
    db
      .select({
        cvCode: cvSubmissions.code,
        cvName: cvSubmissions.name,
        referrerName: referrers.name,
        referrerCode: referrers.code,
        amountMinor: referralPayouts.amountMinor,
        currency: referralPayouts.currency,
        paidAt: referralPayouts.paidAt,
        paidByName: users.displayName,
        note: referralPayouts.note,
      })
      .from(referralPayouts)
      .innerJoin(cvSubmissions, eq(cvSubmissions.id, referralPayouts.cvSubmissionId))
      .innerJoin(referrers, eq(referrers.id, referralPayouts.referrerId))
      .leftJoin(users, eq(users.id, referralPayouts.paidByUserId))
      .orderBy(desc(referralPayouts.paidAt), desc(referralPayouts.id))
      .limit(opts.limit),
    db.select({ value: count() }).from(referralPayouts),
  );
}

export async function loadReviews(opts: LoadOptions): Promise<Loaded<ReviewBackupRow>> {
  return withTotal(
    db
      .select({
        displayName: workerReviews.displayName,
        trade: workerReviews.trade,
        countryName: countries.name,
        rating: workerReviews.rating,
        body: workerReviews.body,
        consentToPublish: workerReviews.consentToPublish,
        status: workerReviews.status,
        cvCode: cvSubmissions.code,
        createdAt: workerReviews.createdAt,
        publishedAt: workerReviews.publishedAt,
      })
      .from(workerReviews)
      .leftJoin(countries, eq(countries.code, workerReviews.countryCode))
      .leftJoin(cvSubmissions, eq(cvSubmissions.id, workerReviews.cvSubmissionId))
      .orderBy(desc(workerReviews.createdAt), desc(workerReviews.id))
      .limit(opts.limit),
    db.select({ value: count() }).from(workerReviews),
  );
}

export async function loadLeads(opts: LoadOptions): Promise<Loaded<LeadBackupRow>> {
  return withTotal(
    db
      .select({
        code: leads.code,
        type: leads.type,
        status: leads.status,
        source: leads.source,
        name: leads.name,
        designation: leads.designation,
        organizationName: leads.organizationName,
        email: leads.email,
        phone: leads.phone,
        countryName: countries.name,
        city: leads.city,
        interest: leads.interest,
        notes: leads.notes,
        estimatedValueMinor: leads.estimatedValueMinor,
        estimatedValueCurrency: leads.estimatedValueCurrency,
        nextFollowUpAt: leads.nextFollowUpAt,
        assignedTo: users.displayName,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .leftJoin(countries, eq(countries.code, leads.countryCode))
      .leftJoin(users, eq(users.id, leads.assignedToUserId))
      .orderBy(desc(leads.createdAt), desc(leads.id))
      .limit(opts.limit),
    db.select({ value: count() }).from(leads),
  );
}

export async function loadEnquiries(opts: LoadOptions): Promise<Loaded<EnquiryBackupRow>> {
  return withTotal(
    db
      .select({
        code: enquiries.code,
        type: enquiries.type,
        status: enquiries.status,
        name: enquiries.name,
        email: enquiries.email,
        phone: enquiries.phone,
        organizationName: enquiries.organizationName,
        subject: enquiries.subject,
        message: enquiries.message,
        createdAt: enquiries.createdAt,
      })
      .from(enquiries)
      .orderBy(desc(enquiries.createdAt), desc(enquiries.id))
      .limit(opts.limit),
    db.select({ value: count() }).from(enquiries),
  );
}

export async function loadOrganisations(opts: LoadOptions): Promise<Loaded<OrganisationBackupRow>> {
  const where = isNull(organizations.deletedAt);
  const loaded = await withTotal(
    db
      .select({
        name: organizations.name,
        type: organizations.type,
        employerKind: organizations.employerKind,
        status: organizations.status,
        email: organizations.email,
        phone: organizations.phone,
        city: organizations.city,
        countryName: countries.name,
        createdAt: organizations.createdAt,
        metadata: organizations.metadata,
      })
      .from(organizations)
      .leftJoin(countries, eq(countries.code, organizations.countryCode))
      .where(where)
      .orderBy(desc(organizations.createdAt), desc(organizations.id))
      .limit(opts.limit),
    db.select({ value: count() }).from(organizations).where(where),
  );
  return { total: loaded.total, rows: loaded.rows.map(({ metadata, ...r }) => ({ ...r, demo: hasDemoMarker(metadata) })) };
}

export async function loadResumeRequests(opts: LoadOptions): Promise<Loaded<ResumeRequestBackupRow>> {
  const loaded = await withTotal(
    db
      .select({
        code: resumeRequests.code,
        name: resumeRequests.name,
        phone: resumeRequests.phone,
        email: resumeRequests.email,
        status: resumeRequests.status,
        passportLast4: resumeRequests.passportNumberLast4,
        passportEncrypted: resumeRequests.passportNumberEncrypted,
        priceAmountMinor: resumeRequests.priceAmountMinor,
        priceCurrency: resumeRequests.priceCurrency,
        paymentMethod: resumeRequests.paymentMethod,
        paymentReference: resumeRequests.paymentReference,
        paidAt: resumeRequests.paidAt,
        candidateNotes: resumeRequests.candidateNotes,
        staffNotes: resumeRequests.staffNotes,
        createdAt: resumeRequests.createdAt,
      })
      .from(resumeRequests)
      .orderBy(desc(resumeRequests.createdAt), desc(resumeRequests.id))
      .limit(opts.limit),
    db.select({ value: count() }).from(resumeRequests),
  );
  return { total: loaded.total, rows: loaded.rows.map(({ passportEncrypted, ...r }) => ({ ...r, passportFull: decrypt(opts.fullPassport, passportEncrypted) })) };
}

/** Rows per area right now (cheap counts, for the backup page). Keys match the sheet keys in service.ts. */
export async function countBackupRows(): Promise<Record<string, number>> {
  const one = async (q: Promise<{ value: number }[]>) => (await q)[0]?.value ?? 0;
  const [cv, posters, apps, requests, slots, bookings, refs, payouts, reviews, leadCount, enquiryCount, orgs, resumes] = await Promise.all([
    one(db.select({ value: count() }).from(cvSubmissions)),
    one(db.select({ value: count() }).from(cmsEntries).where(and(eq(cmsEntries.collection, POSTER_COLLECTION), isNull(cmsEntries.deletedAt)))),
    one(db.select({ value: count() }).from(applications)),
    one(db.select({ value: count() }).from(requirementRequests)),
    one(db.select({ value: count() }).from(bookingSlots)),
    one(db.select({ value: count() }).from(slotBookings)),
    one(db.select({ value: count() }).from(referrers)),
    one(db.select({ value: count() }).from(referralPayouts)),
    one(db.select({ value: count() }).from(workerReviews)),
    one(db.select({ value: count() }).from(leads)),
    one(db.select({ value: count() }).from(enquiries)),
    one(db.select({ value: count() }).from(organizations).where(isNull(organizations.deletedAt))),
    one(db.select({ value: count() }).from(resumeRequests)),
  ]);
  return {
    cv_submissions: cv,
    posters,
    applications: apps,
    manpower_requests: requests,
    booking_slots: slots,
    bookings,
    referrers: refs,
    referral_payouts: payouts,
    worker_reviews: reviews,
    leads: leadCount,
    enquiries: enquiryCount,
    organisations: orgs,
    resume_requests: resumes,
  };
}

/** Display names of users (for the activity list). */
export async function userNames(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}
