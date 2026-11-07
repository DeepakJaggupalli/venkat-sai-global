"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction, createFormAction, ok } from "@/lib/actions";
import { getRequestMeta } from "@/lib/request";
import { f } from "@/lib/validation";
import { getOrgContext, requireOrgMember } from "@/modules/identity/authz";
import { getCurrentUser, requireUser } from "@/modules/identity/session";

import { PORTAL_PREFIX, resolveNoteActor, resolveThreadActor } from "./actor";
import { submitPublicEnquiry } from "./enquiries";
import {
  cancelEmployerRequirement,
  submitEmployerRequirement,
  submitEmployerRequirementDraft,
  submitPublicRequirement,
  updateEmployerRequirement,
} from "./requirements";
import {
  actorPortalSchema,
  employerRequirementSchema,
  guestTicketSchema,
  internalNoteSchema,
  internalNoteUpdateSchema,
  publicEnquirySchema,
  publicRequirementSchema,
  requirementCancelSchema,
  threadCreateSchema,
  threadMessageSchema,
  threadMuteSchema,
  threadRefSchema,
  threadStatusSchema,
  ticketCreateSchema,
  ticketIdSchema,
  ticketRatingSchema,
  ticketReplySchema,
} from "./schemas";
import { closeOwnTicket, createSupportTicket, rateOwnTicket, replyToOwnTicket } from "./support";
import { createThread, markThreadRead, postThreadMessage, setThreadMuted, setThreadStatus } from "./threads";
import { addInternalNote, deleteInternalNote, updateInternalNote } from "./work";

/**
 * Server Actions for public forms, requesters, the Employer Portal and conversation participants.
 * Staff (Command Centre) actions live in admin-actions.ts. Every action authorises the caller itself.
 */

// ---------------------------------------------------------------------------
// Public forms
// ---------------------------------------------------------------------------

/** Contact form (`<form action>`; hidden honeypot input named "website"). */
export const submitEnquiryAction = createFormAction(publicEnquirySchema, async (input) => {
  const [meta, user] = await Promise.all([getRequestMeta(), getCurrentUser()]);
  const result = await submitPublicEnquiry(input, { ipHash: meta.ipHash, userId: user?.id ?? null });
  return ok(result, "Thank you. We have received your enquiry and will get back to you.");
});

/** "Post a requirement" form; role lines are posted as `lines:json`. */
export const submitRequirementAction = createFormAction(publicRequirementSchema, async (input) => {
  const [meta, user] = await Promise.all([getRequestMeta(), getCurrentUser()]);
  const result = await submitPublicRequirement(input, { ipHash: meta.ipHash, userId: user?.id ?? null });
  return ok(result, "Thank you. We have received your workforce requirement.");
});

/** Help form for visitors without an account. */
export const createGuestTicketAction = createFormAction(guestTicketSchema, async (input) => {
  const meta = await getRequestMeta();
  const result = await createSupportTicket({ kind: "guest", name: input.name, email: input.email, phone: input.phone ?? null, locale: input.locale ?? null, ipHash: meta.ipHash }, input);
  return ok(result, "Thank you. We have received your request.");
});

// ---------------------------------------------------------------------------
// Signed-in requesters (any portal)
// ---------------------------------------------------------------------------

const ORG_TYPE_FOR_PORTAL = { employer: "employer", recruiter: "recruitment_partner", institution: "institution" } as const;

/** Raise a support request from a portal; organisation portals attach the active organisation. */
export const createSupportTicketAction = createFormAction(ticketCreateSchema, async (input) => {
  const user = await requireUser();
  let organizationId: string | null = null;
  if (input.portal === "employer" || input.portal === "recruiter" || input.portal === "institution") {
    const ctx = await getOrgContext(ORG_TYPE_FOR_PORTAL[input.portal]);
    if (!ctx) throw new ActionError("Open your organisation's portal to raise a request for it.");
    organizationId = ctx.organization.id;
  }
  const portal = input.portal === "admin" ? "talent" : input.portal;
  const result = await createSupportTicket({ kind: "user", user, portal, organizationId }, input);
  revalidatePath(`${PORTAL_PREFIX[portal === "public" ? "talent" : portal]}/support`);
  return ok(result, `Request ${result.code} received. We will reply here and by email.`);
});

export const replyToMyTicketAction = createFormAction(ticketReplySchema, async (input) => {
  const user = await requireUser();
  const result = await replyToOwnTicket(user, input.ticketId, { body: input.body, attachmentFileIds: input.attachmentFileIds });
  revalidateTicketPages(input.ticketId);
  return ok(result, "Reply sent");
});

export const closeMyTicketAction = createAction(ticketIdSchema, async ({ ticketId }) => {
  const user = await requireUser();
  await closeOwnTicket(user, ticketId);
  revalidateTicketPages(ticketId);
  return ok(undefined, "Request closed");
});

export const rateMyTicketAction = createFormAction(ticketRatingSchema, async (input) => {
  const user = await requireUser();
  await rateOwnTicket(user, input.ticketId, { rating: input.rating, comment: input.comment ?? null });
  revalidateTicketPages(input.ticketId);
  return ok(undefined, "Thank you for your feedback");
});

function revalidateTicketPages(ticketId: string) {
  for (const prefix of ["/talent", "/employer", "/recruiter", "/institution"]) revalidatePath(`${prefix}/support/${ticketId}`);
}

// ---------------------------------------------------------------------------
// Employer Portal: workforce requirements
// ---------------------------------------------------------------------------

/** New requirement (draft or submit); lines as `lines:json`, attachments as `attachmentFileIds[]`. */
export const submitEmployerRequirementAction = createFormAction(employerRequirementSchema, async (input) => {
  const ctx = await requireOrgMember("employer", "employer.requirements.manage");
  const result = await submitEmployerRequirement(ctx, input);
  revalidatePath("/employer/requirements");
  return ok(result, input.asDraft ? "Draft saved" : `Requirement ${result.code} submitted for review`);
});

export const updateEmployerRequirementAction = createFormAction(employerRequirementSchema.extend({ id: f.uuid() }), async ({ id, ...input }) => {
  const ctx = await requireOrgMember("employer", "employer.requirements.manage");
  const result = await updateEmployerRequirement(ctx, id, input);
  revalidatePath("/employer/requirements");
  revalidatePath(`/employer/requirements/${id}`);
  return ok(result, input.asDraft ? "Draft saved" : "Requirement submitted for review");
});

export const submitEmployerRequirementDraftAction = createAction(z.object({ id: z.uuid() }), async ({ id }) => {
  const ctx = await requireOrgMember("employer", "employer.requirements.manage");
  await submitEmployerRequirementDraft(ctx, id);
  revalidatePath("/employer/requirements");
  revalidatePath(`/employer/requirements/${id}`);
  return ok(undefined, "Requirement submitted for review");
});

export const cancelEmployerRequirementAction = createFormAction(requirementCancelSchema, async ({ id, reason }) => {
  const ctx = await requireOrgMember("employer", "employer.requirements.manage");
  await cancelEmployerRequirement(ctx, id, reason);
  revalidatePath("/employer/requirements");
  revalidatePath(`/employer/requirements/${id}`);
  return ok(undefined, "Requirement cancelled");
});

// ---------------------------------------------------------------------------
// Conversations (all portals — `portal` selects the acting capacity)
// ---------------------------------------------------------------------------

export const createThreadAction = createFormAction(threadCreateSchema, async (input) => {
  const actor = await resolveThreadActor(input.portal);
  const result = await createThread(actor, input);
  revalidatePath(`${PORTAL_PREFIX[input.portal]}/messages`);
  return ok(result, "Conversation started");
});

export const postThreadMessageAction = createFormAction(threadMessageSchema, async (input) => {
  const actor = await resolveThreadActor(input.portal);
  const result = await postThreadMessage(actor, input.threadId, { body: input.body, attachmentFileIds: input.attachmentFileIds });
  revalidatePath(`${PORTAL_PREFIX[input.portal]}/messages/${input.threadId}`);
  return ok(result);
});

export const markThreadReadAction = createAction(threadRefSchema, async ({ portal, threadId }) => {
  const actor = await resolveThreadActor(portal);
  await markThreadRead(actor, threadId);
  return ok();
});

export const setThreadMutedAction = createAction(threadMuteSchema, async ({ portal, threadId, muted }) => {
  const actor = await resolveThreadActor(portal);
  await setThreadMuted(actor, threadId, muted);
  revalidatePath(`${PORTAL_PREFIX[portal]}/messages/${threadId}`);
  return ok(undefined, muted ? "Notifications muted for this conversation" : "Notifications turned on for this conversation");
});

export const setThreadStatusAction = createAction(threadStatusSchema, async ({ portal, threadId, status }) => {
  const actor = await resolveThreadActor(portal);
  await setThreadStatus(actor, threadId, status);
  revalidatePath(`${PORTAL_PREFIX[portal]}/messages/${threadId}`);
  return ok(undefined, status === "closed" ? "Conversation closed" : "Conversation reopened");
});

// ---------------------------------------------------------------------------
// Internal notes (staff, or organisation-internal notes from an organisation portal)
// ---------------------------------------------------------------------------

const notePortalSchema = actorPortalSchema.exclude(["talent"]);

export const addInternalNoteAction = createFormAction(internalNoteSchema.extend({ portal: notePortalSchema }), async ({ portal, ...input }) => {
  const actor = await resolveNoteActor(portal);
  const result = await addInternalNote(actor, input);
  return ok(result, "Note added");
});

export const updateInternalNoteAction = createFormAction(internalNoteUpdateSchema.extend({ portal: notePortalSchema }), async ({ portal, id, body, pinned }) => {
  const actor = await resolveNoteActor(portal);
  await updateInternalNote(actor, id, { body, pinned });
  return ok(undefined, "Note updated");
});

export const deleteInternalNoteAction = createAction(z.object({ portal: notePortalSchema, id: z.uuid() }), async ({ portal, id }) => {
  const actor = await resolveNoteActor(portal);
  await deleteInternalNote(actor, id);
  return ok(undefined, "Note deleted");
});
