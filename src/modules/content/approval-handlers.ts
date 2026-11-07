import "server-only";

import { z } from "zod";

import { ActionError } from "@/lib/actions";
import type { ApprovalHandler, ApprovalHandlers, ApprovalRequestRow } from "@/modules/approvals/types";
import { audit } from "@/modules/audit";

import { applyPartnerAnnouncementDecision } from "./announcements";
import { isCmsCollection } from "./collections";
import { applyApprovedPublication } from "./entries";
import { CONTENT_ADMIN_PATHS } from "./links";
import { applyMediaPublic } from "./media";

/**
 * Approval decision handlers owned by the content module (run inside the decision transaction).
 *
 *  - testimonial, case_study: every publication of these consent-sensitive collections (submitted by
 *    publishEntry / scheduleEntry / rollbackEntry). Approval publishes the pinned version — or schedules it
 *    when the request carries a future publishAt — after re-checking the consent evidence and all publication
 *    rules. Rejection / changes requested leave the entry as it is.
 *  - content_publication: editors without content.publish asking for publication (requestPublication).
 *  - media_asset: public use of a media item showing identifiable people. Approval makes it public (consent is
 *    re-checked); rejection leaves it internal.
 *  - partner_announcement: announcements requested by partner organisations. Approval publishes (or schedules)
 *    it; rejection archives it; changes requested leaves the draft for the organisation to edit and resubmit.
 * The approvals module notifies the submitter of every decision (approval.decided).
 */

const publicationPayload = z.object({
  entryId: z.uuid(),
  collection: z.string().optional(),
  version: z.number().int().min(1),
  publishAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

function parsePublication(request: ApprovalRequestRow): z.infer<typeof publicationPayload> {
  const parsed = publicationPayload.safeParse(request.payload);
  if (!parsed.success || parsed.data.entryId !== request.entityId) throw new ActionError("This approval request is missing its publication details.");
  return parsed.data;
}

function entryHref(request: ApprovalRequestRow): string {
  const collection = (request.payload as { collection?: unknown } | null)?.collection;
  return isCmsCollection(collection) ? CONTENT_ADMIN_PATHS.entry(collection, request.entityId) : CONTENT_ADMIN_PATHS.content;
}

const publicationHandler: ApprovalHandler = {
  async onDecision({ request, decision, reason, actorUserId, tx }) {
    const payload = parsePublication(request);
    if (decision === "approved") {
      const outcome = await applyApprovedPublication(
        { entryId: payload.entryId, version: payload.version, publishAt: payload.publishAt ? new Date(payload.publishAt) : null },
        actorUserId,
        tx,
      );
      await audit({
        action: "content.publication_approved",
        entityType: "cms_entry",
        entityId: payload.entryId,
        actorUserId,
        metadata: { version: payload.version, outcome, approvalId: request.id },
        tx,
      });
      return;
    }
    await audit({
      action: decision === "rejected" ? "content.publication_rejected" : "content.publication_changes_requested",
      entityType: "cms_entry",
      entityId: payload.entryId,
      actorUserId,
      metadata: { version: payload.version, reason, approvalId: request.id },
      tx,
    });
  },
  adminHref: entryHref,
};

const mediaHandler: ApprovalHandler = {
  async onDecision({ request, decision, reason, actorUserId, tx }) {
    if (decision === "approved") {
      await applyMediaPublic(request.entityId, actorUserId, tx);
      return;
    }
    await audit({ action: `media.public_use_${decision}`, entityType: "media_asset", entityId: request.entityId, actorUserId, metadata: { reason, approvalId: request.id }, tx });
  },
  adminHref: (request) => CONTENT_ADMIN_PATHS.mediaAsset(request.entityId),
};

const partnerAnnouncementHandler: ApprovalHandler = {
  async onDecision({ request, decision, actorUserId, tx }) {
    await applyPartnerAnnouncementDecision(request.entityId, decision, actorUserId, tx);
  },
  adminHref: (request) => CONTENT_ADMIN_PATHS.announcement(request.entityId),
};

export const approvalHandlers: ApprovalHandlers = {
  testimonial: publicationHandler,
  case_study: publicationHandler,
  content_publication: publicationHandler,
  media_asset: mediaHandler,
  partner_announcement: partnerAnnouncementHandler,
};
