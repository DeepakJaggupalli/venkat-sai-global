/**
 * Employer kinds and the two employer portals (client-safe, pure — unit-tested).
 *
 * An employer organisation is either a direct company / HR team (Company Portal, /employer) or a travel agency
 * that brings manpower requirements from abroad (Travel Agency Portal, /agency). Both portals run on the same
 * employer workspace, services and permissions; /agency is served by the /employer routes (see src/proxy.ts).
 */
import { EMPLOYER_KINDS, type EmployerKind, type OrgType } from "@/db/schema/_constants";

export { EMPLOYER_KINDS, type EmployerKind };

export const EMPLOYER_KIND_LABELS: Record<EmployerKind, string> = {
  direct_company: "Company / HR",
  travel_agency: "Travel agency",
};

export type EmployerPortal = "employer" | "agency";

export const EMPLOYER_PORTAL_BASE: Record<EmployerPortal, string> = { employer: "/employer", agency: "/agency" };

export function isEmployerKind(value: unknown): value is EmployerKind {
  return typeof value === "string" && (EMPLOYER_KINDS as readonly string[]).includes(value);
}

/** Kind of an organisation: null for non-employers; an employer without a stored kind is a direct company. */
export function employerKindOf(org: { type: OrgType; employerKind?: EmployerKind | null }): EmployerKind | null {
  if (org.type !== "employer") return null;
  return org.employerKind ?? "direct_company";
}

export function portalForEmployerKind(kind: EmployerKind): EmployerPortal {
  return kind === "travel_agency" ? "agency" : "employer";
}

/** Portal home for an employer organisation of `kind` ("/agency" or "/employer"). */
export function employerPortalHome(kind: EmployerKind): string {
  return EMPLOYER_PORTAL_BASE[portalForEmployerKind(kind)];
}

/** Onboarding page that creates an employer organisation of `kind`. */
export function employerOnboardingPath(kind: EmployerKind): string {
  return `${employerPortalHome(kind)}/onboarding`;
}

function underBase(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`) || path.startsWith(`${base}?`) || path.startsWith(`${base}#`);
}

/** Which employer portal a path (with optional query) belongs to, or null for any other path. */
export function employerPortalOfPath(path: string): EmployerPortal | null {
  if (underBase(path, EMPLOYER_PORTAL_BASE.agency)) return "agency";
  if (underBase(path, EMPLOYER_PORTAL_BASE.employer)) return "employer";
  return null;
}

/**
 * The /agency vs /employer rule: the same page in the portal that matches the organisation's kind, or null when
 * `path` is already in the right portal (or outside both). A travel agency member who opens /employer/jobs goes to
 * /agency/jobs; a direct company member who opens /agency goes to /employer.
 */
export function employerPortalRedirect(path: string, kind: EmployerKind): string | null {
  const current = employerPortalOfPath(path);
  const target = portalForEmployerKind(kind);
  if (!current || current === target) return null;
  return `${EMPLOYER_PORTAL_BASE[target]}${path.slice(EMPLOYER_PORTAL_BASE[current].length)}`;
}

/**
 * `path` expressed in `portal` when it belongs to the other employer portal ("/employer/jobs" → "/agency/jobs" for
 * the agency portal); unchanged otherwise. The portal shell uses it so navigation highlighting does not depend on
 * whether the router reports the browser URL (/agency/…) or the route it was rewritten to (/employer/…).
 */
export function inEmployerPortal(path: string, portal: string): string {
  if (portal !== "agency" && portal !== "employer") return path;
  const current = employerPortalOfPath(path);
  if (!current || current === portal) return path;
  return `${EMPLOYER_PORTAL_BASE[portal]}${path.slice(EMPLOYER_PORTAL_BASE[current].length)}`;
}
