import "server-only";

import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { countries, currencies, educationLevels, industries, jobCategories, languages, qualificationTypes, skills, states } from "@/db/schema";
import type { SkillCategory } from "@/db/schema/_constants";

/**
 * Read helpers for reference data (forms, filters, public pages).
 * All memoised per request. Admin CRUD lives in the settings/taxonomies admin module.
 */
export type Option = { value: string; label: string };

export const listCountries = cache(async (opts: { destinationsOnly?: boolean } = {}) =>
  db
    .select()
    .from(countries)
    .where(opts.destinationsOnly ? and(eq(countries.isActive, true), eq(countries.isDestination, true)) : eq(countries.isActive, true))
    .orderBy(asc(countries.sortOrder), asc(countries.name)),
);

export const countryOptions = cache(async (): Promise<Option[]> => (await listCountries()).map((c) => ({ value: c.code, label: c.name })));

export const listStates = cache(async (countryCode: string) =>
  db.select().from(states).where(and(eq(states.countryCode, countryCode), eq(states.isActive, true))).orderBy(asc(states.name)),
);

export const listLanguages = cache(async () => db.select().from(languages).where(eq(languages.isActive, true)).orderBy(asc(languages.sortOrder), asc(languages.name)));

export const listCurrencies = cache(async () => db.select().from(currencies).where(eq(currencies.isActive, true)).orderBy(asc(currencies.code)));

export const currencyOptions = cache(async (): Promise<Option[]> =>
  (await listCurrencies()).map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` })),
);

export const listIndustries = cache(async () => db.select().from(industries).where(eq(industries.isActive, true)).orderBy(asc(industries.sortOrder), asc(industries.name)));

export const industryOptions = cache(async (): Promise<Option[]> => (await listIndustries()).map((i) => ({ value: i.id, label: i.name })));

export const listJobCategories = cache(async () =>
  db.select().from(jobCategories).where(eq(jobCategories.isActive, true)).orderBy(asc(jobCategories.sortOrder), asc(jobCategories.name)),
);

export const jobCategoryOptions = cache(async (): Promise<Option[]> => (await listJobCategories()).map((c) => ({ value: c.id, label: c.name })));

export const listEducationLevels = cache(async () => db.select().from(educationLevels).where(eq(educationLevels.isActive, true)).orderBy(asc(educationLevels.rank)));

export const listQualificationTypes = cache(async () =>
  db.select().from(qualificationTypes).where(eq(qualificationTypes.isActive, true)).orderBy(asc(qualificationTypes.name)),
);

export async function getSkillsByIds(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(skills).where(inArray(skills.id, ids));
}

/** Typeahead search over approved skills (name + synonyms), trigram-ranked. */
export async function searchSkills(query: string, opts: { category?: SkillCategory; limit?: number } = {}) {
  const q = query.trim();
  if (!q) return [];
  const pattern = `%${q.replace(/[%_]/g, "")}%`;
  return db
    .select({ id: skills.id, name: skills.name, category: skills.category, slug: skills.slug })
    .from(skills)
    .where(
      and(
        eq(skills.isActive, true),
        eq(skills.status, "approved"),
        opts.category ? eq(skills.category, opts.category) : undefined,
        or(ilike(skills.name, pattern), sql`exists (select 1 from unnest(${skills.synonyms}) s where s ilike ${pattern})`),
      ),
    )
    .orderBy(sql`similarity(${skills.name}, ${q}) desc`, asc(skills.name))
    .limit(opts.limit ?? 20);
}
