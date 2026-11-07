import "server-only";

/**
 * Idempotent production seed for the recruitment module (called by scripts/seed.ts).
 * Seeds: default application workflow + stages (spec 8.5 / 9.5).
 * Must be safe to run repeatedly (upsert / insert-if-missing). Never seed fake business data here.
 */
export async function seed(): Promise<void> {}
