"use server";

import { z } from "zod";

import { createAction, ok, ActionError } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";
import { CMS_COLLECTION_VALUES, CONTENT_LOCALE_VALUES } from "@/modules/content/constants";
import { compareEntryVersions, getEntryVersion, listReferenceOptions } from "@/modules/content/queries";

/**
 * Read-only helpers for the entry editor (version diffs, reference search). Mutations use the content
 * module's own Server Actions (src/modules/content/actions.ts), which authorise and audit.
 */

export const compareVersionsAction = createAction(
  z.object({ id: z.uuid(), from: z.number().int().min(1), to: z.number().int().min(1) }),
  async (input) => {
    const ctx = await requireStaff("content.view");
    const diff = await compareEntryVersions(ctx, input.id, input.from, input.to);
    if (!diff) throw new ActionError("Those versions could not be found.");
    return ok(diff);
  },
);

export const getVersionAction = createAction(z.object({ id: z.uuid(), version: z.number().int().min(1) }), async (input) => {
  const ctx = await requireStaff("content.view");
  const version = await getEntryVersion(ctx, input.id, input.version);
  if (!version) throw new ActionError("That version could not be found.");
  return ok({ ...version, createdAt: version.createdAt.toISOString() });
});

export const searchReferenceOptionsAction = createAction(
  z.object({
    collection: z.enum(CMS_COLLECTION_VALUES),
    q: z.string().trim().max(100).optional(),
    locale: z.enum(CONTENT_LOCALE_VALUES).optional(),
  }),
  async (input) => {
    const ctx = await requireStaff("content.view");
    const rows = await listReferenceOptions(ctx, input.collection, { q: input.q, locale: input.locale, limit: 25 });
    return ok(rows.map((r) => ({ value: r.id, label: r.title, description: r.status === "published" ? r.slug : `${r.slug} · ${r.status}` })));
  },
);
