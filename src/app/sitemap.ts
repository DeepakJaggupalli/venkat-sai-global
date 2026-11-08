import type { MetadataRoute } from "next";

import { settle } from "@/components/public/server";
import type { CmsCollection } from "@/db/schema";
import { absoluteUrl } from "@/lib/env";
import { LEGAL_PAGE_PATHS } from "@/modules/content/collections";
import { getPublishedSlugs } from "@/modules/content/queries";
import { searchJobs } from "@/modules/jobs/queries";
import { parseJobSearchParams } from "@/modules/jobs/schemas";
import { listPublicCourses } from "@/modules/training/queries";

/**
 * sitemap.xml: static public routes + every published CMS page (services, industries, destinations, news, blog,
 * events, success stories, static/legal pages) + public jobs and training programmes via module queries.
 * Rendered per request (data changes constantly and the build must not need a database). Each source fails
 * independently: a broken source is logged and skipped, never a broken sitemap.
 */
export const dynamic = "force-dynamic";

const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/jobs", priority: 0.9, changeFrequency: "hourly" },
  { path: "/requirements", priority: 0.9, changeFrequency: "daily" },
  { path: "/send-cv", priority: 0.8, changeFrequency: "yearly" },
  { path: "/employers", priority: 0.9, changeFrequency: "monthly" },
  { path: "/employers/request", priority: 0.8, changeFrequency: "yearly" },
  { path: "/candidates", priority: 0.8, changeFrequency: "monthly" },
  { path: "/partners", priority: 0.8, changeFrequency: "monthly" },
  { path: "/institutions", priority: 0.7, changeFrequency: "monthly" },
  { path: "/services", priority: 0.8, changeFrequency: "weekly" },
  { path: "/industries", priority: 0.7, changeFrequency: "weekly" },
  { path: "/global-reach", priority: 0.7, changeFrequency: "weekly" },
  { path: "/training", priority: 0.8, changeFrequency: "daily" },
  { path: "/about", priority: 0.7, changeFrequency: "monthly" },
  { path: "/success-stories", priority: 0.6, changeFrequency: "weekly" },
  { path: "/news", priority: 0.6, changeFrequency: "daily" },
  { path: "/blog", priority: 0.5, changeFrequency: "weekly" },
  { path: "/events", priority: 0.6, changeFrequency: "daily" },
  { path: "/faqs", priority: 0.5, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.6, changeFrequency: "yearly" },
  { path: "/safe-recruitment", priority: 0.6, changeFrequency: "yearly" },
  { path: "/verify-certificate", priority: 0.4, changeFrequency: "yearly" },
  { path: "/grievance", priority: 0.3, changeFrequency: "yearly" },
];

const CMS_COLLECTIONS: { collection: CmsCollection; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { collection: "services", priority: 0.8, changeFrequency: "monthly" },
  { collection: "industries", priority: 0.6, changeFrequency: "monthly" },
  { collection: "destinations", priority: 0.6, changeFrequency: "monthly" },
  { collection: "case_studies", priority: 0.5, changeFrequency: "yearly" },
  { collection: "news", priority: 0.5, changeFrequency: "yearly" },
  { collection: "blog_posts", priority: 0.5, changeFrequency: "yearly" },
  { collection: "events", priority: 0.5, changeFrequency: "weekly" },
  { collection: "pages", priority: 0.3, changeFrequency: "yearly" },
  { collection: "requirement_posts", priority: 0.7, changeFrequency: "weekly" },
];

const FIXED_PAGE_PATHS = new Set(Object.values(LEGAL_PAGE_PATHS));

/** Public jobs are paged through the job search API (public visibility rules live there). */
const JOB_PAGE_SIZE = 50;
const MAX_JOB_PAGES = 20;
const MAX_COURSE_PAGES = 10;

async function jobEntries(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = [];
  for (let page = 1; page <= MAX_JOB_PAGES; page++) {
    const result = await searchJobs(parseJobSearchParams({ sort: "newest", page: String(page), pageSize: String(JOB_PAGE_SIZE) }), { kind: "public" });
    for (const job of result.items) {
      out.push({ url: absoluteUrl(`/jobs/${job.slug}`), lastModified: job.publishedAt ?? undefined, changeFrequency: "daily", priority: job.isFeatured ? 0.8 : 0.7 });
    }
    if (page >= result.pageCount) break;
  }
  return out;
}

async function courseEntries(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = [];
  for (let page = 1; page <= MAX_COURSE_PAGES; page++) {
    const result = await listPublicCourses({}, { page, pageSize: 50, offset: (page - 1) * 50 });
    for (const course of result.items) {
      out.push({ url: absoluteUrl(`/training/${course.slug}`), lastModified: course.publishedAt ?? undefined, changeFrequency: "weekly", priority: 0.6 });
    }
    if (page >= result.pageCount) break;
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [cms, jobs, courses] = await Promise.all([
    Promise.all(
      CMS_COLLECTIONS.map(async ({ collection, priority, changeFrequency }) => {
        const slugs = await settle(`sitemap.${collection}`, () => getPublishedSlugs(collection), []);
        return slugs
          // Static pages without a fixed route (no catch-all page exists) are left out to avoid listing 404s.
          .filter((s) => s.path && s.path.startsWith("/") && (collection !== "pages" || FIXED_PAGE_PATHS.has(s.path)))
          .map((s) => ({ url: absoluteUrl(s.path), lastModified: s.contentUpdatedAt, changeFrequency, priority }));
      }),
    ),
    settle("sitemap.jobs", jobEntries, []),
    settle("sitemap.courses", courseEntries, []),
  ]);

  const seen = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];
  const push = (entry: MetadataRoute.Sitemap[number]) => {
    if (seen.has(entry.url)) return;
    seen.add(entry.url);
    entries.push(entry);
  };
  STATIC_ROUTES.forEach((r) => push({ url: absoluteUrl(r.path), lastModified: now, changeFrequency: r.changeFrequency, priority: r.priority }));
  cms.flat().forEach(push);
  jobs.forEach(push);
  courses.forEach(push);
  return entries;
}
