"use server";

import { createFormAction, ok } from "@/lib/actions";
import { getRequestMeta } from "@/lib/request";
import { referralCheckSchema, referrerLinkSchema, type MyReferralsView, type ReferrerLinkResult } from "@/modules/referrals/schemas";
import { getReferrerLink, lookupMyReferrals } from "@/modules/referrals/service";

/** /refer "Get my link" (name + mobile). Rate limited, honeypot and name check in the service. */
export const getReferralLinkAction = createFormAction<typeof referrerLinkSchema, ReferrerLinkResult>(referrerLinkSchema, async (input) => {
  const meta = await getRequestMeta();
  return ok(await getReferrerLink(input, { ipHash: meta.ipHash }));
});

/** /refer "Check my referrals" (mobile + code). Rate limited, constant-time and one generic error in the service. */
export const checkMyReferralsAction = createFormAction<typeof referralCheckSchema, MyReferralsView>(referralCheckSchema, async (input) => {
  const meta = await getRequestMeta();
  return ok(await lookupMyReferrals(input, { ipHash: meta.ipHash }));
});
