/**
 * Which area of the site a path belongs to, for error and not-found screens that must offer "Go to my dashboard"
 * without knowing their portal (client-safe, pure — unit-tested in route-error.test.tsx).
 */

export type AreaHome = {
  /** Portal or area home ("/admin", "/agency", "/" for the public website). */
  href: string;
  /** Button text: "Go to my dashboard", "Go to my account" or "Go to the homepage". */
  label: string;
  /** Staff (Command Centre) report problems to the owner; everyone else can WhatsApp the office. */
  audience: "staff" | "external";
};

const PORTAL_HOMES = ["talent", "employer", "agency", "recruiter", "institution", "admin"] as const;

export function areaHomeForPath(pathname: string | null | undefined): AreaHome {
  const first = (pathname ?? "").split(/[?#]/)[0]!.split("/").filter(Boolean)[0] ?? "";
  if ((PORTAL_HOMES as readonly string[]).includes(first)) {
    return { href: `/${first}`, label: "Go to my dashboard", audience: first === "admin" ? "staff" : "external" };
  }
  if (first === "account") return { href: "/account", label: "Go to my account", audience: "external" };
  return { href: "/", label: "Go to the homepage", audience: "external" };
}
