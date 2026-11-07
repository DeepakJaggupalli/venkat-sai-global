import "server-only";

/**
 * Idempotent production seed for the commercial module (called by scripts/seed.ts).
 * Seeds: tax rate definitions (e.g. India GST CGST/SGST/IGST); no plans or prices.
 * Must be safe to run repeatedly (upsert / insert-if-missing). Never seed fake business data here.
 */
export async function seed(): Promise<void> {}
