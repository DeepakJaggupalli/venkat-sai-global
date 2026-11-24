import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { and, count, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { currencies, cvSubmissions, referralPayouts, referrers } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { absoluteUrl } from "@/lib/env";
import { toMinorUnits } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";
import { audit, logSecurityEvent } from "@/modules/audit";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { getSetting } from "@/modules/settings";

import { generateReferralCode } from "./codes";
import {
  deriveRewardStatus,
  normaliseReferralCode,
  publicReferralStage,
  publicReferredName,
  referralCookie,
  referralLinkPath,
  referrerFirstName,
  referrerNamesMatch,
  type LinkCvToReferrerInput,
  type MarkReferralPaidInput,
  type MyReferralsView,
  type ReferralCheckInput,
  type ReferralCookie,
  type ReferrerLinkInput,
  type ReferrerLinkResult,
} from "./schemas";

/**
 * "Refer a friend" (public /refer, the /r/<CODE> link, staff /admin/referrals).
 *
 * Anyone gets a personal link with their name and mobile number (one referrer per number). A visitor who opens the
 * link gets the `vsg_ref` cookie; /send-cv stores the code on the CV submission (cv_submissions.referralCode). When
 * that CV reaches "departed" the reward is due; staff record the payment (amount + currency they choose, never a
 * default) and can undo a mistaken record. The reward status is derived (schemas.ts → deriveRewardStatus).
 *
 * Public reads are rate limited and enumeration-safe: "Check my referrals" needs the mobile number and the code,
 * compares the number in constant time and gives one generic error. A number that already has a link gets it back
 * only when the typed name has two words of the stored one (schemas.ts → referrerNamesMatch). Staff writes need
 * candidates.manage and are audited.
 */

export const REFERRALS_ADMIN_PATH = "/admin/referrals";
export const REFERRALS_PUBLIC_PATH = "/refer";

export const REFERRAL_LINK_ERROR = "We could not create your link. Please try again, or WhatsApp us.";
export const REFERRAL_NAME_MISMATCH_ERROR =
  "This mobile number already has a referral link. Enter your name the way you gave it the first time, or WhatsApp us and we will send you your link.";
export const REFERRAL_PAUSED_ERROR = "Your referral link is paused. Please WhatsApp or call us.";
export const REFERRAL_LOOKUP_ERROR = "We could not find referrals for this mobile number and code. Check both and try again, or WhatsApp us.";

/** Most people a referrer can see in one check (newest first; the counts cover everyone). */
export const MY_REFERRALS_LIMIT = 200;

type FieldErrors = Record<string, string[]>;

function invalid(fieldErrors: FieldErrors, message = "Please check the highlighted fields."): never {
  throw new ActionError(message, { fieldErrors });
}

function assertCanManage(ctx: StaffContext): void {
  if (!staffCan(ctx, "candidates.manage")) throw new ActionError("You do not have permission to do this.", { code: "forbidden" });
}

async function enforceLimits(limits: { key: string; limit: number; windowSeconds: number }[], message: string): Promise<void> {
  for (const l of limits) {
    const result = await rateLimit(l.key, l.limit, l.windowSeconds);
    if (!result.allowed) throw new ActionError(message, { code: "rate_limited" });
  }
}

/** PostgreSQL constraint of a failed statement (drizzle wraps driver errors in `cause`). */
function failedConstraint(error: unknown): string | undefined {
  for (const candidate of [error, (error as { cause?: unknown })?.cause]) {
    if (candidate && typeof candidate === "object" && "constraint" in candidate && typeof candidate.constraint === "string") return candidate.constraint;
  }
  return undefined;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

// ---------------------------------------------------------------------------
// Codes and links
// ---------------------------------------------------------------------------

/** Absolute share link https://…/r/CODE. */
export function referralShareUrl(code: string): string {
  return absoluteUrl(referralLinkPath(code));
}

/** The reward wording the business wrote in Settings → Referrals ("" = show no amount; never invented). */
export async function getReferralRewardText(): Promise<string> {
  const value = await getSetting("referrals.reward_text");
  return typeof value === "string" ? value.trim() : "";
}

/** An active referrer for a code typed, pasted or read from a link/cookie (null for unknown or blocked codes). */
export async function findActiveReferrerByCode(raw: unknown): Promise<{ id: string; code: string } | null> {
  const code = normaliseReferralCode(raw);
  if (!code) return null;
  const [row] = await db
    .select({ id: referrers.id, code: referrers.code })
    .from(referrers)
    .where(and(eq(referrers.code, code), eq(referrers.status, "active")))
    .limit(1);
  return row ?? null;
}

/**
 * /r/<CODE>: the cookie to set when the code belongs to an active referrer, else null (the visitor still lands on the
 * homepage, just without attribution).
 */
export async function resolveReferralLanding(rawCode: unknown, opts: { production: boolean }): Promise<ReferralCookie | null> {
  const referrer = await findActiveReferrerByCode(rawCode);
  return referrer ? referralCookie(referrer.code, opts) : null;
}

type ReferrerRow = typeof referrers.$inferSelect;

/**
 * Insert a referrer with a fresh code. A code collision is retried with a new code; a number registered at the same
 * moment (double tap) returns null so the caller reads that row instead. Exported for the tests.
 */
export async function insertReferrer(
  values: Omit<typeof referrers.$inferInsert, "code" | "id">,
  generate: () => string = () => generateReferralCode(),
): Promise<ReferrerRow | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const [row] = await db
        .insert(referrers)
        .values({ ...values, code: generate() })
        .onConflictDoNothing({ target: referrers.phone })
        .returning();
      return row ?? null;
    } catch (error) {
      if (failedConstraint(error) === "referrers_code_uq") continue;
      throw error;
    }
  }
  throw new Error("Could not generate a unique referral code");
}

async function findReferrerByPhone(phone: string): Promise<ReferrerRow | null> {
  const [row] = await db.select().from(referrers).where(eq(referrers.phone, phone)).limit(1);
  return row ?? null;
}

async function returningLink(row: ReferrerRow, typedName: string): Promise<ReferrerLinkResult> {
  if (!referrerNamesMatch(row.name, typedName)) {
    await logSecurityEvent({ type: "referral_link_name_mismatch", severity: "info" });
    throw new ActionError(REFERRAL_NAME_MISMATCH_ERROR, { code: "name_mismatch", fieldErrors: { name: ["Enter your name the way you gave it the first time"] } });
  }
  if (row.status !== "active") throw new ActionError(REFERRAL_PAUSED_ERROR, { code: "blocked" });
  return { firstName: referrerFirstName(row.name), code: row.code, url: referralShareUrl(row.code), returning: true };
}

// ---------------------------------------------------------------------------
// Public: get my link, check my referrals
// ---------------------------------------------------------------------------

/**
 * "Get my link": creates the referrer for a new mobile number, or returns the existing link when the typed name
 * matches (see referrerNamesMatch). Honeypot hits are dropped (security event only). Rate limited per network and
 * per number.
 */
export async function getReferrerLink(input: ReferrerLinkInput, meta: { ipHash: string | null }): Promise<ReferrerLinkResult> {
  if (input.website?.trim()) {
    await logSecurityEvent({ type: "form_honeypot_triggered", severity: "info", metadata: { form: "refer" } });
    throw new ActionError(REFERRAL_LINK_ERROR);
  }
  if (!input.consentToContact) invalid({ consentToContact: ["Please agree that we may call or WhatsApp you about your referrals"] });
  await enforceLimits(
    [
      ...(meta.ipHash
        ? [
            { key: `referral-link:ip:${meta.ipHash}`, limit: 10, windowSeconds: 10 * 60 },
            { key: `referral-link:ip-day:${meta.ipHash}`, limit: 30, windowSeconds: 24 * 60 * 60 },
          ]
        : []),
      { key: `referral-link:phone:${input.phone}`, limit: 5, windowSeconds: 60 * 60 },
    ],
    "You have asked for a link several times in a short time. Please wait a little, or WhatsApp us.",
  );

  const existing = await findReferrerByPhone(input.phone);
  if (existing) return returningLink(existing, input.name);

  const policyVersion = await getSetting("privacy.policy_version");
  const created = await insertReferrer({ name: input.name, phone: input.phone, ipHash: meta.ipHash, privacyNoticeVersion: policyVersion });
  if (!created) {
    const again = await findReferrerByPhone(input.phone);
    if (again) return returningLink(again, input.name);
    throw new ActionError(REFERRAL_LINK_ERROR);
  }
  await audit({ action: "referrer.created", entityType: "referrer", entityId: created.id, metadata: { source: "refer_page" } });
  return { firstName: referrerFirstName(created.name), code: created.code, url: referralShareUrl(created.code), returning: false };
}

/**
 * "Check my referrals": mobile number + code. Rate limited per network and per code; the number is compared in
 * constant time (also for an unknown code) and every mismatch gets the same error. Returns only first name + last
 * initial, trade, a coarse stage and the reward status of each referred person.
 */
export async function lookupMyReferrals(input: ReferralCheckInput, meta: { ipHash: string | null }): Promise<MyReferralsView> {
  await enforceLimits(
    [
      ...(meta.ipHash
        ? [
            { key: `referral-check:ip:${meta.ipHash}`, limit: 10, windowSeconds: 10 * 60 },
            { key: `referral-check:ip-day:${meta.ipHash}`, limit: 50, windowSeconds: 24 * 60 * 60 },
          ]
        : []),
      { key: `referral-check:code:${input.code}`, limit: 10, windowSeconds: 60 * 60 },
    ],
    "Too many checks in a short time. Please wait a little and try again, or WhatsApp us.",
  );
  const [row] = await db.select({ code: referrers.code, name: referrers.name, phone: referrers.phone, status: referrers.status }).from(referrers).where(eq(referrers.code, input.code)).limit(1);
  // Compare even when the code is unknown, so both failures take the same time.
  const matches = timingSafeEqual(digest(row?.phone ?? "\u0000no-such-code"), digest(input.phone));
  if (!row || !matches) {
    await logSecurityEvent({ type: "referral_lookup_failed", severity: "info", metadata: { ipHash: meta.ipHash } });
    throw new ActionError(REFERRAL_LOOKUP_ERROR, { code: "not_found" });
  }

  const [rows, totals] = await Promise.all([
    db
      .select({ name: cvSubmissions.name, trade: cvSubmissions.tradeLabel, status: cvSubmissions.status, payoutId: referralPayouts.id })
      .from(cvSubmissions)
      .leftJoin(referralPayouts, eq(referralPayouts.cvSubmissionId, cvSubmissions.id))
      .where(eq(cvSubmissions.referralCode, row.code))
      .orderBy(desc(cvSubmissions.createdAt))
      .limit(MY_REFERRALS_LIMIT),
    db
      .select({
        total: count(),
        placed: sql<number>`count(*) filter (where ${cvSubmissions.status} = 'departed')`.mapWith(Number),
        due: sql<number>`count(*) filter (where ${cvSubmissions.status} = 'departed' and ${referralPayouts.id} is null)`.mapWith(Number),
        paid: sql<number>`count(${referralPayouts.id})`.mapWith(Number),
      })
      .from(cvSubmissions)
      .leftJoin(referralPayouts, eq(referralPayouts.cvSubmissionId, cvSubmissions.id))
      .where(eq(cvSubmissions.referralCode, row.code)),
  ]);
  const t = totals[0];
  return {
    firstName: referrerFirstName(row.name),
    code: row.code,
    url: referralShareUrl(row.code),
    active: row.status === "active",
    items: rows.map((r) => ({ name: publicReferredName(r.name), trade: r.trade, stage: publicReferralStage(r.status), reward: deriveRewardStatus(r.status, r.payoutId !== null) })),
    counts: { total: t?.total ?? 0, placed: t?.placed ?? 0, due: t?.due ?? 0, paid: t?.paid ?? 0 },
  };
}

// ---------------------------------------------------------------------------
// Staff (Command Centre)
// ---------------------------------------------------------------------------

/**
 * Record that a due reward was paid (candidates.manage). Only for a CV sent through an active referrer's link that
 * has departed; one payment per CV (unique index). The amount is in the units of the currency staff chose.
 */
export async function markReferralPaid(ctx: StaffContext, input: MarkReferralPaidInput): Promise<{ payoutId: string }> {
  assertCanManage(ctx);
  const amountMinor = toMinorUnits(input.amount, input.currency);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) invalid({ amount: ["Enter the amount paid"] });
  return db.transaction(async (tx) => {
    const [cv] = await tx
      .select({ id: cvSubmissions.id, status: cvSubmissions.status, referralCode: cvSubmissions.referralCode })
      .from(cvSubmissions)
      .where(eq(cvSubmissions.id, input.cvSubmissionId))
      .for("update")
      .limit(1);
    if (!cv) throw new ActionError("This CV could not be found.");
    if (!cv.referralCode) throw new ActionError("This CV was not sent through a referral link.");
    const [referrer] = await tx.select({ id: referrers.id, status: referrers.status }).from(referrers).where(eq(referrers.code, cv.referralCode)).limit(1);
    if (!referrer) throw new ActionError("No referrer has this CV's referral code.");
    if (referrer.status !== "active") throw new ActionError("This referrer is blocked. Unblock them first if the reward should be paid.");
    if (cv.status !== "departed") throw new ActionError("A reward is due only after the person has departed. Set the CV status to Departed first.");
    const [currency] = await tx
      .select({ code: currencies.code })
      .from(currencies)
      .where(and(eq(currencies.code, input.currency), eq(currencies.isActive, true)))
      .limit(1);
    if (!currency) invalid({ currency: ["This currency is not available. Choose another one."] });
    const note = input.note?.trim() || null;
    const [payout] = await tx
      .insert(referralPayouts)
      .values({ cvSubmissionId: cv.id, referrerId: referrer.id, amountMinor, currency: currency.code, paidByUserId: ctx.user.id, note })
      .onConflictDoNothing({ target: referralPayouts.cvSubmissionId })
      .returning({ id: referralPayouts.id });
    if (!payout) throw new ActionError("This reward is already marked paid.", { code: "already_paid" });
    await audit({
      action: "referral.payout_recorded",
      entityType: "cv_submission",
      entityId: cv.id,
      actorUserId: ctx.user.id,
      metadata: { payoutId: payout.id, referrerId: referrer.id, amountMinor, currency: currency.code, withNote: note !== null },
      tx,
    });
    return { payoutId: payout.id };
  });
}

/** Remove a payment recorded by mistake (candidates.manage, audited with what was removed). The reward is due again. */
export async function undoReferralPayout(ctx: StaffContext, input: { cvSubmissionId: string }): Promise<void> {
  assertCanManage(ctx);
  await db.transaction(async (tx) => {
    const [removed] = await tx.delete(referralPayouts).where(eq(referralPayouts.cvSubmissionId, input.cvSubmissionId)).returning();
    if (!removed) throw new ActionError("There is no payment recorded for this CV.");
    await audit({
      action: "referral.payout_removed",
      entityType: "cv_submission",
      entityId: input.cvSubmissionId,
      actorUserId: ctx.user.id,
      metadata: { payoutId: removed.id, referrerId: removed.referrerId, amountMinor: removed.amountMinor, currency: removed.currency, paidAt: removed.paidAt.toISOString() },
      tx,
    });
  });
}

/**
 * Attach a CV that arrived without the link (walk-in, WhatsApp, Excel import) to the referrer who sent the person
 * (candidates.manage, audited). Re-linking to another referrer is allowed until a payment is recorded; the result
 * names the referrer the CV was taken from (`previousReferrerName`) so staff see the move. The CV's updatedAt is
 * kept: this is staff bookkeeping, not a change the candidate made or sees.
 */
export async function linkCvToReferrer(
  ctx: StaffContext,
  input: LinkCvToReferrerInput,
): Promise<{ cvSubmissionId: string; referrerName: string; changed: boolean; previousReferrerName: string | null }> {
  assertCanManage(ctx);
  return db.transaction(async (tx) => {
    const [cv] = await tx
      .select({ id: cvSubmissions.id, referralCode: cvSubmissions.referralCode, updatedAt: cvSubmissions.updatedAt })
      .from(cvSubmissions)
      .where(eq(cvSubmissions.code, input.cvReference))
      .for("update")
      .limit(1);
    if (!cv) invalid({ cvReference: ["No CV has this reference. Copy it from CV submissions."] });
    const [referrer] = await tx.select({ id: referrers.id, code: referrers.code, name: referrers.name, status: referrers.status }).from(referrers).where(eq(referrers.code, input.referralCode)).limit(1);
    if (!referrer) invalid({ referralCode: ["No referrer has this code"] });
    if (referrer.status !== "active") invalid({ referralCode: ["This referrer is blocked. Unblock them first."] });
    if (cv.referralCode === referrer.code) return { cvSubmissionId: cv.id, referrerName: referrer.name, changed: false, previousReferrerName: null };
    const [payout] = await tx.select({ id: referralPayouts.id }).from(referralPayouts).where(eq(referralPayouts.cvSubmissionId, cv.id)).limit(1);
    if (payout) throw new ActionError("A reward is already recorded as paid for this CV. Undo that payment first if the referrer was wrong.");
    const [previous] = cv.referralCode
      ? await tx.select({ id: referrers.id, name: referrers.name }).from(referrers).where(eq(referrers.code, cv.referralCode)).limit(1)
      : [];
    await tx.update(cvSubmissions).set({ referralCode: referrer.code, updatedAt: cv.updatedAt }).where(eq(cvSubmissions.id, cv.id));
    await audit({
      action: "cv_submission.referral_linked",
      entityType: "cv_submission",
      entityId: cv.id,
      actorUserId: ctx.user.id,
      metadata: { referrerId: referrer.id, code: referrer.code, previousCode: cv.referralCode, previousReferrerId: previous?.id ?? null },
      tx,
    });
    return { cvSubmissionId: cv.id, referrerName: referrer.name, changed: true, previousReferrerName: previous?.name ?? null };
  });
}

/** Take a CV off its referrer (candidates.manage, audited). Refused once a payment is recorded. */
export async function unlinkCvReferral(ctx: StaffContext, input: { cvSubmissionId: string }): Promise<void> {
  assertCanManage(ctx);
  await db.transaction(async (tx) => {
    const [cv] = await tx
      .select({ id: cvSubmissions.id, referralCode: cvSubmissions.referralCode, updatedAt: cvSubmissions.updatedAt })
      .from(cvSubmissions)
      .where(eq(cvSubmissions.id, input.cvSubmissionId))
      .for("update")
      .limit(1);
    if (!cv) throw new ActionError("This CV could not be found.");
    if (!cv.referralCode) return;
    const [payout] = await tx.select({ id: referralPayouts.id }).from(referralPayouts).where(eq(referralPayouts.cvSubmissionId, cv.id)).limit(1);
    if (payout) throw new ActionError("A reward is already recorded as paid for this CV. Undo that payment first.");
    await tx.update(cvSubmissions).set({ referralCode: null, updatedAt: cv.updatedAt }).where(eq(cvSubmissions.id, cv.id));
    await audit({ action: "cv_submission.referral_unlinked", entityType: "cv_submission", entityId: cv.id, actorUserId: ctx.user.id, metadata: { previousCode: cv.referralCode }, tx });
  });
}

/** Block (the link stops working, no payment can be recorded) or unblock a referrer. candidates.manage, audited. */
export async function setReferrerStatus(ctx: StaffContext, input: { id: string; status: "active" | "blocked" }): Promise<void> {
  assertCanManage(ctx);
  await db.transaction(async (tx) => {
    const [current] = await tx.select({ id: referrers.id, status: referrers.status }).from(referrers).where(eq(referrers.id, input.id)).for("update").limit(1);
    if (!current) throw new ActionError("This referrer could not be found.");
    if (current.status === input.status) return;
    await tx.update(referrers).set({ status: input.status, statusChangedAt: new Date(), statusChangedByUserId: ctx.user.id }).where(eq(referrers.id, current.id));
    await audit({
      action: input.status === "blocked" ? "referrer.blocked" : "referrer.unblocked",
      entityType: "referrer",
      entityId: current.id,
      actorUserId: ctx.user.id,
      metadata: { from: current.status, to: input.status },
      tx,
    });
  });
}
