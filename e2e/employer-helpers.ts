import { expect, type Page } from "@playwright/test";

import { expectNoA11yViolations, expectNoHorizontalScroll, signInWith, type Credentials } from "./support";

/**
 * Helpers shared by the employer specs (ui-employer-workspace, ui-employer-talent).
 */

/**
 * Make the cookie choice a first-time visitor makes. The banner is fixed to the bottom of the viewport, so
 * until it is answered it covers the actions at the end of long forms (Save draft, Create workspace).
 */
export async function dismissConsentBanner(page: Page): Promise<void> {
  const reject = page.getByRole("button", { name: "Reject non-essential" });
  await expect(async () => {
    if (await reject.isVisible()) await reject.click({ timeout: 2_000 });
    await expect(reject).toBeHidden({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Password sign-in through /sign-in, then answer the cookie banner. */
export async function signInAs(page: Page, creds: Credentials, returnTo: string): Promise<void> {
  await signInWith(page, creds, { returnTo });
  await dismissConsentBanner(page);
}

/** Collect server errors (5xx) for every document and fetch the page makes while the callback runs. */
export function watchServerErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  return () => errors;
}

/**
 * Baseline checks for a portal page: it rendered (no error boundary), exactly one h1, no horizontal scroll at
 * the project's viewport, no serious/critical axe violations.
 */
export async function expectHealthyPage(page: Page, path: string, h1?: string | RegExp): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), `${path} status`).toBeLessThan(500);
  await expect(page.getByText(/something went wrong|we could not load/i)).toHaveCount(0);
  const headings = page.getByRole("heading", { level: 1 });
  await expect(headings, `${path} should have exactly one h1`).toHaveCount(1);
  if (h1) await expect(headings).toHaveText(h1);
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
}

/** The friendly not-found page inside the portal (status stays 200 once streaming has started; see Next docs). */
export async function expectNotFound(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect([200, 404], `${path} status`).toContain(response?.status());
  await expect(page.getByRole("heading", { level: 1, name: /couldn.t find/i })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
}
