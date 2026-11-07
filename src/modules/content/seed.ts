import "server-only";

/**
 * Idempotent production seed for the content module (called by scripts/seed.ts).
 * Seeds: default CMS entries from the company-provided copy (no statistics, no testimonials), public metric definitions (hidden by default).
 * Must be safe to run repeatedly (upsert / insert-if-missing). Never seed fake business data here.
 */
export async function seed(): Promise<void> {}
