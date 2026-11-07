"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { WORKFLOW_STAGE_CATEGORIES } from "@/db/schema/recruitment";
import { createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireStaff } from "@/modules/identity/authz";

import { duplicateWorkflow, moveStage, saveStage, setDefaultWorkflow, updateWorkflowDetails } from "./_lib/workflows";

const BASE = "/admin/settings/workflows";
const refresh = (id?: string) => {
  revalidatePath(BASE);
  if (id) revalidatePath(`${BASE}/${id}`);
};

export const updateWorkflowAction = createFormAction(
  z.object({ id: f.uuid(), name: f.text({ label: "Name", max: 120 }), description: f.optionalText(500), isActive: f.bool() }),
  async ({ id, ...input }) => {
    const ctx = await requireStaff("settings.manage");
    await updateWorkflowDetails(ctx, id, input);
    refresh(id);
    return ok(undefined, "Workflow saved");
  },
);

export const setDefaultWorkflowAction = createAction(z.object({ id: z.uuid() }), async ({ id }) => {
  await requireStaff("settings.manage");
  await setDefaultWorkflow(id);
  refresh(id);
  return ok(undefined, "Default workflow changed. New jobs without a workflow of their own use it.");
});

export const duplicateWorkflowAction = createFormAction(z.object({ id: f.uuid(), name: f.text({ label: "Name", max: 120 }) }), async ({ id, name }) => {
  const ctx = await requireStaff("settings.manage");
  const result = await duplicateWorkflow(ctx, id, name);
  refresh();
  return ok(result, "Workflow copied");
});

export const saveStageAction = createFormAction(
  z.object({
    workflowId: f.uuid(),
    stageId: f.optionalUuid(),
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,59}$/, "Lowercase letters, numbers and underscores, starting with a letter")
      .optional(),
    category: z.enum(WORKFLOW_STAGE_CATEGORIES).optional(),
    name: f.text({ label: "Pipeline name", max: 80 }),
    candidateLabel: f.text({ label: "Label shown to candidates", max: 80 }),
    candidateDescription: f.optionalText(500),
    labelHi: f.optionalText(120),
    descriptionHi: f.optionalText(600),
    labelTe: f.optionalText(120),
    descriptionTe: f.optionalText(600),
    notifyCandidate: f.bool(),
    isActive: f.bool(),
    slaDays: f.optionalInt({ min: 1, max: 365 }),
  }),
  async ({ workflowId, stageId, ...input }) => {
    await requireStaff("settings.manage");
    const result = await saveStage(workflowId, stageId, input);
    refresh(workflowId);
    return ok({ id: result.id }, result.created ? "Stage added" : "Stage saved");
  },
);

export const moveStageAction = createAction(z.object({ workflowId: z.uuid(), stageId: z.uuid(), direction: z.enum(["up", "down"]) }), async (input) => {
  await requireStaff("settings.manage");
  await moveStage(input.workflowId, input.stageId, input.direction);
  refresh(input.workflowId);
  return ok(undefined, "Order updated");
});
