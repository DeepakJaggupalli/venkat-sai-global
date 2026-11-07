"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { FEATURES, type FeatureKey } from "@/config/features";
import { PORTALS } from "@/db/schema/_constants";
import { ActionError, createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { audit } from "@/modules/audit";
import { requireStaff } from "@/modules/identity/authz";
import { getFeatureFlagRow, listFeatureFlags, setFeatureFlag } from "@/modules/settings";

const flagKey = z.string().refine((k): k is FeatureKey => k in FEATURES, "Unknown module");

function refresh() {
  // Portal layouts and navigation read flags on every request; refresh the whole app tree.
  revalidatePath("/", "layout");
}

export const setFlagEnabledAction = createAction(z.object({ key: flagKey, enabled: z.boolean() }), async ({ key, enabled }) => {
  const ctx = await requireStaff("settings.flags");
  const k = key as FeatureKey;
  const before = (await listFeatureFlags()).find((x) => x.key === k);
  if (before && before.enabled === enabled) return ok(undefined, "No change");
  await setFeatureFlag(k, enabled, ctx.user.id);
  await audit({ action: "feature_flag.updated", entityType: "feature_flag", entityId: k, metadata: { name: FEATURES[k].name, from: before?.enabled ?? null, to: enabled } });
  refresh();
  return ok(undefined, `${FEATURES[k].name} switched ${enabled ? "on" : "off"}`);
});

export const saveFlagRulesAction = createFormAction(
  z.object({
    key: flagKey,
    portals: f.stringArray().pipe(z.array(z.enum(PORTALS)).max(PORTALS.length)),
    staffOnly: f.bool(),
  }),
  async ({ key, portals, staffOnly }) => {
    const ctx = await requireStaff("settings.flags");
    const k = key as FeatureKey;
    const row = await getFeatureFlagRow(k);
    const enabled = row ? row.enabled : FEATURES[k].default;
    const existing = (row?.rules ?? {}) as { orgIds?: unknown };
    const rules: Record<string, unknown> = {};
    if (portals.length) rules.portals = [...new Set(portals)];
    if (staffOnly) rules.staffOnly = true;
    if (Array.isArray(existing.orgIds) && existing.orgIds.length) rules.orgIds = existing.orgIds;
    if (JSON.stringify(rules).length > 4000) throw new ActionError("Too many rules.");
    await setFeatureFlag(k, enabled, ctx.user.id, rules);
    await audit({ action: "feature_flag.rules_updated", entityType: "feature_flag", entityId: k, metadata: { name: FEATURES[k].name, portals, staffOnly } });
    refresh();
    return ok(undefined, "Rules saved");
  },
);

/** Switch-friendly signature: bind the key on the server, the switch supplies the new state. */
export async function toggleFlagAction(key: string, enabled: boolean) {
  return setFlagEnabledAction({ key, enabled });
}
