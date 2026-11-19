import "server-only";

import { type DbOrTx } from "@/db";
import { mediaAssets } from "@/db/schema";
import { submitForApproval } from "@/modules/approvals/service";
import { audit } from "@/modules/audit";
import { requireUploadedFile } from "@/modules/files";

import { insertDraftEntry } from "./entries";

/**
 * Drafts created from public submissions (no staff actor; callers are trusted services that already validated,
 * rate-limited and stored the visitor's input). Nothing here is ever published directly: the draft goes to the
 * approval centre as a normal "content_publication" request, clearly marked as submitted by the public, and its
 * media stays internal (private file) until a reviewer approves — the approval makes the listed assets public and
 * publishes the pinned version in one step (approval-handlers.ts).
 */

export const PUBLIC_SUBMISSION_NOTE = "Submitted by the public - check before publishing";
export const PUBLIC_SUBMISSION_TAG = "public-submission";

export type PublicPosterDraftInput = {
  title: string;
  /** cms_media file (private, stored by the caller in the same transaction). */
  posterFileId: string;
  altText: string;
  /** Public entry fields only (country, trades): never the submitter's contact details. */
  data: { countryCode?: string; trades?: { trade: string; salary?: string; currency?: string }[] };
  /** Staff-only text for the approval request (e.g. which enquiry holds the contact details). */
  reviewNote: string;
};

export type PublicPosterDraft = { entryId: string; slug: string; assetId: string; approvalId: string; approvalCode: string };

/** Internal media item + requirement_posts draft + approval request, in the caller's transaction. */
export async function createPublicRequirementPosterDraft(input: PublicPosterDraftInput, tx: DbOrTx): Promise<PublicPosterDraft> {
  const file = await requireUploadedFile(input.posterFileId, { purposes: ["cms_media"] }, tx);
  const [asset] = await tx
    .insert(mediaAssets)
    .values({
      kind: "image",
      fileId: file.id,
      title: input.title.slice(0, 200),
      altText: input.altText.slice(0, 300),
      tags: ["requirement-poster", PUBLIC_SUBMISSION_TAG],
      // Posters are text and logos; a reviewer who sees people in it rejects or handles consent in the media library.
      showsIdentifiablePeople: false,
      consentStatus: "not_required",
      visibility: "internal",
      uploadedByUserId: null,
    })
    .returning({ id: mediaAssets.id });
  await audit({ action: "media.asset_created", entityType: "media_asset", entityId: asset!.id, metadata: { kind: "image", fileId: file.id, source: "public_submission" }, tx });

  const data: Record<string, unknown> = { posterAssetId: asset!.id };
  if (input.data.countryCode) data.countryCode = input.data.countryCode;
  if (input.data.trades?.length) data.trades = input.data.trades;
  const entry = await insertDraftEntry(
    { collection: "requirement_posts", locale: "en", title: input.title.slice(0, 200), data, seo: {}, tags: [PUBLIC_SUBMISSION_TAG], note: PUBLIC_SUBMISSION_NOTE },
    null,
    tx,
  );

  const request = await submitForApproval(
    {
      type: "content_publication",
      entityType: "cms_entry",
      entityId: entry.id,
      title: `Requirement poster (submitted by the public): ${input.title}`.slice(0, 300),
      summary: `${PUBLIC_SUBMISSION_NOTE}. ${input.reviewNote}`.slice(0, 1000),
      payload: { entryId: entry.id, collection: "requirement_posts", version: entry.version, publishAt: null, publicAssetIds: [asset!.id], publicSubmission: true },
      submittedByUserId: null,
    },
    tx,
  );
  await audit({
    action: "content.publication_requested",
    entityType: "cms_entry",
    entityId: entry.id,
    metadata: { collection: "requirement_posts", version: entry.version, approvalId: request.id, type: "content_publication", publicSubmission: true },
    tx,
  });
  return { entryId: entry.id, slug: entry.slug, assetId: asset!.id, approvalId: request.id, approvalCode: request.code };
}
