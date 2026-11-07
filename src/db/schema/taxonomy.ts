/**
 * Reference data administered from /admin/settings/taxonomies.
 * Layer 1 — imports nothing from other schema files.
 */
import { boolean, char, foreignKey, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { MARKET_REGIONS, QUALIFICATION_KINDS, SKILL_CATEGORIES } from "./_constants";
import { countryCode, currencyCode, pk, timestamps } from "./_shared";

export const currencies = pgTable("currencies", {
  code: char({ length: 3 }).primaryKey(),
  name: text().notNull(),
  symbol: text().notNull(),
  minorUnits: integer().notNull().default(2),
  isActive: boolean().notNull().default(true),
  ...timestamps,
});

export const countries = pgTable(
  "countries",
  {
    code: char({ length: 2 }).primaryKey(),
    iso3: char({ length: 3 }),
    name: text().notNull(),
    nativeName: text(),
    phoneCode: text(),
    currencyCode: currencyCode().references(() => currencies.code),
    continent: text(),
    marketRegion: text({ enum: MARKET_REGIONS }),
    /** Shown in selectors. */
    isActive: boolean().notNull().default(true),
    /** Flagged as an overseas employment destination served by Venkat Sai (Global Reach). */
    isDestination: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index("countries_market_region_idx").on(t.marketRegion), index("countries_currency_idx").on(t.currencyCode)],
);

export const states = pgTable(
  "states",
  {
    id: pk(),
    countryCode: countryCode()
      .notNull()
      .references(() => countries.code, { onDelete: "cascade" }),
    code: text(),
    name: text().notNull(),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("states_country_name_uq").on(t.countryCode, t.name)],
);

export const languages = pgTable("languages", {
  /** BCP-47 / ISO-639-1 code, e.g. "en", "hi", "te", "ar". */
  code: text().primaryKey(),
  name: text().notNull(),
  nativeName: text(),
  isActive: boolean().notNull().default(true),
  /** The UI is translated into this language. */
  isUiLocale: boolean().notNull().default(false),
  sortOrder: integer().notNull().default(0),
  ...timestamps,
});

export const industries = pgTable(
  "industries",
  {
    id: pk(),
    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    parentId: uuid(),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("industries_slug_uq").on(t.slug),
    index("industries_parent_idx").on(t.parentId),
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id], name: "industries_parent_fk" }).onDelete("set null"),
  ],
);

export const jobCategories = pgTable(
  "job_categories",
  {
    id: pk(),
    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    parentId: uuid(),
    industryId: uuid().references(() => industries.id, { onDelete: "set null" }),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("job_categories_slug_uq").on(t.slug),
    index("job_categories_industry_idx").on(t.industryId),
    index("job_categories_parent_idx").on(t.parentId),
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id], name: "job_categories_parent_fk" }).onDelete("set null"),
  ],
);

export const skills = pgTable(
  "skills",
  {
    id: pk(),
    slug: text().notNull(),
    name: text().notNull(),
    category: text({ enum: SKILL_CATEGORIES }).notNull(),
    /** Insert-time default: drizzle-kit cannot round-trip an empty-array DB default (docs/SCHEMA_NOTES.md). */
    synonyms: text().array().notNull().$defaultFn(() => []),
    /** approved = curated; pending = suggested by a user and awaiting admin review. */
    status: text({ enum: ["approved", "pending", "rejected"] }).notNull().default("approved"),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("skills_slug_uq").on(t.slug),
    index("skills_category_idx").on(t.category),
    // Operator class via .op(): an SQL expression here makes drizzle-kit push re-create the index every run.
    index("skills_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
  ],
);

export const educationLevels = pgTable(
  "education_levels",
  {
    id: pk(),
    key: text().notNull(),
    name: text().notNull(),
    /** Ordering from lowest to highest attainment (used for "minimum qualification" filters). */
    rank: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("education_levels_key_uq").on(t.key)],
);

export const qualificationTypes = pgTable(
  "qualification_types",
  {
    id: pk(),
    key: text().notNull(),
    name: text().notNull(),
    kind: text({ enum: QUALIFICATION_KINDS }).notNull(),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("qualification_types_key_uq").on(t.key)],
);
