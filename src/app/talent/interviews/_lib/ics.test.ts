import { describe, expect, it } from "vitest";

import { buildInterviewIcs, icsDate, icsEscape, icsFold } from "./ics";

describe("ics helpers", () => {
  it("formats UTC dates", () => {
    expect(icsDate(new Date("2026-11-07T04:05:06Z"))).toBe("20261107T040506Z");
  });

  it("escapes special characters", () => {
    expect(icsEscape("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("folds long lines at 75 octets", () => {
    const folded = icsFold(`DESCRIPTION:${"x".repeat(200)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(lines.slice(1).every((l) => l.startsWith(" "))).toBe(true);
  });

  it("does not split multi-byte characters", () => {
    const original = `SUMMARY:${"ఇంటర్వ్యూ ".repeat(20)}`;
    const folded = icsFold(original);
    expect(folded.split(String.fromCharCode(13, 10, 32)).join("")).toBe(original);
  });
});

describe("buildInterviewIcs", () => {
  const base = {
    id: "3f6f4a5e-1111-4222-8333-944455556666",
    code: "VSG-INT-000001",
    title: "Interview: Welder",
    start: new Date("2026-12-01T05:30:00Z"),
    end: null,
    location: "Auto Nagar, Visakhapatnam",
    meetingUrl: null,
    description: "Bring your ID",
    cancelled: false,
  };

  it("builds a published event with a default one-hour duration", () => {
    const ics = buildInterviewIcs(base, { now: new Date("2026-11-07T00:00:00Z") });
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("DTSTART:20261201T053000Z");
    expect(ics).toContain("DTEND:20261201T063000Z");
    expect(ics).toContain("LOCATION:Auto Nagar\\, Visakhapatnam");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("marks cancelled interviews", () => {
    const ics = buildInterviewIcs({ ...base, cancelled: true });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
  });
});
