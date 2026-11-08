"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { archiveEntry, softDeleteEntry } from "@/modules/content/service";
import { requireStaff } from "@/modules/identity/authz";
import { quickPosterSchema } from "@/modules/recruitment-posters/schemas";
import { assertPoster, POSTER_PERMISSIONS, POSTERS_ADMIN_PATH, quickPublishPoster, restoreAndPublishPoster, type QuickPosterResult } from "@/modules/recruitment-posters/service";

/**
 * Requirement poster actions (Command Centre). Each action authorises the caller; the content services re-check
 * content.edit / content.publish / media.manage for every write.
 */

function revalidatePosters(slug?: string): void {
  revalidatePath(POSTERS_ADMIN_PATH);
  revalidatePath("/requirements");
  revalidatePath("/");
  if (slug) revalidatePath(`/requirements/${slug}`);
}

function outcomeMessage(result: QuickPosterResult): string {
  if (result.publishError) return `Saved as a draft. ${result.publishError}`;
  if (result.outcome?.outcome === "submitted_for_approval") return `Sent for approval (${result.outcome.approvalCode}). It appears on the website once approved.`;
  return "Published. The poster is now on the website.";
}

/** "Publish now" from the phone page: fileId (already uploaded) + optional details. */
export const quickPublishPosterAction = createFormAction(quickPosterSchema, async (input) => {
  const ctx = await requireStaff([...POSTER_PERMISSIONS]);
  const result = await quickPublishPoster(ctx, input);
  revalidatePosters(result.slug);
  return ok(result, outcomeMessage(result));
});

const idSchema = z.object({ id: f.uuid() });

export const archivePosterAction = createAction(idSchema, async ({ id }) => {
  const ctx = await requireStaff("content.publish");
  await assertPoster(id);
  await archiveEntry(ctx, id, "Requirement closed");
  revalidatePosters();
  return ok(undefined, "Archived. The poster is no longer on the website.");
});

export const restorePosterAction = createAction(idSchema, async ({ id }) => {
  const ctx = await requireStaff([...POSTER_PERMISSIONS]);
  const outcome = await restoreAndPublishPoster(ctx, id);
  revalidatePosters();
  return ok(undefined, outcome.outcome === "submitted_for_approval" ? `Restored and sent for approval (${outcome.approvalCode}).` : "Restored and published again.");
});

export const deletePosterAction = createAction(idSchema, async ({ id }) => {
  const ctx = await requireStaff("content.edit");
  await assertPoster(id);
  await softDeleteEntry(ctx, id, "Deleted from the requirement posters list");
  revalidatePosters();
  return ok(undefined, "Deleted.");
});
