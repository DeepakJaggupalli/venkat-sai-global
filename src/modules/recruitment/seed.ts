import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { applicationWorkflows, workflowStages } from "@/db/schema";

import { DEFAULT_WORKFLOW } from "./default-workflow";

/**
 * Idempotent production seed for the recruitment module (called by scripts/seed.ts).
 * Installs the platform workflow "Standard recruitment" (key "standard") with the 17 candidate
 * stages of spec 8.5. Safe to run repeatedly:
 *  - the workflow is created once (matched by platform scope + key) and becomes the platform default
 *    only if no other platform default exists;
 *  - missing stages are inserted; existing stages are never modified, so labels, translations and
 *    flags edited by administrators survive every deploy.
 * Seeds no business data.
 */
export type RecruitmentSeedResult = { workflowId: string; workflowCreated: boolean; stagesInserted: number };

export async function seedDefaultWorkflow(executor: DbOrTx = db): Promise<RecruitmentSeedResult> {
  return executor.transaction(async (tx) => {
    // Serialise concurrent seed runs (application_workflows_org_key_uq is an expression index, so
    // ON CONFLICT cannot target it — select-then-insert under a lock instead).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('recruitment-seed:default-workflow', 0))`);

    let [workflow] = await tx
      .select({ id: applicationWorkflows.id })
      .from(applicationWorkflows)
      .where(and(isNull(applicationWorkflows.organizationId), eq(applicationWorkflows.key, DEFAULT_WORKFLOW.key)))
      .limit(1);
    let workflowCreated = false;
    if (!workflow) {
      const [existingDefault] = await tx
        .select({ id: applicationWorkflows.id })
        .from(applicationWorkflows)
        .where(and(isNull(applicationWorkflows.organizationId), eq(applicationWorkflows.isDefault, true)))
        .limit(1);
      [workflow] = await tx
        .insert(applicationWorkflows)
        .values({
          organizationId: null,
          key: DEFAULT_WORKFLOW.key,
          name: DEFAULT_WORKFLOW.name,
          description: DEFAULT_WORKFLOW.description,
          isDefault: !existingDefault,
          isActive: true,
        })
        .returning({ id: applicationWorkflows.id });
      workflowCreated = true;
    }

    const inserted = await tx
      .insert(workflowStages)
      .values(
        DEFAULT_WORKFLOW.stages.map((s) => ({
          workflowId: workflow!.id,
          key: s.key,
          name: s.name,
          category: s.category,
          sortOrder: s.sortOrder,
          candidateLabel: s.candidateLabel,
          candidateDescription: s.candidateDescription,
          candidateTranslations: s.candidateTranslations,
          isTerminal: s.isTerminal,
          notifyCandidate: s.notifyCandidate,
          isActive: true,
        })),
      )
      .onConflictDoNothing({ target: [workflowStages.workflowId, workflowStages.key] })
      .returning({ id: workflowStages.id });

    return { workflowId: workflow!.id, workflowCreated, stagesInserted: inserted.length };
  });
}

export async function seed(): Promise<void> {
  await seedDefaultWorkflow();
}
