/**
 * Walking CMS entry data with its field descriptors (pure, client-safe).
 *
 * Used by the service to sanitise rich text, extract plain text for search, find media / entry / taxonomy
 * references (usage tracking, validation, public resolution) and strip internal fields from public output.
 * Every walker tolerates data that does not match the descriptors (old versions, partial drafts): values of
 * an unexpected shape are skipped, never thrown on.
 */
import type { CmsCollection } from "@/db/schema";

import type { FieldDescriptor, FieldMap, TaxonomyKey } from "./fields";

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type LeafVisit = {
  descriptor: FieldDescriptor;
  value: unknown;
  /** Dotted descriptor path without list indexes, e.g. "faqs.answer". */
  path: string;
};

/** Visit every leaf field value present in `data` (lists and groups are descended into). */
export function visitLeaves(fields: FieldMap, data: unknown, visit: (leaf: LeafVisit) => void, prefix = ""): void {
  if (!isObject(data)) return;
  for (const [name, descriptor] of Object.entries(fields)) {
    const value = data[name];
    if (value === undefined || value === null) continue;
    const path = prefix ? `${prefix}.${name}` : name;
    if (descriptor.type === "list") {
      if (Array.isArray(value)) for (const item of value) visitLeaves(descriptor.fields, item, visit, path);
    } else if (descriptor.type === "group") {
      visitLeaves(descriptor.fields, value, visit, path);
    } else {
      visit({ descriptor, value, path });
    }
  }
}

/**
 * Return a copy of `data` with each leaf value replaced by `fn(descriptor, value)`. Keys not described by
 * `fields` are dropped (the zod schemas strip them too); `undefined` results remove the key.
 */
export function mapLeaves(fields: FieldMap, data: unknown, fn: (descriptor: FieldDescriptor, value: unknown) => unknown): Json {
  const out: Json = {};
  if (!isObject(data)) return out;
  for (const [name, descriptor] of Object.entries(fields)) {
    const value = data[name];
    if (value === undefined) continue;
    if (descriptor.type === "list") {
      out[name] = Array.isArray(value) ? value.map((item) => mapLeaves(descriptor.fields, item, fn)) : value;
    } else if (descriptor.type === "group") {
      out[name] = isObject(value) ? mapLeaves(descriptor.fields, value, fn) : value;
    } else {
      const next = fn(descriptor, value);
      if (next !== undefined) out[name] = next;
    }
  }
  return out;
}

/** Sanitise every rich-text value with the given sanitiser (server passes sanitizeRichText). */
export function sanitizeRichTextFields(fields: FieldMap, data: unknown, sanitize: (html: string) => string): Json {
  return mapLeaves(fields, data, (d, value) => (d.type === "richtext" && typeof value === "string" ? sanitize(value) : value));
}

/** Remove internal (editor-only) fields at every level. */
export function stripInternalFields(fields: FieldMap, data: unknown): Json {
  const out: Json = {};
  if (!isObject(data)) return out;
  for (const [name, descriptor] of Object.entries(fields)) {
    if (descriptor.internal) continue;
    const value = data[name];
    if (value === undefined) continue;
    if (descriptor.type === "list") {
      out[name] = Array.isArray(value) ? value.map((item) => stripInternalFields(descriptor.fields, item)) : value;
    } else if (descriptor.type === "group") {
      out[name] = isObject(value) ? stripInternalFields(descriptor.fields, value) : value;
    } else {
      out[name] = value;
    }
  }
  return out;
}

const TEXT_TYPES = new Set<FieldDescriptor["type"]>(["text", "textarea", "richtext", "textlist", "select", "multiselect"]);

/**
 * Plain text for site search: text, textarea, rich text (tags stripped), text lists and option labels.
 * Internal fields, links, contact details, dates and ids are left out. Capped at `maxLength` characters.
 */
export function extractSearchText(fields: FieldMap, data: unknown, stripHtml: (html: string) => string, maxLength = 20_000): string {
  const parts: string[] = [];
  const walk = (map: FieldMap, value: unknown) => {
    if (!isObject(value)) return;
    for (const [name, d] of Object.entries(map)) {
      if (d.internal) continue;
      const v = value[name];
      if (v === undefined || v === null) continue;
      if (d.type === "list") {
        if (Array.isArray(v)) for (const item of v) walk(d.fields, item);
      } else if (d.type === "group") {
        walk(d.fields, v);
      } else if (TEXT_TYPES.has(d.type)) {
        if (d.type === "richtext" && typeof v === "string") parts.push(stripHtml(v));
        else if (d.type === "select" && typeof v === "string") parts.push(d.options.find((o) => o.value === v)?.label ?? v);
        else if (d.type === "multiselect" && Array.isArray(v)) parts.push(...v.map((x) => d.options.find((o) => o.value === x)?.label ?? String(x)));
        else if (Array.isArray(v)) parts.push(...v.filter((x): x is string => typeof x === "string"));
        else if (typeof v === "string") parts.push(v);
      }
    }
  };
  walk(fields, data);
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export type AssetRef = { assetId: string; field: string };

/** Media references inside data (asset / assets fields), with "data.<path>" field names for media_usages. */
export function collectAssetRefs(fields: FieldMap, data: unknown): AssetRef[] {
  const refs: AssetRef[] = [];
  visitLeaves(fields, data, ({ descriptor, value, path }) => {
    if (descriptor.type === "asset" && typeof value === "string") refs.push({ assetId: value, field: `data.${path}` });
    if (descriptor.type === "assets" && Array.isArray(value)) {
      for (const id of value) if (typeof id === "string") refs.push({ assetId: id, field: `data.${path}` });
    }
  });
  return refs;
}

export type ReferenceSet = {
  entries: Map<CmsCollection, Set<string>>;
  taxonomy: Map<TaxonomyKey, Set<string>>;
  countries: Set<string>;
};

/** Entry, taxonomy and country references inside data (for validation and public resolution). */
export function collectReferences(fields: FieldMap, data: unknown): ReferenceSet {
  const result: ReferenceSet = { entries: new Map(), taxonomy: new Map(), countries: new Set() };
  const add = <K>(map: Map<K, Set<string>>, key: K, value: string) => {
    const set = map.get(key) ?? new Set<string>();
    set.add(value);
    map.set(key, set);
  };
  visitLeaves(fields, data, ({ descriptor, value }) => {
    const values = (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === "string");
    if (descriptor.type === "reference") {
      for (const v of values) {
        if (descriptor.target.kind === "collection") add(result.entries, descriptor.target.collection, v);
        else add(result.taxonomy, descriptor.target.taxonomy, v);
      }
    } else if (descriptor.type === "country") {
      for (const v of values) result.countries.add(v);
    }
  });
  return result;
}

/** Stable JSON for equality checks (object keys sorted). */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
