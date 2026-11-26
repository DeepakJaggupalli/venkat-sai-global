import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  addDaysIso,
  addMonthsIso,
  buildTalentChecklist,
  CV_SUBMISSION_JOURNEY,
  daysUntil,
  expiryState,
  journeyPosition,
  lastMonthKeys,
  monthSeries,
  postersForTrades,
  TALENT_ACTIONS,
  TALENT_CHECKLIST_KEYS,
  talentActionsFor,
  tradeWords,
} from "./dashboard";

// ---------------------------------------------------------------------------
// Every link on the People Portal home must open a real page
// ---------------------------------------------------------------------------

const APP_DIR = path.resolve(__dirname, "../..");
const TALENT_DIR = path.resolve(__dirname, "..");

/** URL patterns of every page.tsx / route.ts under src/app (route groups removed; the not-found catch-alls ignored). */
function appRoutes(): string[][] {
  const routes: string[][] = [];
  const walk = (dir: string, segments: string[]) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name.startsWith("_") || name === "[...missing]" || name === "node_modules") continue;
        const isGroup = /^\(.*\)$/.test(name) || name.startsWith("@");
        walk(full, isGroup ? segments : [...segments, name]);
      } else if (/^(page|route)\.(tsx|ts)$/.test(name)) {
        routes.push(segments);
      }
    }
  };
  walk(APP_DIR, []);
  return routes;
}

function matches(url: string[], route: string[]): boolean {
  let i = 0;
  for (const segment of route) {
    if (/^\[\[\.\.\..+\]\]$/.test(segment)) return true;
    if (/^\[\.\.\..+\]$/.test(segment)) return i < url.length;
    if (i >= url.length) return false;
    if (!/^\[.+\]$/.test(segment) && segment !== url[i]) return false;
    i++;
  }
  return i === url.length;
}

const ROUTES = appRoutes();
const isRealRoute = (href: string) => ROUTES.some((route) => matches(href.split(/[?#]/)[0]!.split("/").filter(Boolean), route));

/** Internal hrefs written in the home page and its cards (template parts such as ${job.slug} become "x"). */
function hrefsInSource(): string[] {
  const files = [path.join(TALENT_DIR, "(home)/page.tsx"), ...readdirSync(path.join(TALENT_DIR, "_components"))
      .filter((f) => !f.includes(".test."))
      .map((f) => path.join(TALENT_DIR, "_components", f)),
  ];
  const hrefs = new Set<string>();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(/href[=:]\s*\{?\s*["`](\/[^"`]*)["`]/g)) hrefs.add(m[1]!.replace(/\$\{[^}]*\}/g, "x"));
  }
  return [...hrefs];
}

describe("People Portal home links", () => {
  it("only point at real pages", () => {
    expect(ROUTES.length).toBeGreaterThan(100);
    const hrefs = [...TALENT_ACTIONS.map((a) => a.href), ...buildTalentChecklist({ openHints: new Set(), passportStatus: null, phoneVerified: false, minor: false }).map((s) => s.href), ...hrefsInSource()];
    expect(hrefsInSource().length).toBeGreaterThan(15);
    expect(hrefs.filter((href) => !isRealRoute(href))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------

describe("talentActionsFor", () => {
  it("gives an adult every main button in order", () => {
    expect(talentActionsFor({ minor: false }).map((a) => a.key)).toEqual(["requirements", "jobs", "sendCv", "cvStatus", "bookTest", "training", "resume", "refer", "documents", "messages", "account"]);
  });

  it("keeps children out of overseas recruitment and cash rewards", () => {
    const keys = talentActionsFor({ minor: true }).map((a) => a.key);
    expect(keys).toEqual(["jobs", "training", "resume", "documents", "messages", "account"]);
    for (const hidden of ["requirements", "sendCv", "cvStatus", "bookTest", "refer"]) expect(keys).not.toContain(hidden);
  });

  it("has unique keys and links", () => {
    expect(new Set(TALENT_ACTIONS.map((a) => a.key)).size).toBe(TALENT_ACTIONS.length);
    expect(new Set(TALENT_ACTIONS.map((a) => a.href)).size).toBe(TALENT_ACTIONS.length);
  });
});

// ---------------------------------------------------------------------------
// Profile checklist
// ---------------------------------------------------------------------------

describe("buildTalentChecklist", () => {
  it("marks steps done from the open completeness hints, passport and verified phone", () => {
    const steps = buildTalentChecklist({ openHints: new Set(["add_skills", "upload_resume"]), passportStatus: "valid", phoneVerified: false, minor: false });
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ["trade", true],
      ["experience", true],
      ["skills", false],
      ["cv", false],
      ["passport", true],
      ["phone", false],
    ]);
  });

  it("starts with nothing done for a new profile", () => {
    const steps = buildTalentChecklist({ openHints: new Set(["add_preferred_roles", "add_experience", "add_skills", "upload_resume"]), passportStatus: null, phoneVerified: false, minor: false });
    expect(steps).toHaveLength(TALENT_CHECKLIST_KEYS.length);
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  it("drops the passport step for children", () => {
    const steps = buildTalentChecklist({ openHints: new Set(), passportStatus: null, phoneVerified: true, minor: true });
    expect(steps.map((s) => s.key)).toEqual(["trade", "experience", "skills", "cv", "phone"]);
    expect(steps.every((s) => s.done)).toBe(true);
  });

  it("links every step to the place where it is done", () => {
    const hrefs = Object.fromEntries(buildTalentChecklist({ openHints: new Set(), passportStatus: null, phoneVerified: false, minor: false }).map((s) => [s.key, s.href]));
    expect(hrefs).toEqual({
      trade: "/talent/profile#preferences",
      experience: "/talent/profile#experience",
      skills: "/talent/profile#skills",
      cv: "/talent/profile#resume",
      passport: "/talent/profile#personal",
      phone: "/account#contact",
    });
  });
});

// ---------------------------------------------------------------------------
// Placement journey
// ---------------------------------------------------------------------------

describe("journeyPosition", () => {
  it("places journey stages in order", () => {
    expect(journeyPosition("received")).toEqual({ index: 0, total: CV_SUBMISSION_JOURNEY.length, side: null });
    expect(journeyPosition("trade_test")).toMatchObject({ index: 2, side: null });
    expect(journeyPosition("departed")).toMatchObject({ index: CV_SUBMISSION_JOURNEY.length - 1, side: null });
  });

  it("keeps on hold and not suitable outside the journey", () => {
    expect(journeyPosition("on_hold")).toMatchObject({ index: -1, side: "on_hold" });
    expect(journeyPosition("not_suitable")).toMatchObject({ index: -1, side: "not_suitable" });
  });
});

// ---------------------------------------------------------------------------
// Requirement posters for my trade
// ---------------------------------------------------------------------------

describe("tradeWords", () => {
  it("keeps trade words, drops generic ones and plural s", () => {
    expect([...tradeWords("Skilled Pipe Welders & General Helpers")].sort()).toEqual(["pipe", "welder"]);
    expect([...tradeWords("Glass fitter")].sort()).toEqual(["fitter", "glass"]);
    expect(tradeWords(null).size).toBe(0);
  });
});

describe("postersForTrades", () => {
  const posters = [
    { id: "1", title: "Dubai - Mechanical helper", trades: [{ trade: "Mechanical helper" }] },
    { id: "2", title: "Saudi - Pipe welders 6G", trades: [{ trade: "Pipe welder" }, { trade: "Fitter" }] },
    { id: "3", title: "Qatar - Electricians", trades: [{ trade: "Electrician" }] },
    { id: "4", title: "Oman - TIG welder", trades: [] },
  ];

  it("returns posters for the candidate's trade, newest first as given", () => {
    const result = postersForTrades(posters, ["Welder", null, "TIG welding"], 3);
    expect(result.matched).toBe(true);
    expect(result.items.map((p) => p.id)).toEqual(["2", "4"]);
  });

  it("falls back to the latest posters and says it did not match", () => {
    expect(postersForTrades(posters, ["Cook"], 2)).toEqual({ items: posters.slice(0, 2), matched: false });
    expect(postersForTrades(posters, [], 2)).toEqual({ items: posters.slice(0, 2), matched: false });
  });

  it("never matches on generic words alone", () => {
    expect(postersForTrades(posters, ["General helper"], 4).matched).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Applications chart
// ---------------------------------------------------------------------------

describe("lastMonthKeys / monthSeries", () => {
  it("uses India time for the current month and crosses the year", () => {
    // 31 Dec 2026 20:00 UTC is already 1 Jan 2027 in India.
    expect(lastMonthKeys(3, new Date("2026-12-31T20:00:00Z"))).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(lastMonthKeys(2, new Date("2026-03-15T00:00:00Z"))).toEqual(["2026-02", "2026-03"]);
  });

  it("zero-fills months with no applications and labels them", () => {
    const series = monthSeries([{ month: "2026-10", value: 2 }, { month: "2025-01", value: 9 }], { months: 3, now: new Date("2026-11-26T06:00:00Z"), locale: "en-GB" });
    expect(series).toEqual([
      { label: "Sept", value: 0 },
      { label: "Oct", value: 2 },
      { label: "Nov", value: 0 },
    ]);
  });

  it("survives an unknown locale", () => {
    expect(monthSeries([], { months: 1, now: new Date("2026-11-26T06:00:00Z"), locale: "not a locale!!" })).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Document reminders
// ---------------------------------------------------------------------------

describe("expiry dates", () => {
  it("adds months with the day clamped to the month", () => {
    expect(addMonthsIso("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonthsIso("2026-11-26", 6)).toBe("2027-05-26");
    expect(addDaysIso("2026-11-26", 60)).toBe("2027-01-25");
  });

  it("flags expired and soon, and nothing further out", () => {
    const today = "2026-11-26";
    const limit = addMonthsIso(today, 6);
    expect(expiryState("2026-11-25", today, limit)).toBe("expired");
    expect(expiryState("2026-11-26", today, limit)).toBe("soon");
    expect(expiryState(limit, today, limit)).toBe("soon");
    expect(expiryState("2027-06-01", today, limit)).toBeNull();
    expect(expiryState(null, today, limit)).toBeNull();
  });

  it("counts whole days left", () => {
    expect(daysUntil("2026-12-06", "2026-11-26")).toBe(10);
    expect(daysUntil("2026-11-20", "2026-11-26")).toBe(-6);
  });
});
