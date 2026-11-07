import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

import { expectNoA11yViolations, expectNoHorizontalScroll, latestOtpCode } from "./support";

/**
 * Helpers shared by the People Portal specs (ui-talent-jobs, ui-talent-profile, ui-talent-training).
 */

/** For the first assertion after a server action that redirects or re-renders the page (slow dev renders under load). */
export const ACTION_TIMEOUT = 45_000;

/** The cookie banner is fixed to the bottom of the viewport and covers end-of-form buttons; choose like a visitor would. */
export async function dismissCookieBanner(page: Page): Promise<void> {
  const reject = page.getByRole("region", { name: /your privacy choices/i }).getByRole("button", { name: /reject non-essential/i });
  await expect(async () => {
    if (await reject.isVisible()) await reject.click({ timeout: 2_000 });
    await expect(reject).toBeHidden({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Collect 5xx responses (documents, RSC and server actions) while a test runs. */
export function watchServerErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  return () => errors;
}

/**
 * Register a brand-new candidate through /sign-up with an email address unique to this run and project, and
 * verify it with the 6-digit code from the dev outbox. Unique addresses keep the 60-second resend cooldown
 * out of the way when chromium and mobile run back to back. Ends signed in, on the People Portal.
 */
export async function registerCandidate(page: Page, testInfo: TestInfo, label: string): Promise<{ email: string; name: string }> {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `talent-${label}-${testInfo.project.name}-${stamp}@e2e.venkatsai.test`.toLowerCase();
  const name = `E2E Signup ${label} ${stamp}`;
  await page.goto("/sign-up?returnTo=%2Ftalent");
  await dismissCookieBanner(page);
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email address").fill(email);
  // Nothing from the name or the address: the password rules refuse a password that contains them.
  await page.getByLabel("Password (optional)").fill(`Pw-${randomUUID().replace(/-/g, "").slice(0, 16)}-Kx9`);
  await page.getByRole("checkbox", { name: /terms of service/i }).check();
  await page.getByRole("checkbox", { name: /privacy notice/i }).check();
  const since = new Date(Date.now() - 2_000);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/verify/);
  await expect(page.getByRole("heading", { level: 1, name: /verify your account/i })).toBeVisible();
  const code = await latestOtpCode(email, { channel: "email", since });
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/talent"), { timeout: 30_000 });
  return { email, name };
}

/** ISO date of birth for someone who turned `years` a few days ago. */
export function dateOfBirthForAge(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Wait until React has hydrated an element (it carries React's props key). A click before that submits the form
 * natively, without JavaScript: it still works, but the server's answer cannot put back what was typed, which is
 * not what interactive checks such as "keeps the input after an error" are about.
 */
export async function waitForHydration(locator: Locator): Promise<void> {
  await expect
    .poll(() => locator.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__reactProps$"))), { timeout: 30_000, message: "the page did not hydrate" })
    .toBe(true);
}

/** Fill the onboarding age step (the page a new candidate is held on) and submit it. */
export async function confirmDateOfBirth(page: Page, years: number): Promise<void> {
  const form = page.getByTestId("onboarding-dob-form");
  await expect(form).toBeVisible();
  await waitForHydration(form);
  await form.getByLabel(/date of birth/i).fill(dateOfBirthForAge(years));
  await form.getByRole("button").click();
  // The action redirects to the next step; on a loaded dev machine that render can take well over 10 s.
  await expect(form).toBeHidden({ timeout: ACTION_TIMEOUT });
}

/** Baseline checks for a page: no 5xx, exactly one h1, no sideways scroll, no serious/critical axe violations. */
export async function expectHealthyPage(page: Page, target: string): Promise<void> {
  const response = await page.goto(target);
  expect(response?.status(), `${target} status`).toBeLessThan(500);
  await expect(page.getByRole("heading", { level: 1 }), `${target} should have exactly one h1`).toHaveCount(1);
  await expect(page.getByText(/something went wrong|this page could not load/i)).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await waitForAnimations(page);
  await expectNoA11yViolations(page);
}

/**
 * Wait until entrance transitions have finished. Axe measured buttons mid fade-in (partly transparent) and
 * reported a contrast failure that a settled page does not have. Endless animations (spinners) are ignored.
 */
export async function waitForAnimations(page: Page): Promise<void> {
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity), undefined, { timeout: 5_000 })
    .catch(() => undefined);
}

// ---- Raw translation keys ------------------------------------------------------------------------------

const MESSAGES_EN = path.join(__dirname, "..", "src", "i18n", "messages", "en");
/** Every dotted English key ("requests.col.file"); a key printed as-is means a lookup failed in every locale. */
const DOTTED_KEYS: readonly string[] = readdirSync(MESSAGES_EN)
  .filter((file) => file.endsWith(".json"))
  .flatMap((file) => Object.keys(JSON.parse(readFileSync(path.join(MESSAGES_EN, file), "utf8")) as Record<string, string>))
  .filter((key) => key.includes("."));
const KEY_LIKE = /(?<![\w@./-])[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9_]*){2,}(?![\w@/-])/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
}

/**
 * Translation keys printed in place of text: known English keys, plus anything shaped like a key with at
 * least two dots ("enum.status.open") that is not a domain, an email address or a file name.
 */
export function findRawKeys(text: string): string[] {
  const known = DOTTED_KEYS.filter((key) => new RegExp(`(?<![\\w@./-])${escapeRegExp(key)}(?![\\w@/-]|\\.\\w)`).test(text));
  const shaped = (text.match(KEY_LIKE) ?? []).filter((token) => !/\.(test|com|in|org|net|gov|pdf|png|jpg|json|ics)$/.test(token) && !token.includes("venkatsai"));
  return [...new Set([...known, ...shaped])];
}

/** Assert the page renders in `locale` (html lang) with no raw translation keys in the visible text. */
export async function expectTranslated(page: Page, target: string, locale: "en" | "hi" | "te"): Promise<void> {
  const response = await page.goto(target);
  expect(response?.status(), `${target} status`).toBeLessThan(500);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(findRawKeys(text), `raw translation keys on ${target} (${locale})`).toEqual([]);
}
