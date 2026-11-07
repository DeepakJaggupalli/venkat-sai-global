import { MARKET_REGIONS, QUALIFICATION_KINDS, SKILL_CATEGORIES } from "@/db/schema/_constants";
import { humanize } from "@/lib/format";

/**
 * Taxonomy admin configuration (pure, client-safe): one entry per reference list, describing the
 * editable fields, the CSV columns (import and export use the same headers) and the natural key used to
 * match CSV rows to existing records.
 */
export const TAXONOMY_KINDS = ["countries", "states", "languages", "currencies", "industries", "job-categories", "skills", "education-levels", "qualification-types"] as const;
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];

export type OptionSource = "currencies" | "countries" | "industries" | "jobCategories" | "marketRegions" | "skillCategories" | "qualificationKinds";

export type TaxonomyField = {
  name: string;
  label: string;
  kind: "text" | "textarea" | "number" | "checkbox" | "select" | "search-select";
  required?: boolean;
  /** Natural keys cannot change after creation (other records and code refer to them). */
  createOnly?: boolean;
  options?: OptionSource;
  hint?: string;
  min?: number;
  max?: number;
};

export type TaxonomyConfig = {
  kind: TaxonomyKind;
  title: string;
  singular: string;
  description: string;
  /** "code" kinds use a text primary key; others use a uuid id. */
  idField: "code" | "id";
  fields: TaxonomyField[];
  /** CSV header → field name. */
  csv: [header: string, field: string][];
  searchHint: string;
};

const active: TaxonomyField = { name: "isActive", label: "Active (shown in forms and filters)", kind: "checkbox" };
const sortOrder: TaxonomyField = { name: "sortOrder", label: "Sort order", kind: "number", min: -10000, max: 10000, hint: "Lower numbers appear first; ties sort by name." };

export const TAXONOMIES: Record<TaxonomyKind, TaxonomyConfig> = {
  countries: {
    kind: "countries",
    title: "Countries",
    singular: "country",
    description: "ISO 3166-1 countries. Destinations mark overseas markets Venkat Sai serves; public pages show a destination only when a published destination page exists.",
    idField: "code",
    searchHint: "Search by name or code",
    fields: [
      { name: "code", label: "ISO code (2 letters)", kind: "text", required: true, createOnly: true },
      { name: "iso3", label: "ISO alpha-3 code", kind: "text" },
      { name: "name", label: "Name", kind: "text", required: true },
      { name: "nativeName", label: "Native name", kind: "text" },
      { name: "phoneCode", label: "Calling code", kind: "text", hint: "Digits only, e.g. 971" },
      { name: "currencyCode", label: "Main currency", kind: "search-select", options: "currencies" },
      { name: "continent", label: "Continent", kind: "text" },
      { name: "marketRegion", label: "Market region", kind: "select", options: "marketRegions" },
      sortOrder,
      active,
      { name: "isDestination", label: "Overseas employment destination", kind: "checkbox" },
    ],
    csv: [["code", "code"], ["iso3", "iso3"], ["name", "name"], ["native_name", "nativeName"], ["phone_code", "phoneCode"], ["currency_code", "currencyCode"], ["continent", "continent"], ["market_region", "marketRegion"], ["active", "isActive"], ["destination", "isDestination"], ["sort_order", "sortOrder"]],
  },
  states: {
    kind: "states",
    title: "States and regions",
    singular: "state",
    description: "States, union territories and regions within a country.",
    idField: "id",
    searchHint: "Search by name or code",
    fields: [
      { name: "countryCode", label: "Country", kind: "search-select", options: "countries", required: true },
      { name: "name", label: "Name", kind: "text", required: true },
      { name: "code", label: "Code", kind: "text", hint: "e.g. AP" },
      active,
    ],
    csv: [["country_code", "countryCode"], ["code", "code"], ["name", "name"], ["active", "isActive"]],
  },
  languages: {
    kind: "languages",
    title: "Languages",
    singular: "language",
    description: "Languages candidates can list. “Interface language” marks languages the People Portal is translated into.",
    idField: "code",
    searchHint: "Search by name or code",
    fields: [
      { name: "code", label: "Language code (ISO 639-1 / BCP-47)", kind: "text", required: true, createOnly: true },
      { name: "name", label: "Name (English)", kind: "text", required: true },
      { name: "nativeName", label: "Native name", kind: "text" },
      sortOrder,
      active,
      { name: "isUiLocale", label: "Interface language", kind: "checkbox", hint: "Only languages with a full translation (English, Hindi, Telugu) can be interface languages." },
    ],
    csv: [["code", "code"], ["name", "name"], ["native_name", "nativeName"], ["active", "isActive"], ["ui_locale", "isUiLocale"], ["sort_order", "sortOrder"]],
  },
  currencies: {
    kind: "currencies",
    title: "Currencies",
    singular: "currency",
    description: "ISO 4217 currencies for salaries, plans and invoices. Minor units decide how amounts are stored.",
    idField: "code",
    searchHint: "Search by name or code",
    fields: [
      { name: "code", label: "ISO code (3 letters)", kind: "text", required: true, createOnly: true },
      { name: "name", label: "Name", kind: "text", required: true },
      { name: "symbol", label: "Symbol", kind: "text", required: true },
      { name: "minorUnits", label: "Minor units (decimals)", kind: "number", min: 0, max: 4, required: true, hint: "Changing this for a currency already in use changes how stored amounts read. Avoid unless correcting an error." },
      active,
    ],
    csv: [["code", "code"], ["name", "name"], ["symbol", "symbol"], ["minor_units", "minorUnits"], ["active", "isActive"]],
  },
  industries: {
    kind: "industries",
    title: "Industries",
    singular: "industry",
    description: "Industries for employers, jobs and courses.",
    idField: "id",
    searchHint: "Search by name or slug",
    fields: [
      { name: "name", label: "Name", kind: "text", required: true },
      { name: "slug", label: "Slug", kind: "text", hint: "Leave blank to generate from the name. Used in URLs and imports." },
      { name: "parentId", label: "Parent industry", kind: "search-select", options: "industries" },
      { name: "description", label: "Description", kind: "textarea" },
      sortOrder,
      active,
    ],
    csv: [["slug", "slug"], ["name", "name"], ["description", "description"], ["parent_slug", "parentSlug"], ["active", "isActive"], ["sort_order", "sortOrder"]],
  },
  "job-categories": {
    kind: "job-categories",
    title: "Job categories",
    singular: "job category",
    description: "Hierarchical job categories. Renaming a category refreshes job and candidate search in the background.",
    idField: "id",
    searchHint: "Search by name or slug",
    fields: [
      { name: "name", label: "Name", kind: "text", required: true },
      { name: "slug", label: "Slug", kind: "text", hint: "Leave blank to generate from the name." },
      { name: "parentId", label: "Parent category", kind: "search-select", options: "jobCategories" },
      { name: "industryId", label: "Industry", kind: "search-select", options: "industries" },
      { name: "description", label: "Description", kind: "textarea" },
      sortOrder,
      active,
    ],
    csv: [["slug", "slug"], ["name", "name"], ["description", "description"], ["parent_slug", "parentSlug"], ["industry_slug", "industrySlug"], ["active", "isActive"], ["sort_order", "sortOrder"]],
  },
  skills: {
    kind: "skills",
    title: "Skills",
    singular: "skill",
    description: "Curated skills with synonyms for search. People can suggest new skills; approve them here before they appear in pickers.",
    idField: "id",
    searchHint: "Search by name, slug or synonym",
    fields: [
      { name: "name", label: "Name", kind: "text", required: true },
      { name: "slug", label: "Slug", kind: "text", hint: "Leave blank to generate from the name." },
      { name: "category", label: "Category", kind: "select", options: "skillCategories", required: true },
      { name: "synonyms", label: "Synonyms", kind: "textarea", hint: "Separate with commas, e.g. MIG welding, GMAW. Synonyms help search match other spellings." },
      active,
    ],
    csv: [["slug", "slug"], ["name", "name"], ["category", "category"], ["synonyms", "synonyms"], ["status", "status"], ["active", "isActive"]],
  },
  "education-levels": {
    kind: "education-levels",
    title: "Education levels",
    singular: "education level",
    description: "Ordered from lowest to highest attainment. The order drives “minimum qualification” filters.",
    idField: "id",
    searchHint: "Search by name or key",
    fields: [
      { name: "key", label: "Key", kind: "text", required: true, createOnly: true, hint: "Lowercase letters, numbers and underscores." },
      { name: "name", label: "Name", kind: "text", required: true },
      { name: "rank", label: "Rank", kind: "number", min: 0, max: 1000, required: true, hint: "Higher rank = higher attainment." },
      active,
    ],
    csv: [["key", "key"], ["name", "name"], ["rank", "rank"], ["active", "isActive"]],
  },
  "qualification-types": {
    kind: "qualification-types",
    title: "Qualification types",
    singular: "qualification type",
    description: "Degrees, diplomas, licences and trade certificates candidates can record.",
    idField: "id",
    searchHint: "Search by name or key",
    fields: [
      { name: "key", label: "Key", kind: "text", required: true, createOnly: true, hint: "Lowercase letters, numbers and underscores." },
      { name: "name", label: "Name", kind: "text", required: true },
      { name: "kind", label: "Kind", kind: "select", options: "qualificationKinds", required: true },
      active,
    ],
    csv: [["key", "key"], ["name", "name"], ["kind", "kind"], ["active", "isActive"]],
  },
};

export function isTaxonomyKind(v: string): v is TaxonomyKind {
  return (TAXONOMY_KINDS as readonly string[]).includes(v);
}

export const STATIC_OPTIONS = {
  marketRegions: MARKET_REGIONS.map((v) => ({ value: v, label: v === "gcc" ? "GCC" : humanize(v) })),
  skillCategories: SKILL_CATEGORIES.map((v) => ({ value: v, label: humanize(v) })),
  qualificationKinds: QUALIFICATION_KINDS.map((v) => ({ value: v, label: humanize(v) })),
};

/** Map a CSV record (header-keyed) to form-style field values. Unknown headers are ignored. */
export function csvToInput(kind: TaxonomyKind, record: Record<string, string>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [header, field] of TAXONOMIES[kind].csv) {
    if (header in record) out[field] = record[header] === "" ? undefined : record[header];
  }
  return out;
}

/** Split a synonyms cell or textarea ("a, b; c | d") into unique, trimmed values. */
export function splitSynonyms(value: string | undefined | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (value ?? "").split(/[,;|\n]/)) {
    const s = raw.trim().replace(/\s+/g, " ");
    if (!s || s.length > 80) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.slice(0, 30);
}

/** Would setting `parentId` as the parent of `id` create a cycle? `parentOf` maps id → parent id. */
export function createsCycle(id: string, parentId: string | null | undefined, parentOf: ReadonlyMap<string, string | null>): boolean {
  let cur = parentId ?? null;
  for (let guard = 0; cur && guard < 1000; guard++) {
    if (cur === id) return true;
    cur = parentOf.get(cur) ?? null;
  }
  return false;
}
