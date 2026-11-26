import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PORTAL_HELP_HREF } from "@/components/layout/portal-help";
import { NAVIGATION, type PortalKey } from "@/config/navigation";
import { DEFAULT_ROLES } from "@/config/permissions";

import { allGuideHrefs, canSeeGuideItem, guideFor, PORTAL_GUIDES } from "./portal-guides";

const APP_DIR = path.resolve(__dirname, "../app");
/** The portal catch-alls only show a not-found page; a link must point at a real page. */
const CATCH_ALL_NOT_FOUND = "[...missing]";

/** URL patterns of every page.tsx / route.ts under src/app (route groups and parallel slots removed). */
function appRoutes(): string[][] {
  const routes: string[][] = [];
  const walk = (dir: string, segments: string[]) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name.startsWith("_") || name === CATCH_ALL_NOT_FOUND || name === "node_modules") continue;
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

/** /agency/… is served by the /employer routes (src/proxy.ts rewrite). */
function toAppPath(href: string): string[] {
  const pathname = href.split(/[?#]/)[0]!.replace(/\/$/, "");
  const rewritten = pathname === "/agency" || pathname.startsWith("/agency/") ? `/employer${pathname.slice("/agency".length)}` : pathname;
  return rewritten.split("/").filter(Boolean);
}

const ROUTES = appRoutes();
const PORTALS = Object.keys(PORTAL_GUIDES) as PortalKey[];

describe("portal guides", () => {
  it("only link to real routes", () => {
    expect(ROUTES.length).toBeGreaterThan(100);
    const broken = allGuideHrefs().filter(({ href }) => !href.startsWith("/") || !ROUTES.some((route) => matches(toAppPath(href), route)));
    expect(broken).toEqual([]);
  });

  it("keep each portal's links inside that portal (or the shared account area)", () => {
    const home: Record<PortalKey, string> = { admin: "/admin", talent: "/talent", employer: "/employer", agency: "/agency", recruiter: "/recruiter", institution: "/institution" };
    const outside = allGuideHrefs().filter(({ portal, href }) => !href.startsWith(home[portal]) && !href.startsWith("/account"));
    expect(outside).toEqual([]);
  });

  it("have a guide with 4–6 quick steps, sections and FAQs for every portal", () => {
    expect(PORTALS.sort()).toEqual(["admin", "agency", "employer", "institution", "recruiter", "talent"]);
    for (const portal of PORTALS) {
      const guide = PORTAL_GUIDES[portal];
      expect(guide.portal).toBe(portal);
      expect(guide.quickSteps.length, portal).toBeGreaterThanOrEqual(4);
      expect(guide.quickSteps.length, portal).toBeLessThanOrEqual(6);
      expect(guide.sections.length, portal).toBeGreaterThanOrEqual(5);
      expect(guide.faqs.length, portal).toBeGreaterThanOrEqual(3);
      for (const section of guide.sections) {
        expect(section.steps.length, `${portal}/${section.id}`).toBeGreaterThan(0);
        expect(section.links.length, `${portal}/${section.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("use unique, URL-safe section ids", () => {
    for (const portal of PORTALS) {
      const ids = PORTAL_GUIDES[portal].sections.map((s) => s.id);
      expect(new Set(ids).size, portal).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(ids).not.toContain("questions");
    }
  });

  it("never mention a fee charged to candidates as allowed", () => {
    const text = JSON.stringify(PORTAL_GUIDES).toLowerCase();
    expect(text).not.toMatch(/candidates? (must|should|need to) pay/);
    expect(text).not.toMatch(/\b(₹|inr|rs\.)\s?\d/);
  });

  it("is linked from every portal's navigation", () => {
    for (const portal of PORTALS) {
      const items = NAVIGATION[portal].flatMap((s) => s.items);
      const help = items.find((item) => item.href === PORTAL_HELP_HREF[portal]);
      expect(help?.title, portal).toBe("How to use");
      expect(help?.permission, portal).toBeUndefined();
    }
  });
});

describe("guide filtering by permission", () => {
  it("shows items without a permission to everyone and hides the rest unless granted", () => {
    expect(canSeeGuideItem(undefined, [])).toBe(true);
    expect(canSeeGuideItem("content.view", [])).toBe(false);
    expect(canSeeGuideItem("content.view", ["content.view"])).toBe(true);
    expect(canSeeGuideItem(["a", "b"], new Set(["b"]))).toBe(true);
    expect(canSeeGuideItem(["a", "b"], new Set(["c"]))).toBe(false);
    expect(canSeeGuideItem("anything", null)).toBe(true);
  });

  it("leaves out sections and steps the role cannot use", () => {
    const all = guideFor("admin", null);
    const none = guideFor("admin", []);
    expect(none.sections.length).toBeLessThan(all.sections.length);
    expect(none.sections.every((s) => s.permission === undefined)).toBe(true);
    expect(none.quickSteps.map((s) => s.href)).toEqual(["/admin/tasks"]);
    const content = guideFor("admin", ["content.view"]);
    expect(content.sections.some((s) => s.id === "posters")).toBe(true);
    expect(content.sections.some((s) => s.id === "money")).toBe(false);
  });

  it("does not mutate the registry", () => {
    const before = PORTAL_GUIDES.recruiter.sections.length;
    guideFor("recruiter", []);
    expect(PORTAL_GUIDES.recruiter.sections.length).toBe(before);
  });

  it("leaves out section links the role cannot open", () => {
    const recruiter = guideFor("admin", ["requirements.view", "jobs.view", "support.view", "partners.view"]);
    const hrefs = recruiter.sections.flatMap((s) => s.links.map((l) => l.href));
    expect(hrefs).toEqual(expect.arrayContaining(["/admin/requirements", "/admin/jobs", "/admin/support", "/admin/partners"]));
    expect(hrefs).not.toContain("/admin/jobs/new");
    expect(hrefs.some((h) => h.startsWith("/admin/organizations") || h === "/admin/leads" || h === "/admin/support/new")).toBe(false);
    expect(PORTAL_GUIDES.admin.sections.flatMap((s) => s.links).some((l) => l.href === "/admin/jobs/new")).toBe(true);
  });
});

/**
 * What a Command Centre page demands before it renders: the requireStaff() call of each layout.tsx on the way and of
 * the page.tsx (route groups folded in). Null when a call uses a value this test cannot read.
 */
const PAGE_PERMISSION_CONSTANTS: Record<string, string[]> = {
  POSTER_PERMISSIONS: ["content.edit", "media.manage"],
  BOOKINGS_PERMISSION: ["recruitment.assessments"],
  BACKUP_PERMISSION: ["settings.security"],
};
type PageRule = { permissions: string[]; mode: "all" | "any" };

function staffRuleOf(file: string): PageRule | null | undefined {
  // The call itself, not a mention in a comment ("every page must call requireStaff(permission)").
  const m = /await requireStaff\(([^)]*)\)/.exec(readFileSync(file, "utf8"));
  if (!m) return undefined;
  const arg = m[1]!.trim();
  const permissions = [...arg.matchAll(/"([a-z_]+\.[a-z_.]+)"/g)].map((x) => x[1]!);
  for (const [name, values] of Object.entries(PAGE_PERMISSION_CONSTANTS)) if (arg.includes(name)) permissions.push(...values);
  if (arg && !permissions.length) return null;
  return { permissions, mode: /"any"$/.test(arg) ? "any" : "all" };
}

function adminPageRules(href: string): PageRule[] | null {
  const segments = href.split(/[?#]/)[0]!.split("/").filter(Boolean);
  const rules: PageRule[] = [];
  let dir = APP_DIR;
  const collect = (file: string) => {
    if (!existsSync(file)) return true;
    const rule = staffRuleOf(file);
    if (rule === null) return false;
    if (rule) rules.push(rule);
    return true;
  };
  for (const [i, segment] of segments.entries()) {
    const next = [segment, "[id]", "[collection]"].map((s) => path.join(dir, s)).find((d) => existsSync(d));
    if (!next) return null;
    dir = next;
    if (!collect(path.join(dir, "layout.tsx"))) return null;
    if (i === segments.length - 1) {
      const group = ["(index)", "(dashboard)", "(home)"].find((g) => existsSync(path.join(dir, g, "page.tsx")));
      const page = existsSync(path.join(dir, "page.tsx")) ? path.join(dir, "page.tsx") : group ? path.join(dir, group, "page.tsx") : null;
      if (!page) return null;
      if (group && page.includes(group) && !collect(path.join(dir, group, "layout.tsx"))) return null;
      if (!collect(page)) return null;
    }
  }
  return rules;
}

describe("Command Centre guide links", () => {
  it("only show a default staff role the pages that role can open (never a no-access page)", () => {
    const problems: string[] = [];
    let checked = 0;
    for (const role of DEFAULT_ROLES.filter((r) => r.scope === "platform")) {
      const held = new Set(role.permissions);
      const guide = guideFor("admin", held);
      const hrefs = [...guide.quickSteps.map((s) => s.href), ...guide.sections.flatMap((s) => s.links.map((l) => l.href))].filter((h) => h.startsWith("/admin"));
      for (const href of hrefs) {
        const rules = adminPageRules(href);
        if (!rules) continue; // A page whose check this test cannot read.
        checked++;
        const allowed = rules.every((r) => (r.mode === "all" ? r.permissions.every((p) => held.has(p)) : r.permissions.some((p) => held.has(p))));
        if (!allowed) problems.push(`${role.key}: ${href}`);
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(problems).toEqual([]);
  });
});
