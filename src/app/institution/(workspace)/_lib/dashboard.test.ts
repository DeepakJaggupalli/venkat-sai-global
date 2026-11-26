import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { INSTITUTION_PERMISSIONS } from "@/config/permissions";

import {
  BATCH_VIEW_PERMISSIONS,
  INSTITUTION_ACTIONS,
  institutionHeaderActions,
  institutionQuickActions,
  institutionSetupChecklist,
  lastMonths,
  linkIf,
  monthKeyIn,
  monthlySeries,
  ratePercent,
  seatLine,
  seesOwnBatchesOnly,
  seatPercent,
  seatsLeft,
  verificationSummary,
} from "./dashboard";

const ALL = INSTITUTION_PERMISSIONS.map((p) => p.key);
// The seeded institution roles (src/config/permissions.ts).
const COORDINATOR = [
  "institution.dashboard",
  "institution.courses.manage",
  "institution.batches.manage",
  "institution.students.manage",
  "institution.assessments.manage",
  "institution.placements.manage",
  "institution.reports.view",
];
const INSTRUCTOR = ["institution.dashboard", "institution.students.manage", "institution.assessments.manage"];
const VIEWER = ["institution.dashboard", "institution.reports.view"];

const labels = (items: { label: string }[]) => items.map((i) => i.label);

/** True when `/institution/...` (query and hash ignored) is a real page in the institution workspace. */
const WORKSPACE = join(process.cwd(), "src", "app", "institution", "(workspace)");
function routeExists(href: string): boolean {
  const path = href.split(/[?#]/)[0]!;
  expect(path.startsWith("/institution")).toBe(true);
  const segments = path.split("/").filter(Boolean).slice(1);
  const walk = (dir: string, rest: string[]): boolean => {
    const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
    // Route groups add no URL segment.
    for (const group of entries.filter((e) => /^\(.+\)$/.test(e.name))) if (walk(join(dir, group.name), rest)) return true;
    if (rest.length === 0) return existsSync(join(dir, "page.tsx"));
    const [head, ...tail] = rest;
    const literal = entries.find((e) => e.name === head);
    if (literal && walk(join(dir, literal.name), tail)) return true;
    const dynamic = entries.find((e) => /^\[[^.].*\]$/.test(e.name));
    return dynamic ? walk(join(dir, dynamic.name), tail) : false;
  };
  return walk(WORKSPACE, segments);
}

describe("institution dashboard quick actions", () => {
  it("gives the owner every main button of the portal", () => {
    expect(labels(institutionQuickActions(ALL))).toEqual([
      "Add a course",
      "New batch",
      "Students",
      "Record assessment",
      "Issue certificates",
      "Placements",
      "Reports",
      "Profile and verification",
      "Announcements",
      "Team",
      "Billing",
      "Messages",
      "Support",
    ]);
  });

  it("leaves out buttons the page offers elsewhere", () => {
    const items = labels(institutionQuickActions(new Set(ALL), {}, { omit: ["profile"] }));
    expect(items).not.toContain("Profile and verification");
    expect(items).toHaveLength(12);
  });

  it("shows each role only what it can open", () => {
    expect(labels(institutionQuickActions(new Set(COORDINATOR)))).toEqual(["Add a course", "New batch", "Students", "Record assessment", "Placements", "Reports", "Messages", "Support"]);
    expect(labels(institutionQuickActions(INSTRUCTOR))).toEqual(["Students", "Record assessment", "Messages", "Support"]);
    expect(labels(institutionQuickActions(VIEWER))).toEqual(["Reports", "Messages", "Support"]);
    // Messages and support are open to every member, even with no permissions at all.
    expect(labels(institutionQuickActions([]))).toEqual(["Messages", "Support"]);
  });

  it("shows only real, positive counts as badges and sends badged buttons straight to the waiting items", () => {
    const items = institutionQuickActions(ALL, { applicationsToReview: 3, resultsToPublish: 0, readyForCertificate: null, unreadMessages: 2.7, openSupportRequests: Number.NaN });
    const by = (label: string) => items.find((i) => i.label === label)!;
    expect(by("Students")).toMatchObject({ badge: 3, badgeLabel: "to review", href: "/institution/students?status=applied" });
    expect(by("Record assessment").badge).toBeNull();
    expect(by("Issue certificates").badge).toBeNull();
    expect(by("Messages")).toMatchObject({ badge: 2, href: "/institution/messages?view=unread" });
    expect(by("Support")).toMatchObject({ badge: null, href: "/institution/support" });
    // Without a count the button keeps its normal link.
    expect(institutionQuickActions(ALL).find((i) => i.label === "Students")!.href).toBe("/institution/students");
  });

  it("puts at most two training actions in the header", () => {
    expect(labels(institutionHeaderActions(ALL))).toEqual(["Add a course", "New batch"]);
    expect(labels(institutionHeaderActions(INSTRUCTOR))).toEqual(["Students", "Record assessment"]);
    expect(labels(institutionHeaderActions(VIEWER))).toEqual(["Reports"]);
    expect(institutionHeaderActions([])).toEqual([]);
  });

  it("links every button to a real page of the institution workspace", () => {
    const hrefs = new Set<string>(INSTITUTION_ACTIONS.flatMap((a) => [a.href, a.badgeHref].filter((h): h is string => Boolean(h))));
    hrefs.add("/institution/batches?status=in_progress");
    hrefs.add("/institution/profile#verification");
    for (const item of institutionSetupChecklist(ALL, { profileComplete: false, documentsUploaded: false, verified: false, hasCourse: false, hasBatch: false })) hrefs.add(item.href);
    for (const href of hrefs) expect(routeExists(href), href).toBe(true);
    expect(routeExists("/institution/no-such-page")).toBe(false);
  });
});

describe("institution set-up checklist", () => {
  const facts = { profileComplete: true, documentsUploaded: false, verified: false, hasCourse: true, hasBatch: false };

  it("lists the five steps for the owner with real done flags", () => {
    const items = institutionSetupChecklist(ALL, facts);
    expect(items.map((i) => [i.id, i.done])).toEqual([
      ["profile", true],
      ["documents", false],
      ["verified", false],
      ["course", true],
      ["batch", false],
    ]);
    expect(Object.keys(items[0]!)).not.toContain("permission");
  });

  it("only lists steps the member can do", () => {
    expect(institutionSetupChecklist(COORDINATOR, facts).map((i) => i.id)).toEqual(["course", "batch"]);
    expect(institutionSetupChecklist(INSTRUCTOR, facts)).toEqual([]);
  });
});

describe("links and verification", () => {
  it("links only where the member may go", () => {
    expect(linkIf(INSTRUCTOR, "institution.courses.manage", "/institution/courses")).toBeNull();
    expect(linkIf(INSTRUCTOR, BATCH_VIEW_PERMISSIONS, "/institution/batches")).toBe("/institution/batches");
    expect(linkIf(VIEWER, BATCH_VIEW_PERMISSIONS, "/institution/batches")).toBeNull();
    expect(linkIf([], undefined, "/institution/messages")).toBe("/institution/messages");
  });

  it("counts only an instructor's own batches; coordinators and overview roles see the whole institution", () => {
    expect(seesOwnBatchesOnly(INSTRUCTOR)).toBe(true);
    expect(seesOwnBatchesOnly(["institution.dashboard", "institution.assessments.manage"])).toBe(true);
    expect(seesOwnBatchesOnly(COORDINATOR)).toBe(false);
    expect(seesOwnBatchesOnly(ALL)).toBe(false);
    expect(seesOwnBatchesOnly(VIEWER)).toBe(false);
    expect(seesOwnBatchesOnly(["institution.dashboard", "institution.placements.manage"])).toBe(false);
  });

  it("describes every verification state in plain words", () => {
    expect(verificationSummary("verified")).toMatchObject({ label: "Verified", tone: "success", needsAction: false });
    expect(verificationSummary("verified", { daysLeft: 30 })).toMatchObject({ tone: "success", needsAction: true });
    expect(verificationSummary("verified", { daysLeft: 30 }).text).toContain("30 days");
    expect(verificationSummary("verified", { daysLeft: 1 }).text).toContain("1 day.");
    expect(verificationSummary("verified", { daysLeft: 7 }).tone).toBe("warning");
    expect(verificationSummary("verified", { daysLeft: 0 }).text).toContain("today");
    expect(verificationSummary("verified", { daysLeft: 200 }).needsAction).toBe(false);
    expect(verificationSummary("pending")).toMatchObject({ label: "In review", tone: "info", needsAction: false });
    expect(verificationSummary("under_review").label).toBe("In review");
    expect(verificationSummary("rejected")).toMatchObject({ tone: "danger", needsAction: true });
    expect(verificationSummary("suspended")).toMatchObject({ tone: "danger", needsAction: true });
    expect(verificationSummary("expired")).toMatchObject({ tone: "warning", needsAction: true });
    expect(verificationSummary("draft")).toMatchObject({ label: "Not verified yet", tone: "neutral", needsAction: true });
  });
});

describe("chart months, seats and rates", () => {
  it("buckets months in India time, across a year end", () => {
    // 19:00 UTC on 31 Dec is already 1 Jan in India.
    expect(monthKeyIn(new Date("2026-12-31T19:00:00Z"))).toBe("2027-01");
    expect(monthKeyIn(new Date("2026-12-31T19:00:00Z"), "UTC")).toBe("2026-12");
    const months = lastMonths(new Date("2027-02-10T06:00:00Z"), 6);
    expect(months.map((m) => m.key)).toEqual(["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(months[5]!.label).toMatch(/^Feb/);
  });

  it("fills missing months with zero and ignores rows outside the window", () => {
    const months = lastMonths(new Date("2026-11-26T06:00:00Z"), 3);
    const series = monthlySeries(months, [
      { month: "2026-11", value: 4 },
      { month: "2026-09", value: 2 },
      { month: "2026-09", value: 1 },
      { month: "2025-01", value: 99 },
      { month: "2026-10", value: Number.NaN },
    ]);
    expect(series.map((d) => d.value)).toEqual([3, 0, 4]);
  });

  it("works out seats without going below zero", () => {
    expect(seatsLeft({ capacity: 55, filled: 13 })).toBe(42);
    expect(seatsLeft({ capacity: 10, filled: 12 })).toBe(0);
    expect(seatLine(4, 10)).toBe("4 of 10 seats");
    expect(seatLine(4, null)).toBe("4 enrolled");
    expect(seatPercent(5, 20)).toBe(25);
    expect(seatPercent(30, 20)).toBe(100);
    expect(seatPercent(3, null)).toBeNull();
    expect(seatPercent(3, 0)).toBeNull();
  });

  it("returns no rate when there is nothing to divide by", () => {
    expect(ratePercent(1, 4)).toBe(25);
    expect(ratePercent(2, 3)).toBe(67);
    expect(ratePercent(0, 0)).toBeNull();
    expect(ratePercent(5, 4)).toBe(100);
    expect(ratePercent(Number.NaN, 4)).toBeNull();
  });
});
