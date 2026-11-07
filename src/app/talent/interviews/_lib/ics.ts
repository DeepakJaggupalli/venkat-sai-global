/**
 * iCalendar (RFC 5545) export of one interview (pure, unit-tested). Times are written in UTC so every
 * calendar shows them in the viewer's own zone; the interview's zone is named in the description.
 */
export type IcsInterview = {
  id: string;
  code: string;
  title: string;
  start: Date;
  end: Date | null;
  durationMinutesFallback?: number;
  location: string | null;
  meetingUrl: string | null;
  description: string | null;
  cancelled: boolean;
  url?: string | null;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 20261107T093000Z */
export function icsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Escape text values: backslash, semicolon, comma and newlines. */
export function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets (continuation lines start with a space). */
export function icsFold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const len = new TextEncoder().encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + len > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += len;
  }
  parts.push(current);
  return parts.map((p, i) => (i === 0 ? p : ` ${p}`)).join("\r\n");
}

export function buildInterviewIcs(interview: IcsInterview, opts: { productId?: string; now?: Date; domain?: string } = {}): string {
  const end = interview.end ?? new Date(interview.start.getTime() + (interview.durationMinutesFallback ?? 60) * 60_000);
  const location = [interview.location, interview.meetingUrl].filter(Boolean).join(" · ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${opts.productId ?? "-//Venkat Sai Global//Interviews//EN"}`,
    "CALSCALE:GREGORIAN",
    `METHOD:${interview.cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${interview.id}@${opts.domain ?? "venkatsaiglobal"}`,
    `DTSTAMP:${icsDate(opts.now ?? new Date())}`,
    `DTSTART:${icsDate(interview.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(interview.title)}`,
    location ? `LOCATION:${icsEscape(location)}` : null,
    interview.description ? `DESCRIPTION:${icsEscape(interview.description)}` : null,
    interview.url ? `URL:${interview.url}` : null,
    `STATUS:${interview.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => l !== null);
  return `${lines.map(icsFold).join("\r\n")}\r\n`;
}
