import "server-only";

import { eq } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { platformSettings } from "@/db/schema";

import { DEFAULT_ATTRIBUTION_WINDOW_DAYS, normalizeAttributionWindowDays } from "./matching";

/**
 * Recruitment settings that are not (yet) in src/config/settings.ts. Read straight from
 * platform_settings so administrators can configure them; defaults apply when no row exists.
 *
 *  - "recruitment.partner_attribution_days" (number, default 90): how long the first valid partner
 *    submission holds attribution of a candidate (spec 10.4).
 */
export const PARTNER_ATTRIBUTION_DAYS_SETTING = "recruitment.partner_attribution_days";

export async function getAttributionWindowDays(tx: DbOrTx = db): Promise<number> {
  const [row] = await tx.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, PARTNER_ATTRIBUTION_DAYS_SETTING)).limit(1);
  return row ? normalizeAttributionWindowDays(row.value) : DEFAULT_ATTRIBUTION_WINDOW_DAYS;
}
