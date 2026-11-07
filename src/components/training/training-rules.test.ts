import { describe, expect, it } from "vitest";

import {
  attendanceValue,
  batchCta,
  canWithdrawEnrolment,
  courseApplyPath,
  durationBucket,
  groupAssessments,
  groupEnrolments,
  isDurationFilter,
  isFinalResult,
  joinPlace,
  pageSlice,
  verificationPath,
} from "./training-rules";

describe("durationBucket", () => {
  it("prefers weeks over hours", () => {
    expect(durationBucket({ durationWeeks: 1, durationHours: 600 })).toBe("short");
    expect(durationBucket({ durationWeeks: 4, durationHours: null })).toBe("medium");
    expect(durationBucket({ durationWeeks: 12, durationHours: null })).toBe("long");
    expect(durationBucket({ durationWeeks: 13, durationHours: null })).toBe("extended");
  });

  it("falls back to hours", () => {
    expect(durationBucket({ durationWeeks: null, durationHours: 40 })).toBe("short");
    expect(durationBucket({ durationWeeks: null, durationHours: 41 })).toBe("medium");
    expect(durationBucket({ durationWeeks: null, durationHours: 480 })).toBe("long");
    expect(durationBucket({ durationWeeks: null, durationHours: 481 })).toBe("extended");
  });

  it("has no bucket without a stated duration", () => {
    expect(durationBucket({ durationWeeks: null, durationHours: null })).toBeNull();
    expect(durationBucket({ durationWeeks: 0, durationHours: 0 })).toBeNull();
  });

  it("validates filter values", () => {
    expect(isDurationFilter("short")).toBe(true);
    expect(isDurationFilter("forever")).toBe(false);
    expect(isDurationFilter(undefined)).toBe(false);
  });
});

describe("pageSlice", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  it("slices and counts pages", () => {
    expect(pageSlice(items, 2, 10)).toEqual({ items: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19], total: 25, page: 2, pageSize: 10, pageCount: 3 });
  });
  it("clamps out-of-range pages", () => {
    expect(pageSlice(items, 9, 10).page).toBe(3);
    expect(pageSlice([], 3, 10)).toMatchObject({ items: [], total: 0, page: 1, pageCount: 1 });
  });
});

describe("batchCta", () => {
  const today = "2026-11-07";
  it("offers applying to open batches with seats", () => {
    expect(batchCta({ status: "open", registrationDeadline: null, startsOn: "2026-12-01", seatsLeft: 4 }, today)).toBe("apply");
    expect(batchCta({ status: "open", registrationDeadline: today, startsOn: null, seatsLeft: null }, today)).toBe("apply");
  });
  it("offers the waitlist for full batches", () => {
    expect(batchCta({ status: "full", registrationDeadline: null, startsOn: null, seatsLeft: 0 }, today)).toBe("waitlist");
  });
  it("closes batches past the deadline and marks planned ones as not open", () => {
    expect(batchCta({ status: "open", registrationDeadline: "2026-11-06", startsOn: null, seatsLeft: 3 }, today)).toBe("closed");
    expect(batchCta({ status: "planned", registrationDeadline: null, startsOn: null, seatsLeft: 3 }, today)).toBe("not_open");
    expect(batchCta({ status: "in_progress", registrationDeadline: null, startsOn: null, seatsLeft: 3 }, today)).toBe("closed");
  });
});

describe("enrolments", () => {
  it("allows withdrawing only open enrolments", () => {
    expect(canWithdrawEnrolment("applied")).toBe(true);
    expect(canWithdrawEnrolment("waitlisted")).toBe(true);
    expect(canWithdrawEnrolment("confirmed")).toBe(true);
    expect(canWithdrawEnrolment("in_progress")).toBe(true);
    expect(canWithdrawEnrolment("completed")).toBe(false);
    expect(canWithdrawEnrolment("cancelled")).toBe(false);
    expect(canWithdrawEnrolment("rejected")).toBe(false);
  });

  it("groups current and past enrolments", () => {
    const { current, past } = groupEnrolments([{ status: "applied" as const }, { status: "completed" as const }, { status: "in_progress" as const }, { status: "cancelled" as const }]);
    expect(current.map((e) => e.status)).toEqual(["applied", "in_progress"]);
    expect(past.map((e) => e.status)).toEqual(["completed", "cancelled"]);
  });

  it("shows only final results", () => {
    expect(isFinalResult("passed")).toBe(true);
    expect(isFinalResult("failed")).toBe(true);
    expect(isFinalResult("pending")).toBe(false);
    expect(isFinalResult("not_applicable")).toBe(false);
  });

  it("normalises attendance", () => {
    expect(attendanceValue(87.5)).toBe(88);
    expect(attendanceValue(120)).toBe(100);
    expect(attendanceValue(null)).toBeNull();
    expect(attendanceValue(Number.NaN)).toBeNull();
  });
});

describe("groupAssessments", () => {
  const now = new Date("2026-11-07T10:00:00Z");
  it("splits upcoming (sorted soonest first) and past", () => {
    const items = [
      { id: "a", status: "scheduled" as const, scheduledAt: new Date("2026-11-20T04:00:00Z") },
      { id: "b", status: "scheduled" as const, scheduledAt: new Date("2026-11-08T04:00:00Z") },
      { id: "c", status: "completed" as const, scheduledAt: new Date("2026-10-01T04:00:00Z") },
      { id: "d", status: "cancelled" as const, scheduledAt: new Date("2026-11-30T04:00:00Z") },
      { id: "e", status: "scheduled" as const, scheduledAt: new Date("2026-11-07T04:00:00Z") },
      { id: "f", status: "scheduled" as const, scheduledAt: new Date("2026-11-01T04:00:00Z") },
    ];
    const { upcoming, past } = groupAssessments(items, now);
    expect(upcoming.map((i) => i.id)).toEqual(["e", "b", "a"]);
    expect(past.map((i) => i.id)).toEqual(["c", "d", "f"]);
  });
});

describe("helpers", () => {
  it("builds the public verification path from the verification code", () => {
    expect(verificationPath("ABCD-EFGH-JKMN")).toBe("/verify-certificate/ABCD-EFGH-JKMN");
  });
  it("joins place parts without blanks or repeats", () => {
    expect(joinPlace(["Workshop 2", " ", "Visakhapatnam", null, "Visakhapatnam"])).toBe("Workshop 2, Visakhapatnam");
    expect(joinPlace([null, ""])).toBeNull();
  });
});

describe("courseApplyPath", () => {
  it("links to the People Portal enrolment page of one batch", () => {
    expect(courseApplyPath("mig-welding", "1b6f0f3e-0000-4000-8000-000000000001")).toBe("/talent/training/courses/mig-welding/apply?batch=1b6f0f3e-0000-4000-8000-000000000001");
  });
  it("escapes unsafe slug characters", () => {
    expect(courseApplyPath("a b", "x&y")).toBe("/talent/training/courses/a%20b/apply?batch=x%26y");
  });
});
