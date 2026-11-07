import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";

import { FEATURES, type FeatureKey } from "@/config/features";
import { SETTINGS, type SettingKey, type SettingValue } from "@/config/settings";
import { db } from "@/db";
import { featureFlags, platformSettings } from "@/db/schema";
import type { Portal } from "@/db/schema/_constants";

/**
 * Platform settings and feature flags.
 * Reads are memoised per request; writes are audited by the caller (admin settings actions).
 */

const loadSettings = cache(async () => {
  const rows = await db.select({ key: platformSettings.key, value: platformSettings.value }).from(platformSettings);
  return new Map(rows.map((r) => [r.key, r.value]));
});

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const map = await loadSettings();
  return (map.has(key) ? map.get(key) : SETTINGS[key].default) as SettingValue<K>;
}

export async function getSettings<K extends SettingKey>(keys: K[]): Promise<{ [P in K]: SettingValue<P> }> {
  const map = await loadSettings();
  return Object.fromEntries(keys.map((k) => [k, map.has(k) ? map.get(k) : SETTINGS[k].default])) as { [P in K]: SettingValue<P> };
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingValue<K>, updatedByUserId: string | null): Promise<void> {
  await db
    .insert(platformSettings)
    .values({ key, value: value as unknown, updatedByUserId, description: SETTINGS[key].label })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value: value as unknown, updatedByUserId, updatedAt: new Date() } });
}

const loadFlags = cache(async () => {
  const rows = await db.select().from(featureFlags);
  return new Map(rows.map((r) => [r.key, r]));
});

export type FlagContext = { portal?: Portal; organizationId?: string; isStaff?: boolean };

/**
 * Is a module/feature enabled? Unknown keys are false.
 * Optional rules on a flag row: { portals?: Portal[], orgIds?: string[], staffOnly?: boolean }.
 */
export async function isFeatureEnabled(key: FeatureKey, ctx: FlagContext = {}): Promise<boolean> {
  const map = await loadFlags();
  const row = map.get(key);
  if (!row) return FEATURES[key]?.default ?? false;
  if (!row.enabled) return false;
  const rules = (row.rules ?? {}) as { portals?: string[]; orgIds?: string[]; staffOnly?: boolean };
  if (rules.staffOnly && !ctx.isStaff) return false;
  if (rules.portals?.length && ctx.portal && !rules.portals.includes(ctx.portal)) return false;
  if (rules.orgIds?.length && ctx.organizationId && !rules.orgIds.includes(ctx.organizationId)) return false;
  return true;
}

export async function listFeatureFlags() {
  const map = await loadFlags();
  return (Object.keys(FEATURES) as FeatureKey[]).map((key) => {
    const row = map.get(key);
    return {
      key,
      name: FEATURES[key].name,
      category: FEATURES[key].category,
      enabled: row ? row.enabled : FEATURES[key].default,
      rules: row?.rules ?? {},
      isDefault: !row,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export async function setFeatureFlag(key: FeatureKey, enabled: boolean, updatedByUserId: string | null, rules?: Record<string, unknown>) {
  const meta = FEATURES[key];
  await db
    .insert(featureFlags)
    .values({ key, enabled, name: meta.name, category: meta.category, rules: rules ?? {}, updatedByUserId })
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: { enabled, ...(rules ? { rules } : {}), updatedByUserId, updatedAt: new Date() },
    });
}

/** Convenience for portal layouts: 404-style gate handled by caller. */
export async function getFeatureFlagRow(key: FeatureKey) {
  const rows = await db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
  return rows[0] ?? null;
}
