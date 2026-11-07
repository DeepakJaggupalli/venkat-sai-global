import { describe, expect, it } from "vitest";

import { COLLECTIONS } from "./collections";
import {
  canPublish,
  canRollback,
  canScheduleUnpublish,
  canSchedulePublication,
  canTakeOffline,
  consentAllowsPublication,
  diffVersionContent,
  hasUnpublishedChanges,
  rowMirrorsLatest,
  sameContent,
  scheduleAfterPublish,
  sortOrdersFor,
  statusAfterClearingSchedule,
  statusAfterSchedule,
  type VersionContent,
  type VersionState,
} from "./versioning";

const now = new Date("2026-11-07T10:00:00Z");
const later = new Date("2026-11-08T10:00:00Z");

const state = (patch: Partial<VersionState> = {}): VersionState => ({
  status: "draft",
  currentVersion: 1,
  publishedVersion: null,
  scheduledVersion: null,
  publishAt: null,
  unpublishAt: null,
  deletedAt: null,
  ...patch,
});

const content = (patch: Partial<VersionContent> = {}): VersionContent => ({
  slug: "overseas-employment",
  title: "Overseas employment",
  summary: null,
  data: { overview: "<p>A</p>", enquiryType: "general" },
  seo: {},
  tags: [],
  heroAssetId: null,
  ...patch,
});

describe("versioning model", () => {
  it("mirrors the latest version on the row only while nothing is live", () => {
    expect(rowMirrorsLatest(state())).toBe(true);
    expect(rowMirrorsLatest(state({ status: "published", publishedVersion: 2, currentVersion: 3 }))).toBe(false);
    expect(hasUnpublishedChanges(state())).toBe(true);
    expect(hasUnpublishedChanges(state({ publishedVersion: 3, currentVersion: 3 }))).toBe(false);
    expect(hasUnpublishedChanges(state({ publishedVersion: 2, currentVersion: 3 }))).toBe(true);
  });

  it("only publishes existing versions of entries that are not archived or deleted", () => {
    expect(canPublish(state({ currentVersion: 2 }), 2).ok).toBe(true);
    expect(canPublish(state({ currentVersion: 2 }), 3).ok).toBe(false);
    expect(canPublish(state({ status: "archived" }), 1).ok).toBe(false);
    expect(canPublish(state({ deletedAt: now }), 1).ok).toBe(false);
  });

  it("schedules publication in the future and keeps the window ordered", () => {
    expect(canSchedulePublication(state(), 1, later, now).ok).toBe(true);
    expect(canSchedulePublication(state(), 1, now, now).ok).toBe(false);
    expect(canSchedulePublication(state({ unpublishAt: later }), 1, later, now).ok).toBe(false);
    expect(canScheduleUnpublish(state({ status: "published" }), later, now, null).ok).toBe(true);
    expect(canScheduleUnpublish(state({ status: "published" }), later, now, later).ok).toBe(false);
    expect(canScheduleUnpublish(state({ status: "archived" }), later, now, null).ok).toBe(false);
  });

  it("keeps a live entry published while an update is scheduled", () => {
    expect(statusAfterSchedule(state())).toBe("scheduled");
    expect(statusAfterSchedule(state({ status: "published", publishedVersion: 1 }))).toBe("published");
    expect(statusAfterClearingSchedule(state({ status: "scheduled" }))).toBe("draft");
    expect(statusAfterClearingSchedule(state({ status: "published" }))).toBe("published");
  });

  it("keeps only a schedule that pins a newer version after publishing", () => {
    expect(scheduleAfterPublish({ scheduledVersion: 3, publishAt: later }, 2)).toEqual({ scheduledVersion: 3, publishAt: later });
    expect(scheduleAfterPublish({ scheduledVersion: 2, publishAt: later }, 2)).toEqual({ scheduledVersion: null, publishAt: null });
    expect(scheduleAfterPublish({ scheduledVersion: null, publishAt: null }, 1)).toEqual({ scheduledVersion: null, publishAt: null });
  });

  it("takes offline only live or scheduled entries and rolls back only to older versions", () => {
    expect(canTakeOffline(state({ status: "published", publishedVersion: 1 })).ok).toBe(true);
    expect(canTakeOffline(state({ status: "draft" })).ok).toBe(false);
    expect(canRollback(state({ currentVersion: 3 }), 1).ok).toBe(true);
    expect(canRollback(state({ currentVersion: 3 }), 3).ok).toBe(false);
    expect(canRollback(state({ currentVersion: 3 }), 4).ok).toBe(false);
  });

  it("allows publication only with current, unexpired consent", () => {
    expect(consentAllowsPublication({ consentStatus: "obtained", consentExpiresAt: null }, now)).toBe(true);
    expect(consentAllowsPublication({ consentStatus: "obtained", consentExpiresAt: later }, now)).toBe(true);
    expect(consentAllowsPublication({ consentStatus: "obtained", consentExpiresAt: now }, now)).toBe(false);
    expect(consentAllowsPublication({ consentStatus: "pending", consentExpiresAt: null }, now)).toBe(false);
    expect(consentAllowsPublication({ consentStatus: "withdrawn", consentExpiresAt: null }, now)).toBe(false);
  });

  it("assigns sort orders with gaps", () => {
    expect([...sortOrdersFor(["a", "b", "c"]).entries()]).toEqual([
      ["a", 10],
      ["b", 20],
      ["c", 30],
    ]);
  });
});

describe("version diff", () => {
  const fields = COLLECTIONS.services.fields;

  it("detects identical content regardless of key order", () => {
    expect(sameContent(content(), content({ data: { enquiryType: "general", overview: "<p>A</p>" } }))).toBe(true);
    expect(sameContent(content(), content({ title: "Changed" }))).toBe(false);
  });

  it("lists field-level changes with editor labels", () => {
    const before = content({ data: { overview: "<p>A</p>", enquiryType: "general", benefits: ["One"] } });
    const after = content({
      title: "Overseas jobs",
      data: { overview: "<p>B</p>", enquiryType: "general", cta: { label: "Apply", href: "/jobs" } },
      seo: { description: "New" },
    });
    const changes = diffVersionContent(fields, before, after);
    const byPath = Object.fromEntries(changes.map((c) => [c.path, c]));
    expect(byPath.title).toMatchObject({ kind: "changed", before: "Overseas employment", after: "Overseas jobs" });
    expect(byPath["data.overview"]).toMatchObject({ kind: "changed", label: "Overview" });
    expect(byPath["data.benefits"]).toMatchObject({ kind: "removed" });
    expect(byPath["data.cta.label"]).toMatchObject({ kind: "added", label: "Call to action › Button text" });
    expect(byPath["seo.description"]).toMatchObject({ kind: "added", label: "SEO description" });
    expect(byPath["data.enquiryType"]).toBeUndefined();
  });

  it("reports keys that the collection no longer describes", () => {
    const changes = diffVersionContent(fields, content({ data: { legacy: "x" } }), content({ data: {} }));
    expect(changes.find((c) => c.path === "data.legacy")?.label).toMatch(/no longer used/);
  });
});
