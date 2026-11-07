import type { EntitlementCheck } from "@/modules/commercial/entitlements";

/**
 * The seat line under the invite form. Shown only while plan limits are enforced and the plan has a seat cap:
 * with `enforced` off the limit is informational (EntitlementCheck contract) and the service accepts any
 * number of invitations, so quoting "x of y seats" would be misleading.
 *
 * `used` from the entitlement counts active members only; pending, unexpired invitations reserve a seat too
 * (the organisations module counts them before sending another invitation), so they are added here.
 */
export function seatsNote(seats: Pick<EntitlementCheck, "enforced" | "limit" | "used" | "allowed" | "reason"> | null, pendingInvitations: number): string | null {
  if (!seats || !seats.enforced || seats.limit === null) return null;
  const inUse = seats.used + pendingInvitations;
  const base = `${inUse} of ${seats.limit} ${seats.limit === 1 ? "seat" : "seats"} in use on your plan (active members and pending invitations).`;
  if (!seats.allowed) return seats.reason ? `${base} ${seats.reason}` : base;
  if (inUse >= seats.limit) return `${base} Cancel an invitation, remove a member or upgrade the plan to invite someone else.`;
  return base;
}
