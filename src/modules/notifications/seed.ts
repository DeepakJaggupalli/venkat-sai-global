import "server-only";

/**
 * Idempotent production seed for the notifications module (called by scripts/seed.ts).
 *
 * Deliberately inserts nothing: every event in events.ts has a code default template (templates.ts), and
 * notification_templates rows are administrator overrides. Seeding copies of the defaults would freeze them
 * (later wording fixes in code would never reach existing installations) and WhatsApp / DLT template ids are
 * account-specific, so they can only be entered by an administrator.
 */
export async function seed(): Promise<void> {
  // Nothing to seed — see the comment above.
}
