import "server-only";

import { and, count, countDistinct, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { courses, jobSkills, jobs, skills } from "@/db/schema";
import { logger } from "@/lib/logger";
import type { CourseOffer, SkillDemand } from "@/components/talent/career/skill-gap";
import { getPublishedEntries } from "@/modules/content/queries";

/**
 * Route-private reads for /talent/career (reported as cross-module needs): skill demand across
 * published jobs, published courses teaching given skills, and CMS interview-preparation resources.
 */

const liveJob = () => and(eq(jobs.status, "published"), isNull(jobs.deletedAt), or(isNull(jobs.expiresAt), gt(jobs.expiresAt, sql`now()`)));

/** Skills most often listed on live published jobs (optionally only in the given categories). */
export async function getSkillDemand(categoryIds: readonly string[], limit = 30): Promise<{ totalJobs: number; demand: SkillDemand[] }> {
  const where = categoryIds.length ? and(liveJob(), inArray(jobs.jobCategoryId, [...categoryIds])) : liveJob();
  const [[total], rows] = await Promise.all([
    db.select({ value: count() }).from(jobs).where(where),
    db
      .select({ skillId: jobSkills.skillId, name: skills.name, jobCount: countDistinct(jobSkills.jobId) })
      .from(jobSkills)
      .innerJoin(jobs, eq(jobs.id, jobSkills.jobId))
      .innerJoin(skills, eq(skills.id, jobSkills.skillId))
      .where(where)
      .groupBy(jobSkills.skillId, skills.name)
      .orderBy(desc(countDistinct(jobSkills.jobId)), skills.name)
      .limit(limit),
  ]);
  return { totalJobs: Number(total?.value ?? 0), demand: rows.map((r) => ({ skillId: r.skillId, name: r.name, jobCount: Number(r.jobCount) })) };
}

/** Published courses that teach at least one of the skills. */
export async function getCoursesTeaching(skillIds: readonly string[], limit = 20): Promise<CourseOffer[]> {
  if (!skillIds.length) return [];
  const rows = await db
    .select({ id: courses.id, slug: courses.slug, title: courses.title, skillIds: courses.skillIds })
    .from(courses)
    .where(and(eq(courses.status, "published"), isNull(courses.deletedAt), sql`${courses.skillIds} && ARRAY[${sql.join(skillIds.map((id) => sql`${id}`), sql`, `)}]::uuid[]`))
    .orderBy(desc(courses.publishedAt))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, slug: r.slug, title: r.title, skillIds: r.skillIds ?? [] }));
}

export type InterviewResource = { id: string; title: string; summary: string | null; path: string | null; kind: "article" | "video" };

/** Published CMS posts and videos tagged "interview-preparation" (empty when none are published yet). */
export async function getInterviewResources(locale: string): Promise<InterviewResource[]> {
  try {
    const [posts, videos] = await Promise.all([
      getPublishedEntries("blog_posts", { locale, tag: "interview-preparation", limit: 6 }),
      getPublishedEntries("videos", { locale, tag: "interview-preparation", limit: 4 }),
    ]);
    return [
      ...posts.items.map((e) => ({ id: e.id, title: e.title, summary: e.summary, path: e.path, kind: "article" as const })),
      ...videos.items.map((e) => ({ id: e.id, title: e.title, summary: e.summary, path: e.path, kind: "video" as const })),
    ];
  } catch (error) {
    logger.warn("Interview resources unavailable", { error });
    return [];
  }
}
