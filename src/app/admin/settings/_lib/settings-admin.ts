import "server-only";

import { inArray } from "drizzle-orm";

import { SETTINGS, type SettingKey, type SettingValue } from "@/config/settings";
import { db } from "@/db";
import { platformSettings, users } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";
import { staffCan } from "@/modules/identity/authz";
import { setSetting } from "@/modules/settings";
import { countryOptions, currencyOptions } from "@/modules/taxonomy/queries";

import { displayValue, parseSettingValues, sameValue, settingMeta } from "./catalog";

export type SettingState = { key: SettingKey; value: unknown; isDefault: boolean; updatedAt: Date | null; updatedBy: string | null };

/** Current value (stored or default) of every catalogue key, with who changed it last. */
export async function loadSettingStates(keys: readonly SettingKey[]): Promise<Map<SettingKey, SettingState>> {
  const rows = keys.length
    ? await db
        .select({ key: platformSettings.key, value: platformSettings.value, updatedAt: platformSettings.updatedAt, updatedByUserId: platformSettings.updatedByUserId })
        .from(platformSettings)
        .where(inArray(platformSettings.key, [...keys]))
    : [];
  const userIds = [...new Set(rows.map((r) => r.updatedByUserId).filter((v): v is string => Boolean(v)))];
  const names = userIds.length ? await db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, userIds)) : [];
  const nameById = new Map(names.map((n) => [n.id, n.name]));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return new Map(
    keys.map((key) => {
      const row = byKey.get(key);
      return [
        key,
        {
          key,
          value: row ? row.value : SETTINGS[key].default,
          isDefault: !row,
          updatedAt: row?.updatedAt ?? null,
          updatedBy: row?.updatedByUserId ? (nameById.get(row.updatedByUserId) ?? null) : null,
        },
      ];
    }),
  );
}

/** Which permission edits a group. Security policy is separated from general settings. */
export function editPermissionFor(group: string) {
  return group === "Security" ? ("settings.security" as const) : ("settings.manage" as const);
}

/**
 * Validate and store a group of settings. Only changed keys are written, each audited with its old and
 * new value (settings never hold secrets). Throws ActionError with field errors on invalid input.
 */
export async function saveSettingGroup(ctx: StaffContext, group: string, input: Record<string, unknown>): Promise<{ changed: SettingKey[] }> {
  const keys = (Object.keys(SETTINGS) as SettingKey[]).filter((k) => SETTINGS[k].group === group);
  if (!keys.length) throw new ActionError("Unknown settings group.");
  if (!staffCan(ctx, editPermissionFor(group))) throw new ActionError("You do not have permission to change these settings.");

  const needsCurrencies = keys.some((k) => settingMeta(k).kind === "currency");
  const needsCountries = keys.some((k) => settingMeta(k).kind === "country");
  const [currencies, countries] = await Promise.all([
    needsCurrencies ? currencyOptions().then((o) => o.map((x) => x.value)) : Promise.resolve(undefined),
    needsCountries ? countryOptions().then((o) => o.map((x) => x.value)) : Promise.resolve(undefined),
  ]);
  const parsed = parseSettingValues(keys, input, { currencies, countries });
  if (Object.keys(parsed.fieldErrors).length) {
    throw new ActionError("Please correct the highlighted fields.", { fieldErrors: parsed.fieldErrors });
  }

  const current = await loadSettingStates(keys);
  const changed: SettingKey[] = [];
  for (const key of keys) {
    if (!(key in parsed.values)) continue;
    const next = parsed.values[key];
    const before = current.get(key)?.value;
    if (sameValue(before, next)) continue;
    await setSetting(key, next as SettingValue<typeof key>, ctx.user.id);
    const isObject = typeof next === "object" && next !== null;
    await audit({
      action: "settings.updated",
      entityType: "platform_setting",
      entityId: key,
      metadata: isObject
        ? { group, label: SETTINGS[key].label, changedFields: changedFields(before, next) }
        : { group, label: SETTINGS[key].label, from: displayValue(before), to: displayValue(next) },
    });
    changed.push(key);
  }
  return { changed };
}

function changedFields(before: unknown, after: unknown): string[] {
  const a = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const b = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => (a[k] ?? "") !== (b[k] ?? ""));
}
