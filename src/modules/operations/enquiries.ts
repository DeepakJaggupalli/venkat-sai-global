import "server-only";

import { eq } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { enquiries, internalNotes, leads, supportTickets } from "@/db/schema";
import type { EnquiryStatus, EnquiryType, LeadType, SupportTicketCategory } from "@/db/schema/operations";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { trackServer } from "@/modules/analytics/server";
import { audit, logSecurityEvent } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";
import { notify, notifyStaff } from "@/modules/notifications";
import { getSetting } from "@/modules/settings";

import { canTransition, ENQUIRY_LEAD_TYPE, ENQUIRY_STATUS_LABELS, ENQUIRY_TRANSITIONS, ENQUIRY_TYPE_LABELS } from "./constants";
import { assertAssignableStaff, assertStaff, enforceRateLimits, excerptText, loadSlaSettings } from "./internal";
import { findOrCreateInboundLead } from "./leads";
import { requesterTicketHref, staffEnquiryHref, staffTicketHref } from "./links";
import type { PublicEnquiryInput } from "./schemas";
import { insertTicket, type TicketRow } from "./support";

/**
 * Enquiries from the public contact forms and their staff processing (leads.view / leads.manage).
 * Business enquiries (employer / partner / institution) create or attach a lead; grievances become
 * grievance tickets straight away so the statutory timelines are tracked.
 */

export type EnquiryRow = typeof enquiries.$inferSelect;

export type PublicSubmissionMeta = {
  /** Pseudonymised client IP (getRequestMeta().ipHash) — rate limiting and abuse review. */
  ipHash: string | null;
  /** Set when the visitor was signed in. */
  userId?: string | null;
};

export type PublicSubmissionResult = {
  /** Always true for a well-formed request (honeypot hits are not revealed). */
  accepted: true;
  /** Reference code to show to the visitor (null when the submission was dropped as spam). */
  code: string | null;
};

const TICKET_CATEGORY_FOR_ENQUIRY: Record<EnquiryType, SupportTicketCategory> = {
  general: "other",
  employer: "employer_support",
  partner: "recruiter_support",
  institution: "training_support",
  candidate_support: "candidate_support",
  media: "other",
  grievance: "grievance",
  careers: "other",
};

async function ticketFromEnquiry(tx: DbOrTx, enquiry: EnquiryRow, opts: { staff?: StaffContext } = {}): Promise<TicketRow> {
  const sla = await loadSlaSettings();
  return insertTicket(
    tx,
    {
      requesterUserId: enquiry.userId,
      requesterName: enquiry.name,
      requesterEmail: enquiry.email,
      requesterPhone: enquiry.phone,
      portal: enquiry.userId ? "talent" : "public",
      channel: "web",
      category: TICKET_CATEGORY_FOR_ENQUIRY[enquiry.type],
      priority: "normal",
      subject: enquiry.subject?.trim() || `${ENQUIRY_TYPE_LABELS[enquiry.type]} (${enquiry.code})`,
      message: enquiry.message,
      firstMessageBy: { type: "requester", userId: enquiry.userId, name: enquiry.name },
      locale: enquiry.locale,
      relatedType: "enquiry",
      relatedId: enquiry.id,
      grievanceType: enquiry.type === "grievance" ? "general" : null,
      ipHash: enquiry.ipHash,
      assignedToUserId: opts.staff?.user.id ?? null,
      createdAt: opts.staff ? undefined : enquiry.createdAt,
    },
    sla,
  );
}

async function acknowledgeTicket(tx: DbOrTx, ticket: TicketRow): Promise<void> {
  const recipient = ticket.requesterUserId
    ? { userId: ticket.requesterUserId }
    : ticket.requesterEmail
      ? { email: ticket.requesterEmail, name: ticket.requesterName ?? undefined, locale: ticket.locale ?? undefined }
      : ticket.requesterPhone
        ? { phone: ticket.requesterPhone, locale: ticket.locale ?? undefined }
        : null;
  if (!recipient) return;
  await notify(
    {
      event: "support.ticket_created",
      recipients: [recipient],
      data: { code: ticket.code, subject: ticket.subject, grievanceCode: ticket.grievanceCode, firstResponseDue: ticket.firstResponseDueAt?.toISOString() ?? null },
      link: requesterTicketHref(ticket.portal, ticket.id, Boolean(ticket.requesterUserId)),
      channels: "phone" in recipient ? ["sms"] : undefined,
    },
    { tx },
  );
}

/**
 * Public contact form. Honeypot hits are dropped silently (security event only); rate limited per IP hash,
 * email and phone; consent to be contacted is required; staff with leads.view are notified and the sender
 * receives an acknowledgement with the reference code (email, or SMS for phone-only senders).
 */
export async function submitPublicEnquiry(input: PublicEnquiryInput, meta: PublicSubmissionMeta): Promise<PublicSubmissionResult> {
  if (input.website?.trim()) {
    await logSecurityEvent({ type: "form_honeypot_triggered", severity: "info", metadata: { form: "enquiry" } });
    return { accepted: true, code: null };
  }
  if (!input.consentToContact) throw new ActionError("Please agree that we may contact you about your enquiry.", { fieldErrors: { consentToContact: ["Required"] } });
  if (!input.email && !input.phone) throw new ActionError("Enter an email address or a phone number so we can reply.", { fieldErrors: { email: ["Required"] } });
  await enforceRateLimits(
    [
      ...(meta.ipHash
        ? [
            { key: `enquiry:ip:${meta.ipHash}`, limit: 5, windowSeconds: 10 * 60 },
            { key: `enquiry:ip-day:${meta.ipHash}`, limit: 20, windowSeconds: 24 * 60 * 60 },
          ]
        : []),
      ...(input.email ? [{ key: `enquiry:email:${input.email}`, limit: 5, windowSeconds: 60 * 60 }] : []),
      ...(input.phone ? [{ key: `enquiry:phone:${input.phone}`, limit: 5, windowSeconds: 60 * 60 }] : []),
    ],
    "You have sent several enquiries in a short time. Please wait a little and try again.",
  );
  const policyVersion = await getSetting("privacy.policy_version");

  const code = await db.transaction(async (tx) => {
    const enquiryCode = await nextCode("ENQ", { tx });
    const leadType: LeadType | undefined = ENQUIRY_LEAD_TYPE[input.type];
    const lead = leadType
      ? await findOrCreateInboundLead(
          {
            type: leadType,
            source: "website_form",
            sourceDetail: input.sourcePage ?? null,
            name: input.name,
            email: input.email ?? null,
            phone: input.phone ?? null,
            organizationName: input.organizationName ?? null,
            interest: input.subject ?? excerptText(input.message, 300),
            consentToContact: true,
            utm: { ...(input.utm ?? {}), ...(input.sourcePage ? { landingPath: input.sourcePage } : {}) },
          },
          tx,
        )
      : null;

    const [enquiry] = await tx
      .insert(enquiries)
      .values({
        code: enquiryCode,
        type: input.type,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        organizationName: input.organizationName ?? null,
        subject: input.subject ?? null,
        message: input.message,
        leadId: lead?.id ?? null,
        userId: meta.userId ?? null,
        consentToContact: true,
        privacyNoticeVersion: policyVersion,
        locale: input.locale ?? null,
        sourcePage: input.sourcePage ?? null,
        ipHash: meta.ipHash,
      })
      .returning();

    let ticket: TicketRow | null = null;
    if (input.type === "grievance") {
      ticket = await ticketFromEnquiry(tx, enquiry!);
      await tx.update(enquiries).set({ supportTicketId: ticket.id, status: "in_progress" }).where(eq(enquiries.id, enquiry!.id));
    }

    await audit({
      action: "enquiry.submitted",
      entityType: "enquiry",
      entityId: enquiry!.id,
      metadata: { code: enquiryCode, type: input.type, leadId: lead?.id ?? null, leadCreated: lead?.created ?? false, ticketId: ticket?.id ?? null },
      tx,
    });

    await notifyStaff(
      {
        event: "enquiry.received",
        permission: input.type === "grievance" ? "support.grievances" : "leads.view",
        data: { forStaff: true, code: enquiryCode, type: input.type, senderName: input.name, organizationName: input.organizationName ?? null, subject: input.subject ?? null },
        link: ticket ? staffTicketHref(ticket.id) : staffEnquiryHref(enquiry!.id),
        channels: ["in_app", "email"],
      },
      { tx },
    );

    if (ticket) {
      await acknowledgeTicket(tx, ticket);
    } else {
      const recipient = input.email ? { email: input.email, name: input.name, locale: input.locale } : { phone: input.phone!, locale: input.locale };
      await notify(
        { event: "enquiry.received", recipients: [recipient], channels: input.email ? ["email"] : ["sms"], data: { forStaff: false, code: enquiryCode, subject: input.subject ?? null } },
        { tx },
      );
    }
    return enquiryCode;
  });
  // Conversion after the commit; the enquiry type is a category, never form contents.
  if (input.type === "employer") await trackServer("employer_enquiry_submitted", { formId: "contact" });
  else await trackServer("contact_form_submitted", { formId: "contact", enquiryType: input.type });
  return { accepted: true, code };
}

async function loadEnquiryForUpdate(tx: DbOrTx, id: string): Promise<EnquiryRow> {
  const [row] = await tx.select().from(enquiries).where(eq(enquiries.id, id)).for("update").limit(1);
  if (!row) throw new ActionError("Enquiry not found.");
  return row;
}

/** Assign an enquiry to a staff member with leads.view (notified). */
export async function assignEnquiry(ctx: StaffContext, id: string, assigneeUserId: string | null): Promise<void> {
  assertStaff(ctx, "leads.manage");
  const assignee = assigneeUserId ? await assertAssignableStaff(assigneeUserId, "leads.view") : null;
  await db.transaction(async (tx) => {
    const enquiry = await loadEnquiryForUpdate(tx, id);
    if (enquiry.assignedToUserId === (assignee?.id ?? null)) return;
    await tx
      .update(enquiries)
      .set({ assignedToUserId: assignee?.id ?? null, ...(enquiry.status === "new" && assignee ? { status: "in_progress" as const } : {}) })
      .where(eq(enquiries.id, id));
    await audit({ action: "enquiry.assigned", entityType: "enquiry", entityId: id, metadata: { from: enquiry.assignedToUserId, to: assignee?.id ?? null }, actorUserId: ctx.user.id, actorType: "staff", tx });
    if (assignee && assignee.id !== ctx.user.id) {
      await notify(
        {
          event: "work.assigned",
          recipients: [{ userId: assignee.id }],
          data: { kindLabel: "enquiry", title: enquiry.subject ?? `${ENQUIRY_TYPE_LABELS[enquiry.type]} from ${enquiry.name}`, code: enquiry.code, assignedBy: ctx.user.displayName },
          link: staffEnquiryHref(id),
        },
        { tx },
      );
    }
  });
}

/** Move an enquiry (ENQUIRY_TRANSITIONS); an optional note is kept as a staff-only internal note. */
export async function setEnquiryStatus(ctx: StaffContext, id: string, status: EnquiryStatus, opts: { note?: string | null } = {}): Promise<void> {
  assertStaff(ctx, "leads.manage");
  await db.transaction(async (tx) => {
    const enquiry = await loadEnquiryForUpdate(tx, id);
    if (!canTransition(ENQUIRY_TRANSITIONS, enquiry.status, status)) {
      throw new ActionError(`An enquiry cannot move from ${ENQUIRY_STATUS_LABELS[enquiry.status]} to ${ENQUIRY_STATUS_LABELS[status]}.`);
    }
    const now = new Date();
    await tx
      .update(enquiries)
      .set({
        status,
        ...(status === "responded" ? { respondedAt: enquiry.respondedAt ?? now } : {}),
        ...(status === "closed" || status === "spam" ? { closedAt: now } : { closedAt: null }),
      })
      .where(eq(enquiries.id, id));
    if (opts.note?.trim()) {
      await tx.insert(internalNotes).values({ entityType: "enquiry", entityId: id, authorUserId: ctx.user.id, body: opts.note.trim(), visibility: "staff" });
    }
    await audit({
      action: status === "spam" ? "enquiry.marked_spam" : status === "responded" ? "enquiry.responded" : "enquiry.status_changed",
      entityType: "enquiry",
      entityId: id,
      metadata: { from: enquiry.status, to: status },
      actorUserId: ctx.user.id,
      actorType: "staff",
      tx,
    });
  });
}

/** Record that the enquirer was answered (by phone, email, WhatsApp…) with a summary of the response. */
export async function respondToEnquiry(ctx: StaffContext, id: string, note: string): Promise<void> {
  if (!note.trim()) throw new ActionError("Summarise the response.", { fieldErrors: { note: ["Required"] } });
  await setEnquiryStatus(ctx, id, "responded", { note });
}

export async function markEnquirySpam(ctx: StaffContext, id: string): Promise<void> {
  await setEnquiryStatus(ctx, id, "spam");
}

/** Close an enquiry (optionally with a closing note kept as a staff-only internal note). */
export async function closeEnquiry(ctx: StaffContext, id: string, note?: string | null): Promise<void> {
  await setEnquiryStatus(ctx, id, "closed", { note });
}

/** Turn an enquiry into a support ticket (SLA tracking); the enquirer receives the ticket reference. */
export async function convertEnquiryToTicket(ctx: StaffContext, id: string): Promise<{ ticketId: string; code: string }> {
  assertStaff(ctx, ["leads.manage", "support.manage"]);
  return db.transaction(async (tx) => {
    const enquiry = await loadEnquiryForUpdate(tx, id);
    if (enquiry.supportTicketId) {
      const [existing] = await tx.select({ id: supportTickets.id, code: supportTickets.code }).from(supportTickets).where(eq(supportTickets.id, enquiry.supportTicketId)).limit(1);
      if (existing) throw new ActionError(`This enquiry is already support request ${existing.code}.`);
    }
    if (enquiry.type === "grievance" && !ctx.permissions.has("support.grievances")) throw new ActionError("Only grievance officers can register grievances.", { code: "forbidden" });
    const ticket = await ticketFromEnquiry(tx, enquiry, { staff: ctx });
    await tx
      .update(enquiries)
      .set({ supportTicketId: ticket.id, ...(enquiry.status === "new" ? { status: "in_progress" as const } : {}) })
      .where(eq(enquiries.id, id));
    await audit({ action: "enquiry.converted_to_ticket", entityType: "enquiry", entityId: id, metadata: { ticketId: ticket.id, ticketCode: ticket.code }, actorUserId: ctx.user.id, actorType: "staff", tx });
    await acknowledgeTicket(tx, ticket);
    return { ticketId: ticket.id, code: ticket.code };
  });
}

/** Link an enquiry to an existing lead, or (leadId null) create a lead from it. */
export async function linkEnquiryToLead(ctx: StaffContext, id: string, leadId: string | null): Promise<{ leadId: string }> {
  assertStaff(ctx, "leads.manage");
  return db.transaction(async (tx) => {
    const enquiry = await loadEnquiryForUpdate(tx, id);
    let target = leadId;
    if (target) {
      const [lead] = await tx.select({ id: leads.id }).from(leads).where(eq(leads.id, target)).limit(1);
      if (!lead) throw new ActionError("Lead not found.", { fieldErrors: { leadId: ["Choose a lead"] } });
    } else {
      const created = await findOrCreateInboundLead(
        {
          type: ENQUIRY_LEAD_TYPE[enquiry.type] ?? "other",
          source: "website_form",
          name: enquiry.name,
          email: enquiry.email,
          phone: enquiry.phone,
          organizationName: enquiry.organizationName,
          interest: enquiry.subject ?? excerptText(enquiry.message, 300),
          consentToContact: enquiry.consentToContact,
        },
        tx,
      );
      target = created.id;
    }
    await tx.update(enquiries).set({ leadId: target }).where(eq(enquiries.id, id));
    await audit({ action: "enquiry.linked_to_lead", entityType: "enquiry", entityId: id, metadata: { leadId: target }, actorUserId: ctx.user.id, actorType: "staff", tx });
    return { leadId: target! };
  });
}
