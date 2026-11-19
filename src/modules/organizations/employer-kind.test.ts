import { describe, expect, it } from "vitest";

import { employerKindForIntent, SIGNUP_INTENTS } from "@/modules/identity/types";

import {
  employerKindOf,
  employerOnboardingPath,
  employerPortalHome,
  employerPortalOfPath,
  employerPortalRedirect,
  inEmployerPortal,
  isEmployerKind,
  portalForEmployerKind,
} from "./employer-kind";

describe("sign-up intent → employer kind", () => {
  it("maps the two business intents to the employer kinds and nothing else", () => {
    expect(employerKindForIntent("travel_agency")).toBe("travel_agency");
    expect(employerKindForIntent("employer")).toBe("direct_company");
    for (const intent of ["candidate", "partner", "institution"] as const) expect(employerKindForIntent(intent)).toBeNull();
    expect(employerKindForIntent(null)).toBeNull();
    expect(SIGNUP_INTENTS).toContain("travel_agency");
  });

  it("each kind has its own portal home and onboarding", () => {
    expect(portalForEmployerKind("travel_agency")).toBe("agency");
    expect(portalForEmployerKind("direct_company")).toBe("employer");
    expect(employerPortalHome("travel_agency")).toBe("/agency");
    expect(employerPortalHome("direct_company")).toBe("/employer");
    expect(employerOnboardingPath("travel_agency")).toBe("/agency/onboarding");
    expect(employerOnboardingPath("direct_company")).toBe("/employer/onboarding");
  });
});

describe("employerKindOf", () => {
  it("defaults employers to direct_company and ignores other organisation types", () => {
    expect(employerKindOf({ type: "employer", employerKind: null })).toBe("direct_company");
    expect(employerKindOf({ type: "employer", employerKind: "travel_agency" })).toBe("travel_agency");
    expect(employerKindOf({ type: "recruitment_partner", employerKind: "travel_agency" })).toBeNull();
    expect(employerKindOf({ type: "institution", employerKind: null })).toBeNull();
    expect(isEmployerKind("travel_agency")).toBe(true);
    expect(isEmployerKind("agency")).toBe(false);
  });
});

describe("/agency vs /employer redirect rule", () => {
  it("sends a travel agency member from /employer to the same page under /agency", () => {
    expect(employerPortalRedirect("/employer", "travel_agency")).toBe("/agency");
    expect(employerPortalRedirect("/employer/requirements/123?tab=candidates", "travel_agency")).toBe("/agency/requirements/123?tab=candidates");
    expect(employerPortalRedirect("/employer?welcome=1", "travel_agency")).toBe("/agency?welcome=1");
  });

  it("sends a direct company member from /agency to the same page under /employer", () => {
    expect(employerPortalRedirect("/agency", "direct_company")).toBe("/employer");
    expect(employerPortalRedirect("/agency/jobs/new", "direct_company")).toBe("/employer/jobs/new");
  });

  it("leaves members in their own portal and ignores other paths", () => {
    expect(employerPortalRedirect("/agency/pipeline", "travel_agency")).toBeNull();
    expect(employerPortalRedirect("/employer/jobs", "direct_company")).toBeNull();
    for (const path of ["/", "/employers", "/agency-news", "/employer-branding", "/talent", "/admin/organizations?type=employer"]) {
      expect(employerPortalRedirect(path, "travel_agency")).toBeNull();
      expect(employerPortalRedirect(path, "direct_company")).toBeNull();
    }
  });

  it("recognises each portal on segment boundaries only", () => {
    expect(employerPortalOfPath("/agency")).toBe("agency");
    expect(employerPortalOfPath("/agency/team")).toBe("agency");
    expect(employerPortalOfPath("/employer/team")).toBe("employer");
    expect(employerPortalOfPath("/employers/request")).toBeNull();
    expect(employerPortalOfPath("/agencyx")).toBeNull();
  });

  it("expresses a rewritten path in the portal being shown (navigation highlighting)", () => {
    expect(inEmployerPortal("/employer/requirements", "agency")).toBe("/agency/requirements");
    expect(inEmployerPortal("/agency/requirements", "agency")).toBe("/agency/requirements");
    expect(inEmployerPortal("/agency", "employer")).toBe("/employer");
    expect(inEmployerPortal("/employer/jobs", "recruiter")).toBe("/employer/jobs");
  });
});
