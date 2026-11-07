import { describe, expect, it } from "vitest";

import { NAVIGATION, PORTAL_HOME } from "@/config/navigation";
import enCommon from "@/i18n/messages/en/common.json";
import hiCommon from "@/i18n/messages/hi/common.json";
import teCommon from "@/i18n/messages/te/common.json";

import {
  buildAutoTrail,
  filterNavSections,
  findActiveNavItem,
  isExternalHref,
  isNavItemActive,
  isNavItemExact,
  navSectionI18nKey,
  quickLinks,
  safeInternalHref,
  splitHref,
} from "./nav-utils";

const qs = (query: string) => new URLSearchParams(query);
const titles = (sections: ReturnType<typeof filterNavSections>) => sections.flatMap((s) => s.items.map((i) => i.title));

describe("filterNavSections", () => {
  it("always keeps items without a permission and hides the rest unless granted", () => {
    const sections = filterNavSections(NAVIGATION.employer, ["employer.dashboard"]);
    expect(titles(sections)).toEqual(["Dashboard", "Messages", "Support"]);
  });

  it("drops sections that end up empty", () => {
    const sections = filterNavSections(NAVIGATION.recruiter, []);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe("Agency");
    expect(titles(sections)).toEqual(["Support"]);
  });

  it("shows every item to a viewer holding all permissions", () => {
    const all = NAVIGATION.admin.flatMap((s) => s.items.map((i) => i.permission).filter((p): p is string => !!p));
    const total = NAVIGATION.admin.reduce((sum, s) => sum + s.items.length, 0);
    expect(titles(filterNavSections(NAVIGATION.admin, all))).toHaveLength(total);
  });

  it("does not mutate the navigation config", () => {
    const before = JSON.stringify(NAVIGATION.employer.map((s) => s.items.length));
    filterNavSections(NAVIGATION.employer, []);
    expect(JSON.stringify(NAVIGATION.employer.map((s) => s.items.length))).toBe(before);
  });
});

describe("splitHref", () => {
  it("separates path and query and trims trailing slashes", () => {
    const { path, query } = splitHref("/admin/organizations/?type=employer");
    expect(path).toBe("/admin/organizations");
    expect(query.get("type")).toBe("employer");
    expect(splitHref("/").path).toBe("/");
  });
});

describe("isNavItemActive", () => {
  it("matches nested routes by default", () => {
    expect(isNavItemActive({ href: "/employer/jobs" }, "/employer/jobs/123/edit")).toBe(true);
    expect(isNavItemActive({ href: "/employer/jobs" }, "/employer/jobs/")).toBe(true);
    expect(isNavItemActive({ href: "/employer/jobs" }, "/employer/jobsite")).toBe(false);
  });

  it("respects matchNested: false", () => {
    expect(isNavItemActive({ href: "/talent", matchNested: false }, "/talent")).toBe(true);
    expect(isNavItemActive({ href: "/talent", matchNested: false }, "/talent/profile")).toBe(false);
  });

  it("requires every query parameter of the href", () => {
    const item = { href: "/admin/organizations?type=employer", matchNested: false };
    expect(isNavItemActive(item, "/admin/organizations", qs("type=employer&page=2"))).toBe(true);
    expect(isNavItemActive(item, "/admin/organizations", qs("type=institution"))).toBe(false);
    expect(isNavItemActive(item, "/admin/organizations", null)).toBe(false);
  });

  it("never treats '/' as an ancestor of everything", () => {
    expect(isNavItemActive({ href: "/" }, "/about")).toBe(false);
    expect(isNavItemActive({ href: "/" }, "/")).toBe(true);
  });
});

describe("findActiveNavItem", () => {
  const admin = filterNavSections(
    NAVIGATION.admin,
    NAVIGATION.admin.flatMap((s) => s.items.map((i) => i.permission ?? "")),
  );

  it("prefers the most specific path", () => {
    expect(findActiveNavItem(admin, "/admin/commercial/invoices")?.title).toBe("Invoices");
    expect(findActiveNavItem(admin, "/admin/commercial")?.title).toBe("Revenue & billing");
    expect(findActiveNavItem(admin, "/admin/commercial/plans")?.title).toBe("Revenue & billing");
  });

  it("distinguishes query-string items", () => {
    expect(findActiveNavItem(admin, "/admin/organizations", qs("type=employer"))?.title).toBe("Employers");
    expect(findActiveNavItem(admin, "/admin/organizations", qs("type=recruitment_partner"))?.title).toBe("Recruitment partners");
    expect(findActiveNavItem(admin, "/admin/organizations", qs("type=institution"))?.title).toBe("Institutions");
    expect(findActiveNavItem(admin, "/admin/organizations")).toBeNull();
  });

  it("keeps the dashboard exact-only", () => {
    expect(findActiveNavItem(NAVIGATION.talent, "/talent")?.title).toBe("Dashboard");
    expect(findActiveNavItem(NAVIGATION.talent, "/talent/profile/education")?.title).toBe("My profile");
    expect(findActiveNavItem(NAVIGATION.talent, "/talent/something-else")).toBeNull();
  });
});

describe("isNavItemExact", () => {
  it("is true only on the item's own page", () => {
    expect(isNavItemExact({ href: "/employer/jobs" }, "/employer/jobs")).toBe(true);
    expect(isNavItemExact({ href: "/employer/jobs" }, "/employer/jobs/1")).toBe(false);
    expect(isNavItemExact({ href: "/admin/organizations?type=employer" }, "/admin/organizations", qs("type=employer"))).toBe(true);
  });
});

describe("buildAutoTrail", () => {
  const jobs = NAVIGATION.employer[0]!.items[1]!;
  const dashboard = NAVIGATION.employer[0]!.items[0]!;

  it("shows the portal as the current page on its home", () => {
    expect(buildAutoTrail({ homeLabel: "Employer Portal", homeHref: "/employer", activeItem: dashboard, isExact: true })).toEqual([
      { label: "Employer Portal" },
    ]);
  });

  it("links the section when on a nested page", () => {
    expect(buildAutoTrail({ homeLabel: "Employer Portal", homeHref: "/employer", activeItem: jobs, isExact: false })).toEqual([
      { label: "Employer Portal", href: "/employer" },
      { label: "Jobs", href: "/employer/jobs" },
    ]);
  });

  it("marks the section as current when on its own page, using the translated label when given", () => {
    expect(
      buildAutoTrail({ homeLabel: "Employer Portal", homeHref: "/employer", activeItem: jobs, activeLabel: "Openings", isExact: true }),
    ).toEqual([{ label: "Employer Portal", href: "/employer" }, { label: "Openings" }]);
  });

  it("falls back to a home link when nothing matches", () => {
    expect(buildAutoTrail({ homeLabel: "People Portal", homeHref: "/talent", activeItem: null, isExact: false })).toEqual([
      { label: "People Portal", href: "/talent" },
    ]);
  });
});

describe("quickLinks", () => {
  it("excludes the portal home and respects the limit", () => {
    const links = quickLinks(NAVIGATION.talent, PORTAL_HOME.talent, 4);
    expect(links).toHaveLength(4);
    expect(links.some((l) => l.href === "/talent")).toBe(false);
  });
});

describe("safeInternalHref / isExternalHref", () => {
  it("only lets relative in-app paths through", () => {
    expect(safeInternalHref("/talent/applications/1")).toBe("/talent/applications/1");
    expect(safeInternalHref("https://evil.example")).toBeNull();
    expect(safeInternalHref("//evil.example")).toBeNull();
    expect(safeInternalHref("/\\evil.example")).toBeNull();
    expect(safeInternalHref("javascript:alert(1)")).toBeNull();
    expect(safeInternalHref("")).toBeNull();
    expect(safeInternalHref(null)).toBeNull();
  });

  it("detects absolute http(s) links", () => {
    expect(isExternalHref("https://example.com")).toBe(true);
    expect(isExternalHref("HTTP://example.com")).toBe(true);
    expect(isExternalHref("/about")).toBe(false);
  });
});

describe("People Portal navigation translations", () => {
  const catalogues = {
    en: enCommon as Record<string, string>,
    hi: hiCommon as Record<string, string>,
    te: teCommon as Record<string, string>,
  };

  it("has a label for every nav item and section in every language", () => {
    const keys = [
      ...NAVIGATION.talent.flatMap((s) => s.items.map((i) => i.i18nKey).filter((k): k is string => !!k)),
      ...NAVIGATION.talent
        .map((s) => s.title)
        .filter((t): t is string => !!t)
        .map(navSectionI18nKey),
      "portal.talent",
      "portal.employer",
      "portal.recruiter",
      "portal.institution",
      "portal.admin",
    ];
    for (const [locale, messages] of Object.entries(catalogues)) {
      for (const key of keys) {
        expect(messages[key], `${locale}: ${key}`).toBeTruthy();
      }
    }
  });

  it("keeps Hindi and Telugu in sync with English", () => {
    const english = Object.keys(catalogues.en).sort();
    expect(Object.keys(catalogues.hi).sort()).toEqual(english);
    expect(Object.keys(catalogues.te).sort()).toEqual(english);
  });

  it("preserves placeholders in translations", () => {
    const placeholders = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const [key, value] of Object.entries(catalogues.en)) {
      expect(placeholders(catalogues.hi[key] ?? ""), `hi: ${key}`).toBe(placeholders(value));
      expect(placeholders(catalogues.te[key] ?? ""), `te: ${key}`).toBe(placeholders(value));
    }
  });

  it("derives section keys from titles", () => {
    expect(navSectionI18nKey("Skills & growth")).toBe("nav.section.skills-growth");
    expect(navSectionI18nKey("Opportunities")).toBe("nav.section.opportunities");
  });
});
