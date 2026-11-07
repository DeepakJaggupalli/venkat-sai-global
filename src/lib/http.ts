/**
 * Small, client-safe helpers for URLs, pagination, slugs and CSV.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

/** First value of a search param. */
export function sp(params: SearchParams | undefined, key: string): string | undefined {
  const v = params?.[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() !== "" ? s : undefined;
}

/** All values of a repeated search param. */
export function spAll(params: SearchParams | undefined, key: string): string[] {
  const v = params?.[key];
  if (!v) return [];
  return (Array.isArray(v) ? v : v.split(",")).map((x) => x.trim()).filter(Boolean);
}

export type PageQuery = { page: number; pageSize: number; offset: number };

export function parsePage(params: SearchParams | undefined, opts: { defaultSize?: number; maxSize?: number } = {}): PageQuery {
  const page = Math.max(1, Number.parseInt(sp(params, "page") ?? "1", 10) || 1);
  const requested = Number.parseInt(sp(params, "pageSize") ?? "", 10);
  const pageSize = Math.min(opts.maxSize ?? 100, Math.max(1, Number.isFinite(requested) ? requested : (opts.defaultSize ?? 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number; pageCount: number };

export function paginated<T>(items: T[], total: number, q: Pick<PageQuery, "page" | "pageSize">): Paginated<T> {
  return { items, total, page: q.page, pageSize: q.pageSize, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) };
}

/** Build a URL keeping existing params, e.g. for pagination / filter links. */
export function withParams(pathname: string, params: SearchParams | undefined, patch: Record<string, string | number | null | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => usp.append(k, x));
    else usp.set(k, v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") usp.delete(k);
    else usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Only allow same-site relative redirect targets (prevents open redirects). */
export function safeReturnTo(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

export function slugify(input: string, maxLength = 80): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

/** Generate a unique slug given an async existence check. */
export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  const root = slugify(base) || "item";
  if (!(await exists(root))) return root;
  for (let i = 2; i < 500; i++) {
    const candidate = `${root}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** RFC-4180 CSV. Values are stringified; formulas are neutralised against CSV injection. */
export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: { key: keyof T; header: string }[]): string {
  const escape = (value: unknown) => {
    let s = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => escape(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => escape(r[c.key])).join(",")).join("\r\n");
  return `${head}\r\n${body}`;
}
