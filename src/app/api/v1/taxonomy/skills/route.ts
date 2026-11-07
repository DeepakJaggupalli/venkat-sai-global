import type { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { searchSkills } from "@/modules/taxonomy/queries";

import { firstIssue, pickParams, skillSearchSchema } from "../_lib/params";
import { jsonError, jsonItems } from "../_lib/respond";

/**
 * GET /api/v1/taxonomy/skills?q=weld&category=trade&limit=15
 * Public typeahead over approved, active skills (name + synonyms, trigram-ranked). Read-only
 * reference data: no authentication; input validated; at most 25 results.
 * Response: { items: { id, name, category, slug }[] } — empty `q` returns no items.
 */
export async function GET(request: NextRequest) {
  const parsed = skillSearchSchema.safeParse(pickParams(request.nextUrl.searchParams, ["q", "category", "limit"]));
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  const { q, category, limit } = parsed.data;
  if (!q) return jsonItems([]);
  try {
    const items = await searchSkills(q, { category, limit });
    return jsonItems(items);
  } catch (error) {
    logger.error("Skill typeahead failed", { error });
    return jsonError("Skills could not be loaded. Please try again.", 500);
  }
}
