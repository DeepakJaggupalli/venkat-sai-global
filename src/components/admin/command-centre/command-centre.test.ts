import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_ROLES, PLATFORM_PERMISSIONS } from "@/config/permissions";
import { formatMoney } from "@/lib/format";

import {
  allows,
  bucketSeries,
  COMMAND_CENTRE_ACTIONS,
  commandCentreAccess,
  dayLabel,
  fillDailySeries,
  filterAllowed,
  headerActions,
  istDate,
  istDayStart,
  moneyLine,
  roleLabel,
  seatState,
  tileColumns,
  timeLabel,
} from "./config";
import { barPercent } from "./ranked-bars";

const APP_DIR = path.resolve(__dirname, "../../../app");
const rolePermissions = (key: string) => new Set(DEFAULT_ROLES.find((r) => r.scope === "platform" && r.key === key)!.permissions);
const ALL = new Set<string>(PLATFORM_PERMISSIONS.map((p) => p.key));
const keysFor = (permissions: ReadonlySet<string>) => filterAllowed(COMMAND_CENTRE_ACTIONS, permissions).map((a) => a.key);

/** src/app page file behind an /admin href (route groups like (index) and (dashboard) are folded in). */
function pageFileFor(href: string): string | null {
  const segments = href.split(/[?#]/)[0]!.split("/").filter(Boolean);
  const walk = (dir: string, rest: string[]): string | null => {
    if (rest.length === 0) {
      if (existsSync(path.join(dir, "page.tsx"))) return path.join(dir, "page.tsx");
      for (const group of ["(index)", "(dashboard)"]) if (existsSync(path.join(dir, group, "page.tsx"))) return path.join(dir, group, "page.tsx");
      return null;
    }
    const [head, ...tail] = rest;
    if (existsSync(path.join(dir, head!))) return walk(path.join(dir, head!), tail);
    if (existsSync(path.join(dir, "[collection]"))) return walk(path.join(dir, "[collection]"), tail);
    return null;
  };
  return walk(APP_DIR, segments);
}

/** Constants some pages pass to requireStaff(), as their values. */
const PERMISSION_CONSTANTS: Record<string, string[]> = {
  POSTER_PERMISSIONS: ["content.edit", "media.manage"],
  BOOKINGS_PERMISSION: ["recruitment.assessments"],
  BACKUP_PERMISSION: ["settings.security"],
};

/** What the page itself demands: requireStaff("x"), requireStaff(["x", "y"], "any"), requireStaff([...CONST]). */
function pageRule(file: string): { permissions: string[]; mode: "all" | "any" } {
  const source = readFileSync(file, "utf8");
  const m = /requireStaff\(([^)]*)\)/.exec(source);
  if (!m) return { permissions: [], mode: "all" };
  const arg = m[1]!;
  const permissions = [...arg.matchAll(/"([a-z_]+\.[a-z_.]+)"/g)].map((x) => x[1]!);
  for (const [name, values] of Object.entries(PERMISSION_CONSTANTS)) if (arg.includes(name)) permissions.push(...values);
  return { permissions: [...new Set(permissions)].sort(), mode: /"any"\s*$/.test(arg.trim()) ? "any" : "all" };
}

describe("Command Centre quick actions", () => {
  it("every button opens a real page that its viewer is allowed to open (never a no-access screen)", () => {
    for (const action of COMMAND_CENTRE_ACTIONS) {
      const file = pageFileFor(action.href);
      expect(file, action.href).not.toBeNull();
      const rule = pageRule(file!);
      const pageAllows = (held: ReadonlySet<string>) =>
        rule.permissions.length === 0 || (rule.mode === "all" ? rule.permissions.every((x) => held.has(x)) : rule.permissions.some((x) => held.has(x)));
      const mine = typeof action.permission === "string" ? [action.permission] : [...(action.permission ?? [])];
      // The smallest permission sets that show the button must all open the page.
      const minimal = (action.mode ?? "all") === "all" ? [new Set<string>(mine)] : mine.map((x) => new Set([x]));
      for (const held of minimal) expect(pageAllows(held), `${action.key} -> ${action.href}`).toBe(true);
      // And the button is not stricter than needed without a reason: it asks for at least what the page asks for.
      expect(
        rule.permissions.every((x) => mine.includes(x)),
        action.key,
      ).toBe(true);
    }
  });

  it("has unique keys and covers every main job the owner asked for", () => {
    const keys = COMMAND_CENTRE_ACTIONS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of [
      "post-requirement",
      "cvs",
      "import-cvs",
      "matching-cvs",
      "bookings",
      "worker-invoice",
      "reviews",
      "referrals",
      "training-batches",
      "content",
      "users",
      "settings",
      "backup",
      "owner-overview",
    ]) {
      expect(keys).toContain(key);
    }
  });

  it("shows the Super Admin every button", () => {
    expect(keysFor(ALL)).toHaveLength(COMMAND_CENTRE_ACTIONS.length);
  });

  it("shows each staff role only what it can open", () => {
    const recruiter = keysFor(rolePermissions("recruiter"));
    expect(recruiter).toEqual(
      expect.arrayContaining(["cvs", "import-cvs", "requirements", "bookings", "approvals", "reviews", "referrals", "support", "owner-overview"]),
    );
    for (const hidden of ["post-requirement", "matching-cvs", "worker-invoice", "content", "users", "settings", "backup", "leads", "training-batches"])
      expect(recruiter).not.toContain(hidden);

    const finance = keysFor(rolePermissions("finance"));
    expect(finance).toEqual(expect.arrayContaining(["worker-invoice", "approvals", "support", "owner-overview"]));
    for (const hidden of ["cvs", "import-cvs", "post-requirement", "bookings", "backup"]) expect(finance).not.toContain(hidden);

    const content = keysFor(rolePermissions("content_manager"));
    expect(content).toEqual(expect.arrayContaining(["post-requirement", "content", "approvals"]));
    for (const hidden of ["cvs", "matching-cvs", "worker-invoice", "users", "backup"]) expect(content).not.toContain(hidden);

    expect(keysFor(rolePermissions("training_coordinator"))).toEqual(expect.arrayContaining(["training-batches", "bookings"]));
    expect(keysFor(rolePermissions("operations_manager"))).not.toContain("backup");
    expect(keysFor(rolePermissions("administrator"))).not.toContain("backup");
  });

  it("shows nothing but always-allowed buttons to a role with no permissions", () => {
    expect(keysFor(new Set())).toEqual([]);
  });

  it("puts at most three allowed actions in the header, best first", () => {
    expect(headerActions(filterAllowed(COMMAND_CENTRE_ACTIONS, ALL)).map((a) => a.key)).toEqual(["post-requirement", "cvs", "owner-overview"]);
    expect(headerActions(filterAllowed(COMMAND_CENTRE_ACTIONS, rolePermissions("finance"))).map((a) => a.key)).toEqual([
      "owner-overview",
      "approvals",
      "support",
    ]);
    expect(headerActions([])).toEqual([]);
  });
});

describe("permission rules", () => {
  it("follows staffCan: none = everyone, a list needs all unless mode is any", () => {
    const p = new Set(["a.view"]);
    expect(allows(p, {})).toBe(true);
    expect(allows(p, { permission: "a.view" as never })).toBe(true);
    expect(allows(p, { permission: ["a.view", "b.view"] as never })).toBe(false);
    expect(allows(p, { permission: ["a.view", "b.view"] as never, mode: "any" })).toBe(true);
    expect(allows(p, { permission: "b.view" as never })).toBe(false);
  });

  it("maps figures to the permission of the page each one opens", () => {
    const recruiter = commandCentreAccess(rolePermissions("recruiter"));
    expect(recruiter).toMatchObject({
      cvs: true,
      candidateCare: true,
      requirements: true,
      bookings: true,
      approvals: true,
      support: true,
      money: false,
      leads: false,
      posters: false,
      posterApplicants: false,
      setup: false,
      grievances: false,
    });
    const finance = commandCentreAccess(rolePermissions("finance"));
    expect(finance).toMatchObject({ cvs: false, money: true, orgs: true, approvals: true, bookings: false });
    const content = commandCentreAccess(rolePermissions("content_manager"));
    expect(content).toMatchObject({ posters: true, posterApplicants: false, cvs: false });
    const owner = commandCentreAccess(ALL);
    expect(Object.values(owner).every(Boolean)).toBe(true);
    expect(Object.values(commandCentreAccess(new Set())).some(Boolean)).toBe(false);
  });
});

describe("India-time dates and series", () => {
  // 20:00 UTC on 25 Nov is 01:30 on 26 Nov in India.
  const now = new Date("2026-11-25T20:00:00Z");

  it("uses the India calendar day", () => {
    expect(istDate(now)).toBe("2026-11-26");
    expect(istDate(now, 1)).toBe("2026-11-25");
    expect(istDayStart(now).toISOString()).toBe("2026-11-25T18:30:00.000Z");
    expect(istDayStart(now, 6).toISOString()).toBe("2026-11-19T18:30:00.000Z");
    expect(dayLabel("2026-11-16")).toBe("16 Nov");
  });

  it("fills missing days with zero, oldest first, today last", () => {
    const series = fillDailySeries(
      [
        { day: "2026-11-26", count: 3 },
        { day: "2026-11-20", count: 1 },
        { day: "2026-10-01", count: 9 },
      ],
      now,
      14,
    );
    expect(series).toHaveLength(14);
    expect(series[0]!.day).toBe("2026-11-13");
    expect(series.at(-1)).toEqual({ day: "2026-11-26", label: "26 Nov", value: 3 });
    expect(series.find((d) => d.day === "2026-11-20")!.value).toBe(1);
    expect(series.reduce((a, d) => a + d.value, 0)).toBe(4);
  });

  it("buckets days into weeks that end today without losing any", () => {
    const daily = fillDailySeries(
      [
        { day: "2026-11-26", count: 2 },
        { day: "2026-11-19", count: 5 },
        { day: "2026-08-29", count: 1 },
      ],
      now,
      90,
    );
    const weeks = bucketSeries(daily, 7);
    expect(weeks).toHaveLength(13);
    expect(weeks.reduce((a, d) => a + d.value, 0)).toBe(daily.reduce((a, d) => a + d.value, 0));
    expect(weeks.at(-1)).toMatchObject({ day: "2026-11-20", value: 2 });
    expect(weeks.at(-2)).toMatchObject({ day: "2026-11-13", value: 5 });
    expect(bucketSeries(daily.slice(0, 3), 1)).toHaveLength(3);
  });
});

describe("display helpers", () => {
  it("keeps tile rows even", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(tileColumns)).toEqual([4, 4, 4, 4, 5, 3, 4, 4, 5, 5, 4, 4]);
  });

  it("lists money per currency and never adds currencies", () => {
    const fmt = (minor: number, currency: string) => formatMoney(minor, currency, "en-IN");
    expect(moneyLine([], fmt)).toBeNull();
    expect(moneyLine([{ currency: "INR", amountMinor: 0 }], fmt)).toBeNull();
    const one = moneyLine([{ currency: "AED", amountMinor: 50_000 }], fmt)!;
    expect(one).toContain("500");
    const three = moneyLine(
      [
        { currency: "INR", amountMinor: 12_000_000 },
        { currency: "AED", amountMinor: 50_000 },
        { currency: "QAR", amountMinor: 10_000 },
      ],
      fmt,
    )!;
    expect(three.split(" · ")).toHaveLength(3);
    expect(three).toMatch(/\+1 more currency$/);
  });

  it("formats venue times and seats", () => {
    expect(timeLabel("09:30")).toBe("9:30 am");
    expect(timeLabel("12:05")).toBe("12:05 pm");
    expect(timeLabel("00:15")).toBe("12:15 am");
    expect(timeLabel("18:00")).toBe("6:00 pm");
    expect(timeLabel("soon")).toBe("soon");
    expect(seatState({ capacity: 10, bookedSeats: 9, status: "open" })).toEqual({ label: "1 seat left", tone: "success" });
    expect(seatState({ capacity: 10, bookedSeats: 10, status: "open" })).toEqual({ label: "Full", tone: "warning" });
    expect(seatState({ capacity: 10, bookedSeats: 2, status: "closed" })).toEqual({ label: "Booking closed", tone: "neutral" });
  });

  it("names roles and draws bars", () => {
    const names = new Map([["super_admin", "Super Admin"]]);
    expect(roleLabel(["super_admin"], names)).toBe("Super Admin");
    expect(roleLabel(["site_lead"], names)).toBe("Site lead");
    expect(roleLabel([], names)).toBeNull();
    expect(barPercent(5, 10)).toBe(50);
    expect(barPercent(1, 1000)).toBe(4);
    expect(barPercent(0, 10)).toBe(0);
    expect(barPercent(3, 0)).toBe(0);
  });
});
