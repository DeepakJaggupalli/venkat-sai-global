import "server-only";

/**
 * Idempotent production seed for the training module (called by scripts/seed.ts).
 * Seeds: Venkat Sai assessment centre placeholder only if configured; usually nothing.
 * Must be safe to run repeatedly (upsert / insert-if-missing). Never seed fake business data here.
 */
export async function seed(): Promise<void> {}
