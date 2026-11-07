import "server-only";

import { and, eq, gte, isNull, or } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { currencies, jobs, organizations, partnerAssignments, partnerLicences, requirementRequests, type PartnerAssignmentStatus } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";
import { notifyOrganization } from "@/modules/notifications";

import { assertStaff, assertUuid } from "./access";
import { isUniqueViolation, notFoundError, rethrowConstraint } from "./errors";
import { recruitmentLinks } from "./links";
import { createAssignmentSchema, updateAssignmentSchema, type CreateAssignmentInput, type UpdateAssignmentInput } from "./schemas";

/**
 * Partner assignments: staff (partners.assign) give a verified recruitment partner a requirement
 * and/or job to source for, with targets, a submission limit, the partner's own commission terms and
 * instructions. One open (active / paused) assignment per partner and target.
 */

/** Requirement statuses in which partners may source candidates. */
export const SOURCING_REQUIREMENT_STATUSES = ["approved", "sourcing", "in_progress", "partially_filled"] as const;
const CLOSED_JOB_STATUSES = ["closed", "rejected", "archived"] as const;

/** Country whose emigration law (Emigration Act 1983, eMigrate recruiting-agent registration) the licence check applies to. */
const EMIGRATION_LICENCE_COUNTRY = "IN";

export const ASSIGNMENT_WARNINGS = {
  /** Overseas target but the partner has no verified, unexpired India recruiting-agent licence on record. */
  noRecruitingAgentLicence: "partner_without_verified_recruiting_agent_licence",
} as const;
export type AssignmentWarning = (typeof ASSIGNMENT_WARNINGS)[keyof typeof ASSIGNMENT_WARNINGS];

const ASSIGNMENT_CONSTRAINTS = {
  partner_assignments_open_uq: "This partner already has an open assignment for this requirement or job.",
  partner_assignments_limits_chk: "Targets and limits must be greater than zero.",
  partner_assignments_target_chk: "Choose a requirement or a job.",
} as const;

/** Allowed assignment status changes. */
const ASSIGNMENT_TRANSITIONS: Readonly<Record<PartnerAssignmentStatus, readonly PartnerAssignmentStatus[]>> = {
  active: ["paused", "completed", "revoked"],
  paused: ["active", "completed", "revoked"],
  completed: [],
  revoked: [],
};

export function canChangeAssignmentStatus(from: PartnerAssignmentStatus, to: PartnerAssignmentStatus): boolean {
  return from === to || ASSIGNMENT_TRANSITIONS[from].includes(to);
}

async function hasVerifiedRecruitingAgentLicence(partnerOrganizationId: string, tx: DbOrTx): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const [licence] = await tx
    .select({ id: partnerLicences.id })
    .from(partnerLicences)
    .where(
      and(
        eq(partnerLicences.organizationId, partnerOrganizationId),
        eq(partnerLicences.licenceType, "india_recruiting_agent"),
        eq(partnerLicences.verificationStatus, "verified"),
        isNull(partnerLicences.deletedAt),
        or(isNull(partnerLicences.validUntil), gte(partnerLicences.validUntil, today)),
      ),
    )
    .limit(1);
  return Boolean(licence);
}

/**
 * Assign a requirement and/or job to a verified recruitment partner and notify the partner.
 * Returns compliance warnings (e.g. overseas work for a partner without a verified India
 * recruiting-agent licence) — they are recorded in the audit log and shown to staff; the legal rule
 * is to be confirmed by counsel (docs/research/regulatory-notes.md, recommendation 5).
 */
export async function createPartnerAssignment(ctx: StaffContext, input: CreateAssignmentInput): Promise<{ id: string; warnings: AssignmentWarning[] }> {
  assertStaff(ctx, "partners.assign");
  const data = createAssignmentSchema.parse(input);
  try {
    return await db.transaction(async (tx) => {
      const [partner] = await tx
        .select({ id: organizations.id, name: organizations.name, type: organizations.type, status: organizations.status, deletedAt: organizations.deletedAt })
        .from(organizations)
        .where(eq(organizations.id, data.partnerOrganizationId))
        .limit(1);
      if (!partner || partner.type !== "recruitment_partner" || partner.deletedAt) throw notFoundError("Recruitment partner");
      if (partner.status !== "verified") throw new ActionError("Only verified recruitment partners can be given assignments.", { code: "partner_not_verified" });

      let requirement: { id: string; code: string; title: string; status: string; countryCode: string | null } | null = null;
      if (data.requirementId) {
        const [row] = await tx
          .select({ id: requirementRequests.id, code: requirementRequests.code, title: requirementRequests.title, status: requirementRequests.status, countryCode: requirementRequests.countryCode })
          .from(requirementRequests)
          .where(eq(requirementRequests.id, data.requirementId))
          .limit(1);
        if (!row) throw notFoundError("Requirement");
        if (!(SOURCING_REQUIREMENT_STATUSES as readonly string[]).includes(row.status)) {
          throw new ActionError("The requirement is not open for sourcing.", { code: "requirement_not_open" });
        }
        requirement = row;
      }
      let job: { id: string; code: string; title: string; status: string; isOverseas: boolean; requirementId: string | null } | null = null;
      if (data.jobId) {
        const [row] = await tx
          .select({ id: jobs.id, code: jobs.code, title: jobs.title, status: jobs.status, isOverseas: jobs.isOverseas, requirementId: jobs.requirementId, deletedAt: jobs.deletedAt })
          .from(jobs)
          .where(eq(jobs.id, data.jobId))
          .limit(1);
        if (!row || row.deletedAt) throw notFoundError("Job");
        if ((CLOSED_JOB_STATUSES as readonly string[]).includes(row.status)) throw new ActionError("The job is closed.", { code: "job_closed" });
        if (data.requirementId && row.requirementId !== data.requirementId) throw new ActionError("The job does not belong to this requirement.", { code: "job_requirement_mismatch" });
        job = row;
      }
      if (data.commissionTerms.currency) {
        const [currency] = await tx.select({ code: currencies.code }).from(currencies).where(eq(currencies.code, data.commissionTerms.currency)).limit(1);
        if (!currency) throw new ActionError("Choose a valid currency.", { fieldErrors: { "commissionTerms.currency": ["Choose a valid currency"] } });
      }

      const warnings: AssignmentWarning[] = [];
      const overseas = Boolean(job?.isOverseas) || Boolean(requirement?.countryCode && requirement.countryCode !== EMIGRATION_LICENCE_COUNTRY);
      if (overseas && !(await hasVerifiedRecruitingAgentLicence(partner.id, tx))) warnings.push(ASSIGNMENT_WARNINGS.noRecruitingAgentLicence);

      const [row] = await tx
        .insert(partnerAssignments)
        .values({
          partnerOrganizationId: partner.id,
          requirementId: data.requirementId,
          jobId: data.jobId,
          assignedByUserId: ctx.user.id,
          status: "active",
          positionsTarget: data.positionsTarget,
          submissionLimit: data.submissionLimit,
          commissionTerms: data.commissionTerms,
          dueDate: data.dueDate,
          instructions: data.instructions,
          internalNotes: data.internalNotes,
        })
        .returning({ id: partnerAssignments.id });

      await notifyOrganization(
        {
          event: "partner.assignment_created",
          organizationId: partner.id,
          permission: "partner.requirements.view",
          data: {
            title: job?.title ?? requirement?.title ?? "",
            requirementCode: requirement?.code ?? null,
            jobCode: job?.code ?? null,
            positionsTarget: data.positionsTarget,
            dueDate: data.dueDate,
          },
          link: recruitmentLinks.partnerAssignment(row!.id),
          dedupeKey: `partner-assignment-created:${row!.id}`,
        },
        { tx },
      );
      await audit({
        action: "partner_assignment.created",
        entityType: "partner_assignment",
        entityId: row!.id,
        organizationId: partner.id,
        actorUserId: ctx.user.id,
        actorType: "staff",
        metadata: { requirementId: data.requirementId, jobId: data.jobId, positionsTarget: data.positionsTarget, submissionLimit: data.submissionLimit, warnings },
        tx,
      });
      return { id: row!.id, warnings };
    });
  } catch (error) {
    if (isUniqueViolation(error, "partner_assignments_open_uq")) throw new ActionError(ASSIGNMENT_CONSTRAINTS.partner_assignments_open_uq, { code: "assignment_open" });
    rethrowConstraint(error, ASSIGNMENT_CONSTRAINTS);
  }
}

/** Change an assignment's status (pause / resume / complete / revoke with a reason), targets, terms or instructions. */
export async function updatePartnerAssignment(ctx: StaffContext, input: UpdateAssignmentInput): Promise<void> {
  assertStaff(ctx, "partners.assign");
  const data = updateAssignmentSchema.parse(input);
  try {
    await db.transaction(async (tx) => {
      assertUuid(data.assignmentId, "Assignment");
      const [assignment] = await tx.select().from(partnerAssignments).where(eq(partnerAssignments.id, data.assignmentId)).limit(1).for("update");
      if (!assignment) throw notFoundError("Assignment");
      const set: Partial<typeof partnerAssignments.$inferInsert> = {};
      const closed = assignment.status === "completed" || assignment.status === "revoked";
      const statusChange = data.status && data.status !== assignment.status ? data.status : null;
      if (statusChange) {
        if (!canChangeAssignmentStatus(assignment.status, statusChange)) throw new ActionError(`A ${assignment.status} assignment cannot be ${statusChange}.`, { code: "assignment_status" });
        set.status = statusChange;
        if (statusChange === "revoked") {
          if (!data.reason) throw new ActionError("Give a reason for revoking the assignment.", { fieldErrors: { reason: ["Required"] } });
          set.revokedAt = new Date();
          set.revocationReason = data.reason;
        }
        if (statusChange === "completed") set.completedAt = new Date();
      }
      if (closed && (data.positionsTarget !== undefined || data.submissionLimit !== undefined || data.commissionTerms !== undefined || data.dueDate !== undefined || data.instructions !== undefined)) {
        throw new ActionError("This assignment is closed.", { code: "assignment_closed" });
      }
      if (data.positionsTarget !== undefined) set.positionsTarget = data.positionsTarget;
      if (data.submissionLimit !== undefined) set.submissionLimit = data.submissionLimit;
      if (data.commissionTerms !== undefined) set.commissionTerms = data.commissionTerms;
      if (data.dueDate !== undefined) set.dueDate = data.dueDate;
      if (data.instructions !== undefined) set.instructions = data.instructions;
      if (data.internalNotes !== undefined) set.internalNotes = data.internalNotes;
      if (!Object.keys(set).length) return;
      await tx.update(partnerAssignments).set(set).where(eq(partnerAssignments.id, assignment.id));
      if (statusChange) {
        await notifyOrganization(
          {
            event: "partner.assignment_updated",
            organizationId: assignment.partnerOrganizationId,
            permission: "partner.requirements.view",
            data: { status: statusChange, reason: statusChange === "revoked" ? data.reason : null },
            link: recruitmentLinks.partnerAssignment(assignment.id),
            dedupeKey: `partner-assignment-status:${assignment.id}:${statusChange}:${Date.now()}`,
          },
          { tx },
        );
      }
      await audit({
        action: statusChange ? `partner_assignment.${statusChange}` : "partner_assignment.updated",
        entityType: "partner_assignment",
        entityId: assignment.id,
        organizationId: assignment.partnerOrganizationId,
        actorUserId: ctx.user.id,
        actorType: "staff",
        metadata: { from: assignment.status, fields: Object.keys(set), reason: data.reason ?? null },
        tx,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, "partner_assignments_open_uq")) throw new ActionError(ASSIGNMENT_CONSTRAINTS.partner_assignments_open_uq, { code: "assignment_open" });
    rethrowConstraint(error, ASSIGNMENT_CONSTRAINTS);
  }
}
