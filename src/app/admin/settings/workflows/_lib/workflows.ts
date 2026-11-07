import "server-only";

import { and, asc, count, eq, gt, isNull, lt, ne, desc } from "drizzle-orm";

import { db } from "@/db";
import { applications, applicationWorkflows, workflowStages } from "@/db/schema";
import { WORKFLOW_STAGE_CATEGORIES, type WorkflowStageCategory } from "@/db/schema/recruitment";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";
import { isTerminalCategory, SYSTEM_MANAGED_STAGE_KEYS } from "@/modules/recruitment/workflow";

/**
 * Platform application workflows (organizationId null): stage editor for the Command Centre
 * (settings.manage). Stage keys and categories are fixed once created — pipeline rules and automatic
 * moves key off them — while names, candidate wording, order, notifications and SLAs are editable.
 */

export type WorkflowRow = typeof applicationWorkflows.$inferSelect & { stageCount: number; applicationCount: number };
export type StageRow = typeof workflowStages.$inferSelect & { applicationCount: number };

export async function listPlatformWorkflows(): Promise<WorkflowRow[]> {
  const rows = await db.select().from(applicationWorkflows).where(isNull(applicationWorkflows.organizationId)).orderBy(desc(applicationWorkflows.isDefault), asc(applicationWorkflows.name));
  const [stageCounts, appCounts] = await Promise.all([
    db.select({ id: workflowStages.workflowId, value: count() }).from(workflowStages).groupBy(workflowStages.workflowId),
    db.select({ id: applications.workflowId, value: count() }).from(applications).groupBy(applications.workflowId),
  ]);
  const s = new Map(stageCounts.map((r) => [r.id, r.value]));
  const a = new Map(appCounts.map((r) => [r.id, r.value]));
  return rows.map((r) => ({ ...r, stageCount: s.get(r.id) ?? 0, applicationCount: a.get(r.id) ?? 0 }));
}

export async function getPlatformWorkflow(id: string): Promise<{ workflow: WorkflowRow; stages: StageRow[] } | null> {
  const [wf] = await db
    .select()
    .from(applicationWorkflows)
    .where(and(eq(applicationWorkflows.id, id), isNull(applicationWorkflows.organizationId)))
    .limit(1);
  if (!wf) return null;
  const [stages, counts, [apps]] = await Promise.all([
    db.select().from(workflowStages).where(eq(workflowStages.workflowId, id)).orderBy(asc(workflowStages.sortOrder), asc(workflowStages.name)),
    db.select({ id: applications.currentStageId, value: count() }).from(applications).where(eq(applications.workflowId, id)).groupBy(applications.currentStageId),
    db.select({ value: count() }).from(applications).where(eq(applications.workflowId, id)),
  ]);
  const byStage = new Map(counts.map((c) => [c.id, c.value]));
  return {
    workflow: { ...wf, stageCount: stages.length, applicationCount: apps?.value ?? 0 },
    stages: stages.map((s) => ({ ...s, applicationCount: byStage.get(s.id) ?? 0 })),
  };
}

async function requireWorkflow(id: string) {
  const found = await getPlatformWorkflow(id);
  if (!found) throw new ActionError("Workflow not found.");
  return found;
}

export async function updateWorkflowDetails(ctx: StaffContext, id: string, input: { name: string; description?: string; isActive: boolean }): Promise<void> {
  const { workflow } = await requireWorkflow(id);
  if (workflow.isDefault && !input.isActive) throw new ActionError("The default workflow must stay active. Make another workflow the default first.", { fieldErrors: { isActive: ["Default workflow stays active"] } });
  await db.update(applicationWorkflows).set({ name: input.name, description: input.description ?? null, isActive: input.isActive, updatedAt: new Date() }).where(eq(applicationWorkflows.id, id));
  await audit({ action: "workflow.updated", entityType: "application_workflow", entityId: id, metadata: { name: input.name, isActive: input.isActive, actor: ctx.user.id } });
}

export async function setDefaultWorkflow(id: string): Promise<void> {
  const { workflow, stages } = await requireWorkflow(id);
  if (!workflow.isActive) throw new ActionError("Activate this workflow before making it the default.");
  if (!stages.some((s) => s.isActive && s.category === "applied")) throw new ActionError("The workflow needs an active stage in the “applied” category to receive new applications.");
  if (workflow.isDefault) return;
  await db.transaction(async (tx) => {
    await tx.update(applicationWorkflows).set({ isDefault: false, updatedAt: new Date() }).where(and(isNull(applicationWorkflows.organizationId), eq(applicationWorkflows.isDefault, true)));
    await tx.update(applicationWorkflows).set({ isDefault: true, updatedAt: new Date() }).where(eq(applicationWorkflows.id, id));
  });
  await audit({ action: "workflow.default_changed", entityType: "application_workflow", entityId: id, metadata: { name: workflow.name } });
}

/** Copy a workflow with all its stages (a safe way to try changes without touching live pipelines). */
export async function duplicateWorkflow(ctx: StaffContext, id: string, name: string): Promise<{ id: string }> {
  const { workflow, stages } = await requireWorkflow(id);
  const base = `${workflow.key}_copy`;
  let key = base;
  for (let i = 2; i < 100; i++) {
    const [exists] = await db
      .select({ id: applicationWorkflows.id })
      .from(applicationWorkflows)
      .where(and(isNull(applicationWorkflows.organizationId), eq(applicationWorkflows.key, key)))
      .limit(1);
    if (!exists) break;
    key = `${base}_${i}`;
  }
  const newId = await db.transaction(async (tx) => {
    const [wf] = await tx
      .insert(applicationWorkflows)
      .values({ key, name, description: workflow.description, isDefault: false, isActive: true, organizationId: null, createdByUserId: ctx.user.id })
      .returning({ id: applicationWorkflows.id });
    if (stages.length) {
      await tx.insert(workflowStages).values(
        stages.map((s) => ({
          workflowId: wf!.id,
          key: s.key,
          name: s.name,
          category: s.category,
          sortOrder: s.sortOrder,
          candidateLabel: s.candidateLabel,
          candidateDescription: s.candidateDescription,
          candidateTranslations: s.candidateTranslations,
          isTerminal: s.isTerminal,
          notifyCandidate: s.notifyCandidate,
          isActive: s.isActive,
          slaDays: s.slaDays,
        })),
      );
    }
    return wf!.id;
  });
  await audit({ action: "workflow.duplicated", entityType: "application_workflow", entityId: newId, metadata: { from: id, name } });
  return { id: newId };
}

export type StageInput = {
  key?: string;
  category?: WorkflowStageCategory;
  name: string;
  candidateLabel: string;
  candidateDescription?: string;
  labelHi?: string;
  descriptionHi?: string;
  labelTe?: string;
  descriptionTe?: string;
  notifyCandidate: boolean;
  isActive: boolean;
  slaDays?: number;
};

function translations(input: StageInput) {
  const t: Record<string, { label?: string; description?: string }> = {};
  if (input.labelHi || input.descriptionHi) t.hi = { ...(input.labelHi ? { label: input.labelHi } : {}), ...(input.descriptionHi ? { description: input.descriptionHi } : {}) };
  if (input.labelTe || input.descriptionTe) t.te = { ...(input.labelTe ? { label: input.labelTe } : {}), ...(input.descriptionTe ? { description: input.descriptionTe } : {}) };
  return t;
}

export async function saveStage(workflowId: string, stageId: string | undefined, input: StageInput): Promise<{ id: string; created: boolean }> {
  const { stages } = await requireWorkflow(workflowId);
  if (stageId) {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) throw new ActionError("Stage not found.");
    if (!input.isActive && stage.isActive) {
      if (SYSTEM_MANAGED_STAGE_KEYS.includes(stage.key)) throw new ActionError("This stage is set automatically when a candidate accepts an offer and must stay active.", { fieldErrors: { isActive: ["Must stay active"] } });
      if (stage.category === "applied" && !stages.some((s) => s.id !== stage.id && s.isActive && s.category === "applied")) {
        throw new ActionError("At least one active “applied” stage is needed to receive new applications.", { fieldErrors: { isActive: ["Must stay active"] } });
      }
      if (stage.applicationCount > 0) throw new ActionError(`${stage.applicationCount} application${stage.applicationCount === 1 ? " is" : "s are"} in this stage. Move them before retiring it.`, { fieldErrors: { isActive: ["Stage in use"] } });
    }
    await db
      .update(workflowStages)
      .set({
        name: input.name,
        candidateLabel: input.candidateLabel,
        candidateDescription: input.candidateDescription ?? null,
        candidateTranslations: translations(input),
        notifyCandidate: input.notifyCandidate,
        isActive: input.isActive,
        slaDays: input.slaDays ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(workflowStages.id, stageId), eq(workflowStages.workflowId, workflowId)));
    await audit({ action: "workflow.stage_updated", entityType: "workflow_stage", entityId: stageId, metadata: { workflowId, key: stage.key, name: input.name, isActive: input.isActive, notifyCandidate: input.notifyCandidate } });
    return { id: stageId, created: false };
  }

  if (!input.key || !input.category) throw new ActionError("Choose a key and category for the new stage.");
  if (!(WORKFLOW_STAGE_CATEGORIES as readonly string[]).includes(input.category)) throw new ActionError("Choose a category.", { fieldErrors: { category: ["Choose a category"] } });
  if (stages.some((s) => s.key === input.key)) throw new ActionError("This workflow already has a stage with that key.", { fieldErrors: { key: ["Key already used in this workflow"] } });
  // New stages go after the last stage of the same or an earlier category, keeping pipeline order.
  // Renumber first (10, 20, 30…) so there is always a gap to insert into.
  await renumber(workflowId);
  const fresh = await db.select({ category: workflowStages.category, sortOrder: workflowStages.sortOrder }).from(workflowStages).where(eq(workflowStages.workflowId, workflowId));
  const rankOf = (c: WorkflowStageCategory) => WORKFLOW_STAGE_CATEGORIES.indexOf(c);
  const sameOrEarlier = fresh.filter((s) => !isTerminalCategory(s.category) && rankOf(s.category) <= rankOf(input.category!));
  const sortOrder = (sameOrEarlier.length ? Math.max(...sameOrEarlier.map((s) => s.sortOrder)) : 0) + 5;
  const [row] = await db
    .insert(workflowStages)
    .values({
      workflowId,
      key: input.key,
      name: input.name,
      category: input.category,
      sortOrder,
      candidateLabel: input.candidateLabel,
      candidateDescription: input.candidateDescription ?? null,
      candidateTranslations: translations(input),
      isTerminal: isTerminalCategory(input.category),
      notifyCandidate: input.notifyCandidate,
      isActive: input.isActive,
      slaDays: input.slaDays ?? null,
    })
    .returning({ id: workflowStages.id });
  await audit({ action: "workflow.stage_created", entityType: "workflow_stage", entityId: row!.id, metadata: { workflowId, key: input.key, category: input.category } });
  return { id: row!.id, created: true };
}

/** Rewrite sort orders as 10, 20, 30… keeping the current order. */
async function renumber(workflowId: string) {
  const rows = await db.select({ id: workflowStages.id }).from(workflowStages).where(eq(workflowStages.workflowId, workflowId)).orderBy(asc(workflowStages.sortOrder), asc(workflowStages.createdAt));
  await db.transaction(async (tx) => {
    for (const [i, r] of rows.entries()) await tx.update(workflowStages).set({ sortOrder: (i + 1) * 10 }).where(eq(workflowStages.id, r.id));
  });
}

/** Swap a stage with its neighbour. Stages may not move across category boundaries out of pipeline order. */
export async function moveStage(workflowId: string, stageId: string, direction: "up" | "down"): Promise<void> {
  const [stage] = await db.select().from(workflowStages).where(and(eq(workflowStages.id, stageId), eq(workflowStages.workflowId, workflowId))).limit(1);
  if (!stage) throw new ActionError("Stage not found.");
  const [neighbour] = await db
    .select()
    .from(workflowStages)
    .where(and(eq(workflowStages.workflowId, workflowId), ne(workflowStages.id, stageId), direction === "up" ? lt(workflowStages.sortOrder, stage.sortOrder) : gt(workflowStages.sortOrder, stage.sortOrder)))
    .orderBy(direction === "up" ? desc(workflowStages.sortOrder) : asc(workflowStages.sortOrder))
    .limit(1);
  if (!neighbour) return;
  const rank = (c: WorkflowStageCategory) => WORKFLOW_STAGE_CATEGORIES.indexOf(c);
  const crossesOrder = direction === "up" ? rank(neighbour.category) < rank(stage.category) && !isTerminalCategory(stage.category) : rank(neighbour.category) > rank(stage.category) && !isTerminalCategory(neighbour.category);
  if (crossesOrder) throw new ActionError(`A ${stage.category.replace("_", "-")} stage cannot move ${direction === "up" ? "before" : "after"} a ${neighbour.category.replace("_", "-")} stage.`);
  await db.transaction(async (tx) => {
    await tx.update(workflowStages).set({ sortOrder: neighbour.sortOrder, updatedAt: new Date() }).where(eq(workflowStages.id, stage.id));
    await tx.update(workflowStages).set({ sortOrder: stage.sortOrder, updatedAt: new Date() }).where(eq(workflowStages.id, neighbour.id));
  });
  await audit({ action: "workflow.stage_moved", entityType: "workflow_stage", entityId: stageId, metadata: { workflowId, direction } });
}
