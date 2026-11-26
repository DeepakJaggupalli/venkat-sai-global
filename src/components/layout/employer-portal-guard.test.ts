import { describe, expect, it } from "vitest";

import { companyPortalLinkTarget } from "./employer-portal-guard";

const ORIGIN = "http://127.0.0.1:3210";

/** A click on a link, with just the DOM surface the helper reads. */
function click(href: string | null, opts: { target?: string; download?: boolean; button?: number; ctrlKey?: boolean; defaultPrevented?: boolean; tagName?: string } = {}) {
  const anchor =
    href === null
      ? null
      : {
          tagName: opts.tagName ?? "A",
          target: opts.target ?? "",
          href: new URL(href, ORIGIN).href,
          hasAttribute: (name: string) => name === "download" && Boolean(opts.download),
        };
  const target = { closest: () => anchor };
  return {
    button: opts.button ?? 0,
    metaKey: false,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: opts.defaultPrevented ?? false,
    target: target as unknown as EventTarget,
  };
}

describe("companyPortalLinkTarget (Travel Agency Portal link clicks)", () => {
  it("returns the /employer path, query and hash of a plain click on a Company Portal link", () => {
    expect(companyPortalLinkTarget(click("/employer/requirements?status=draft#top"), ORIGIN)).toBe("/employer/requirements?status=draft#top");
    expect(companyPortalLinkTarget(click("/employer"), ORIGIN)).toBe("/employer");
  });

  it("leaves other links and special clicks to the browser", () => {
    expect(companyPortalLinkTarget(click("/agency/requirements"), ORIGIN)).toBeNull();
    expect(companyPortalLinkTarget(click("/employers/acme"), ORIGIN)).toBeNull();
    expect(companyPortalLinkTarget(click("/contact"), ORIGIN)).toBeNull();
    expect(companyPortalLinkTarget(click("https://example.com/employer/jobs"), ORIGIN)).toBeNull();
    expect(companyPortalLinkTarget(click("/employer/jobs", { ctrlKey: true }), ORIGIN)).toBeNull();
    expect(companyPortalLinkTarget(click("/employer/jobs", { button: 1 }), ORIGIN)).toBeNull();
    expect(companyPortalLinkTarget(click("/employer/jobs", { target: "_blank" }), ORIGIN)).toBeNull();
    expect(companyPortalLinkTarget(click("/employer/jobs", { defaultPrevented: true }), ORIGIN)).toBeNull();
    expect(companyPortalLinkTarget(click(null), ORIGIN)).toBeNull();
  });

  it("never turns file downloads or exports into page navigations", () => {
    expect(companyPortalLinkTarget(click("/employer/billing/invoices/0a4040dd-8b62-40fc-bdcd-ac66da9fb389/pdf"), ORIGIN)).toBeNull();
    expect(companyPortalLinkTarget(click("/employer/reports/export?report=jobs"), ORIGIN)).toBeNull();
    expect(companyPortalLinkTarget(click("/employer/reports/export/xlsx?report=jobs"), ORIGIN)).toBeNull();
    expect(companyPortalLinkTarget(click("/employer/files/report.csv"), ORIGIN)).toBeNull();
    expect(companyPortalLinkTarget(click("/employer/jobs", { download: true }), ORIGIN)).toBeNull();
  });
});
