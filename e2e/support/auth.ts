import { expect, type Page } from "@playwright/test";

/**
 * Sign-in helpers for the accounts created by `npm run db:seed:e2e` (credentials come from the env file
 * it writes: E2E_<KEY>_EMAIL / E2E_<KEY>_PASSWORD). See e2e/support/README.md.
 */

export type Role =
  | "admin"
  | "ops"
  | "finance"
  | "content"
  | "employer"
  | "employerMember"
  | "partner"
  | "otherPartner"
  | "institution"
  | "otherInstitution"
  | "candidate"
  | "minor"
  | "newUser"
  | "newCandidate"
  | "newPartner";

/** Role → env prefix (E2E_<PREFIX>_EMAIL / _PASSWORD). */
export const ROLE_ENV: Record<Role, string> = {
  admin: "ADMIN",
  ops: "OPS",
  finance: "FINANCE",
  content: "CONTENT",
  employer: "EMPLOYER",
  employerMember: "EMPLOYER_MEMBER",
  partner: "PARTNER",
  otherPartner: "OTHER_PARTNER",
  institution: "INSTITUTION",
  otherInstitution: "OTHER_INSTITUTION",
  candidate: "CANDIDATE",
  minor: "MINOR",
  newUser: "NEW_USER",
  newCandidate: "NEW_CANDIDATE",
  newPartner: "NEW_PARTNER",
};

/** Where each role lands after signing in without a returnTo. Fresh accounts have no portal yet. */
export const PORTAL_HOME: Record<Role, string> = {
  admin: "/admin",
  ops: "/admin",
  finance: "/admin",
  content: "/admin",
  employer: "/employer",
  employerMember: "/employer",
  partner: "/recruiter",
  otherPartner: "/recruiter",
  institution: "/institution",
  otherInstitution: "/institution",
  candidate: "/talent",
  minor: "/talent/onboarding",
  newUser: "/account",
  newCandidate: "/account",
  newPartner: "/account",
};

/** Accounts that specs use up (onboarding creates an organisation, the age step locks a date of birth). */
export const FRESH_ROLES: readonly Role[] = ["newUser", "newCandidate", "newPartner"];

export type Credentials = { email: string; password: string };

export function credentials(role: Role): Credentials | null {
  const prefix = ROLE_ENV[role];
  const email = process.env[`E2E_${prefix}_EMAIL`];
  const password = process.env[`E2E_${prefix}_PASSWORD`];
  return email && password ? { email, password } : null;
}

/** For `test.skip(!hasCredentials("employer"), missingCredentials("employer"))`. */
export function hasCredentials(role: Role): boolean {
  return credentials(role) !== null;
}

export function missingCredentials(role: Role): string {
  const prefix = ROLE_ENV[role];
  return `E2E_${prefix}_EMAIL / E2E_${prefix}_PASSWORD not set (run npm run db:seed:e2e and source the env file)`;
}

const pathOf = (target: string): string => target.split("?")[0]!.split("#")[0]!;

/**
 * Fill and submit the password form on /sign-in. Scoped to the form that holds the password input: the
 * "Password" tab panel is itself labelled "Password", so `getByLabel(/password/i).first()` hits the panel.
 */
export async function fillPasswordSignInForm(page: Page, creds: Credentials): Promise<void> {
  const form = page.locator("form").filter({ has: page.locator('input[type="password"]') }).first();
  await form.getByLabel("Email or mobile number").fill(creds.email);
  await form.locator('input[type="password"]').fill(creds.password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
}

/**
 * Sign in with the password form and wait until the app has left the auth screens.
 *  - `returnTo` (default: the role's portal home, `/account` for fresh accounts so nothing gets consumed)
 *    is passed to /sign-in and the final URL must be inside it — unless `expectPath` says otherwise
 *    (e.g. the People Portal age gate sends a minor to /talent/onboarding).
 *  - Staff 2FA interstitials fail with a clear message: the E2E seed turns `security.require_staff_2fa`
 *    off for the local database, so seeing one means the seed has not run on this database.
 */
export async function signIn(page: Page, role: Role, opts: { returnTo?: string; expectPath?: string | RegExp } = {}): Promise<void> {
  const creds = credentials(role);
  if (!creds) throw new Error(missingCredentials(role));
  await signInWith(page, creds, { returnTo: opts.returnTo ?? PORTAL_HOME[role], expectPath: opts.expectPath });
}

/** Same as signIn() for any email + password (e.g. an account a spec registered itself). */
export async function signInWith(page: Page, creds: Credentials, opts: { returnTo?: string; expectPath?: string | RegExp } = {}): Promise<void> {
  const query = opts.returnTo ? `?returnTo=${encodeURIComponent(opts.returnTo)}` : "";
  await page.goto(`/sign-in${query}`);
  await fillPasswordSignInForm(page, creds);

  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in") || url.pathname.startsWith("/sign-in/two-factor"), { timeout: 30_000 }).catch(async () => {
    const alert = await page.getByRole("alert").first().textContent().catch(() => null);
    throw new Error(`Sign-in did not complete for ${creds.email}${alert ? `: ${alert.trim()}` : ""}`);
  });
  const url = new URL(page.url());
  if (url.pathname.startsWith("/sign-in/two-factor")) {
    throw new Error(`${creds.email} has two-factor authentication on; the E2E accounts must not (re-run npm run db:seed:e2e).`);
  }
  if (url.pathname.startsWith("/account/security") && url.searchParams.get("require") === "2fa") {
    throw new Error("Staff 2FA is required on this database; run npm run db:seed:e2e (it sets security.require_staff_2fa to false locally).");
  }
  const expected = opts.expectPath ?? (opts.returnTo ? pathOf(opts.returnTo) : undefined);
  if (expected instanceof RegExp) await expect(page).toHaveURL(expected);
  else if (expected) await page.waitForURL((u) => u.pathname === expected || u.pathname.startsWith(`${expected.replace(/\/$/, "")}/`));
}

/** Sign out through the real form (POST /sign-out). */
export async function signOut(page: Page): Promise<void> {
  await page.request.post("/sign-out", { headers: { origin: new URL(page.url()).origin } });
  await page.context().clearCookies();
}
