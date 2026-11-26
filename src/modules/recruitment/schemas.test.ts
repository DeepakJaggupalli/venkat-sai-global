import { describe, expect, it } from "vitest";

import { createOfferSchema, rescheduleInterviewSchema, scheduleInterviewSchema } from "./schemas";

const APP = "3a67bd75-3b59-4000-b6c1-0c8a7813ea16";
const interview = { applicationId: APP, roundName: "First interview", mode: "video", startsAtLocal: "2030-01-15T10:00", timezone: "Asia/Kolkata" } as const;

function messages(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, field: string): string[] {
  return (result.error?.issues ?? []).filter((i) => i.path.join(".") === field).map((i) => i.message);
}

describe("interview meeting link", () => {
  it("accepts http(s) links and no link", () => {
    expect(scheduleInterviewSchema.safeParse({ ...interview, meetingUrl: "https://meet.example.com/abc" }).success).toBe(true);
    expect(scheduleInterviewSchema.safeParse({ ...interview, meetingUrl: null }).success).toBe(true);
    expect(scheduleInterviewSchema.safeParse(interview).success).toBe(true);
  });

  it("refuses javascript:, data: and other non-web links with a plain message", () => {
    for (const link of ["javascript:alert(1)", "data:text/html,<b>x</b>", "file:///c:/x", "ftp://example.com/x", "meet.example.com/abc"]) {
      const result = scheduleInterviewSchema.safeParse({ ...interview, meetingUrl: link });
      expect(result.success, link).toBe(false);
      expect(messages(result, "meetingUrl"), link).toEqual(["Enter a meeting link starting with https://"]);
    }
    const reschedule = rescheduleInterviewSchema.safeParse({ interviewId: APP, startsAtLocal: "2030-01-15T10:00", timezone: "Asia/Kolkata", meetingUrl: "javascript:alert(1)" });
    expect(reschedule.success).toBe(false);
  });
});

describe("plain-English limits on typed numbers", () => {
  it("explains round numbers and offer contract length instead of raw validator text", () => {
    expect(messages(scheduleInterviewSchema.safeParse({ ...interview, roundNumber: 50 }), "roundNumber")).toEqual(["Enter 20 or less"]);
    expect(messages(scheduleInterviewSchema.safeParse({ ...interview, roundNumber: 0 }), "roundNumber")).toEqual(["Enter 1 or more"]);
    const offer = { applicationId: APP, jobTitle: "Welder" };
    expect(messages(createOfferSchema.safeParse({ ...offer, contractDurationMonths: 500 }), "contractDurationMonths")).toEqual(["Enter 120 or less"]);
    expect(messages(createOfferSchema.safeParse({ ...offer, salaryMinor: 1e20, salaryCurrency: "AED", salaryPeriod: "month" }), "salaryMinor")).toEqual(["Amount is too large"]);
  });
});
