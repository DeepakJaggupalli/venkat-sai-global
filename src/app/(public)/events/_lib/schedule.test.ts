import { describe, expect, it } from "vitest";

import { countryName, eventTiming, formatEventSchedule, registrationState } from "./schedule";

const NOW = new Date("2026-11-10T06:00:00Z");

describe("eventTiming", () => {
  it("classifies upcoming, ongoing and past events", () => {
    expect(eventTiming("2026-11-12T04:30:00Z", "2026-11-12T10:30:00Z", NOW)).toBe("upcoming");
    expect(eventTiming("2026-11-10T04:30:00Z", "2026-11-10T10:30:00Z", NOW)).toBe("ongoing");
    expect(eventTiming("2026-11-01T04:30:00Z", "2026-11-01T10:30:00Z", NOW)).toBe("past");
  });

  it("treats an event without an end as a moment in time", () => {
    expect(eventTiming("2026-11-09T04:30:00Z", null, NOW)).toBe("past");
    expect(eventTiming(null, null, NOW)).toBe("unscheduled");
  });
});

describe("registrationState", () => {
  it("is none when there is no link and registration is not required", () => {
    expect(registrationState({ required: false, url: "" }, "upcoming", NOW)).toEqual({ kind: "none" });
    expect(registrationState(null, "upcoming", NOW)).toEqual({ kind: "none" });
  });

  it("closes after the deadline or once the event is over", () => {
    expect(registrationState({ url: "https://example.org/r", deadline: "2026-11-09T00:00:00Z" }, "upcoming", NOW)).toEqual({ kind: "closed", reason: "deadline" });
    expect(registrationState({ url: "https://example.org/r" }, "past", NOW)).toEqual({ kind: "closed", reason: "event_over" });
  });

  it("is open before the deadline", () => {
    const state = registrationState({ required: true, url: "https://example.org/r", deadline: "2026-11-11T00:00:00Z" }, "upcoming", NOW);
    expect(state.kind).toBe("open");
    if (state.kind === "open") {
      expect(state.required).toBe(true);
      expect(state.deadline?.toISOString()).toBe("2026-11-11T00:00:00.000Z");
    }
  });
});

describe("formatEventSchedule", () => {
  it("shows a same-day range once, in the event's zone", () => {
    const text = formatEventSchedule("2026-11-14T04:30:00Z", "2026-11-14T10:30:00Z", "Asia/Kolkata");
    expect(text).toContain("14 Nov 2026");
    expect(text).toContain("10:00");
    expect(text).toContain("4:00");
    expect(text.match(/2026/g)).toHaveLength(1);
  });

  it("shows both days for multi-day events", () => {
    const text = formatEventSchedule("2026-11-14T04:30:00Z", "2026-11-15T07:30:00Z", "Asia/Kolkata");
    expect(text).toContain("14 Nov 2026");
    expect(text).toContain("15 Nov 2026");
  });

  it("handles a missing start", () => {
    expect(formatEventSchedule("not a date", null, "Asia/Kolkata")).toBe("Date to be announced");
  });
});

describe("countryName", () => {
  it("names countries and tolerates bad input", () => {
    expect(countryName("ae")).toBe("United Arab Emirates");
    expect(countryName(null)).toBeNull();
  });
});
