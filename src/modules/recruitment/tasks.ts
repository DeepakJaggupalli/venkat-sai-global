import type { TaskHandlers } from "@/server/tasks/types";

/**
 * Background task handlers owned by the recruitment module.
 * Task type names must be prefixed with "recruitment." (see src/server/tasks/schedule.ts for recurring ones).
 *
 *  - recruitment.interview_reminders (recurring, every 15 min — in schedule.ts): sends the 24 h and
 *    2 h interview reminders (dedupe keys include the scheduled time, so reschedules get fresh
 *    reminders and retries never double-send). It also enqueues the hourly maintenance tasks below
 *    (one per hour via dedupe key) until they are listed in schedule.ts themselves.
 *  - recruitment.expire_offers: issued offers past their response deadline → expired (+ notifications).
 *  - recruitment.expire_attributions: partner attributions past their window → expired.
 *  - recruitment.expire_unlocks (hourly, in schedule.ts): profile unlocks that lapsed → the organisation's
 *    candidate-profile file grants are withdrawn (unless a shared application still entitles it).
 *
 * Services are imported lazily so loading the task registry stays cheap. All handlers are idempotent.
 */
export const tasks: TaskHandlers = {
  "recruitment.interview_reminders": async (_payload, ctx) => {
    const { sendDueInterviewReminders } = await import("./interviews");
    const sent = await sendDueInterviewReminders(new Date());
    ctx.log("Interview reminders processed", { sent });

    const { enqueueTask } = await import("@/server/tasks/queue");
    const hourBucket = new Date().toISOString().slice(0, 13);
    await enqueueTask("recruitment.expire_offers", {}, { dedupeKey: `recruitment.expire_offers:${hourBucket}` });
    await enqueueTask("recruitment.expire_attributions", {}, { dedupeKey: `recruitment.expire_attributions:${hourBucket}` });
  },

  "recruitment.expire_offers": async (_payload, ctx) => {
    const { expireDueOffers } = await import("./offers");
    const expired = await expireDueOffers(new Date());
    ctx.log("Offer expiry processed", { expired });
  },

  "recruitment.expire_attributions": async (_payload, ctx) => {
    const { expireAttributions } = await import("./partner-submissions");
    const expired = await expireAttributions(new Date());
    ctx.log("Attribution expiry processed", { expired });
  },

  "recruitment.expire_unlocks": async (_payload, ctx) => {
    const { revokeGrantsForLapsedUnlocks } = await import("./unlocks");
    const processed = await revokeGrantsForLapsedUnlocks(new Date());
    ctx.log("Lapsed unlocks processed", { processed });
  },
};
