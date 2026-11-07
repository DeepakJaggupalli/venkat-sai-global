import { expect, test } from "@playwright/test";

import { fillPasswordSignInForm, FRESH_ROLES, hasCredentials, missingCredentials, PORTAL_HOME, signIn, type Role } from "./support/auth";

/**
 * Every account created by `npm run db:seed:e2e` can sign in with its password and reach its portal home
 * (qa:e2e-foundation). Fresh accounts are only signed in to /account so nothing is consumed.
 */

const ROLES = Object.keys(PORTAL_HOME) as Role[];

for (const role of ROLES) {
  test(`${role} signs in and reaches ${PORTAL_HOME[role]}`, async ({ page }) => {
    test.skip(!hasCredentials(role), missingCredentials(role));
    await signIn(page, role);

    const home = PORTAL_HOME[role];
    await expect(page).toHaveURL((url) => url.pathname === home || url.pathname.startsWith(`${home}/`));
    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

    if (role === "minor") {
      // Under 18 without guardian consent: the People Portal offers only the guardian step.
      await expect(page.getByTestId("onboarding-guardian-form")).toBeVisible();
      await page.goto("/talent/jobs");
      await expect(page).toHaveURL(/\/talent\/onboarding/);
    }
    if (role === "candidate") {
      // The adult candidate has passed the age gate: other People Portal pages open.
      await page.goto("/talent/profile");
      await expect(page).toHaveURL(/\/talent\/profile/);
    }
    if (FRESH_ROLES.includes(role)) {
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    }
  });
}

test("signing in with unknown credentials shows an error and stays on sign-in", async ({ page }) => {
  // An unknown address, so the shared seeded accounts never collect failed attempts (lock-out after 8).
  await page.goto("/sign-in");
  await fillPasswordSignInForm(page, { email: `nobody-${Date.now().toString(36)}@e2e.venkatsai.test`, password: "not-the-right-password-1" });
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("client components hydrate and the page does not reload by itself", async ({ page }) => {
  // Guards the test environment: without hydration (e.g. the dev server refusing /_next/hmr for the
  // 127.0.0.1 origin) or with an HMR reload loop (stale build folder), every interactive spec fails oddly.
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  await page.goto("/sign-in");
  const tab = page.getByRole("tab", { name: "One-time code" });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  const settled = navigations;
  await page.waitForTimeout(3_000);
  expect(navigations - settled, "The page reloaded by itself (HMR loop?). Stop the server, delete its .next-e2e-<slot> folder and start it again.").toBe(0);
});
