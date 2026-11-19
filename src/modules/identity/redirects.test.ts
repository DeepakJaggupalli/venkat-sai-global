import { describe, expect, it } from "vitest";

import type { PortalAccess } from "./authz";
import { INTENT_ONBOARDING_PATH, INTENT_PORTAL_PATH, intentForPath, isAuthPath, resolvePostAuthRedirect, sanitizeReturnTo } from "./redirects";

const candidateOnly: PortalAccess = { talent: true, employer: false, agency: false, recruiter: false, institution: false, admin: false };
const employer: PortalAccess = { ...candidateOnly, employer: true };
const agency: PortalAccess = { ...candidateOnly, agency: true };
const staff: PortalAccess = { ...candidateOnly, admin: true };

describe("sanitizeReturnTo", () => {
  it("keeps same-site relative paths with their query", () => {
    expect(sanitizeReturnTo("/talent/jobs?country=AE")).toBe("/talent/jobs?country=AE");
    expect(sanitizeReturnTo("/")).toBe("/");
  });

  it("drops absolute, protocol-relative and malformed targets", () => {
    expect(sanitizeReturnTo("https://evil.example/")).toBeNull();
    expect(sanitizeReturnTo("//evil.example/path")).toBeNull();
    expect(sanitizeReturnTo("/\\evil.example")).toBeNull();
    expect(sanitizeReturnTo("javascript:alert(1)")).toBeNull();
    expect(sanitizeReturnTo("/ok\r\nSet-Cookie: x=1")).toBeNull();
    expect(sanitizeReturnTo(`/${"a".repeat(2100)}`)).toBeNull();
    expect(sanitizeReturnTo(null)).toBeNull();
    expect(sanitizeReturnTo("")).toBeNull();
  });

  it("never returns to an auth page (prevents loops)", () => {
    for (const path of ["/sign-in", "/sign-in?returnTo=/x", "/sign-in/two-factor", "/sign-up", "/verify", "/sign-out", "/forgot-password", "/reset-password?token=a", "/auth/google/callback"]) {
      expect(sanitizeReturnTo(path)).toBeNull();
    }
    expect(isAuthPath("/sign-in-help")).toBe(false);
    expect(isAuthPath("/authority")).toBe(false);
  });
});

describe("travel agency accounts", () => {
  it("sends a new travel agency to the agency onboarding, an existing one to /agency", () => {
    expect(INTENT_ONBOARDING_PATH.travel_agency).toBe("/agency/onboarding");
    expect(resolvePostAuthRedirect({ intent: "travel_agency", access: candidateOnly, homePath: "/talent" })).toBe("/agency/onboarding");
    expect(resolvePostAuthRedirect({ intent: "travel_agency", access: agency, homePath: "/agency" })).toBe("/agency");
  });

  it("keeps the two employer kinds apart", () => {
    // A company member choosing "Travel agency" sets one up; a travel agency choosing "Company / HR" does too.
    expect(resolvePostAuthRedirect({ intent: "travel_agency", access: employer, homePath: "/employer" })).toBe("/agency/onboarding");
    expect(resolvePostAuthRedirect({ intent: "employer", access: agency, homePath: "/agency" })).toBe("/employer/onboarding");
  });

  it("maps portal paths back to their account type", () => {
    expect(intentForPath("/agency")).toBe("travel_agency");
    expect(intentForPath("/agency/requirements?x=1")).toBe("travel_agency");
    expect(intentForPath("/employer/jobs")).toBe("employer");
    expect(intentForPath("/talent")).toBe("candidate");
    expect(intentForPath("/recruiter")).toBe("partner");
    expect(intentForPath("/institution/courses")).toBe("institution");
    expect(intentForPath("/employers/request")).toBeNull();
    expect(intentForPath("/jobs/abc")).toBeNull();
    expect(intentForPath(null)).toBeNull();
    expect(Object.values(INTENT_PORTAL_PATH)).toEqual(["/talent", "/agency", "/employer", "/recruiter", "/institution"]);
  });
});

describe("resolvePostAuthRedirect", () => {
  it("prefers a safe returnTo over everything else", () => {
    expect(resolvePostAuthRedirect({ returnTo: "/talent/jobs/123", intent: "employer", access: staff, homePath: "/admin" })).toBe("/talent/jobs/123");
  });

  it("ignores an unsafe returnTo", () => {
    expect(resolvePostAuthRedirect({ returnTo: "//evil.example", access: candidateOnly, homePath: "/talent" })).toBe("/talent");
  });

  it("sends staff to the Command Centre", () => {
    expect(resolvePostAuthRedirect({ access: staff, homePath: "/admin" })).toBe("/admin");
    expect(resolvePostAuthRedirect({ intent: "employer", access: staff, homePath: "/admin" })).toBe("/admin");
  });

  it("maps sign-up intents to onboarding when the portal is not set up yet", () => {
    expect(resolvePostAuthRedirect({ intent: "employer", access: candidateOnly, homePath: "/talent" })).toBe(INTENT_ONBOARDING_PATH.employer);
    expect(resolvePostAuthRedirect({ intent: "partner", access: candidateOnly, homePath: "/talent" })).toBe("/recruiter/onboarding");
    expect(resolvePostAuthRedirect({ intent: "institution", access: candidateOnly, homePath: "/talent" })).toBe("/institution/onboarding");
    expect(resolvePostAuthRedirect({ intent: "candidate", access: candidateOnly, homePath: "/talent", isNewUser: true })).toBe("/talent/onboarding");
  });

  it("goes to the portal itself when the user already has it", () => {
    expect(resolvePostAuthRedirect({ intent: "employer", access: employer, homePath: "/employer" })).toBe("/employer");
    expect(resolvePostAuthRedirect({ intent: "candidate", access: candidateOnly, homePath: "/talent" })).toBe("/talent");
  });

  it("falls back to the portal home", () => {
    expect(resolvePostAuthRedirect({ access: employer, homePath: "/employer" })).toBe("/employer");
    expect(resolvePostAuthRedirect({ access: candidateOnly, homePath: "/talent" })).toBe("/talent");
  });
});
