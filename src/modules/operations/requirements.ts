import "server-only";

import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { jobs, requirementLines, requirementRequests } from "@/db/schema";
import type { RequirementStatus } from "@/db/schema/operations";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { toMinorUnits } from "@/lib/format";
import { cancelApprovalsForEntity, submitForApproval } from "@/modules/approvals/service";
import { trackServer } from "@/modules/analytics/server";
import { audit, logSecurityEvent } from "@/modules/audit";
import { checkEntitlement } from "@/modules/commercial/entitlements";
import { requireUploadedFile } from "@/modules/files";
import { orgCan, type OrgContext, type StaffContext } from "@/modules/identity/authz";
import { notify } from "@/modules/notifications";
import { getSetting, isFeatureEnabled } from "@/modules/settings";

import {
  canTransition,
  REQUIREMENT_CLOSED_STATUSES,
  REQUIREMENT_DELIVERY_STATUSES,
  REQUIREMENT_EMPLOYER_CANCELLABLE,
  REQUIREMENT_STAFF_TRANSITIONS,
  REQUIREMENT_STATUS_LABELS,
} from "./constants";
import type { PublicSubmissionMeta, PublicSubmissionResult } from "./enquiries";
import { assertAssignableStaff, assertStaff, enforceRateLimits, rethrowConstraint } from "./internal";
import { findOrCreateInboundLead } from "./leads";
import { staffRequirementHref } from "./links";
import { notifyRequirementStaff, notifyRequirementSubmitter, type RequirementRow } from "./requirement-notify";
import type { EmployerRequirementInput, PublicRequirementInput, RequirementDetailsInput, RequirementLineInput } from "./schemas";

/**
 * Workforce requirement requests (bulk / project manpower). Public form and Employer Portal submissions go
 * to the approval centre (type requirement_request — decisions in approval-handlers.ts); Venkat Sai staff
 * with requirements.manage process them (status, owner, quotation, lines, links to jobs, internal notes).
 * Employer functions are scoped to the caller's organisation and never expose internalNotes.
 */

export type { RequirementRow };
export type RequirementLineRow = typeof requirementLines.$inferSelect;

const REQUIREMENT_CONSTRAINTS = {
  requirement_requests_quote_chk: "Enter both a quotation amount and its currency.",
  requirement_lines_salary_chk: "Salary ranges need a currency and a period, with the minimum below the maximum.",
  requirement_lines_experience_chk: "Maximum experience must be at least the minimum.",
  requirement_requests_positions_chk: "A requirement needs at least one position.",
};

type WorkFields = Omit<EmployerRequirementInput, "contactName" | "contactDesignation" | "contactEmail" | "contactPhone" | "attachmentFileIds" | "asDraft">;

function lineValues(line: RequirementLineInput, sortOrder: number): Omit<typeof requirementLines.$inferInsert, "requirementId"> {
  const hasSalary = line.salaryMin !== undefined || line.salaryMax !== undefined;
  const currency = hasSalary ? (line.salaryCurrency ?? null) : null;
  return {
    sortOrder,
    jobCategoryId: line.jobCategoryId ?? null,
    roleTitle: line.roleTitle,
    positions: line.positions,
    experienceMinYears: line.experienceMinYears ?? null,
    experienceMaxYears: line.experienceMaxYears ?? null,
    qualification: line.qualification ?? null,
    requiredSkills: [...new Set(line.requiredSkills.map((s) => s.trim()).filter(Boolean))],
    salaryMinMinor: currency && line.salaryMin !== undefined ? toMinorUnits(line.salaryMin, currency) : null,
    salaryMaxMinor: currency && line.salaryMax !== undefined ? toMinorUnits(line.salaryMax, currency) : null,
    salaryCurrency: currency,
    salaryPeriod: hasSalary ? (line.salaryPeriod ?? null) : null,
    notes: line.notes ?? null,
  };
}

function workValues(input: WorkFields) {
  return {
    kind: input.kind,
    title: input.title,
    description: input.description ?? null,
    countryCode: input.countryCode ?? null,
    locations: input.locations ?? null,
    industryId: input.industryId ?? null,
    totalPositions: input.lines.reduce((sum, l) => sum + l.positions, 0),
    contractDurationMonths: input.contractDurationMonths ?? null,
    workingHours: input.workingHours ?? null,
    joiningBy: input.joiningBy ?? null,
    interviewMethod: input.interviewMethod ?? null,
    interviewDetails: input.interviewDetails ?? null,
    assessmentRequired: input.assessmentRequired,
    assessmentDetails: input.assessmentDetails ?? null,
    documentationRequirements: input.documentationRequirements ?? null,
    languageRequirements: input.languageRequirements ?? null,
    benefits: [...new Set(input.benefits.map((b) => b.trim()).filter(Boolean))],
    accommodationProvided: input.accommodationProvided,
    foodProvided: input.foodProvided,
    transportProvided: input.transportProvided,
    urgency: input.urgency,
  };
}

async function insertLines(tx: DbOrTx, requirementId: string, lines: readonly RequirementLineInput[]): Promise<void> {
  if (!lines.length) return;
  await tx.insert(requirementLines).values(lines.map((line, i) => ({ requirementId, ...lineValues(line, i) })));
}

async function recomputeTotalPositions(tx: DbOrTx, requirementId: string): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${requirementLines.positions}), 0)::int` })
    .from(requirementLines)
    .where(eq(requirementLines.requirementId, requirementId));
  const total = row?.total ?? 0;
  if (total > 0) await tx.update(requirementRequests).set({ totalPositions: total }).where(eq(requirementRequests.id, requirementId));
  return total;
}

async function loadRequirementForUpdate(tx: DbOrTx, id: string): Promise<RequirementRow> {
  const [row] = await tx.select().from(requirementRequests).where(eq(requirementRequests.id, id)).for("update").limit(1);
  if (!row) throw new ActionError("Requirement not found.");
  return row;
}

async function loadOrgRequirementForUpdate(tx: DbOrTx, ctx: OrgContext<"employer">, id: string): Promise<RequirementRow> {
  const [row] = await tx
    .select()
    .from(requirementRequests)
    .where(and(eq(requirementRequests.id, id), eq(requirementRequests.organizationId, ctx.organization.id)))
    .for("update")
    .limit(1);
  if (!row) throw new ActionError("Requirement not found.");
  return row;
}

/** Put a submitted requirement into the approval centre and record the request id. */
async function sendToApprovals(tx: DbOrTx, requirement: RequirementRow): Promise<void> {
  const approval = await submitForApproval(
    {
      type: "requirement_request",
      entityType: "requirement_request",
      entityId: requirement.id,
      organizationId: requirement.organizationId,
      title: `${requirement.code}: ${requirement.title}`,
      summary: `${requirement.totalPositions} position${requirement.totalPositions === 1 ? "" : "s"}${requirement.organizationName ? ` for ${requirement.organizationName}` : ""}`,
      payload: {
        code: requirement.code,
        title: requirement.title,
        kind: requirement.kind,
        source: requirement.source,
        organizationName: requirement.organizationName,
        countryCode: requirement.countryCode,
        totalPositions: requirement.totalPositions,
        urgency: requirement.urgency,
        joiningBy: requirement.joiningBy,
      },
      priority: requirement.urgency === "critical" ? "urgent" : requirement.urgency === "high" ? "high" : "normal",
      submittedByUserId: requirement.submittedByUserId,
    },
    tx,
  );
  await tx.update(requirementRequests).set({ approvalRequestId: approval.id }).where(eq(requirementRequests.id, requirement.id));
}

async function assertRequirementsOpen(ctx?: { organizationId?: string }): Promise<void> {
  const enabled = await isFeatureEnabled("employer.bulk_requirements", { portal: ctx?.organizationId ? "employer" : "public", organizationId: ctx?.organizationId });
  if (!enabled) throw new ActionError("Workforce requirements cannot be submitted online at the moment. Please contact us instead.", { code: "feature_disabled" });
}

// ---------------------------------------------------------------------------
// Public form
// ---------------------------------------------------------------------------

/**
 * "Post a requirement" (no account): honeypot, rate limits (IP hash, email), consent to be contacted.
 * Creates / attaches an employer lead, the requirement and its lines, sends it to the approval centre,
 * notifies staff (requirement.received) and acknowledges the contact with the reference code.
 */
export async function submitPublicRequirement(input: PublicRequirementInput, meta: PublicSubmissionMeta): Promise<PublicSubmissionResult> {
  if (input.website?.trim()) {
    await logSecurityEvent({ type: "form_honeypot_triggered", severity: "info", metadata: { form: "requirement" } });
    return { accepted: true, code: null };
  }
  if (!input.consentToContact) throw new ActionError("Please agree that we may contact you about this requirement.", { fieldErrors: { consentToContact: ["Required"] } });
  await assertRequirementsOpen();
  await enforceRateLimits(
    [
      ...(meta.ipHash
        ? [
            { key: `requirement:ip:${meta.ipHash}`, limit: 3, windowSeconds: 60 * 60 },
            { key: `requirement:ip-day:${meta.ipHash}`, limit: 10, windowSeconds: 24 * 60 * 60 },
          ]
        : []),
      ...(input.contactEmail ? [{ key: `requirement:email:${input.contactEmail}`, limit: 3, windowSeconds: 60 * 60 }] : []),
    ],
    "You have sent several requirements in a short time. Please wait a little and try again, or contact us directly.",
  );
  const policyVersion = await getSetting("privacy.policy_version");

  try {
    const code = await db.transaction(async (tx) => {
      const lead = await findOrCreateInboundLead(
        {
          type: "employer",
          source: "requirement_form",
          sourceDetail: input.sourcePage ?? null,
          name: input.contactName,
          email: input.contactEmail ?? null,
          phone: input.contactPhone ?? null,
          organizationName: input.organizationName,
          countryCode: input.countryCode ?? null,
          interest: input.title,
          consentToContact: true,
          utm: { ...(input.utm ?? {}), ...(input.sourcePage ? { landingPath: input.sourcePage } : {}) },
        },
        tx,
      );
      const requirementCode = await nextCode("REQ", { tx });
      const now = new Date();
      const [requirement] = await tx
        .insert(requirementRequests)
        .values({
          code: requirementCode,
          organizationId: null,
          leadId: lead.id,
          submittedByUserId: meta.userId ?? null,
          source: "public_form",
          ...workValues(input),
          organizationName: input.organizationName,
          contactName: input.contactName,
          contactDesignation: input.contactDesignation ?? null,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          consentToContact: true,
          privacyNoticeVersion: policyVersion,
          status: "submitted",
          ipHash: meta.ipHash,
          submittedAt: now,
        })
        .returning();
      await insertLines(tx, requirement!.id, input.lines);
      await sendToApprovals(tx, requirement!);
      await audit({
        action: "requirement.submitted",
        entityType: "requirement_request",
        entityId: requirement!.id,
        metadata: { code: requirementCode, source: "public_form", lines: input.lines.length, totalPositions: requirement!.totalPositions, leadId: lead.id, leadCreated: lead.created },
        tx,
      });
      await notifyRequirementStaff(requirement!, { event: "requirement.received" }, tx);
      await notifyRequirementSubmitter(requirement!, { event: "requirement.received" }, tx);
      return requirementCode;
    });
    await trackServer("requirement_submitted", { kind: input.kind });
    return { accepted: true, code };
  } catch (error) {
    rethrowConstraint(error, REQUIREMENT_CONSTRAINTS);
  }
}

// ---------------------------------------------------------------------------
// Employer Portal
// ---------------------------------------------------------------------------

function assertEmployerCanSubmit(ctx: OrgContext<"employer">): void {
  if (!orgCan(ctx, "employer.requirements.manage")) throw new ActionError("You do not have permission to manage workforce requirements.", { code: "forbidden" });
  if (ctx.organization.status === "suspended") {
    throw new ActionError("Your organisation is suspended, so new requirements cannot be submitted. Please contact support.", { code: "org_suspended" });
  }
}

/** Submitted requirements count towards the plan's bulk_requirements allowance (drafts do not). Call before the transaction. */
async function assertBulkRequirementAllowance(ctx: OrgContext<"employer">): Promise<void> {
  const entitlement = await checkEntitlement(ctx.organization.id, "bulk_requirements");
  if (!entitlement.allowed) {
    throw new ActionError(entitlement.reason ?? "Your plan does not allow more workforce requirements this period. Upgrade your plan or contact us.", {
      code: "entitlement_exhausted",
    });
  }
}

async function validateRequirementAttachments(ctx: OrgContext<"employer">, fileIds: readonly string[], tx: DbOrTx): Promise<string[]> {
  const unique = [...new Set(fileIds)];
  for (const id of unique) {
    await requireUploadedFile(id, { purposes: ["org_document", "message_attachment"], ownerUserId: ctx.user.id, organizationId: ctx.organization.id }, tx);
  }
  return unique;
}

function employerContact(ctx: OrgContext<"employer">, input: Pick<EmployerRequirementInput, "contactName" | "contactDesignation" | "contactEmail" | "contactPhone">) {
  return {
    organizationName: ctx.organization.name,
    contactName: input.contactName ?? ctx.user.displayName,
    contactDesignation: input.contactDesignation ?? ctx.membership.jobTitle ?? null,
    contactEmail: input.contactEmail ?? ctx.user.email ?? null,
    contactPhone: input.contactPhone ?? ctx.user.phone ?? null,
  };
}

async function submitDraft(tx: DbOrTx, ctx: OrgContext<"employer">, requirement: RequirementRow): Promise<RequirementRow> {
  const [submitted] = await tx
    .update(requirementRequests)
    .set({ status: "submitted", submittedAt: new Date(), submittedByUserId: ctx.user.id, statusReason: null })
    .where(eq(requirementRequests.id, requirement.id))
    .returning();
  await sendToApprovals(tx, submitted!);
  await audit({
    action: "requirement.submitted",
    entityType: "requirement_request",
    entityId: requirement.id,
    organizationId: ctx.organization.id,
    metadata: { code: requirement.code, source: requirement.source, resubmitted: Boolean(requirement.submittedAt) },
    actorUserId: ctx.user.id,
    actorType: "user",
    tx,
  });
  await notifyRequirementStaff(submitted!, { event: "requirement.received" }, tx);
  await notify(
    { event: "requirement.received", recipients: [{ userId: ctx.user.id }], data: { forStaff: false, code: submitted!.code, title: submitted!.title }, link: `/employer/requirements/${submitted!.id}`, organizationId: ctx.organization.id },
    { tx },
  );
  return submitted!;
}

/** Employer submits (or saves as a draft) a workforce requirement for their organisation. */
export async function submitEmployerRequirement(ctx: OrgContext<"employer">, input: EmployerRequirementInput): Promise<{ id: string; code: string; status: RequirementStatus }> {
  assertEmployerCanSubmit(ctx);
  await assertRequirementsOpen({ organizationId: ctx.organization.id });
  if (!input.asDraft) await assertBulkRequirementAllowance(ctx);
  let result: { id: string; code: string; status: RequirementStatus };
  try {
    result = await db.transaction(async (tx) => {
      const attachmentFileIds = await validateRequirementAttachments(ctx, input.attachmentFileIds, tx);
      const code = await nextCode("REQ", { tx });
      const [draft] = await tx
        .insert(requirementRequests)
        .values({
          code,
          organizationId: ctx.organization.id,
          submittedByUserId: ctx.user.id,
          source: "employer_portal",
          ...workValues(input),
          ...employerContact(ctx, input),
          consentToContact: true,
          attachmentFileIds,
          status: "draft",
        })
        .returning();
      await insertLines(tx, draft!.id, input.lines);
      await audit({ action: "requirement.created", entityType: "requirement_request", entityId: draft!.id, organizationId: ctx.organization.id, metadata: { code, asDraft: input.asDraft }, actorUserId: ctx.user.id, actorType: "user", tx });
      if (input.asDraft) return { id: draft!.id, code, status: "draft" as const };
      const submitted = await submitDraft(tx, ctx, draft!);
      return { id: submitted.id, code, status: submitted.status };
    });
  } catch (error) {
    rethrowConstraint(error, REQUIREMENT_CONSTRAINTS);
  }
  if (!input.asDraft) await trackServer("requirement_submitted", { kind: input.kind });
  return result;
}

/** Edit a draft (including one returned with "changes requested"); `asDraft: false` submits it again. */
export async function updateEmployerRequirement(ctx: OrgContext<"employer">, id: string, input: EmployerRequirementInput): Promise<{ status: RequirementStatus }> {
  assertEmployerCanSubmit(ctx);
  if (!input.asDraft) await assertBulkRequirementAllowance(ctx);
  let result: { status: RequirementStatus };
  try {
    result = await db.transaction(async (tx) => {
      const requirement = await loadOrgRequirementForUpdate(tx, ctx, id);
      if (requirement.status !== "draft") throw new ActionError("Only drafts can be edited. Contact your Venkat Sai contact to change a submitted requirement.");
      if (!input.asDraft) await assertRequirementsOpen({ organizationId: ctx.organization.id });
      const attachmentFileIds = await validateRequirementAttachments(ctx, input.attachmentFileIds, tx);
      const [updated] = await tx
        .update(requirementRequests)
        .set({ ...workValues(input), ...employerContact(ctx, input), attachmentFileIds })
        .where(eq(requirementRequests.id, id))
        .returning();
      await tx.delete(requirementLines).where(eq(requirementLines.requirementId, id));
      await insertLines(tx, id, input.lines);
      await audit({ action: "requirement.updated", entityType: "requirement_request", entityId: id, organizationId: ctx.organization.id, metadata: { lines: input.lines.length }, actorUserId: ctx.user.id, actorType: "user", tx });
      if (input.asDraft) return { status: "draft" as const };
      const submitted = await submitDraft(tx, ctx, updated!);
      return { status: submitted.status };
    });
  } catch (error) {
    rethrowConstraint(error, REQUIREMENT_CONSTRAINTS);
  }
  if (!input.asDraft) await trackServer("requirement_submitted", { kind: input.kind });
  return result;
}

/** Submit an existing draft unchanged. */
export async function submitEmployerRequirementDraft(ctx: OrgContext<"employer">, id: string): Promise<void> {
  assertEmployerCanSubmit(ctx);
  await assertRequirementsOpen({ organizationId: ctx.organization.id });
  await assertBulkRequirementAllowance(ctx);
  const submitted = await db.transaction(async (tx) => {
    const requirement = await loadOrgRequirementForUpdate(tx, ctx, id);
    if (requirement.status !== "draft") throw new ActionError("This requirement has already been submitted.");
    const [{ lines } = { lines: 0 }] = await tx
      .select({ lines: sql<number>`count(*)::int` })
      .from(requirementLines)
      .where(eq(requirementLines.requirementId, id));
    if (!lines) throw new ActionError("Add at least one role before submitting.");
    return submitDraft(tx, ctx, requirement);
  });
  await trackServer("requirement_submitted", { kind: submitted.kind });
}

/** The employer withdraws a requirement (any open status); open approvals are cancelled. */
export async function cancelEmployerRequirement(ctx: OrgContext<"employer">, id: string, reason: string): Promise<void> {
  if (!orgCan(ctx, "employer.requirements.manage")) throw new ActionError("You do not have permission to manage workforce requirements.", { code: "forbidden" });
  await db.transaction(async (tx) => {
    const requirement = await loadOrgRequirementForUpdate(tx, ctx, id);
    if (!REQUIREMENT_EMPLOYER_CANCELLABLE.includes(requirement.status)) throw new ActionError("This requirement can no longer be cancelled.");
    const [updated] = await tx
      .update(requirementRequests)
      .set({ status: "cancelled", statusReason: reason, closedAt: new Date() })
      .where(eq(requirementRequests.id, id))
      .returning();
    await cancelApprovalsForEntity("requirement_request", id, ctx.user.id, `Cancelled by the employer: ${reason}`, tx);
    await audit({ action: "requirement.cancelled", entityType: "requirement_request", entityId: id, organizationId: ctx.organization.id, metadata: { from: requirement.status, reason, by: "employer" }, actorUserId: ctx.user.id, actorType: "user", tx });
    if (requirement.status !== "draft") {
      await notifyRequirementStaff(updated!, { event: "requirement.status_changed", data: { status: REQUIREMENT_STATUS_LABELS.cancelled, reason } }, tx);
    }
  });
}

// ---------------------------------------------------------------------------
// Staff processing (requirements.manage)
// ---------------------------------------------------------------------------

/** Move a requirement through REQUIREMENT_STAFF_TRANSITIONS; on hold / cancel need a reason. The employer is notified. */
export async function changeRequirementStatus(ctx: StaffContext, id: string, status: RequirementStatus, opts: { reason?: string | null } = {}): Promise<void> {
  assertStaff(ctx, "requirements.manage");
  const reason = opts.reason?.trim() || null;
  if ((status === "on_hold" || status === "cancelled") && !reason) {
    throw new ActionError("Give a reason; it is shared with the employer.", { fieldErrors: { reason: ["A reason is required"] } });
  }
  await db.transaction(async (tx) => {
    const requirement = await loadRequirementForUpdate(tx, id);
    if (!canTransition(REQUIREMENT_STAFF_TRANSITIONS, requirement.status, status)) {
      throw new ActionError(
        status === "approved"
          ? "Approve requirements from the approval centre."
          : `A requirement cannot move from ${REQUIREMENT_STATUS_LABELS[requirement.status]} to ${REQUIREMENT_STATUS_LABELS[status]}.`,
      );
    }
    // Resuming from "on hold" into the delivery stages is only possible after an approval-centre approval.
    if (requirement.status === "on_hold" && !requirement.approvedAt && REQUIREMENT_DELIVERY_STATUSES.includes(status)) {
      throw new ActionError("This requirement has not been approved yet. Decide it in the approval centre first.");
    }
    const closing = REQUIREMENT_CLOSED_STATUSES.includes(status);
    const [updated] = await tx
      .update(requirementRequests)
      .set({ status, statusReason: reason, closedAt: closing ? new Date() : null })
      .where(eq(requirementRequests.id, id))
      .returning();
    if (status === "cancelled") await cancelApprovalsForEntity("requirement_request", id, ctx.user.id, reason ?? undefined, tx);
    // Back under review after changes were requested on a public submission: return it to the approval centre.
    if (status === "under_review" && requirement.status === "on_hold" && !requirement.approvedAt) await sendToApprovals(tx, updated!);
    await audit({ action: "requirement.status_changed", entityType: "requirement_request", entityId: id, organizationId: requirement.organizationId, metadata: { from: requirement.status, to: status, reason }, actorUserId: ctx.user.id, actorType: "staff", tx });
    await notifyRequirementSubmitter(updated!, { event: "requirement.status_changed", data: { reason } }, tx);
  });
}

/** Set the Venkat Sai owner (needs requirements.manage); the new owner is notified. */
export async function assignRequirementOwner(ctx: StaffContext, id: string, assigneeUserId: string | null): Promise<void> {
  assertStaff(ctx, "requirements.manage");
  const assignee = assigneeUserId ? await assertAssignableStaff(assigneeUserId, "requirements.manage") : null;
  await db.transaction(async (tx) => {
    const requirement = await loadRequirementForUpdate(tx, id);
    if (requirement.assignedToUserId === (assignee?.id ?? null)) return;
    await tx.update(requirementRequests).set({ assignedToUserId: assignee?.id ?? null }).where(eq(requirementRequests.id, id));
    await audit({ action: "requirement.assigned", entityType: "requirement_request", entityId: id, organizationId: requirement.organizationId, metadata: { from: requirement.assignedToUserId, to: assignee?.id ?? null }, actorUserId: ctx.user.id, actorType: "staff", tx });
    if (assignee && assignee.id !== ctx.user.id) {
      await notify(
        {
          event: "work.assigned",
          recipients: [{ userId: assignee.id }],
          data: { kindLabel: "workforce requirement", title: requirement.title, code: requirement.code, assignedBy: ctx.user.displayName, dueAt: requirement.joiningBy },
          link: staffRequirementHref(id),
        },
        { tx },
      );
    }
  });
}

/** Record (or clear with null) the quotation for the employer: amount in major units + ISO currency. */
export async function setRequirementQuotation(ctx: StaffContext, id: string, quote: { amount: number; currency: string } | null): Promise<void> {
  assertStaff(ctx, "requirements.manage");
  if (quote && (!Number.isFinite(quote.amount) || quote.amount < 0)) throw new ActionError("Enter a valid amount.", { fieldErrors: { amount: ["Enter a valid amount"] } });
  try {
    await db.transaction(async (tx) => {
      const requirement = await loadRequirementForUpdate(tx, id);
      const currency = quote?.currency.toUpperCase() ?? null;
      const amountMinor = quote && currency ? toMinorUnits(quote.amount, currency) : null;
      await tx.update(requirementRequests).set({ quotedFeeMinor: amountMinor, quotedFeeCurrency: currency }).where(eq(requirementRequests.id, id));
      await audit({ action: "requirement.quoted", entityType: "requirement_request", entityId: id, organizationId: requirement.organizationId, metadata: { amountMinor, currency }, actorUserId: ctx.user.id, actorType: "staff", tx });
    });
  } catch (error) {
    rethrowConstraint(error, REQUIREMENT_CONSTRAINTS);
  }
}

/** Staff edit of header details (only fields present in `input`). */
export async function updateRequirementDetails(ctx: StaffContext, input: RequirementDetailsInput): Promise<void> {
  assertStaff(ctx, "requirements.manage");
  const keys = [
    "kind",
    "title",
    "description",
    "countryCode",
    "locations",
    "industryId",
    "contractDurationMonths",
    "workingHours",
    "joiningBy",
    "interviewMethod",
    "interviewDetails",
    "assessmentRequired",
    "assessmentDetails",
    "documentationRequirements",
    "languageRequirements",
    "urgency",
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const k of keys) if (input[k] !== undefined) patch[k] = input[k];
  if (!Object.keys(patch).length) return;
  try {
    await db.transaction(async (tx) => {
      const requirement = await loadRequirementForUpdate(tx, input.id);
      await tx.update(requirementRequests).set(patch).where(eq(requirementRequests.id, input.id));
      await audit({ action: "requirement.updated", entityType: "requirement_request", entityId: input.id, organizationId: requirement.organizationId, metadata: { fields: Object.keys(patch), by: "staff" }, actorUserId: ctx.user.id, actorType: "staff", tx });
    });
  } catch (error) {
    rethrowConstraint(error, REQUIREMENT_CONSTRAINTS);
  }
}

/** Staff-only working notes on the requirement (never shown to the employer). */
export async function setRequirementInternalNotes(ctx: StaffContext, id: string, internalNotes: string | null): Promise<void> {
  assertStaff(ctx, "requirements.manage");
  await db.transaction(async (tx) => {
    const requirement = await loadRequirementForUpdate(tx, id);
    await tx.update(requirementRequests).set({ internalNotes: internalNotes?.trim() || null }).where(eq(requirementRequests.id, id));
    await audit({ action: "requirement.internal_notes_updated", entityType: "requirement_request", entityId: id, organizationId: requirement.organizationId, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

/** Add or edit a role line (line.id = edit); keeps totalPositions in sync. */
export async function upsertRequirementLine(ctx: StaffContext, requirementId: string, line: RequirementLineInput): Promise<{ lineId: string }> {
  assertStaff(ctx, "requirements.manage");
  try {
    return await db.transaction(async (tx) => {
      const requirement = await loadRequirementForUpdate(tx, requirementId);
      let lineId: string;
      if (line.id) {
        const [existing] = await tx
          .select({ id: requirementLines.id, sortOrder: requirementLines.sortOrder, filledCount: requirementLines.filledCount })
          .from(requirementLines)
          .where(and(eq(requirementLines.id, line.id), eq(requirementLines.requirementId, requirementId)))
          .limit(1);
        if (!existing) throw new ActionError("Role not found on this requirement.");
        if (existing.filledCount > line.positions) throw new ActionError("Positions cannot be fewer than those already filled.", { fieldErrors: { positions: ["Below the filled count"] } });
        await tx.update(requirementLines).set(lineValues(line, existing.sortOrder)).where(eq(requirementLines.id, line.id));
        lineId = line.id;
      } else {
        const [{ next } = { next: 0 }] = await tx
          .select({ next: sql<number>`coalesce(max(${requirementLines.sortOrder}) + 1, 0)::int` })
          .from(requirementLines)
          .where(eq(requirementLines.requirementId, requirementId));
        const [row] = await tx.insert(requirementLines).values({ requirementId, ...lineValues(line, next) }).returning({ id: requirementLines.id });
        lineId = row!.id;
      }
      const total = await recomputeTotalPositions(tx, requirementId);
      await audit({ action: "requirement.line_saved", entityType: "requirement_request", entityId: requirementId, organizationId: requirement.organizationId, metadata: { lineId, roleTitle: line.roleTitle, positions: line.positions, totalPositions: total }, actorUserId: ctx.user.id, actorType: "staff", tx });
      return { lineId };
    });
  } catch (error) {
    rethrowConstraint(error, REQUIREMENT_CONSTRAINTS);
  }
}

/** Remove a role line (a requirement keeps at least one line). */
export async function removeRequirementLine(ctx: StaffContext, lineId: string): Promise<void> {
  assertStaff(ctx, "requirements.manage");
  await db.transaction(async (tx) => {
    const [line] = await tx.select().from(requirementLines).where(eq(requirementLines.id, lineId)).limit(1);
    if (!line) throw new ActionError("Role not found.");
    const requirement = await loadRequirementForUpdate(tx, line.requirementId);
    const others = await tx
      .select({ id: requirementLines.id })
      .from(requirementLines)
      .where(and(eq(requirementLines.requirementId, line.requirementId), ne(requirementLines.id, lineId)))
      .limit(1);
    if (!others.length) throw new ActionError("A requirement needs at least one role.");
    if (line.filledCount > 0) throw new ActionError("This role already has filled positions and cannot be removed.");
    await tx.delete(requirementLines).where(eq(requirementLines.id, lineId));
    await recomputeTotalPositions(tx, line.requirementId);
    await audit({ action: "requirement.line_removed", entityType: "requirement_request", entityId: line.requirementId, organizationId: requirement.organizationId, metadata: { lineId, roleTitle: line.roleTitle }, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

/**
 * Link a role line to the job posting created for it (or unlink with null). The job must belong to this
 * requirement, to the same employer, or be Venkat Sai-managed.
 */
export async function linkRequirementLineToJob(ctx: StaffContext, lineId: string, jobId: string | null): Promise<void> {
  assertStaff(ctx, ["requirements.manage", "jobs.view"]);
  await db.transaction(async (tx) => {
    const [line] = await tx.select().from(requirementLines).where(eq(requirementLines.id, lineId)).limit(1);
    if (!line) throw new ActionError("Role not found.");
    const requirement = await loadRequirementForUpdate(tx, line.requirementId);
    if (jobId) {
      const [job] = await tx
        .select({ id: jobs.id, organizationId: jobs.organizationId, requirementId: jobs.requirementId, managedByVenkatSai: jobs.managedByVenkatSai, title: jobs.title })
        .from(jobs)
        .where(and(eq(jobs.id, jobId), isNull(jobs.deletedAt)))
        .limit(1);
      if (!job) throw new ActionError("Job not found.", { fieldErrors: { jobId: ["Choose a job"] } });
      const matches = job.requirementId === requirement.id || (requirement.organizationId !== null && job.organizationId === requirement.organizationId) || job.managedByVenkatSai;
      if (!matches) throw new ActionError("This job belongs to a different employer.", { fieldErrors: { jobId: ["Choose a job for this employer"] } });
    }
    await tx.update(requirementLines).set({ jobId }).where(eq(requirementLines.id, lineId));
    await audit({ action: "requirement.line_linked", entityType: "requirement_request", entityId: line.requirementId, organizationId: requirement.organizationId, metadata: { lineId, jobId }, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

/** Record how many positions of a line are filled (0 … positions). */
export async function setRequirementLineFilled(ctx: StaffContext, lineId: string, filledCount: number): Promise<void> {
  assertStaff(ctx, "requirements.manage");
  if (!Number.isInteger(filledCount) || filledCount < 0) throw new ActionError("Enter a whole number.");
  await db.transaction(async (tx) => {
    const [line] = await tx.select().from(requirementLines).where(eq(requirementLines.id, lineId)).for("update").limit(1);
    if (!line) throw new ActionError("Role not found.");
    if (filledCount > line.positions) throw new ActionError(`This role has ${line.positions} positions.`, { fieldErrors: { filledCount: ["More than the positions"] } });
    await tx.update(requirementLines).set({ filledCount }).where(eq(requirementLines.id, lineId));
    await audit({ action: "requirement.line_filled", entityType: "requirement_request", entityId: line.requirementId, metadata: { lineId, from: line.filledCount, to: filledCount }, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

/** Lines of a requirement in display order (internal helper for queries). */
export async function loadRequirementLines(requirementId: string, tx: DbOrTx = db): Promise<RequirementLineRow[]> {
  return tx.select().from(requirementLines).where(eq(requirementLines.requirementId, requirementId)).orderBy(asc(requirementLines.sortOrder), asc(requirementLines.createdAt));
}
