import { describe, expect, it } from "vitest";

import { ORG_STATUSES } from "@/db/schema/_constants";

import { parseNotificationSummary } from "./notification-summary";
import { getOrgStatusNotice } from "./org-status";
import { ORG_PORTALS, PORTAL_SUPPORT_HREF, VERIFICATION_HREF } from "./portal-config";
import {
  DEFAULT_FOOTER_COLUMNS,
  fitNavItems,
  isCurrentPage,
  isSectionActive,
  MORE_TRIGGER_WIDTH,
  estimateNavItemWidth,
  sanitizeFooterLinks,
  sanitizeHref,
  sanitizeNavItems,
} from "./public-nav";
import { formatRelativeTime } from "./time";

describe("getOrgStatusNotice", () => {
  it("shows nothing for verified organisations", () => {
    for (const portal of ORG_PORTALS) expect(getOrgStatusNotice("verified", portal)).toBeNull();
  });

  it("covers every other status with a verification link", () => {
    for (const portal of ORG_PORTALS) {
      for (const status of ORG_STATUSES.filter((s) => s !== "verified")) {
        const notice = getOrgStatusNotice(status, portal);
        expect(notice, `${portal}/${status}`).not.toBeNull();
        const hrefs = [notice!.primary.href, notice!.secondary?.href];
        expect(hrefs).toContain(VERIFICATION_HREF[portal]);
        expect(notice!.title.length).toBeGreaterThan(5);
        expect(notice!.description).not.toMatch(/!/);
      }
    }
  });

  it("points suspended organisations to support first", () => {
    const notice = getOrgStatusNotice("suspended", "recruiter")!;
    expect(notice.tone).toBe("danger");
    expect(notice.primary.href).toBe(PORTAL_SUPPORT_HREF.recruiter);
    expect(notice.secondary?.href).toBe("/recruiter/profile/verification");
  });

  it("uses the portal's word for the organisation", () => {
    expect(getOrgStatusNotice("draft", "employer")!.title).toContain("company");
    expect(getOrgStatusNotice("draft", "recruiter")!.title).toContain("agency");
    expect(getOrgStatusNotice("draft", "institution")!.title).toContain("institution");
  });
});

describe("parseNotificationSummary", () => {
  it("accepts the documented payload", () => {
    const parsed = parseNotificationSummary({
      unreadCount: 2,
      items: [
        {
          id: "a",
          title: "Interview scheduled",
          body: "Tomorrow at 10:00",
          link: "/talent/interviews",
          createdAt: "2026-11-07T10:00:00Z",
          readAt: null,
        },
        { id: "b", title: "Profile verified", body: null, link: null, createdAt: "2026-11-06T10:00:00Z", readAt: "2026-11-06T11:00:00Z" },
      ],
    });
    expect(parsed?.unreadCount).toBe(2);
    expect(parsed?.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("skips malformed items instead of failing", () => {
    const parsed = parseNotificationSummary({
      unreadCount: 1,
      items: [{ id: "x" }, { id: "y", title: "Ok", createdAt: "2026-11-07T10:00:00Z" }, 42],
    });
    expect(parsed?.items.map((i) => i.id)).toEqual(["y"]);
  });

  it("rejects payloads that do not match the contract", () => {
    expect(parseNotificationSummary(null)).toBeNull();
    expect(parseNotificationSummary({ unreadCount: -1, items: [] })).toBeNull();
    expect(parseNotificationSummary({ unreadCount: "3", items: [] })).toBeNull();
    expect(parseNotificationSummary({ error: "Not found" })).toBeNull();
  });
});

describe("public navigation helpers", () => {
  it("sanitises links", () => {
    expect(sanitizeHref("/about")).toBe("/about");
    expect(sanitizeHref(" https://example.com/x ")).toBe("https://example.com/x");
    expect(sanitizeHref("javascript:alert(1)")).toBeNull();
    expect(sanitizeHref("//evil.example")).toBeNull();
    expect(sanitizeHref("data:text/html;base64,AAAA")).toBeNull();
    expect(sanitizeHref(undefined)).toBeNull();
  });

  it("drops unsafe nav entries and children", () => {
    const items = sanitizeNavItems([
      {
        title: "Good",
        href: "/good",
        children: [
          { title: "Bad", href: "javascript:void(0)" },
          { title: "Fine", href: "/fine" },
        ],
      },
      { title: "Evil", href: "//evil.example" },
      { title: "  ", href: "/blank-title" },
      { title: "Group of bad", href: "/group", children: [{ title: "Bad", href: "vbscript:x" }] },
    ]);
    expect(items).toEqual([
      { title: "Good", href: "/good", children: [{ title: "Fine", href: "/fine" }] },
      { title: "Group of bad", href: "/group", description: undefined },
    ]);
    expect(
      sanitizeFooterLinks([
        { title: "Ok", href: "/privacy" },
        { title: "No", href: "ftp://x" },
      ]),
    ).toEqual([{ title: "Ok", href: "/privacy" }]);
  });

  it("never marks query-string links as the current page", () => {
    expect(isCurrentPage("/jobs", "/jobs")).toBe(true);
    expect(isCurrentPage("/jobs?overseas=1", "/jobs")).toBe(false);
    expect(isCurrentPage("https://example.com", "/")).toBe(false);
  });

  it("detects the active section from the item or its children", () => {
    const services = { title: "What We Do", href: "/services", children: [{ title: "Testing", href: "/services/testing" }] };
    expect(isSectionActive(services, "/services/testing")).toBe(true);
    expect(isSectionActive({ title: "Home", href: "/" }, "/about")).toBe(false);
    expect(isSectionActive({ title: "About", href: "/about" }, "/about/team")).toBe(true);
  });

  it("fits as many items as the budget allows, reserving room for More", () => {
    const items = [{ title: "About" }, { title: "Services" }, { title: "Contact" }];
    const total = items.reduce((sum, item) => sum + estimateNavItemWidth(item), 0);
    expect(fitNavItems(items, total)).toBe(3);
    const first = estimateNavItemWidth(items[0]!);
    expect(fitNavItems(items, MORE_TRIGGER_WIDTH + first)).toBe(1);
    expect(fitNavItems(items, MORE_TRIGGER_WIDTH)).toBe(0);
  });

  it("derives default footer columns from PUBLIC_NAV with internal links only", () => {
    expect(DEFAULT_FOOTER_COLUMNS.length).toBeGreaterThanOrEqual(3);
    for (const column of DEFAULT_FOOTER_COLUMNS) {
      expect(column.links.length).toBeGreaterThan(0);
      for (const link of column.links) expect(link.href.startsWith("/")).toBe(true);
    }
  });
});

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");

  it("formats past and future times in English", () => {
    expect(formatRelativeTime("2026-11-07T11:59:40Z", "en", now)).toBe("now");
    expect(formatRelativeTime("2026-11-07T11:55:00Z", "en", now)).toBe("5 minutes ago");
    expect(formatRelativeTime("2026-11-07T09:00:00Z", "en", now)).toBe("3 hours ago");
    expect(formatRelativeTime("2026-11-06T12:00:00Z", "en", now)).toBe("yesterday");
    expect(formatRelativeTime("2026-11-07T14:00:00Z", "en", now)).toBe("in 2 hours");
  });

  it("localises for Hindi and Telugu and tolerates bad input", () => {
    const hi = formatRelativeTime("2026-11-07T11:55:00Z", "hi", now);
    const te = formatRelativeTime("2026-11-07T11:55:00Z", "te", now);
    expect(hi).toMatch(/5/);
    expect(te).toMatch(/5/);
    expect(hi).not.toBe("5 minutes ago");
    expect(te).not.toBe("5 minutes ago");
    expect(formatRelativeTime("not a date", "en", now)).toBe("");
  });
});
