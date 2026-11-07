import { describe, expect, it } from "vitest";

import { partnerSubmissionSchema } from "@/modules/recruitment/schemas";

import { daysUntil, formatExperience, formatRate, labelOf, SUBMISSION_STATUS } from "./labels";
import { buildSubmissionPayload, experienceMonths } from "./submission-payload";

const ASSIGNMENT = "6f1c2b8e-3d4a-4e5f-8a9b-0c1d2e3f4a5b";
const CANDIDATE = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

describe("buildSubmissionPayload", () => {
  it("builds a valid payload for a previously sourced candidate", () => {
    const payload = buildSubmissionPayload(ASSIGNMENT, "existing", { candidateId: CANDIDATE, consentMethod: "written", consentAttested: "true", partnerNotes: "  Available now " });
    const parsed = partnerSubmissionSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    expect(payload.candidate).toEqual({ kind: "existing", candidateId: CANDIDATE });
    expect(payload.partnerNotes).toBe("Available now");
    expect(payload.jobId).toBeNull();
  });

  it("builds a valid payload for a new person and converts experience to months", () => {
    const payload = buildSubmissionPayload(ASSIGNMENT, "new", {
      fullName: " Ravi Kumar ",
      phone: "+919848012345",
      experienceYears: "4.5",
      nationalityCode: "IN",
      preferredLocale: "te",
      consentMethod: "verbal",
      consentCapturedOn: "2026-11-01",
      consentAttested: "true",
    });
    const parsed = partnerSubmissionSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (payload.candidate.kind !== "new") throw new Error("expected a new candidate");
    expect(payload.candidate.fullName).toBe("Ravi Kumar");
    expect(payload.candidate.totalExperienceMonths).toBe(54);
    expect(payload.candidate.email).toBeNull();
    expect(payload.candidate.preferredLocale).toBe("te");
  });

  it("reports a missing consent attestation and missing contact through the schema", () => {
    const payload = buildSubmissionPayload(ASSIGNMENT, "new", { fullName: "Asha", consentMethod: "written" });
    const parsed = partnerSubmissionSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    const paths = parsed.success ? [] : parsed.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("consent.attested");
    expect(paths).toContain("candidate.email");
  });

  it("ignores unknown locales", () => {
    const payload = buildSubmissionPayload(ASSIGNMENT, "new", { fullName: "A", email: "a@example.com", preferredLocale: "fr", consentAttested: "true", consentMethod: "written" });
    if (payload.candidate.kind !== "new") throw new Error("expected a new candidate");
    expect(payload.candidate.preferredLocale).toBeUndefined();
  });
});

describe("experienceMonths", () => {
  it("handles blanks, negatives and caps", () => {
    expect(experienceMonths(undefined)).toBeNull();
    expect(experienceMonths(" ")).toBeNull();
    expect(experienceMonths("-1")).toBeNull();
    expect(experienceMonths("abc")).toBeNull();
    expect(experienceMonths("2")).toBe(24);
    expect(experienceMonths("100")).toBe(720);
  });
});

describe("display helpers", () => {
  it("counts calendar days until a date", () => {
    const now = new Date("2026-11-07T18:30:00Z");
    expect(daysUntil("2026-11-07", now)).toBe(0);
    expect(daysUntil("2026-11-10", now)).toBe(3);
    expect(daysUntil("2026-11-01", now)).toBe(-6);
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil("not a date", now)).toBeNull();
  });

  it("formats rates and experience honestly", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(0.125)).toBe("12.5%");
    expect(formatRate(1)).toBe("100%");
    expect(formatExperience(null)).toBeNull();
    expect(formatExperience(0)).toBe("Less than a month");
    expect(formatExperience(13)).toBe("1 year 1 month");
    expect(formatExperience(26)).toBe("2 years 2 months");
  });

  it("falls back to a humanised neutral label for unknown statuses", () => {
    expect(labelOf(SUBMISSION_STATUS, "accepted").tone).toBe("success");
    expect(labelOf(SUBMISSION_STATUS, "on_hold")).toEqual({ label: "On hold", tone: "neutral" });
  });
});
