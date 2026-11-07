/**
 * CMS field descriptors (client-safe).
 *
 * One declaration per field drives three things, so they can never drift apart:
 *  1. the admin editor — descriptors are plain serialisable objects (label, help, options, limits…) from which
 *     ONE generic editor renders inputs (see `describeCollection()` in collections.ts);
 *  2. validation — `buildObjectSchema(fields, mode)` derives the zod schema at runtime:
 *       - "draft":   every field optional (incomplete drafts can be saved), formats still checked;
 *       - "publish": `required` fields must be present (non-empty lists), plus the collection's refinements;
 *  3. TypeScript types — builders carry phantom types, so `DataOf<typeof fields>` is the typed entry data.
 *
 * Stored values are JSON: dates "YYYY-MM-DD", datetimes ISO 8601 with offset, assets = media_assets.id,
 * collection references = cms_entries.id, taxonomy references = ids (industries, job_categories, skills) or
 * language codes, countries = ISO 3166-1 alpha-2. Rich text is sanitised on write by the content service.
 * Fields flagged `internal` are editor-only notes: public queries never return them.
 */
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { z } from "zod";

import type { CmsCollection, MediaKind } from "@/db/schema";

import { isAllowedMapEmbedUrl, isSafeLink, parseVideoEmbedUrl } from "./embeds";

// ---------------------------------------------------------------------------
// Descriptor types
// ---------------------------------------------------------------------------

export type SelectOption<V extends string = string> = { readonly value: V; readonly label: string };

type FieldCommon = {
  readonly label: string;
  /** Help text shown under the input. */
  readonly help?: string;
  /** Required to publish (drafts may omit it). Lists, multi-selects and asset lists need at least one item. */
  readonly required: boolean;
  /** Editor-only (internal notes, evidence pointers): never returned by public queries or preview. */
  readonly internal?: boolean;
  readonly placeholder?: string;
};

export type TextFieldDescriptor = FieldCommon & {
  readonly type: "text";
  readonly maxLength?: number;
  /** Regular expression source the trimmed value must match. */
  readonly pattern?: string;
  readonly patternMessage?: string;
};
export type TextareaFieldDescriptor = FieldCommon & { readonly type: "textarea"; readonly maxLength?: number; readonly rows?: number };
export type RichTextFieldDescriptor = FieldCommon & { readonly type: "richtext"; readonly maxLength?: number };
export type NumberFieldDescriptor = FieldCommon & { readonly type: "number"; readonly min?: number; readonly max?: number; readonly integer?: boolean };
export type BooleanFieldDescriptor = FieldCommon & { readonly type: "boolean"; readonly defaultValue?: boolean };
export type DateFieldDescriptor = FieldCommon & { readonly type: "date" };
export type DateTimeFieldDescriptor = FieldCommon & { readonly type: "datetime" };
export type SelectFieldDescriptor = FieldCommon & { readonly type: "select"; readonly options: readonly SelectOption[] };
export type MultiSelectFieldDescriptor = FieldCommon & {
  readonly type: "multiselect";
  readonly options: readonly SelectOption[];
  readonly maxItems?: number;
};
export type AssetFieldDescriptor = FieldCommon & { readonly type: "asset"; readonly kinds?: readonly MediaKind[] };
export type AssetsFieldDescriptor = FieldCommon & { readonly type: "assets"; readonly kinds?: readonly MediaKind[]; readonly maxItems?: number };
/** link = site-relative path (when allowRelative) or http(s) URL; video = YouTube/Vimeo (normalised to the player URL); map = map embed. */
export type UrlFieldDescriptor = FieldCommon & {
  readonly type: "url";
  readonly urlKind?: "link" | "video" | "map";
  readonly allowRelative?: boolean;
};
export type EmailFieldDescriptor = FieldCommon & { readonly type: "email" };
/** Validated as a real number (default country India) but stored as typed, so the display format is kept. */
export type PhoneFieldDescriptor = FieldCommon & { readonly type: "phone" };
/** An ordered list of short texts (benefits, requirements…). */
export type TextListFieldDescriptor = FieldCommon & { readonly type: "textlist"; readonly maxItems?: number; readonly maxLength?: number };
/** An ordered list of objects with sub-fields (FAQs, process steps, links…). */
export type ListFieldDescriptor = FieldCommon & {
  readonly type: "list";
  readonly fields: FieldMap;
  readonly itemLabel: string;
  /** Sub-field used as the item's title in the editor (collapsed rows). */
  readonly titleField?: string;
  readonly minItems?: number;
  readonly maxItems?: number;
};
/** A nested object rendered as a fieldset (contact details, a call to action…). */
export type GroupFieldDescriptor = FieldCommon & { readonly type: "group"; readonly fields: FieldMap };

export type TaxonomyKey = "industries" | "job_categories" | "skills" | "languages";
export type ReferenceTarget = { readonly kind: "collection"; readonly collection: CmsCollection } | { readonly kind: "taxonomy"; readonly taxonomy: TaxonomyKey };
export type ReferenceFieldDescriptor = FieldCommon & {
  readonly type: "reference";
  readonly target: ReferenceTarget;
  readonly multiple: boolean;
  readonly maxItems?: number;
};
export type CountryFieldDescriptor = FieldCommon & { readonly type: "country"; readonly multiple: boolean; readonly maxItems?: number };

export type FieldDescriptor =
  | TextFieldDescriptor
  | TextareaFieldDescriptor
  | RichTextFieldDescriptor
  | NumberFieldDescriptor
  | BooleanFieldDescriptor
  | DateFieldDescriptor
  | DateTimeFieldDescriptor
  | SelectFieldDescriptor
  | MultiSelectFieldDescriptor
  | AssetFieldDescriptor
  | AssetsFieldDescriptor
  | UrlFieldDescriptor
  | EmailFieldDescriptor
  | PhoneFieldDescriptor
  | TextListFieldDescriptor
  | ListFieldDescriptor
  | GroupFieldDescriptor
  | ReferenceFieldDescriptor
  | CountryFieldDescriptor;

export type FieldType = FieldDescriptor["type"];

// ---------------------------------------------------------------------------
// Phantom typing
// ---------------------------------------------------------------------------

declare const FIELD_VALUE: unique symbol;
declare const FIELD_REQUIRED: unique symbol;

/** Type-only markers: the TS value type of a field and whether it is required. Never present at runtime. */
type Phantom<T, R extends boolean> = { readonly [FIELD_VALUE]: T; readonly [FIELD_REQUIRED]: R };

export type Field<D extends FieldDescriptor = FieldDescriptor, T = unknown, R extends boolean = boolean> = D & Phantom<T, R>;
export type AnyField = FieldDescriptor & Phantom<unknown, boolean>;
export type FieldMap = { readonly [name: string]: AnyField };

type ValueOf<X> = X extends Phantom<infer T, boolean> ? T : unknown;
type IsRequired<X> = X extends Phantom<unknown, true> ? true : false;
type Prettify<T> = { [K in keyof T]: T[K] } & {};

/** Typed data for a field map: required fields are required keys, everything else optional. */
export type DataOf<F extends FieldMap> = Prettify<
  { -readonly [K in keyof F as IsRequired<F[K]> extends true ? K : never]: ValueOf<F[K]> } & {
    -readonly [K in keyof F as IsRequired<F[K]> extends true ? never : K]?: ValueOf<F[K]>;
  }
>;

function make<D extends FieldDescriptor, T, R extends boolean>(descriptor: D): Field<D, T, R> {
  return descriptor as Field<D, T, R>;
}

type Opts<D extends FieldDescriptor, R extends boolean> = Omit<D, "type" | "required"> & { readonly required?: R };

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export const field = {
  text<const R extends boolean = false>(o: Opts<TextFieldDescriptor, R>) {
    return make<TextFieldDescriptor, string, R>({ ...o, type: "text", required: o.required ?? false });
  },
  textarea<const R extends boolean = false>(o: Opts<TextareaFieldDescriptor, R>) {
    return make<TextareaFieldDescriptor, string, R>({ ...o, type: "textarea", required: o.required ?? false });
  },
  richtext<const R extends boolean = false>(o: Opts<RichTextFieldDescriptor, R>) {
    return make<RichTextFieldDescriptor, string, R>({ ...o, type: "richtext", required: o.required ?? false });
  },
  number<const R extends boolean = false>(o: Opts<NumberFieldDescriptor, R>) {
    return make<NumberFieldDescriptor, number, R>({ ...o, type: "number", required: o.required ?? false });
  },
  boolean<const R extends boolean = false>(o: Opts<BooleanFieldDescriptor, R>) {
    return make<BooleanFieldDescriptor, boolean, R>({ ...o, type: "boolean", required: o.required ?? false });
  },
  date<const R extends boolean = false>(o: Opts<DateFieldDescriptor, R>) {
    return make<DateFieldDescriptor, string, R>({ ...o, type: "date", required: o.required ?? false });
  },
  datetime<const R extends boolean = false>(o: Opts<DateTimeFieldDescriptor, R>) {
    return make<DateTimeFieldDescriptor, string, R>({ ...o, type: "datetime", required: o.required ?? false });
  },
  select<const V extends string, const R extends boolean = false>(
    o: Omit<Opts<SelectFieldDescriptor, R>, "options"> & { readonly options: readonly SelectOption<V>[] },
  ) {
    return make<SelectFieldDescriptor, V, R>({ ...o, type: "select", required: o.required ?? false });
  },
  multiselect<const V extends string, const R extends boolean = false>(
    o: Omit<Opts<MultiSelectFieldDescriptor, R>, "options"> & { readonly options: readonly SelectOption<V>[] },
  ) {
    return make<MultiSelectFieldDescriptor, V[], R>({ ...o, type: "multiselect", required: o.required ?? false });
  },
  asset<const R extends boolean = false>(o: Opts<AssetFieldDescriptor, R>) {
    return make<AssetFieldDescriptor, string, R>({ ...o, type: "asset", required: o.required ?? false });
  },
  assets<const R extends boolean = false>(o: Opts<AssetsFieldDescriptor, R>) {
    return make<AssetsFieldDescriptor, string[], R>({ ...o, type: "assets", required: o.required ?? false });
  },
  url<const R extends boolean = false>(o: Opts<UrlFieldDescriptor, R>) {
    return make<UrlFieldDescriptor, string, R>({ ...o, type: "url", required: o.required ?? false });
  },
  email<const R extends boolean = false>(o: Opts<EmailFieldDescriptor, R>) {
    return make<EmailFieldDescriptor, string, R>({ ...o, type: "email", required: o.required ?? false });
  },
  phone<const R extends boolean = false>(o: Opts<PhoneFieldDescriptor, R>) {
    return make<PhoneFieldDescriptor, string, R>({ ...o, type: "phone", required: o.required ?? false });
  },
  textlist<const R extends boolean = false>(o: Opts<TextListFieldDescriptor, R>) {
    return make<TextListFieldDescriptor, string[], R>({ ...o, type: "textlist", required: o.required ?? false });
  },
  list<const F extends FieldMap, const R extends boolean = false>(o: Omit<Opts<ListFieldDescriptor, R>, "fields"> & { readonly fields: F }) {
    return make<ListFieldDescriptor, DataOf<F>[], R>({ ...o, type: "list", required: o.required ?? false });
  },
  group<const F extends FieldMap, const R extends boolean = false>(o: Omit<Opts<GroupFieldDescriptor, R>, "fields"> & { readonly fields: F }) {
    return make<GroupFieldDescriptor, DataOf<F>, R>({ ...o, type: "group", required: o.required ?? false });
  },
  reference<const M extends boolean = false, const R extends boolean = false>(
    o: Omit<Opts<ReferenceFieldDescriptor, R>, "multiple"> & { readonly multiple?: M },
  ) {
    return make<ReferenceFieldDescriptor, M extends true ? string[] : string, R>({
      ...o,
      type: "reference",
      multiple: o.multiple ?? false,
      required: o.required ?? false,
    });
  },
  country<const M extends boolean = false, const R extends boolean = false>(
    o: Omit<Opts<CountryFieldDescriptor, R>, "multiple"> & { readonly multiple?: M },
  ) {
    return make<CountryFieldDescriptor, M extends true ? string[] : string, R>({
      ...o,
      type: "country",
      multiple: o.multiple ?? false,
      required: o.required ?? false,
    });
  },
};

// ---------------------------------------------------------------------------
// Zod generation
// ---------------------------------------------------------------------------

export type SchemaMode = "draft" | "publish";

export type BuildOptions = {
  /** Leave out `internal` fields (public output). Unknown keys are always stripped. */
  omitInternal?: boolean;
};

/** Default length limits when a descriptor does not set one. */
export const FIELD_LIMITS = {
  text: 300,
  textarea: 5_000,
  richtext: 200_000,
  textlistItem: 300,
  textlistItems: 50,
  assets: 60,
  listItems: 100,
  references: 50,
} as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LANGUAGE_CODE = /^[a-z]{2,3}$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;

/** null, "", whitespace, [] and objects whose every value is blank (an untouched optional fieldset). */
export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.every(isBlank);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).every(isBlank);
  return false;
}

function blankToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  if (typeof value === "object" && !Array.isArray(value) && isBlank(value)) return undefined;
  return value;
}

/** A single value becomes a one-item list; blank items (including untouched list rows) are dropped (FormData-friendly). */
function toList(value: unknown): unknown {
  const list = Array.isArray(value) ? value : value === undefined ? undefined : [value];
  return list?.filter((item) => !isBlank(item));
}

function unique<T>(list: T[]): T[] {
  return [...new Set(list)];
}

export function isValidCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Visible text of a rich-text string (tags removed) — used to reject "<p></p>" as an empty value. */
export function richTextHasContent(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/g, " ").trim().length > 0 || /<img\b/i.test(html);
}

function stringBase(max: number): z.ZodString {
  return z.string({ error: "Enter text" }).trim().max(max, `Keep this under ${max.toLocaleString("en")} characters`);
}

function uuidList(max: number): z.ZodType<string[]> {
  return z.preprocess(toList, z.array(z.uuid("Invalid reference")).max(max, `Choose at most ${max}`).transform(unique));
}

/** The schema for a present (non-blank) value of the field. */
function baseSchema(d: FieldDescriptor, mode: SchemaMode, opts: BuildOptions): z.ZodType {
  switch (d.type) {
    case "text": {
      let s = stringBase(d.maxLength ?? FIELD_LIMITS.text);
      if (d.pattern) s = s.regex(new RegExp(d.pattern), d.patternMessage ?? "Invalid format");
      return s;
    }
    case "textarea":
      return stringBase(d.maxLength ?? FIELD_LIMITS.textarea);
    case "richtext":
      return z.string({ error: "Enter text" }).max(d.maxLength ?? FIELD_LIMITS.richtext, "This text is too long");
    case "number": {
      let n = z.number({ error: "Enter a number" });
      if (d.integer) n = n.int("Enter a whole number");
      if (d.min !== undefined) n = n.min(d.min, `Must be at least ${d.min}`);
      if (d.max !== undefined) n = n.max(d.max, `Must be at most ${d.max}`);
      return z.preprocess((v) => (typeof v === "string" ? Number(v.trim()) : v), n);
    }
    case "boolean":
      return z.preprocess((v) => {
        if (v === "on" || v === "true" || v === "1") return true;
        if (v === "off" || v === "false" || v === "0") return false;
        return v;
      }, z.boolean({ error: "Choose yes or no" }));
    case "date":
      return z.string().trim().refine(isValidCalendarDate, "Enter a valid date (YYYY-MM-DD)");
    case "datetime":
      return z.iso.datetime({ offset: true, error: "Enter a valid date and time" });
    case "select":
      return z.enum(d.options.map((o) => o.value) as [string, ...string[]], { error: "Choose a valid option" });
    case "multiselect":
      return z.preprocess(
        toList,
        z
          .array(z.enum(d.options.map((o) => o.value) as [string, ...string[]], { error: "Choose valid options" }))
          .max(d.maxItems ?? d.options.length, `Choose at most ${d.maxItems ?? d.options.length}`)
          .transform(unique),
      );
    case "asset":
      return z.uuid("Choose a media item");
    case "assets":
      return uuidList(d.maxItems ?? FIELD_LIMITS.assets);
    case "url": {
      const kind = d.urlKind ?? "link";
      const s = z.string().trim();
      if (kind === "video") {
        return s.transform((value, ctx) => {
          const embed = parseVideoEmbedUrl(value);
          if (!embed) {
            ctx.addIssue({ code: "custom", message: "Enter a YouTube or Vimeo video link" });
            return z.NEVER;
          }
          return embed.embedUrl;
        });
      }
      if (kind === "map") return s.refine(isAllowedMapEmbedUrl, "Enter a Google Maps or OpenStreetMap embed link (https)");
      return s.refine(
        (value) => isSafeLink(value, { allowRelative: d.allowRelative ?? false }),
        d.allowRelative ? "Enter a site path starting with / or a full http(s) link" : "Enter a full link starting with https://",
      );
    }
    case "email":
      return z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));
    case "phone":
      return z
        .string()
        .trim()
        .max(40, "Phone number is too long")
        .refine((value) => parsePhoneNumberFromString(value, "IN")?.isValid() ?? false, "Enter a valid phone number with country code");
    case "textlist": {
      const max = d.maxItems ?? FIELD_LIMITS.textlistItems;
      return z.preprocess(toList, z.array(stringBase(d.maxLength ?? FIELD_LIMITS.textlistItem)).max(max, `Add at most ${max} items`));
    }
    case "list": {
      const max = d.maxItems ?? FIELD_LIMITS.listItems;
      let list = z.array(buildObjectSchema(d.fields, mode, opts)).max(max, `Add at most ${max} items`);
      if (mode === "publish" && d.minItems) list = list.min(d.minItems, `Add at least ${d.minItems}`);
      return z.preprocess(toList, list);
    }
    case "group":
      return buildObjectSchema(d.fields, mode, opts);
    case "reference": {
      const single =
        d.target.kind === "taxonomy" && d.target.taxonomy === "languages"
          ? z.string().trim().toLowerCase().regex(LANGUAGE_CODE, "Choose a language")
          : z.uuid("Choose an item");
      if (!d.multiple) return single;
      const max = d.maxItems ?? FIELD_LIMITS.references;
      return z.preprocess(toList, z.array(single).max(max, `Choose at most ${max}`).transform(unique));
    }
    case "country": {
      const single = z.string().trim().toUpperCase().regex(COUNTRY_CODE, "Choose a country");
      if (!d.multiple) return single;
      const max = d.maxItems ?? 250;
      return z.preprocess(toList, z.array(single).max(max, `Choose at most ${max}`).transform(unique));
    }
  }
}

/** A value that satisfies "required to publish" (present, non-blank, lists non-empty, rich text with visible content). */
function hasRequiredValue(d: FieldDescriptor, value: unknown): boolean {
  const v = blankToUndefined(value);
  if (v === undefined) return false;
  if (Array.isArray(v)) return v.some((item) => !isBlank(item));
  if (d.type === "richtext" && typeof v === "string") return richTextHasContent(v);
  return true;
}

/**
 * Schema for one field in a mode (handles blank → undefined, required-to-publish and rich-text emptiness).
 *
 * Required fields are wrapped in a non-optional `z.custom` gate: Zod 4 objects silently drop the issues of a
 * key whose schema accepts `undefined` when the key is missing, so the requirement must not live inside an
 * optional schema.
 */
export function fieldSchema(d: FieldDescriptor, mode: SchemaMode, opts: BuildOptions = {}): z.ZodType {
  const base = baseSchema(d, mode, opts);
  const optional = z.preprocess(blankToUndefined, base.optional());
  if (mode !== "publish" || !d.required) return optional;
  return z.custom<unknown>((value) => hasRequiredValue(d, value), `${d.label} is required to publish`).pipe(optional);
}

/** Copy of parsed data without `undefined` values (blank inputs leave no empty keys behind). */
export function dropUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => dropUndefined(item)) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, dropUndefined(v)]),
    ) as T;
  }
  return value;
}

/** z.object for a field map (unknown keys stripped). */
export function buildObjectSchema(fields: FieldMap, mode: SchemaMode, opts: BuildOptions = {}): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType> = {};
  for (const [name, d] of Object.entries(fields)) {
    if (opts.omitInternal && d.internal) continue;
    shape[name] = fieldSchema(d, mode, opts);
  }
  return z.object(shape) as unknown as z.ZodType<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Serialisable descriptors for the editor
// ---------------------------------------------------------------------------

/** A descriptor with its name; nested `fields` become arrays (stable order). Plain JSON — safe to pass to client components. */
export type SerializedField = Omit<FieldDescriptor, "fields"> & { name: string; fields?: SerializedField[] };

export function serializeFields(fields: FieldMap): SerializedField[] {
  return Object.entries(fields).map(([name, d]) => {
    if (d.type === "list" || d.type === "group") {
      const { fields: nested, ...rest } = d;
      return { ...rest, name, fields: serializeFields(nested) } as SerializedField;
    }
    return { ...d, name } as SerializedField;
  });
}
