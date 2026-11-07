import type { NextRequest } from "next/server";

import { logger } from "@/lib/logger";

import { firstIssue, jobCategorySearchSchema, pickParams } from "../_lib/params";
import { searchJobCategories } from "../_lib/queries";
import { jsonError, jsonItems } from "../_lib/respond";

/**
 * GET /api/v1/taxonomy/job-categories?q=weld&limit=20
 * Public typeahead over active job categories (case-insensitive substring match, prefix matches
 * first). An empty `q` returns the first categories in admin sort order.
 * Response: { items: { id, name, slug, parentId }[] }.
 */
export async function GET(request: NextRequest) {
  const parsed = jobCategorySearchSchema.safeParse(pickParams(request.nextUrl.searchParams, ["q", "limit"]));
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  try {
    const items = await searchJobCategories(parsed.data.q, parsed.data.limit);
    return jsonItems(items);
  } catch (error) {
    logger.error("Job category typeahead failed", { error });
    return jsonError("Job categories could not be loaded. Please try again.", 500);
  }
}
