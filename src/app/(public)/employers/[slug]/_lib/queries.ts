import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { jobs } from "@/db/schema";
import { loadJobVisibilityFlags, publicJobConditions } from "@/modules/jobs/filters";
import { hydrateJobCards, selectJobCardRows } from "@/modules/jobs/present";
import type { JobCard } from "@/modules/jobs/types";

/**
 * Publicly listed jobs of one employer for its public company page (read-only, server-only).
 * Uses the jobs module's single public-visibility rule and card hydration; confidential jobs are
 * excluded so a confidential requirement is never tied to the company's page.
 * TODO(core:jobs): replace with a module query such as listPublicJobsForOrganization(orgId, { limit }).
 */
export async function listCompanyPublicJobs(organizationId: string, limit = 12): Promise<JobCard[]> {
  const where = and(...publicJobConditions(await loadJobVisibilityFlags()), eq(jobs.organizationId, organizationId), eq(jobs.isConfidential, false));
  const rows = await selectJobCardRows(where, [desc(jobs.publishedAt)], Math.min(Math.max(limit, 1), 50));
  return hydrateJobCards(rows, { kind: "public" });
}
