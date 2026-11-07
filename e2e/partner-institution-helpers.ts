import { expect, type Locator, type Page } from "@playwright/test";

import { expectNoA11yViolations, expectNoHorizontalScroll, signInWith } from "./support";

/**
 * Helpers shared by the Recruitment Partner and Institution portal specs (ui-recruiter, ui-institution).
 */

export const unique = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export type Account = { email: string; password: string };

/** E2E_<PREFIX>_EMAIL / _PASSWORD from the env file written by `npm run db:seed:e2e`. */
export function account(prefix: string): Account | null {
  const email = process.env[`E2E_${prefix}_EMAIL`];
  const password = process.env[`E2E_${prefix}_PASSWORD`];
  return email && password ? { email, password } : null;
}

export const missing = (prefix: string): string => `E2E_${prefix}_EMAIL / E2E_${prefix}_PASSWORD not set (run npm run db:seed:e2e and source the env file)`;

/**
 * Answer the cookie banner the way a first-time visitor does. It is fixed to the bottom of the viewport and
 * covers the last action of long forms until it is answered.
 */
export async function dismissConsentBanner(page: Page): Promise<void> {
  const reject = page.getByRole("region", { name: /your privacy choices/i }).getByRole("button", { name: /reject non-essential/i });
  await expect(async () => {
    if (await reject.isVisible()) await reject.click({ timeout: 2_000 });
    await expect(reject).toBeHidden({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Password sign-in (lands inside `returnTo`), then answer the cookie banner. */
export async function signInAs(page: Page, creds: Account, returnTo: string): Promise<void> {
  await signInWith(page, creds, { returnTo });
  await dismissConsentBanner(page);
}

/** Collect 5xx responses (documents, server actions, fetches) while a test runs. */
export function watchServerErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  return () => errors;
}

/**
 * Baseline checks for a portal page: no error status or error boundary, exactly one h1 (optionally with
 * this name), no horizontal scroll at the project's viewport, no serious / critical axe violations.
 */
export async function expectHealthyPage(page: Page, path: string, h1?: string | RegExp): Promise<void> {
  const consoleErrors: string[] = [];
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300));
  };
  page.on("console", onConsole);
  const response = await page.goto(path);
  expect(response?.status(), path).toBeLessThan(400);
  await expect(page.getByRole("heading", { level: 1 }), `${path}: one h1`).toHaveCount(1);
  if (h1) await expect(page.getByRole("heading", { level: 1, name: h1 }), path).toBeVisible();
  await expect(page.getByText(/something went wrong/i), `${path}: error boundary`).toHaveCount(0);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page, { exclude: ["nextjs-portal"] });
  page.off("console", onConsole);
  expect(consoleErrors, `${path}: browser console errors`).toEqual([]);
}

/** Every link inside <main> that stays in this portal answers without an error status. */
export async function expectInternalLinksResolve(page: Page, path: string, prefix: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const hrefs = await page.locator("main a[href]").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  // At most two links per route shape (ids replaced), so long lists do not multiply the requests.
  const perShape = new Map<string, number>();
  const targets = [...new Set(hrefs.filter((h) => h.startsWith(prefix)).map((h) => h.split("#")[0]!))].filter((href) => {
    const shape = href.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id").split("?")[0]!;
    perShape.set(shape, (perShape.get(shape) ?? 0) + 1);
    return perShape.get(shape)! <= 2;
  });
  const broken: string[] = [];
  for (const href of targets) {
    const response = await page.request.get(href);
    if (response.status() >= 400) broken.push(`${response.status()} ${href}`);
  }
  expect(broken, `${path}: broken links`).toEqual([]);
}

/** The page answers with HTTP 404 and the not-found page (unknown ids and other organisations' ids alike). */
export async function expectNotFound(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: /couldn.t find that page/i }), path).toBeVisible();
}

/**
 * The friendly "no access" page. Pages without a loading boundary above the check also answer HTTP 403;
 * list pages stream behind their loading skeleton, so their status is already 200 when the check runs
 * (Next.js streaming) and only the content tells.
 */
export async function expectForbidden(page: Page, path: string, opts: { status?: 403 } = {}): Promise<void> {
  const response = await page.goto(path);
  if (opts.status) expect(response?.status(), path).toBe(opts.status);
  await expect(page.getByRole("heading", { level: 1, name: /don.t have access to this page/i }), path).toBeVisible();
}

/** Click a trigger until its dialog is open (a click that lands before hydration does nothing). */
export async function openDialog(trigger: Locator, dialog: Locator): Promise<Locator> {
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click({ timeout: 5_000 });
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  return dialog;
}

/** The portal's main navigation, opening the menu sheet first on small screens. */
export async function mainNavigation(page: Page): Promise<Locator> {
  const open = page.getByRole("button", { name: "Open menu" });
  if (await open.isVisible()) {
    await open.click();
    return page.getByRole("dialog").getByRole("navigation");
  }
  return page.getByRole("navigation", { name: "Main navigation" });
}

/** True when the focused element shows a visible focus indicator (outline or box-shadow ring). */
export async function focusIsVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    const style = getComputedStyle(el);
    const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
    const ring = style.boxShadow !== "none" && style.boxShadow !== "";
    return outline || ring;
  });
}

/** A minimal one-page PDF (the upload route sniffs the magic bytes). */
const TEST_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "latin1",
);

/** Choose a PDF in a FileUpload (its file input is labelled "<label>: Choose file") and wait until it is uploaded. */
export async function uploadPdf(scope: Page | Locator, label: string, name: string): Promise<void> {
  await scope.getByLabel(`${label}: Choose file`).setInputFiles({ name, mimeType: "application/pdf", buffer: TEST_PDF });
  await expect(scope.getByRole("button", { name: `Remove ${name}` })).toBeVisible({ timeout: 30_000 });
}
