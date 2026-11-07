"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireStaff } from "@/modules/identity/authz";
import { createThread } from "@/modules/operations/threads";
import { requirementLineSchema } from "@/modules/operations/schemas";
import { linkRequirementLineToJob, setRequirementLineFilled, upsertRequirementLine } from "@/modules/operations/service";
import { createPartnerAssignment } from "@/modules/recruitment/partner-assignments";

/**
 * Flat-field form wrappers for the requirement detail page. The module's actions expect `line:json`
 * or programmatic calls; these re-authorise and call the same services.
 */

function refresh(id: string) {
  revalidatePath("/admin/requirements");
  revalidatePath(`/admin/requirements/${id}`);
  revalidatePath(`/employer/requirements/${id}`);
}

const lineFormSchema = z.object({
  requirementId: f.uuid(),
  lineId: f.optionalUuid(),
  roleTitle: z.string().optional(),
  positions: z.string().optional(),
  experienceMinYears: z.string().optional(),
  experienceMaxYears: z.string().optional(),
  qualification: z.string().optional(),
  requiredSkills: z.string().optional(),
  salaryMin: z.string().optional(),
  salaryMax: z.string().optional(),
  salaryCurrency: z.string().optional(),
  salaryPeriod: z.string().optional(),
  notes: z.string().optional(),
});

export const saveRequirementLineFormAction = createFormAction(lineFormSchema, async (raw) => {
  const ctx = await requireStaff("requirements.manage");
  const parsed = requirementLineSchema.safeParse({
    id: raw.lineId,
    roleTitle: raw.roleTitle,
    positions: raw.positions,
    experienceMinYears: raw.experienceMinYears,
    experienceMaxYears: raw.experienceMaxYears,
    qualification: raw.qualification,
    requiredSkills: (raw.requiredSkills ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    salaryMin: raw.salaryMin,
    salaryMax: raw.salaryMax,
    salaryCurrency: raw.salaryCurrency,
    salaryPeriod: raw.salaryPeriod,
    notes: raw.notes,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (fieldErrors[String(issue.path[0] ?? "_form")] ??= []).push(issue.message);
    return { ok: false, error: "Please correct the highlighted fields.", fieldErrors };
  }
  const result = await upsertRequirementLine(ctx, raw.requirementId, parsed.data);
  refresh(raw.requirementId);
  return ok(result, raw.lineId ? "Role updated" : "Role added");
});

export const linkLineJobFormAction = createFormAction(z.object({ requirementId: f.uuid(), lineId: f.uuid(), jobId: f.optionalUuid() }), async ({ requirementId, lineId, jobId }) => {
  const ctx = await requireStaff(["requirements.manage", "jobs.view"]);
  await linkRequirementLineToJob(ctx, lineId, jobId ?? null);
  refresh(requirementId);
  return ok(undefined, jobId ? "Role linked to the job" : "Job link removed");
});

export const assignPartnerFormAction = createFormAction(
  z.object({
    requirementId: f.uuid(),
    partnerOrganizationId: f.uuid(),
    positionsTarget: f.optionalInt({ min: 1, max: 100_000 }),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").optional(),
    instructions: f.longText(4000),
  }),
  async ({ requirementId, partnerOrganizationId, positionsTarget, dueDate, instructions }) => {
    const ctx = await requireStaff("partners.assign");
    const result = await createPartnerAssignment(ctx, {
      partnerOrganizationId,
      requirementId,
      positionsTarget: positionsTarget ?? null,
      dueDate: dueDate ?? null,
      instructions: instructions ?? null,
    });
    refresh(requirementId);
    revalidatePath("/admin/partners");
    const warning = result.warnings.length ? " Check the warnings on the assignment." : "";
    return ok({ id: result.id }, `Partner assigned.${warning}`);
  },
);

export const startRequirementThreadAction = createFormAction(
  z.object({ requirementId: f.uuid(), organizationId: f.uuid(), subject: f.text({ label: "Subject", max: 200 }), message: f.text({ label: "Message", max: 10_000 }) }),
  async ({ requirementId, organizationId, subject, message }) => {
    const ctx = await requireStaff("requirements.view");
    const thread = await createThread(
      { kind: "staff", ctx },
      { portal: "admin", subject, message, contextType: "requirement", contextId: requirementId, organizationId, participantUserIds: [], attachmentFileIds: [] },
    );
    refresh(requirementId);
    return ok(thread, "Conversation started with the employer");
  },
);

export const setLineFilledFormAction = createFormAction(
  z.object({ requirementId: f.uuid(), lineId: f.uuid(), filledCount: f.int({ min: 0, max: 100_000 }) }),
  async ({ requirementId, lineId, filledCount }) => {
    const ctx = await requireStaff("requirements.manage");
    await setRequirementLineFilled(ctx, lineId, filledCount);
    refresh(requirementId);
    return ok(undefined, "Filled positions updated");
  },
);
