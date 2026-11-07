import "server-only";

/**
 * Idempotent production seed for the training module (called by scripts/seed.ts).
 *
 * Intentionally seeds nothing: assessment centres, courses and batches describe real Venkat Sai facilities
 * and programmes and are entered by staff in the Command Centre (centres.ts / courses.ts). Never seed
 * sample or placeholder business data here.
 */
export async function seed(): Promise<void> {}
