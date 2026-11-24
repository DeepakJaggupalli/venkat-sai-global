import "server-only";

import { getSetting } from "@/modules/settings";

import type { StaffContext } from "./authz";

/** Shown by staff route handlers (downloads, uploads) when two-factor set-up is still missing. */
export const STAFF_TWO_FACTOR_MESSAGE = "Set up two-factor authentication at /account/security first.";

/**
 * True when the platform requires staff two-factor authentication and this staff member has not set it up yet.
 * Command Centre pages enforce this through requireStaff; route handlers (direct download / upload links) use
 * getStaffContext and must refuse with this check so a direct link cannot skip the rule.
 */
export async function staffTwoFactorMissing(ctx: StaffContext): Promise<boolean> {
  if (ctx.user.twoFactorEnabled) return false;
  return Boolean(await getSetting("security.require_staff_2fa"));
}
