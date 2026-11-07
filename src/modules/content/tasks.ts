import "server-only";

import type { TaskHandlers } from "@/server/tasks/types";

import { processAnnouncementSchedule } from "./announcements";
import { expireLogoPermissions } from "./logo-permissions";
import { expireMediaConsents } from "./media";
import { refreshLiveMetrics } from "./public-metrics";
import { processScheduledEntries } from "./scheduled";

/**
 * Background task handlers owned by the content module.
 *
 *  - content.publish_scheduled (recurring, every 5 minutes — src/server/tasks/schedule.ts): publishes / archives
 *    CMS entries by schedule, archives consent-expired testimonials, case studies and team members, starts and
 *    expires announcements, withdraws public use of media whose consent expired, expires logo permissions, and
 *    refreshes stale live public-metric values. Every step is idempotent; a failing step does not stop the
 *    others, and the task fails afterwards so the processor retries it.
 *  - content.refresh_public_metrics (on demand): recompute every live public metric now.
 */
export const tasks: TaskHandlers = {
  "content.publish_scheduled": async (_payload, ctx) => {
    const now = new Date();
    const failures: string[] = [];
    const run = async <T>(name: string, step: () => Promise<T>): Promise<T | null> => {
      try {
        return await step();
      } catch (error) {
        failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    };
    const entries = await run("entries", () => processScheduledEntries(now));
    const announcements = await run("announcements", () => processAnnouncementSchedule(now));
    const media = await run("media consent", () => expireMediaConsents(now));
    const logos = await run("logo permissions", () => expireLogoPermissions(now));
    const metrics = await run("live metrics", () => refreshLiveMetrics(now, { onlyStale: true }));
    ctx.log("Content schedule processed", { entries, announcements, mediaConsentExpired: media, logoPermissionsExpired: logos, metricsRefreshed: metrics });
    if (failures.length) throw new Error(`content.publish_scheduled had failing steps — ${failures.join("; ")}`);
  },

  "content.refresh_public_metrics": async (_payload, ctx) => {
    const refreshed = await refreshLiveMetrics(new Date());
    ctx.log("Live public metrics refreshed", { refreshed });
  },
};
