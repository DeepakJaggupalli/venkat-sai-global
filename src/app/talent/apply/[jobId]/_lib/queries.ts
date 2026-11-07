import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { jobs } from "@/db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Slug of a job by id, so the apply page can reuse the public job read model (`getPublicJobBySlug`,
 * which applies the public-visibility rule). Returns null for malformed ids. Cross-module need: a
 * `getPublicJobById()` in the jobs module would replace this.
 */
export async function jobSlugById(jobId: string): Promise<string | null> {
  if (!UUID.test(jobId)) return null;
  const [row] = await db.select({ slug: jobs.slug }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return row?.slug ?? null;
}
