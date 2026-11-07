/**
 * Pure pagination helpers (client-safe, unit-tested).
 */
export type PageToken = number | "ellipsis-start" | "ellipsis-end";

/**
 * Page numbers to render: always the first and last page, `siblings` pages either side of the
 * current page, and ellipses for the gaps. A gap of exactly one page shows that page instead of "…".
 *
 *   pageWindow(6, 12) → [1, "ellipsis-start", 5, 6, 7, "ellipsis-end", 12]
 */
export function pageWindow(page: number, pageCount: number, siblings = 1): PageToken[] {
  const count = Math.max(1, Math.floor(pageCount));
  const current = Math.min(Math.max(1, Math.floor(page)), count);
  // first + last + current + 2*siblings + 2 ellipses
  const slots = 2 * siblings + 5;
  if (count <= slots) return Array.from({ length: count }, (_, i) => i + 1);

  const left = Math.max(current - siblings, 2);
  const right = Math.min(current + siblings, count - 1);
  const showStartGap = left > 3;
  const showEndGap = right < count - 2;

  const tokens: PageToken[] = [1];
  if (showStartGap) {
    tokens.push("ellipsis-start");
  } else {
    for (let p = 2; p < left; p++) tokens.push(p);
  }
  for (let p = left; p <= right; p++) tokens.push(p);
  if (showEndGap) {
    tokens.push("ellipsis-end");
  } else {
    for (let p = right + 1; p < count; p++) tokens.push(p);
  }
  tokens.push(count);

  // Keep the number of slots stable near the edges (avoids layout jumps while paging).
  if (!showStartGap && showEndGap) {
    const lastNumber = tokens[tokens.length - 3];
    if (typeof lastNumber === "number") {
      const extra: number[] = [];
      for (let p = lastNumber + 1; tokens.length + extra.length < slots && p < count - 1; p++) extra.push(p);
      tokens.splice(tokens.length - 2, 0, ...extra);
    }
  } else if (showStartGap && !showEndGap) {
    const firstNumber = tokens[2];
    if (typeof firstNumber === "number") {
      const extra: number[] = [];
      for (let p = firstNumber - 1; tokens.length + extra.length < slots && p > 2; p--) extra.unshift(p);
      tokens.splice(2, 0, ...extra);
    }
  }
  return tokens;
}

/** "21–40 of 132" range for the summary line. */
export function pageRange(page: number, pageSize: number, total: number): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const from = (Math.max(1, page) - 1) * pageSize + 1;
  return { from: Math.min(from, total), to: Math.min(from + pageSize - 1, total) };
}
