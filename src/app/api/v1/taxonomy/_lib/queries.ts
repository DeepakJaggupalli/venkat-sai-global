import "server-only";

import { and, asc, eq, ilike, sql } from "drizzle-orm";

import { db } from "@/db";
import { jobCategories } from "@/db/schema";

import { escapeLike } from "./params";

export type JobCategorySuggestion = { id: string; name: string; slug: string; parentId: string | null };

/**
 * Typeahead over active job categories (local read-only query — the taxonomy module exposes
 * listJobCategories()/jobCategoryOptions() but no search; see the design-system report).
 * Prefix matches rank first, then alphabetical.
 */
export async function searchJobCategories(query: string, limit: number): Promise<JobCategorySuggestion[]> {
  const q = query.trim();
  const filters = [eq(jobCategories.isActive, true)];
  if (q) filters.push(ilike(jobCategories.name, `%${escapeLike(q)}%`));
  return db
    .select({ id: jobCategories.id, name: jobCategories.name, slug: jobCategories.slug, parentId: jobCategories.parentId })
    .from(jobCategories)
    .where(and(...filters))
    .orderBy(
      q ? sql`case when ${jobCategories.name} ilike ${`${escapeLike(q)}%`} then 0 else 1 end` : asc(jobCategories.sortOrder),
      asc(jobCategories.sortOrder),
      asc(jobCategories.name),
    )
    .limit(limit);
}
