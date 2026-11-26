import { ActionError } from "@/lib/actions";

/**
 * A requirement sent to Venkat Sai cannot ask for people by a day that has already passed (drafts may keep any date).
 * One day of slack covers time zones: `joiningBy` is a calendar day (YYYY-MM-DD) and "today" differs around the world.
 */
export function assertJoiningDateNotPast(joiningBy: string | null | undefined, now: Date = new Date()): void {
  if (!joiningBy) return;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (joiningBy < yesterday) {
    throw new ActionError("The joining date has already passed. Choose today or a later date before sending the requirement.", {
      fieldErrors: { joiningBy: ["Choose today or a later date"] },
    });
  }
}
