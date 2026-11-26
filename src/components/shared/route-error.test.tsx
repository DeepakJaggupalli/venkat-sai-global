import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { matchesHelpQuery, normalizeHelpQuery } from "@/components/help/help-search";

import { NotFoundView } from "./not-found-view";
import { areaHomeForPath } from "./portal-home";
import { RouteError } from "./route-error";

const navigation = vi.hoisted(() => ({ pathname: "/employer/jobs" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
}));

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("areaHomeForPath", () => {
  it("finds the portal home of a path", () => {
    expect(areaHomeForPath("/admin/jobs/123")).toEqual({ href: "/admin", label: "Go to my dashboard", audience: "staff" });
    expect(areaHomeForPath("/agency/requirements?x=1")).toMatchObject({ href: "/agency", audience: "external" });
    expect(areaHomeForPath("/talent")).toMatchObject({ href: "/talent" });
    expect(areaHomeForPath("/account/security")).toMatchObject({ href: "/account", label: "Go to my account" });
    expect(areaHomeForPath("/jobs/welder")).toMatchObject({ href: "/", label: "Go to the homepage" });
    expect(areaHomeForPath("/administrator")).toMatchObject({ href: "/" });
    expect(areaHomeForPath(null)).toMatchObject({ href: "/" });
  });
});

describe("RouteError", () => {
  it("shows a plain message, retry, the dashboard link, WhatsApp and the reference — never details", () => {
    navigation.pathname = "/employer/jobs";
    const html = renderToStaticMarkup(<RouteError area="your jobs" digest="12345" />);
    expect(text(html)).toContain("We could not load your jobs");
    expect(text(html)).toContain("Try again");
    expect(html).toContain('href="/employer"');
    expect(html).toContain("https://wa.me/");
    expect(text(html)).toContain("12345");
    expect(html).toContain('role="alert"');
  });

  it("asks staff to tell the owner instead of offering WhatsApp", () => {
    navigation.pathname = "/admin/pipeline";
    const html = renderToStaticMarkup(<RouteError digest="abc" />);
    expect(text(html)).toContain("tell the owner");
    expect(html).not.toContain("wa.me");
    expect(html).toContain('href="/admin"');
  });

  it("drops a digest that does not look like a reference code", () => {
    const html = renderToStaticMarkup(<RouteError digest={"<script>alert(1)</script>"} />);
    expect(html).not.toContain("Reference code");
    expect(html).not.toContain("<script>");
  });

  it("uses translated labels", () => {
    navigation.pathname = "/talent/jobs";
    const html = renderToStaticMarkup(<RouteError digest="9" labels={{ title: "ఏదో తప్పు జరిగింది", retry: "మళ్ళీ", reference: "సూచన: {code}" }} />);
    expect(text(html)).toContain("ఏదో తప్పు జరిగింది");
    expect(text(html)).toContain("మళ్ళీ");
    expect(text(html)).toContain("సూచన: 9");
  });
});

describe("NotFoundView", () => {
  it("links back to the portal dashboard", () => {
    const html = renderToStaticMarkup(<NotFoundView homeHref="/recruiter" secondary={{ label: "How to use", href: "/recruiter/help" }} />);
    expect(html).toContain("<h1");
    expect(text(html)).toMatch(/couldn&#x27;t find that page/);
    expect(html).toContain('href="/recruiter"');
    expect(html).toContain('href="/recruiter/help"');
  });
});

describe("help search", () => {
  it("matches every word, ignoring case and punctuation", () => {
    const terms = normalizeHelpQuery("  Invoice, PAY! ");
    expect(terms).toEqual(["invoice", "pay"]);
    expect(matchesHelpQuery(terms, ["Record payments against an invoice"])).toBe(true);
    expect(matchesHelpQuery(terms, ["Invoices only"])).toBe(false);
    expect(matchesHelpQuery([], ["anything"])).toBe(true);
    expect(normalizeHelpQuery("a b c d e f g h i j")).toHaveLength(8);
  });
});
