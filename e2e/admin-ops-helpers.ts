import { expect, type Page } from "@playwright/test";

import { expectNoA11yViolations, expectNoHorizontalScroll, signIn, type Role } from "./support";

/**
 * Helpers for the Command Centre operations and billing specs (ui-admin-ops, ui-commercial).
 */

/**
 * Answer the cookie banner like a first-time visitor. It is fixed to the bottom of the viewport, so
 * until it is answered it covers the buttons at the end of long forms (Save draft, Add note).
 */
export async function dismissConsentBanner(page: Page): Promise<void> {
  const reject = page.getByRole("button", { name: "Reject non-essential" });
  await expect(async () => {
    if (await reject.isVisible()) await reject.click({ timeout: 2_000 });
    await expect(reject).toBeHidden({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Password sign-in (lands inside `returnTo`), then answer the cookie banner. */
export async function signInAs(page: Page, role: Role, returnTo: string): Promise<void> {
  await signIn(page, role, { returnTo });
  await dismissConsentBanner(page);
}

export const unique = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Open a Radix select / searchable select by its label and pick an option. */
export async function chooseOption(page: Page, label: string | RegExp, option: string | RegExp, scope?: ReturnType<Page["locator"]>): Promise<void> {
  await (scope ?? page).getByLabel(label).first().click();
  await page.getByRole("option", { name: option }).first().click();
}

/** Collect 5xx responses (documents, RSC and Server Action posts) while a test runs. */
export function watchServerErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  return () => errors;
}

/**
 * Baseline checks for a page in this area: it renders (status < 400, no error boundary), has exactly one
 * h1, does not scroll sideways at the project's viewport and has no serious/critical axe violations.
 */
export async function expectHealthyPage(page: Page, path: string, h1?: string | RegExp): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), path).toBeLessThan(400);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading, path).toHaveCount(1);
  if (h1) await expect(heading, path).toHaveText(h1);
  await expect(page.getByText("Something went wrong"), path).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
}

/** Tab until an element inside `main` has focus and check that it shows a visible focus indicator. */
export async function expectVisibleKeyboardFocus(page: Page): Promise<void> {
  await page.locator("main").first().focus().catch(() => undefined);
  let found = false;
  for (let i = 0; i < 40 && !found; i++) {
    await page.keyboard.press("Tab");
    found = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.closest("main")) return false;
      const s = getComputedStyle(el);
      const outline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
      const ring = s.boxShadow !== "none" && s.boxShadow !== "";
      return outline || ring;
    });
  }
  expect(found, "an element in main shows a visible focus indicator").toBe(true);
}

/**
 * Open a dialog / bottom sheet from its trigger. On phones ResponsiveDialog swaps the Dialog for a Sheet
 * right after hydration (the trigger remounts), so a tap in that instant is retried.
 */
export async function openDialog(page: Page, trigger: ReturnType<Page["locator"]>): Promise<void> {
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click({ timeout: 2_000 });
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}
