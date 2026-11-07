import "server-only";

import { db } from "@/db";
import { analyticsFunnels } from "@/db/schema";

import { DEFAULT_FUNNEL_DEFINITIONS } from "./default-funnels";

/**
 * Idempotent production seed for the analytics module (called by scripts/seed.ts).
 * Inserts the default funnel definitions from spec 13.2 when their `key` is missing. Existing funnels are
 * never overwritten (administrators may have edited them), and seeded funnels cannot be deleted in the
 * admin — only deactivated — so they are not re-created against an administrator's wishes.
 * No business data is seeded.
 */
export async function seed(): Promise<void> {
  for (const funnel of DEFAULT_FUNNEL_DEFINITIONS) {
    await db
      .insert(analyticsFunnels)
      .values({ key: funnel.key, name: funnel.name, description: funnel.description, windowDays: funnel.windowDays, steps: funnel.steps, isActive: true })
      .onConflictDoNothing({ target: analyticsFunnels.key });
  }
}
