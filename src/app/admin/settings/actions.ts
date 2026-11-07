"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createFormAction, ok } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";

import { editPermissionFor, saveSettingGroup } from "./_lib/settings-admin";

/** Saves one group of the settings catalogue. The group's edit permission is checked here and in the service. */
export const saveSettingsGroupAction = createFormAction(z.looseObject({ group: z.string().trim().min(1).max(60) }), async (input) => {
  const ctx = await requireStaff(editPermissionFor(input.group));
  const { changed } = await saveSettingGroup(ctx, input.group, input as Record<string, unknown>);
  revalidatePath("/admin/settings", "layout");
  return ok(undefined, changed.length ? `${input.group} settings saved (${changed.length} changed)` : "No changes to save");
});
