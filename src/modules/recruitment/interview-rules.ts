/**
 * Interview reminder timing (pure, client-safe).
 */

/** Reminders go out 24 hours and 2 hours before an interview. */
export const REMINDER_OFFSETS = [
  { key: "24h", ms: 24 * 60 * 60 * 1000 },
  { key: "2h", ms: 2 * 60 * 60 * 1000 },
] as const;

export type InterviewReminder = (typeof REMINDER_OFFSETS)[number];

/**
 * Which reminder (if any) is due for an interview starting at `start`: the closest offset whose
 * window has opened (the 2 h reminder supersedes the 24 h one once it is due).
 */
export function dueReminder(start: Date, now: Date): InterviewReminder | null {
  const remaining = start.getTime() - now.getTime();
  if (remaining <= 0) return null;
  const opened = REMINDER_OFFSETS.filter((o) => remaining <= o.ms);
  return opened.length ? opened[opened.length - 1]! : null;
}
