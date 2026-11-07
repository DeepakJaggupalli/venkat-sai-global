"use server";

import { z } from "zod";

import { createAction, ok } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";
import { MEDIA_KIND_VALUES } from "@/modules/content/constants";
import { getMediaAsset, listMediaAssets } from "@/modules/content/queries";

import { toPickerAsset, type PickerAsset } from "./picker-types";

/**
 * Media picker reads for the CMS editors (asset fields, SEO image, announcement/logo pickers).
 * Staff with media.manage or content.edit may browse (the module re-checks the same rule).
 */

const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  kind: z.enum(MEDIA_KIND_VALUES).optional(),
  folderId: z.union([z.uuid(), z.literal("unfiled")]).optional(),
  page: z.number().int().min(1).max(1000).default(1),
});

export const searchMediaForPickerAction = createAction(searchSchema, async (input) => {
  const ctx = await requireStaff(["media.manage", "content.edit"], "any");
  const pageSize = 24;
  const result = await listMediaAssets(
    ctx,
    { q: input.q || undefined, kind: input.kind, folderId: input.folderId, status: "active" },
    { page: input.page, pageSize, offset: (input.page - 1) * pageSize },
  );
  const items: PickerAsset[] = result.items.map((m) => ({
    id: m.id,
    kind: m.kind,
    title: m.title,
    altText: m.altText,
    thumbnailUrl: m.thumbnailUrl,
    url: m.url,
    mimeType: m.mimeType,
    visibility: m.visibility,
    status: m.status,
    consentStatus: m.consentStatus,
    showsIdentifiablePeople: m.showsIdentifiablePeople,
  }));
  return ok({ items, page: result.page, pageCount: result.pageCount, total: result.total });
});

export const getPickerAssetsAction = createAction(z.object({ ids: z.array(z.uuid()).max(50) }), async (input) => {
  const ctx = await requireStaff(["media.manage", "content.edit"], "any");
  const details = await Promise.all(input.ids.map((id) => getMediaAsset(ctx, id)));
  return ok(details.filter((d) => d !== null).map(toPickerAsset));
});
