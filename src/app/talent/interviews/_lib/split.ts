/** Interviews still to come (scheduled / rescheduled, not yet ended) soonest first; the rest newest first. */
export function splitInterviews<T extends { status: string; scheduledStart: Date; scheduledEnd: Date | null }>(interviews: T[], now: Date = new Date()): { upcoming: T[]; past: T[] } {
  const at = now.getTime();
  const isUpcoming = (i: T) => (i.status === "scheduled" || i.status === "rescheduled") && (i.scheduledEnd ?? i.scheduledStart).getTime() >= at;
  return {
    upcoming: interviews.filter(isUpcoming).sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime()),
    past: interviews.filter((i) => !isUpcoming(i)).sort((a, b) => b.scheduledStart.getTime() - a.scheduledStart.getTime()),
  };
}
