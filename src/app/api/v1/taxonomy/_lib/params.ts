import { z } from "zod";

import { SKILL_CATEGORIES } from "@/db/schema/_constants";

/**
 * Query-string validation for the public taxonomy typeahead endpoints (pure; unit-tested).
 * Blank values are treated as absent so `?category=` behaves like no filter.
 */
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const MAX_QUERY_LENGTH = 80;

export const skillSearchSchema = z.object({
  q: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().trim().max(MAX_QUERY_LENGTH, "Search text is too long")),
  category: z.preprocess(blankToUndefined, z.enum(SKILL_CATEGORIES, { error: "Unknown skill category" }).optional()),
  limit: z.preprocess(blankToUndefined, z.coerce.number().int("Limit must be a whole number").min(1).max(25).default(15)),
});

export const jobCategorySearchSchema = z.object({
  q: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().trim().max(MAX_QUERY_LENGTH, "Search text is too long")),
  limit: z.preprocess(blankToUndefined, z.coerce.number().int("Limit must be a whole number").min(1).max(50).default(20)),
});

export type SkillSearchParams = z.output<typeof skillSearchSchema>;
export type JobCategorySearchParams = z.output<typeof jobCategorySearchSchema>;

/** URLSearchParams → plain object of first values (only the keys a schema reads). */
export function pickParams(params: URLSearchParams, keys: readonly string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((k) => [k, params.get(k) ?? undefined]));
}

/** Escape LIKE/ILIKE wildcards so user input matches literally (PostgreSQL default escape is "\"). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** First validation message, for a concise 400 response. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid query";
}
