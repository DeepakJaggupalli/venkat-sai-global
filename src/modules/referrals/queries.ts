import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { cvSubmissions, referralPayouts, referrers, users } from "@/db/schema";
import type { CvSubmissionStatus } from "@/db/schema/cv-submissions";
import type { ReferrerStatus } from "@/db/schema/referrals";
import { ActionError } from "@/lib/actions";
import { maskPhone } from "@/lib/format";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { logDataAccess } from "@/modules/audit";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import { deriveRewardStatus, phoneSearchDigits, type ReferralFilters, type RewardStatus } from "./schemas";
import { referralShareUrl } from "./service";

/**
 * Command Centre reads for /admin/referrals (candidates.manage). Phone numbers are shown only with
 * candidates.view_contact, and every list that shows them is logged (logDataAccess), as for CV submissions.
 */

function assertCanManage(ctx: StaffContext): void {
  if (!staffCan(ctx, "candidates.manage")) throw new ActionError("You do not have permission to do this.", { code: "forbidden" });
}

function likePattern(q: string): string {
  return `%${q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

export type PaidTotal = { currency: string; amountMinor: number };

/** Referred CVs (cv_submissions whose referral code belongs to a referrer) with the referrer and any payout. */
const referredJoin = () =>
  db
    .select({
      id: cvSubmissions.id,
      code: cvSubmissions.code,
      name: cvSubmissions.name,
      phone: cvSubmissions.phone,
      tradeLabel: cvSubmissions.tradeLabel,
      status: cvSubmissions.status,
      createdAt: cvSubmissions.createdAt,
      statusChangedAt: cvSubmissions.statusChangedAt,
      referrerId: referrers.id,
      referrerName: referrers.name,
      referrerCode: referrers.code,
      referrerPhone: referrers.phone,
      referrerStatus: referrers.status,
      payoutId: referralPayouts.id,
      payoutAmountMinor: referralPayouts.amountMinor,
      payoutCurrency: referralPayouts.currency,
      payoutPaidAt: referralPayouts.paidAt,
      payoutNote: referralPayouts.note,
      paidByName: users.displayName,
    })
    .from(cvSubmissions)
    .innerJoin(referrers, eq(referrers.code, cvSubmissions.referralCode))
    .leftJoin(referralPayouts, eq(referralPayouts.cvSubmissionId, cvSubmissions.id))
    .leftJoin(users, eq(users.id, referralPayouts.paidByUserId));

/** SQL for one derived reward status (mirrors deriveRewardStatus). */
function rewardCondition(reward: RewardStatus): SQL {
  switch (reward) {
    case "paid":
      return isNotNull(referralPayouts.id);
    case "due":
      return and(eq(cvSubmissions.status, "departed"), isNull(referralPayouts.id))!;
    case "not_eligible":
      return and(eq(cvSubmissions.status, "not_suitable"), isNull(referralPayouts.id))!;
    case "in_progress":
      return and(notInArray(cvSubmissions.status, ["departed", "not_suitable"]), isNull(referralPayouts.id))!;
  }
}

function referredConditions(filters: Pick<ReferralFilters, "reward" | "referrer" | "q">): SQL | undefined {
  const where: SQL[] = [];
  if (filters.reward) where.push(rewardCondition(filters.reward));
  if (filters.referrer) where.push(eq(referrers.id, filters.referrer));
  if (filters.q) {
    const p = likePattern(filters.q);
    where.push(or(ilike(cvSubmissions.name, p), ilike(cvSubmissions.code, p), ilike(cvSubmissions.tradeLabel, p), ilike(referrers.name, p), ilike(referrers.code, p))!);
  }
  return where.length ? and(...where) : undefined;
}

/** Due rewards first (oldest departure first), then everything else newest first. */
const dueFirst = sql`case when ${cvSubmissions.status} = 'departed' and ${referralPayouts.id} is null then 0 else 1 end`;

export type ReferredCvItem = {
  id: string;
  /** CV reference (VSG-CV-000123). */
  code: string;
  name: string;
  tradeLabel: string;
  status: CvSubmissionStatus;
  createdAt: Date;
  statusChangedAt: Date | null;
  reward: RewardStatus;
  referrer: { id: string; name: string; code: string; status: ReferrerStatus; phone: string | null; phoneMasked: string; url: string };
  payout: { amountMinor: number; currency: string; paidAt: Date; paidByName: string | null; note: string | null } | null;
  /** The CV was sent with the referrer's own mobile number. */
  selfReferral: boolean;
};

type ReferredRow = Awaited<ReturnType<ReturnType<typeof referredJoin>["execute"]>>[number];

function toReferredItem(r: ReferredRow, canContact: boolean): ReferredCvItem {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    tradeLabel: r.tradeLabel,
    status: r.status,
    createdAt: r.createdAt,
    statusChangedAt: r.statusChangedAt,
    reward: deriveRewardStatus(r.status, r.payoutId !== null),
    referrer: {
      id: r.referrerId,
      name: r.referrerName,
      code: r.referrerCode,
      status: r.referrerStatus,
      phone: canContact ? r.referrerPhone : null,
      phoneMasked: maskPhone(r.referrerPhone),
      url: referralShareUrl(r.referrerCode),
    },
    payout:
      r.payoutId !== null && r.payoutAmountMinor !== null && r.payoutCurrency !== null && r.payoutPaidAt !== null
        ? { amountMinor: r.payoutAmountMinor, currency: r.payoutCurrency, paidAt: r.payoutPaidAt, paidByName: r.paidByName ?? null, note: r.payoutNote }
        : null,
    selfReferral: r.phone === r.referrerPhone,
  };
}

async function logContactView(ctx: StaffContext, reason: string, codes: string[]): Promise<void> {
  if (!codes.length || !staffCan(ctx, "candidates.view_contact")) return;
  await logDataAccess({ actorUserId: ctx.user.id, subjectType: "referrer", subjectId: "list", dataCategory: "contact", accessType: "view", reason, metadata: { codes: [...new Set(codes)] } });
}

/** CVs sent through a referral link, due rewards first (candidates.manage). */
export async function listReferredCvs(ctx: StaffContext, filters: ReferralFilters, page: PageQuery): Promise<Paginated<ReferredCvItem>> {
  assertCanManage(ctx);
  const canContact = staffCan(ctx, "candidates.view_contact");
  const condition = referredConditions(filters);
  const [rows, totals] = await Promise.all([
    referredJoin().where(condition).orderBy(dueFirst, asc(sql`case when ${cvSubmissions.status} = 'departed' and ${referralPayouts.id} is null then ${cvSubmissions.statusChangedAt} end`), desc(cvSubmissions.createdAt)).limit(page.pageSize).offset(page.offset),
    db
      .select({ value: count() })
      .from(cvSubmissions)
      .innerJoin(referrers, eq(referrers.code, cvSubmissions.referralCode))
      .leftJoin(referralPayouts, eq(referralPayouts.cvSubmissionId, cvSubmissions.id))
      .where(condition),
  ]);
  const items = rows.map((r) => toReferredItem(r, canContact));
  await logContactView(ctx, "Referred CVs list (referrer numbers shown to WhatsApp referrers)", items.map((i) => i.referrer.code));
  return paginated(items, totals[0]?.value ?? 0, page);
}

export type ReferrerItem = {
  id: string;
  name: string;
  code: string;
  url: string;
  status: ReferrerStatus;
  phone: string | null;
  phoneMasked: string;
  createdAt: Date;
  referredCount: number;
  placedCount: number;
  dueCount: number;
  paidCount: number;
  paidTotals: PaidTotal[];
};

/** Per referral code: CVs sent, placed (departed) and rewards due. Joined to referrers by code. */
function referralStats() {
  return db
    .select({
      code: cvSubmissions.referralCode,
      referred: sql<number>`count(*)`.mapWith(Number).as("referred"),
      placed: sql<number>`count(*) filter (where ${cvSubmissions.status} = 'departed')`.mapWith(Number).as("placed"),
      due: sql<number>`count(*) filter (where ${rewardCondition("due")})`.mapWith(Number).as("due"),
    })
    .from(cvSubmissions)
    .leftJoin(referralPayouts, eq(referralPayouts.cvSubmissionId, cvSubmissions.id))
    .where(isNotNull(cvSubmissions.referralCode))
    .groupBy(cvSubmissions.referralCode)
    .as("referral_stats");
}

/** Payouts recorded per referrer. */
function payoutStats() {
  return db
    .select({ referrerId: referralPayouts.referrerId, paid: sql<number>`count(*)`.mapWith(Number).as("paid") })
    .from(referralPayouts)
    .groupBy(referralPayouts.referrerId)
    .as("referral_paid");
}

function referrerConditions(filters: Pick<ReferralFilters, "status" | "q">): SQL | undefined {
  const where: SQL[] = [];
  if (filters.status) where.push(eq(referrers.status, filters.status));
  if (filters.q) {
    const p = likePattern(filters.q);
    const any: SQL[] = [ilike(referrers.name, p), ilike(referrers.code, p), ilike(referrers.phone, p)];
    // A number copied from WhatsApp ("+91 98765 43210") or typed with spaces or a leading 0 still finds the referrer.
    for (const digits of phoneSearchDigits(filters.q)) any.push(ilike(referrers.phone, `%${digits}%`));
    where.push(or(...any)!);
  }
  return where.length ? and(...where) : undefined;
}

/** Sum of payouts per referrer and currency (never mixed across currencies). */
async function paidTotalsByReferrer(referrerIds: string[]): Promise<Map<string, PaidTotal[]>> {
  const out = new Map<string, PaidTotal[]>();
  if (!referrerIds.length) return out;
  const rows = await db
    .select({ referrerId: referralPayouts.referrerId, currency: referralPayouts.currency, amountMinor: sql<string>`sum(${referralPayouts.amountMinor})` })
    .from(referralPayouts)
    .where(inArray(referralPayouts.referrerId, referrerIds))
    .groupBy(referralPayouts.referrerId, referralPayouts.currency)
    .orderBy(referralPayouts.currency);
  for (const r of rows) {
    const list = out.get(r.referrerId) ?? [];
    list.push({ currency: r.currency, amountMinor: Number(r.amountMinor) });
    out.set(r.referrerId, list);
  }
  return out;
}

async function selectReferrers(condition: SQL | undefined, limit: number, offset: number) {
  const stats = referralStats();
  const paid = payoutStats();
  const due = sql<number>`coalesce(${stats.due}, 0)`.mapWith(Number);
  return db
    .select({
      id: referrers.id,
      name: referrers.name,
      code: referrers.code,
      phone: referrers.phone,
      status: referrers.status,
      createdAt: referrers.createdAt,
      referredCount: sql<number>`coalesce(${stats.referred}, 0)`.mapWith(Number),
      placedCount: sql<number>`coalesce(${stats.placed}, 0)`.mapWith(Number),
      dueCount: due,
      paidCount: sql<number>`coalesce(${paid.paid}, 0)`.mapWith(Number),
    })
    .from(referrers)
    .leftJoin(stats, eq(stats.code, referrers.code))
    .leftJoin(paid, eq(paid.referrerId, referrers.id))
    .where(condition)
    .orderBy(desc(due), desc(referrers.createdAt))
    .limit(limit)
    .offset(offset);
}

async function toReferrerItems(ctx: StaffContext, rows: Awaited<ReturnType<typeof selectReferrers>>): Promise<ReferrerItem[]> {
  const canContact = staffCan(ctx, "candidates.view_contact");
  const totals = await paidTotalsByReferrer(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    url: referralShareUrl(r.code),
    status: r.status,
    phone: canContact ? r.phone : null,
    phoneMasked: maskPhone(r.phone),
    createdAt: r.createdAt,
    referredCount: r.referredCount,
    placedCount: r.placedCount,
    dueCount: r.dueCount,
    paidCount: r.paidCount,
    paidTotals: totals.get(r.id) ?? [],
  }));
}

/** Referrers with their counts and paid totals per currency, those with due rewards first (candidates.manage). */
export async function listReferrers(ctx: StaffContext, filters: ReferralFilters, page: PageQuery): Promise<Paginated<ReferrerItem>> {
  assertCanManage(ctx);
  const condition = referrerConditions(filters);
  const [rows, totals] = await Promise.all([selectReferrers(condition, page.pageSize, page.offset), db.select({ value: count() }).from(referrers).where(condition)]);
  const items = await toReferrerItems(ctx, rows);
  await logContactView(ctx, "Referrers list (numbers shown to call or WhatsApp referrers)", items.map((i) => i.code));
  return paginated(items, totals[0]?.value ?? 0, page);
}

/** One referrer by id (for the referred list's heading when filtered by referrer). */
export async function getReferrerSummary(ctx: StaffContext, id: string): Promise<{ id: string; name: string; code: string; status: ReferrerStatus } | null> {
  assertCanManage(ctx);
  const [row] = await db.select({ id: referrers.id, name: referrers.name, code: referrers.code, status: referrers.status }).from(referrers).where(eq(referrers.id, id)).limit(1);
  return row ?? null;
}

export type ReferralSummary = {
  referrers: number;
  blockedReferrers: number;
  referred: number;
  due: number;
  paid: number;
  inProgress: number;
  notEligible: number;
  paidTotals: PaidTotal[];
};

/** Counts for the top of /admin/referrals (candidates.manage). */
export async function referralSummary(ctx: StaffContext): Promise<ReferralSummary> {
  assertCanManage(ctx);
  const [people, cvs, paidTotals] = await Promise.all([
    db
      .select({ total: count(), blocked: sql<number>`count(*) filter (where ${referrers.status} = 'blocked')`.mapWith(Number) })
      .from(referrers),
    db
      .select({
        total: count(),
        due: sql<number>`count(*) filter (where ${rewardCondition("due")})`.mapWith(Number),
        paid: sql<number>`count(*) filter (where ${rewardCondition("paid")})`.mapWith(Number),
        inProgress: sql<number>`count(*) filter (where ${rewardCondition("in_progress")})`.mapWith(Number),
        notEligible: sql<number>`count(*) filter (where ${rewardCondition("not_eligible")})`.mapWith(Number),
      })
      .from(cvSubmissions)
      .innerJoin(referrers, eq(referrers.code, cvSubmissions.referralCode))
      .leftJoin(referralPayouts, eq(referralPayouts.cvSubmissionId, cvSubmissions.id)),
    db
      .select({ currency: referralPayouts.currency, amountMinor: sql<string>`sum(${referralPayouts.amountMinor})` })
      .from(referralPayouts)
      .groupBy(referralPayouts.currency)
      .orderBy(referralPayouts.currency),
  ]);
  const c = cvs[0];
  return {
    referrers: people[0]?.total ?? 0,
    blockedReferrers: people[0]?.blocked ?? 0,
    referred: c?.total ?? 0,
    due: c?.due ?? 0,
    paid: c?.paid ?? 0,
    inProgress: c?.inProgress ?? 0,
    notEligible: c?.notEligible ?? 0,
    paidTotals: paidTotals.map((r) => ({ currency: r.currency, amountMinor: Number(r.amountMinor) })),
  };
}

/** Number of rewards due now (for dashboards; no personal data). */
export async function countDueReferralRewards(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(cvSubmissions)
    .innerJoin(referrers, eq(referrers.code, cvSubmissions.referralCode))
    .leftJoin(referralPayouts, eq(referralPayouts.cvSubmissionId, cvSubmissions.id))
    .where(rewardCondition("due"));
  return row?.value ?? 0;
}

// ---------------------------------------------------------------------------
// Excel download rows (the route masks phone numbers per permission and logs the export)
// ---------------------------------------------------------------------------

export type ReferredExportRow = ReferredCvItem & { referrerPhoneRaw: string };

export async function listReferredCvsForExport(ctx: StaffContext, filters: ReferralFilters, limit: number): Promise<{ rows: ReferredExportRow[]; total: number }> {
  assertCanManage(ctx);
  const condition = referredConditions(filters);
  const [rows, totals] = await Promise.all([
    referredJoin().where(condition).orderBy(dueFirst, desc(cvSubmissions.createdAt)).limit(limit),
    db
      .select({ value: count() })
      .from(cvSubmissions)
      .innerJoin(referrers, eq(referrers.code, cvSubmissions.referralCode))
      .leftJoin(referralPayouts, eq(referralPayouts.cvSubmissionId, cvSubmissions.id))
      .where(condition),
  ]);
  return { rows: rows.map((r) => ({ ...toReferredItem(r, true), referrerPhoneRaw: r.referrerPhone })), total: totals[0]?.value ?? 0 };
}

export type ReferrerExportRow = ReferrerItem & { phoneRaw: string };

export async function listReferrersForExport(ctx: StaffContext, filters: ReferralFilters, limit: number): Promise<{ rows: ReferrerExportRow[]; total: number }> {
  assertCanManage(ctx);
  const condition = referrerConditions(filters);
  const [rows, totals] = await Promise.all([selectReferrers(condition, limit, 0), db.select({ value: count() }).from(referrers).where(condition)]);
  const items = await toReferrerItems(ctx, rows);
  const phones = new Map(rows.map((r) => [r.id, r.phone]));
  return { rows: items.map((i) => ({ ...i, phoneRaw: phones.get(i.id) ?? "" })), total: totals[0]?.value ?? 0 };
}
