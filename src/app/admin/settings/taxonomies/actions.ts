"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction, createFormAction, ok } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";

import { isTaxonomyKind, TAXONOMIES, TAXONOMY_KINDS, type TaxonomyKind } from "./_lib/config";
import { decideSkill, importTaxonomyCsv, saveTaxonomyRecord, setTaxonomyActive } from "./_lib/service";

const kindSchema = z.enum(TAXONOMY_KINDS);
const BASE = "/admin/settings/taxonomies";

function refresh(kind: TaxonomyKind) {
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${kind}`);
}

export const saveTaxonomyAction = createFormAction(
  z.looseObject({ kind: kindSchema, recordId: z.string().trim().max(64).optional() }),
  async (input) => {
    await requireStaff("settings.taxonomies");
    const { kind, recordId, ...rest } = input;
    const result = await saveTaxonomyRecord(kind, rest as Record<string, unknown>, recordId || undefined);
    refresh(kind);
    const singular = TAXONOMIES[kind].singular;
    return ok({ id: result.id }, result.created ? `New ${singular} added` : `${singular[0]!.toUpperCase()}${singular.slice(1)} saved`);
  },
);

export const setTaxonomyActiveAction = createAction(z.object({ kind: kindSchema, id: z.string().max(64), active: z.boolean() }), async ({ kind, id, active }) => {
  await requireStaff("settings.taxonomies");
  await setTaxonomyActive(kind, id, active);
  refresh(kind);
  return ok(undefined, active ? "Activated" : "Deactivated");
});

export const decideSkillAction = createAction(z.object({ id: z.uuid(), decision: z.enum(["approved", "rejected"]) }), async ({ id, decision }) => {
  await requireStaff("settings.taxonomies");
  await decideSkill(id, decision);
  refresh("skills");
  return ok(undefined, decision === "approved" ? "Skill approved and added to search" : "Skill suggestion rejected");
});

const MAX_BYTES = 1_000_000;

export const importTaxonomyAction = createFormAction(z.object({ kind: z.string() }), async ({ kind }, formData) => {
  await requireStaff("settings.taxonomies");
  if (!isTaxonomyKind(kind)) throw new ActionError("Unknown list.");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ActionError("Choose a CSV file to import.", { fieldErrors: { file: ["Choose a CSV file"] } });
  if (file.size > MAX_BYTES) throw new ActionError("The file is larger than 1 MB. Split it into smaller files.", { fieldErrors: { file: ["File too large (1 MB maximum)"] } });
  if (!/\.csv$/i.test(file.name) && !/csv|text\/plain/.test(file.type)) throw new ActionError("Upload a .csv file.", { fieldErrors: { file: ["Upload a .csv file"] } });
  const summary = await importTaxonomyCsv(kind, await file.text());
  refresh(kind);
  if (summary.missingHeaders.length) {
    throw new ActionError(`The file is missing required columns: ${summary.missingHeaders.join(", ")}. Export the list to get a template.`);
  }
  return ok(summary, `Import finished: ${summary.created} added, ${summary.updated} updated${summary.failed ? `, ${summary.failed} skipped` : ""}`);
});
