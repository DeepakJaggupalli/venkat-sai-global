import { expect, type Page } from "@playwright/test";

/**
 * Helpers shared by the public website specs (ui-public-marketing, ui-public-content).
 */

/** Collects console errors and uncaught page errors for the lifetime of the page. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/**
 * Waits until the page is hydrated and visually settled before an automated accessibility scan:
 *  - hides the Next.js dev-tools badge (dev server only; it overlaps the cookie banner and skews colour checks,
 *    and it can mount after hydration, so a stylesheet is used instead of removing the element once);
 *  - waits for the cookie banner buttons to be enabled (they are disabled until the consent state is read on
 *    the client) and for running CSS transitions to finish: axe samples colours mid-transition otherwise and
 *    reports the 50% "disabled" opacity as a contrast failure.
 */
export async function settleForScan(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const accept = page.getByRole("region", { name: /privacy choices/i }).getByRole("button", { name: /accept all/i });
  if (await accept.count()) await expect(accept).toBeEnabled();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
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
