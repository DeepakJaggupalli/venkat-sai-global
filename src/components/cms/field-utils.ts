/**
 * Pure helpers for the CMS editors (client-safe, unit-tested in field-utils.test.ts).
 *
 * The generic entry editor keeps the whole entry as plain JSON and edits nested values by path
 * ("faqs.0.answer"). Field errors from the content module are keyed "data.<path>", "seo.<key>", "title"…
 */
import type { FieldDescriptor, SerializedField } from "@/modules/content/fields";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * `SerializedField` from the content module, as a discriminated union (its `Omit` over the descriptor union
 * collapses the per-type props, so the editor narrows on this type instead).
 */
export type EditorField = DistributiveOmit<FieldDescriptor, "fields"> & { name: string; fields?: EditorField[] };

/** Narrow serialized descriptors (plain JSON from describeCollection) for the editor. */
export function asEditorFields(fields: readonly SerializedField[] | undefined): EditorField[] {
  return (fields ?? []) as unknown as EditorField[];
}

export type Path = (string | number)[];
export type FieldErrors = Record<string, string[] | undefined>;

export function pathKey(path: Path): string {
  return path.map(String).join(".");
}

/** Read a nested value. */
export function getAt(value: unknown, path: Path): unknown {
  let current: unknown = value;
  for (const segment of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

/** Immutable nested write: copies every object/array on the way down. */
export function setAt<T>(root: T, path: Path, next: unknown): T {
  if (path.length === 0) return next as T;
  const [head, ...rest] = path;
  const isIndex = typeof head === "number";
  const base: unknown = root ?? (isIndex ? [] : {});
  const copy: Record<string | number, unknown> | unknown[] = Array.isArray(base) ? [...base] : { ...(base as Record<string, unknown>) };
  const child = (copy as Record<string | number, unknown>)[head as string | number];
  const updated = setAt(child, rest, next);
  if (updated === undefined && !Array.isArray(copy)) delete (copy as Record<string, unknown>)[head as string];
  else (copy as Record<string | number, unknown>)[head as string | number] = updated;
  return copy as T;
}

/** Move an array element (returns a new array; out-of-range moves are no-ops). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

/** Errors for exactly this key. */
export function errorsAt(errors: FieldErrors | undefined, key: string): string[] | undefined {
  const list = errors?.[key];
  return list && list.length ? list : undefined;
}

/** Number of errors at or below a key (collapsed list rows and sections show a count). */
export function countErrorsUnder(errors: FieldErrors | undefined, key: string): number {
  if (!errors) return 0;
  let n = 0;
  for (const [k, v] of Object.entries(errors)) {
    if (!v?.length) continue;
    if (k === key || k.startsWith(`${key}.`)) n += v.length;
  }
  return n;
}

/** Initial value for a new field / list row. */
export function emptyValueFor(field: EditorField): unknown {
  switch (field.type) {
    case "boolean":
      return field.defaultValue ?? false;
    case "multiselect":
    case "assets":
    case "textlist":
    case "list":
      return [];
    case "reference":
    case "country":
      return field.multiple ? [] : undefined;
    case "group":
      return emptyObjectFor(field.fields ?? []);
    default:
      return undefined;
  }
}

export function emptyObjectFor(fields: readonly EditorField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = emptyValueFor(f);
    if (v !== undefined) out[f.name] = v;
  }
  return out;
}

/** Title shown on a collapsed list row. */
export function listItemTitle(item: unknown, field: EditorField, index: number): string {
  const label = field.type === "list" ? field.itemLabel : "Item";
  const titleField = field.type === "list" ? field.titleField : undefined;
  if (titleField && item && typeof item === "object") {
    const raw = (item as Record<string, unknown>)[titleField];
    const sub = field.fields?.find((f) => f.name === titleField);
    if (typeof raw === "string" && raw.trim()) {
      if (sub && (sub.type === "select" || sub.type === "multiselect")) {
        return sub.options.find((o) => o.value === raw)?.label ?? raw;
      }
      return raw.trim().slice(0, 80);
    }
  }
  return `${label} ${index + 1}`;
}

/** `datetime-local` value ("2026-11-07T09:30") in the browser's zone from an ISO string. */
export function toDatetimeLocal(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO 8601 with offset from a `datetime-local` value (interpreted in the browser's zone); "" → undefined. */
export function fromDatetimeLocal(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Readable one-line rendering of a stored value for version diffs (no HTML is ever rendered). */
export function describeValue(value: unknown, max = 240): string {
  if (value === undefined || value === null || value === "") return "(empty)";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const text = /<[a-z][\s\S]*>/i.test(value) ? stripTags(value) : value;
    return truncate(text.replace(/\s+/g, " ").trim(), max) || "(empty)";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "(empty)";
    if (value.every((v) => typeof v === "string" || typeof v === "number")) return truncate(value.join(", "), max);
    return `${value.length} item${value.length === 1 ? "" : "s"}: ${truncate(value.map((v) => describeValue(v, 60)).join(" · "), max)}`;
  }
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))
      .map(([k, v]) => `${k}: ${describeValue(v, 60)}`);
    return parts.length ? truncate(parts.join("; "), max) : "(empty)";
  }
  return truncate(String(value), max);
}

function stripTags(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|li|blockquote)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** SEO title / description length guidance (search engines truncate around these lengths). */
export const SEO_LIMITS = { title: 70, description: 200, idealTitle: 60, idealDescription: 160 } as const;

/** Collect every asset id referenced from an entry's data (so the editor can show thumbnails). */
export function collectAssetIds(fields: readonly EditorField[], data: unknown, out: Set<string> = new Set()): Set<string> {
  if (!data || typeof data !== "object") return out;
  const obj = data as Record<string, unknown>;
  for (const f of fields) {
    const v = obj[f.name];
    if (f.type === "asset" && typeof v === "string") out.add(v);
    else if (f.type === "assets" && Array.isArray(v)) v.forEach((id) => typeof id === "string" && out.add(id));
    else if (f.type === "group") collectAssetIds(f.fields ?? [], v, out);
    else if (f.type === "list" && Array.isArray(v)) v.forEach((row) => collectAssetIds(f.fields ?? [], row, out));
  }
  return out;
}

/** Collect referenced entry ids per target collection (pickers preload their labels). */
export function collectReferenceTargets(fields: readonly EditorField[], out: Set<string> = new Set()): Set<string> {
  for (const f of fields) {
    if (f.type === "reference" && f.target.kind === "collection") out.add(f.target.collection);
    if (f.fields?.length) collectReferenceTargets(f.fields, out);
  }
  return out;
}

export function collectTaxonomyTargets(fields: readonly EditorField[], out: Set<string> = new Set()): Set<string> {
  for (const f of fields) {
    if (f.type === "reference" && f.target.kind === "taxonomy") out.add(f.target.taxonomy);
    if (f.fields?.length) collectTaxonomyTargets(f.fields, out);
  }
  return out;
}

export function usesCountries(fields: readonly EditorField[]): boolean {
  return fields.some((f) => f.type === "country" || (f.fields?.length ? usesCountries(f.fields) : false));
}
