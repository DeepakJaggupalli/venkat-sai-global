import "server-only";

/**
 * Idempotent production seed for the notifications module (called by scripts/seed.ts).
 * Seeds: optional DB template overrides (code defaults are used otherwise).
 * Must be safe to run repeatedly (upsert / insert-if-missing). Never seed fake business data here.
 */
export async function seed(): Promise<void> {}
