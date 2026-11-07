import { expect, type Page } from "@playwright/test";

/**
 * Layout checks. CONVENTIONS §7: no horizontal page scroll at 360 px (tables scroll inside their own
 * container). Run it with the "mobile" project or after `page.setViewportSize({ width: 360, height: 800 })`.
 */
export async function expectNoHorizontalScroll(page: Page, opts: { tolerance?: number } = {}): Promise<void> {
  const tolerance = opts.tolerance ?? 1;
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const viewport = root.clientWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.right <= viewport + 1) continue;
      // Ignore elements inside their own scroll container (wide tables, carousels).
      let parent = el.parentElement;
      let clipped = false;
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent);
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          clipped = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (clipped) continue;
      const id = el.id ? `#${el.id}` : "";
      const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}` : "";
      offenders.push(`${el.tagName.toLowerCase()}${id}${cls} (right edge ${Math.round(rect.right)}px)`);
      if (offenders.length >= 5) break;
    }
    return { overflow: root.scrollWidth - viewport, viewport, offenders };
  });
  expect(result.overflow, `Horizontal scroll of ${result.overflow}px at ${result.viewport}px wide on ${page.url()}. Widest elements:\n${result.offenders.join("\n")}`).toBeLessThanOrEqual(tolerance);
}
