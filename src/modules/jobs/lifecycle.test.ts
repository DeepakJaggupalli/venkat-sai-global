import { describe, expect, it } from "vitest";

import { jobDisplayStatus } from "./constants";
import { canTransition, changedReviewedFields, childSignature, computeListingWindow, parseZonedDateTime, publicationProblems, transitionError, zonedEndOfDay, type PublishableJob } from "./lifecycle";

const DAY = 86_400_000;

describe("transitions", () => {
  it("allows the documented lifecycle", () => {
    expect(canTransition("submit", "draft")).toBe(true);
    expect(canTransition("submit", "changes_requested")).toBe(true);
    expect(canTransition("submit", "published")).toBe(false);
    expect(canTransition("pause", "published")).toBe(true);
    expect(canTransition("resume", "paused")).toBe(true);
    expect(canTransition("close", "draft")).toBe(false);
    expect(canTransition("reopen", "closed")).toBe(true);
    expect(canTransition("delete", "published")).toBe(false);
    expect(canTransition("delete", "closed")).toBe(true);
    expect(canTransition("withdraw", "pending_approval")).toBe(true);
    expect(canTransition("archive", "published")).toBe(false);
  });

  it("explains refused transitions in plain words", () => {
    expect(transitionError("pause", "pending_approval")).toBe("A job that is pending approval cannot be paused.");
  });
});

describe("re-review detection", () => {
  it("flags changes to what candidates read, not to openings or deadlines", () => {
    const before = { title: "Pipe welder", benefits: ["Food", "Accommodation"], salaryMinMinor: 100_000, city: "Doha" };
    expect(changedReviewedFields(before, { title: "Pipe welder", benefits: ["Accommodation", "Food"], salaryMinMinor: 100_000, city: "Doha" })).toEqual([]);
    expect(changedReviewedFields(before, { title: "Senior pipe welder", salaryMinMinor: 90_000 })).toEqual(["title", "salaryMinMinor"]);
    expect(changedReviewedFields({ summary: null }, { summary: "" })).toEqual([]);
  });

  it("compares child lists regardless of order", () => {
    const a = [{ skillId: "s1", isRequired: true }, { skillId: "s2", isRequired: false }];
    const b = [{ skillId: "s2", isRequired: false }, { skillId: "s1", isRequired: true }];
    expect(childSignature(a, ["skillId", "isRequired"])).toBe(childSignature(b, ["skillId", "isRequired"]));
    expect(childSignature(a, ["skillId", "isRequired"])).not.toBe(childSignature([{ skillId: "s1", isRequired: false }], ["skillId", "isRequired"]));
  });
});

describe("listing window", () => {
  const now = new Date("2026-11-07T10:00:00Z");
  const base = { now, previousPublishedAt: null, scheduledPublishAt: null, currentExpiresAt: null, defaultDurationDays: 30, maxDays: 180 };

  it("defaults to the configured duration from go-live", () => {
    const w = computeListingWindow(base);
    expect(w.publishedAt).toEqual(now);
    expect(w.expiresAt.getTime() - now.getTime()).toBe(30 * DAY);
  });

  it("goes live at the scheduled time and counts the duration from then", () => {
    const at = new Date(now.getTime() + 2 * DAY);
    const w = computeListingWindow({ ...base, scheduledPublishAt: at });
    expect(w.publishedAt).toEqual(at);
    expect(w.expiresAt.getTime()).toBe(at.getTime() + 30 * DAY);
  });

  it("keeps the first publication date and a still-valid expiry on re-approval", () => {
    const first = new Date(now.getTime() - 10 * DAY);
    const expires = new Date(now.getTime() + 5 * DAY);
    const w = computeListingWindow({ ...base, previousPublishedAt: first, currentExpiresAt: expires });
    expect(w.publishedAt).toEqual(first);
    expect(w.expiresAt).toEqual(expires);
  });

  it("caps the window", () => {
    const w = computeListingWindow({ ...base, currentExpiresAt: new Date(now.getTime() + 400 * DAY) });
    expect(w.expiresAt.getTime()).toBe(now.getTime() + 180 * DAY);
  });
});

describe("publication problems", () => {
  const job: PublishableJob = {
    title: "Pipe welder",
    summary: null,
    descriptionHtml: "<p>Weld carbon steel pipe.</p>",
    workMode: "on_site",
    countryCode: "QA",
    applyMode: "platform",
    externalApplyUrl: null,
    isConfidential: false,
    organizationId: "org",
    confidentialEmployerName: null,
    applicationDeadline: null,
    expiresAt: null,
    salaryMinMinor: null,
    salaryMaxMinor: null,
  };
  it("accepts a complete job", () => {
    expect(publicationProblems(job)).toEqual([]);
  });
  it("lists what is missing", () => {
    const problems = publicationProblems({ ...job, descriptionHtml: "<p> </p>", countryCode: null, organizationId: null, applicationDeadline: new Date(Date.now() - DAY) });
    expect(problems).toEqual([
      "Add a job description or summary.",
      "Add the work location (country).",
      "Add the employer description shown on confidential jobs.",
      "The application deadline has passed. Choose a later date.",
    ]);
  });
  it("does not need a country for remote work", () => {
    expect(publicationProblems({ ...job, workMode: "remote", countryCode: null })).toEqual([]);
  });
});

describe("time zones", () => {
  it("reads deadlines as the end of the day in the platform time zone", () => {
    expect(zonedEndOfDay("2026-12-31", "Asia/Kolkata").toISOString()).toBe("2026-12-31T18:29:59.999Z");
    expect(zonedEndOfDay("2026-12-31", "UTC").toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });
  it("handles daylight saving time", () => {
    expect(zonedEndOfDay("2026-07-01", "Europe/London").toISOString()).toBe("2026-07-01T22:59:59.999Z");
  });
  it("reads datetime-local values as wall-clock time, explicit offsets as given", () => {
    expect(parseZonedDateTime("2026-12-01T09:30", "Asia/Kolkata").toISOString()).toBe("2026-12-01T04:00:00.000Z");
    expect(parseZonedDateTime("2026-12-01T09:30:00Z", "Asia/Kolkata").toISOString()).toBe("2026-12-01T09:30:00.000Z");
  });
});

describe("display status", () => {
  const now = new Date("2026-11-07T10:00:00Z");
  it("shows scheduled and expired states of published jobs", () => {
    expect(jobDisplayStatus({ status: "published", publishedAt: new Date(now.getTime() + DAY), expiresAt: null, applicationDeadline: null }, now)).toBe("scheduled");
    expect(jobDisplayStatus({ status: "published", publishedAt: now, expiresAt: new Date(now.getTime() - 1), applicationDeadline: null }, now)).toBe("expired");
    expect(jobDisplayStatus({ status: "published", publishedAt: now, expiresAt: null, applicationDeadline: null }, now)).toBe("published");
    expect(jobDisplayStatus({ status: "paused", publishedAt: now, expiresAt: null, applicationDeadline: null }, now)).toBe("paused");
  });
});
