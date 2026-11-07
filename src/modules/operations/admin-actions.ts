"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireStaff } from "@/modules/identity/authz";

import { assignEnquiry, convertEnquiryToTicket, linkEnquiryToLead, markEnquirySpam, respondToEnquiry, setEnquiryStatus } from "./enquiries";
import { assignLead, changeLeadStatus, convertLead, createLead, recordLeadFollowUp, updateLead } from "./leads";
import {
  assignRequirementOwner,
  changeRequirementStatus,
  linkRequirementLineToJob,
  removeRequirementLine,
  setRequirementInternalNotes,
  setRequirementLineFilled,
  setRequirementQuotation,
  updateRequirementDetails,
  upsertRequirementLine,
} from "./requirements";
import {
  assignSchema,
  enquiryLinkLeadSchema,
  enquiryRespondSchema,
  enquiryStatusSchema,
  leadConvertSchema,
  leadCreateSchema,
  leadFollowUpSchema,
  leadStatusSchema,
  leadUpdateSchema,
  requirementDetailsSchema,
  requirementInternalNotesSchema,
  requirementLineFilledSchema,
  requirementLineLinkSchema,
  requirementLineUpsertSchema,
  requirementQuoteSchema,
  requirementStatusSchema,
  staffTaskSchema,
  staffTaskStatusSchema,
  staffTaskUpdateSchema,
  staffTicketReplySchema,
  staffTicketSchema,
  threadMessageHideSchema,
  threadParticipantSchema,
  ticketEscalateSchema,
  ticketGrievanceSchema,
  ticketPrioritySchema,
  ticketStatusSchema,
  ticketTagsSchema,
} from "./schemas";
import {
  assignTicket,
  changeTicketStatus,
  createTicketForRequester,
  escalateTicket,
  markTicketAsGrievance,
  replyToTicket,
  setTicketPriority,
  setTicketTags,
} from "./support";
import { addThreadParticipant, hideThreadMessage, removeThreadParticipant } from "./threads";
import { assignStaffTask, createStaffTask, setStaffTaskStatus, updateStaffTask } from "./work";

/**
 * Command Centre Server Actions for operations. Each re-checks the staff permission through requireStaff
 * and again inside the service (which also scopes the record).
 */

const idSchema = z.object({ id: f.uuid() });

function revalidateLead(id?: string) {
  revalidatePath("/admin/leads");
  if (id) revalidatePath(`/admin/leads/${id}`);
}
function revalidateEnquiry(id?: string) {
  revalidatePath("/admin/leads");
  if (id) revalidatePath(`/admin/leads/enquiries/${id}`);
}
function revalidateRequirement(id?: string) {
  revalidatePath("/admin/requirements");
  if (id) {
    revalidatePath(`/admin/requirements/${id}`);
    revalidatePath(`/employer/requirements/${id}`);
  }
}
function revalidateTicket(id?: string) {
  revalidatePath("/admin/support");
  if (id) revalidatePath(`/admin/support/${id}`);
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export const createLeadAction = createFormAction(leadCreateSchema, async (input) => {
  const ctx = await requireStaff("leads.manage");
  const lead = await createLead(ctx, input);
  revalidateLead();
  return ok(lead, `Lead ${lead.code} created`);
});

export const updateLeadAction = createFormAction(leadUpdateSchema, async (input) => {
  const ctx = await requireStaff("leads.manage");
  await updateLead(ctx, input);
  revalidateLead(input.id);
  return ok(undefined, "Lead updated");
});

export const assignLeadAction = createAction(assignSchema, async ({ id, assigneeUserId }) => {
  const ctx = await requireStaff("leads.manage");
  await assignLead(ctx, id, assigneeUserId);
  revalidateLead(id);
  return ok(undefined, assigneeUserId ? "Lead assigned" : "Lead unassigned");
});

export const changeLeadStatusAction = createFormAction(leadStatusSchema, async ({ id, status, lostReason }) => {
  const ctx = await requireStaff("leads.manage");
  await changeLeadStatus(ctx, id, status, { lostReason });
  revalidateLead(id);
  return ok(undefined, "Lead status updated");
});

export const recordLeadFollowUpAction = createFormAction(leadFollowUpSchema, async ({ id, note, contactedAt, nextFollowUpAt }) => {
  const ctx = await requireStaff("leads.manage");
  await recordLeadFollowUp(ctx, id, { note, contactedAt, nextFollowUpAt: nextFollowUpAt ?? null });
  revalidateLead(id);
  return ok(undefined, "Follow-up recorded");
});

export const convertLeadAction = createAction(leadConvertSchema, async ({ id, organizationId }) => {
  const ctx = await requireStaff(["leads.manage", "orgs.view"]);
  await convertLead(ctx, id, organizationId);
  revalidateLead(id);
  return ok(undefined, "Lead linked to the organisation");
});

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------

export const assignEnquiryAction = createAction(assignSchema, async ({ id, assigneeUserId }) => {
  const ctx = await requireStaff("leads.manage");
  await assignEnquiry(ctx, id, assigneeUserId);
  revalidateEnquiry(id);
  return ok(undefined, assigneeUserId ? "Enquiry assigned" : "Enquiry unassigned");
});

export const setEnquiryStatusAction = createFormAction(enquiryStatusSchema, async ({ id, status, note }) => {
  const ctx = await requireStaff("leads.manage");
  await setEnquiryStatus(ctx, id, status, { note });
  revalidateEnquiry(id);
  return ok(undefined, "Enquiry updated");
});

export const respondToEnquiryAction = createFormAction(enquiryRespondSchema, async ({ id, note }) => {
  const ctx = await requireStaff("leads.manage");
  await respondToEnquiry(ctx, id, note);
  revalidateEnquiry(id);
  return ok(undefined, "Response recorded");
});

export const markEnquirySpamAction = createAction(idSchema, async ({ id }) => {
  const ctx = await requireStaff("leads.manage");
  await markEnquirySpam(ctx, id);
  revalidateEnquiry(id);
  return ok(undefined, "Marked as spam");
});

export const convertEnquiryToTicketAction = createAction(idSchema, async ({ id }) => {
  const ctx = await requireStaff(["leads.manage", "support.manage"]);
  const result = await convertEnquiryToTicket(ctx, id);
  revalidateEnquiry(id);
  revalidateTicket();
  return ok(result, `Support request ${result.code} created`);
});

export const linkEnquiryToLeadAction = createAction(enquiryLinkLeadSchema, async ({ id, leadId }) => {
  const ctx = await requireStaff("leads.manage");
  const result = await linkEnquiryToLead(ctx, id, leadId);
  revalidateEnquiry(id);
  revalidateLead(result.leadId);
  return ok(result, "Enquiry linked to a lead");
});

// ---------------------------------------------------------------------------
// Workforce requirements
// ---------------------------------------------------------------------------

export const changeRequirementStatusAction = createFormAction(requirementStatusSchema, async ({ id, status, reason }) => {
  const ctx = await requireStaff("requirements.manage");
  await changeRequirementStatus(ctx, id, status, { reason });
  revalidateRequirement(id);
  return ok(undefined, "Requirement status updated");
});

export const assignRequirementOwnerAction = createAction(assignSchema, async ({ id, assigneeUserId }) => {
  const ctx = await requireStaff("requirements.manage");
  await assignRequirementOwner(ctx, id, assigneeUserId);
  revalidateRequirement(id);
  return ok(undefined, assigneeUserId ? "Owner assigned" : "Owner removed");
});

export const setRequirementQuotationAction = createFormAction(requirementQuoteSchema, async ({ id, amount, currency }) => {
  const ctx = await requireStaff("requirements.manage");
  await setRequirementQuotation(ctx, id, amount !== undefined && currency ? { amount, currency } : null);
  revalidateRequirement(id);
  return ok(undefined, amount !== undefined ? "Quotation saved" : "Quotation cleared");
});

export const updateRequirementDetailsAction = createFormAction(requirementDetailsSchema, async (input) => {
  const ctx = await requireStaff("requirements.manage");
  await updateRequirementDetails(ctx, input);
  revalidateRequirement(input.id);
  return ok(undefined, "Requirement updated");
});

export const setRequirementInternalNotesAction = createFormAction(requirementInternalNotesSchema, async ({ id, internalNotes }) => {
  const ctx = await requireStaff("requirements.manage");
  await setRequirementInternalNotes(ctx, id, internalNotes ?? null);
  revalidateRequirement(id);
  return ok(undefined, "Internal notes saved");
});

/** Add / edit a role line — post the line as `line:json` with `requirementId`. */
export const upsertRequirementLineAction = createFormAction(requirementLineUpsertSchema, async ({ requirementId, line }) => {
  const ctx = await requireStaff("requirements.manage");
  const result = await upsertRequirementLine(ctx, requirementId, line);
  revalidateRequirement(requirementId);
  return ok(result, line.id ? "Role updated" : "Role added");
});

export const removeRequirementLineAction = createAction(z.object({ lineId: f.uuid(), requirementId: f.uuid() }), async ({ lineId, requirementId }) => {
  const ctx = await requireStaff("requirements.manage");
  await removeRequirementLine(ctx, lineId);
  revalidateRequirement(requirementId);
  return ok(undefined, "Role removed");
});

export const linkRequirementLineToJobAction = createAction(requirementLineLinkSchema.extend({ requirementId: f.uuid() }), async ({ lineId, jobId, requirementId }) => {
  const ctx = await requireStaff(["requirements.manage", "jobs.view"]);
  await linkRequirementLineToJob(ctx, lineId, jobId);
  revalidateRequirement(requirementId);
  return ok(undefined, jobId ? "Role linked to the job" : "Job link removed");
});

export const setRequirementLineFilledAction = createAction(requirementLineFilledSchema.extend({ requirementId: f.uuid() }), async ({ lineId, filledCount, requirementId }) => {
  const ctx = await requireStaff("requirements.manage");
  await setRequirementLineFilled(ctx, lineId, filledCount);
  revalidateRequirement(requirementId);
  return ok(undefined, "Filled positions updated");
});

// ---------------------------------------------------------------------------
// Support desk
// ---------------------------------------------------------------------------

export const createTicketForRequesterAction = createFormAction(staffTicketSchema, async (input) => {
  const ctx = await requireStaff("support.manage");
  const result = await createTicketForRequester(ctx, input);
  revalidateTicket();
  return ok(result, `Support request ${result.code} logged`);
});

export const staffReplyToTicketAction = createFormAction(staffTicketReplySchema, async (input) => {
  const ctx = await requireStaff("support.manage");
  const result = await replyToTicket(ctx, input.ticketId, { body: input.body, attachmentFileIds: input.attachmentFileIds, internal: input.internal, status: input.status });
  revalidateTicket(input.ticketId);
  return ok(result, input.internal ? "Internal note added" : "Reply sent");
});

export const assignTicketAction = createAction(assignSchema, async ({ id, assigneeUserId }) => {
  const ctx = await requireStaff("support.manage");
  await assignTicket(ctx, id, assigneeUserId);
  revalidateTicket(id);
  return ok(undefined, assigneeUserId ? "Request assigned" : "Request unassigned");
});

export const changeTicketStatusAction = createFormAction(ticketStatusSchema, async ({ ticketId, status, resolution }) => {
  const ctx = await requireStaff("support.manage");
  await changeTicketStatus(ctx, ticketId, status, { resolution });
  revalidateTicket(ticketId);
  return ok(undefined, "Request updated");
});

export const setTicketPriorityAction = createAction(ticketPrioritySchema, async ({ ticketId, priority }) => {
  const ctx = await requireStaff("support.manage");
  await setTicketPriority(ctx, ticketId, priority);
  revalidateTicket(ticketId);
  return ok(undefined, "Priority updated");
});

export const escalateTicketAction = createFormAction(ticketEscalateSchema, async ({ ticketId, note, assigneeUserId }) => {
  const ctx = await requireStaff("support.manage");
  await escalateTicket(ctx, ticketId, { note, assigneeUserId: assigneeUserId ?? null });
  revalidateTicket(ticketId);
  return ok(undefined, "Request escalated");
});

export const markTicketAsGrievanceAction = createAction(ticketGrievanceSchema, async ({ ticketId, grievanceType }) => {
  const ctx = await requireStaff(["support.manage", "support.grievances"]);
  const result = await markTicketAsGrievance(ctx, ticketId, grievanceType);
  revalidateTicket(ticketId);
  return ok(result, `Registered as grievance ${result.grievanceCode}`);
});

export const setTicketTagsAction = createAction(ticketTagsSchema, async ({ ticketId, tags }) => {
  const ctx = await requireStaff("support.manage");
  await setTicketTags(ctx, ticketId, tags);
  revalidateTicket(ticketId);
  return ok(undefined, "Tags saved");
});

// ---------------------------------------------------------------------------
// Internal tasks
// ---------------------------------------------------------------------------

export const createStaffTaskAction = createFormAction(staffTaskSchema, async (input) => {
  const ctx = await requireStaff();
  const result = await createStaffTask(ctx, input);
  revalidatePath("/admin/tasks");
  return ok(result, "Task created");
});

export const updateStaffTaskAction = createFormAction(staffTaskUpdateSchema, async (input) => {
  const ctx = await requireStaff();
  await updateStaffTask(ctx, input);
  revalidatePath("/admin/tasks");
  return ok(undefined, "Task updated");
});

export const assignStaffTaskAction = createAction(assignSchema, async ({ id, assigneeUserId }) => {
  const ctx = await requireStaff();
  await assignStaffTask(ctx, id, assigneeUserId);
  revalidatePath("/admin/tasks");
  return ok(undefined, assigneeUserId ? "Task assigned" : "Task unassigned");
});

export const setStaffTaskStatusAction = createAction(staffTaskStatusSchema, async ({ id, status }) => {
  const ctx = await requireStaff();
  await setStaffTaskStatus(ctx, id, status);
  revalidatePath("/admin/tasks");
  return ok(undefined, status === "done" ? "Task completed" : "Task updated");
});

// ---------------------------------------------------------------------------
// Conversations (staff moderation)
// ---------------------------------------------------------------------------

export const addThreadParticipantAction = createAction(threadParticipantSchema, async ({ threadId, userId }) => {
  const ctx = await requireStaff();
  await addThreadParticipant(ctx, threadId, userId);
  revalidatePath(`/admin/messages/${threadId}`);
  return ok(undefined, "Person added to the conversation");
});

export const removeThreadParticipantAction = createAction(threadParticipantSchema, async ({ threadId, userId }) => {
  const ctx = await requireStaff();
  await removeThreadParticipant(ctx, threadId, userId);
  revalidatePath(`/admin/messages/${threadId}`);
  return ok(undefined, "Person removed from the conversation");
});

export const hideThreadMessageAction = createAction(threadMessageHideSchema, async ({ messageId }) => {
  const ctx = await requireStaff();
  await hideThreadMessage(ctx, messageId);
  return ok(undefined, "Message removed");
});
