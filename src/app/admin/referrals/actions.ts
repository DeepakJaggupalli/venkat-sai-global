"use server";

import { revalidatePath } from "next/cache";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { formatMoney, toMinorUnits } from "@/lib/format";
import { requireStaff } from "@/modules/identity/authz";
import { linkCvToReferrerSchema, markReferralPaidSchema, referralPayoutUndoSchema, referrerStatusSchema, unlinkCvReferralSchema } from "@/modules/referrals/schemas";
import { linkCvToReferrer, markReferralPaid, REFERRALS_ADMIN_PATH, setReferrerStatus, undoReferralPayout, unlinkCvReferral } from "@/modules/referrals/service";

/** Record a paid reward (candidates.manage, re-checked and audited by the service). */
export const markReferralPaidAction = createFormAction(markReferralPaidSchema, async (input) => {
  const ctx = await requireStaff("candidates.manage");
  await markReferralPaid(ctx, input);
  revalidatePath(REFERRALS_ADMIN_PATH);
  return ok(undefined, `Marked paid: ${formatMoney(toMinorUnits(input.amount, input.currency), input.currency)}.`);
});

/** Remove a payment recorded by mistake (the reward shows as due again). */
export const undoReferralPayoutAction = createAction(referralPayoutUndoSchema, async (input) => {
  const ctx = await requireStaff("candidates.manage");
  await undoReferralPayout(ctx, input);
  revalidatePath(REFERRALS_ADMIN_PATH);
  return ok(undefined, "Payment record removed. The reward shows as due again.");
});

/** Block or unblock a referrer. */
export const setReferrerStatusAction = createAction(referrerStatusSchema, async (input) => {
  const ctx = await requireStaff("candidates.manage");
  await setReferrerStatus(ctx, input);
  revalidatePath(REFERRALS_ADMIN_PATH);
  return ok(undefined, input.status === "blocked" ? "Referrer blocked. Their link no longer works." : "Referrer unblocked. Their link works again.");
});

/** Attach a CV (by reference) to a referrer (by code). */
export const linkCvToReferrerAction = createFormAction(linkCvToReferrerSchema, async (input) => {
  const ctx = await requireStaff("candidates.manage");
  const result = await linkCvToReferrer(ctx, input);
  revalidatePath(REFERRALS_ADMIN_PATH);
  if (!result.changed) return ok(undefined, `${input.cvReference} was already referred by ${result.referrerName}.`);
  const moved = result.previousReferrerName ? ` It no longer counts for ${result.previousReferrerName}.` : "";
  return ok(undefined, `${input.cvReference} is now referred by ${result.referrerName}.${moved}`);
});

/** Take a CV off its referrer. */
export const unlinkCvReferralAction = createAction(unlinkCvReferralSchema, async (input) => {
  const ctx = await requireStaff("candidates.manage");
  await unlinkCvReferral(ctx, input);
  revalidatePath(REFERRALS_ADMIN_PATH);
  return ok(undefined, "Referral removed from this CV.");
});
