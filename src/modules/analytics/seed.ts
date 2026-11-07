import "server-only";

/**
 * Idempotent production seed for the analytics module (called by scripts/seed.ts).
 * Seeds: default funnel definitions (spec 13.2 examples).
 * Must be safe to run repeatedly (upsert / insert-if-missing). Never seed fake business data here.
 */
export async function seed(): Promise<void> {}
