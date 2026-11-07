import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Automated accessibility check with axe-core: WCAG 2.0 / 2.1 level A and AA rules. Fails on violations with
 * impact "serious" or "critical" (moderate / minor findings are returned for logging but do not fail).
 * Automated checks find only part of the problems — keyboard and screen-reader passes are still needed.
 */

export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

export type A11yOptions = {
  /** CSS selectors to leave out (third-party embeds, known issues tracked elsewhere). */
  exclude?: string[];
  /** Limit the scan to these selectors (default: the whole page). */
  include?: string[];
  /** axe rule ids to switch off — only with a reason in the spec. */
  disableRules?: string[];
  /** Impacts that fail the test (default: serious and critical). */
  failOn?: ("minor" | "moderate" | "serious" | "critical")[];
};

export type A11yViolation = { id: string; impact: string | null; help: string; helpUrl: string; targets: string[] };

export async function scanA11y(page: Page, opts: A11yOptions = {}): Promise<A11yViolation[]> {
  let builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS]);
  for (const selector of opts.include ?? []) builder = builder.include(selector);
  for (const selector of opts.exclude ?? []) builder = builder.exclude(selector);
  if (opts.disableRules?.length) builder = builder.disableRules(opts.disableRules);
  const results = await builder.analyze();
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? null,
    help: v.help,
    helpUrl: v.helpUrl,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
  }));
}

export async function expectNoA11yViolations(page: Page, opts: A11yOptions = {}): Promise<void> {
  const failOn = new Set<string>(opts.failOn ?? ["serious", "critical"]);
  const violations = (await scanA11y(page, opts)).filter((v) => v.impact && failOn.has(v.impact));
  const report = violations.map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.helpUrl})\n    ${v.targets.join("\n    ")}`).join("\n");
  expect(violations, `Accessibility violations on ${page.url()}:\n${report}`).toEqual([]);
}
