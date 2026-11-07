import "server-only";

import type { DbOrTx } from "@/db";
import { enqueueCategoryRefresh, enqueueSkillRefresh } from "@/modules/candidates/tasks";
import { enqueueJobCategoryRefresh, enqueueJobSkillRefresh } from "@/modules/jobs/tasks";

/**
 * Taxonomy write hooks. Skill and job-category names (and skill synonyms) are copied into denormalised
 * search columns on candidate profiles and jobs, so every write that renames a skill, changes its synonyms or
 * renames a job category must call the matching hook — pass `tx` to queue the refresh atomically with the edit.
 */

/** A skill was renamed or its synonyms changed: refresh the profiles and jobs that list it (background tasks). */
export async function afterSkillChanged(skillId: string, tx?: DbOrTx): Promise<void> {
  await enqueueSkillRefresh(skillId, tx);
  await enqueueJobSkillRefresh(skillId, tx);
}

/** A job category was renamed: refresh the profiles that prefer it and the jobs filed under it (background tasks). */
export async function afterCategoryChanged(categoryId: string, tx?: DbOrTx): Promise<void> {
  await enqueueCategoryRefresh(categoryId, tx);
  await enqueueJobCategoryRefresh(categoryId, tx);
}
