import "server-only";

import { and, asc, count, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import type { SelectOption } from "@/components/shared/types";
import { db } from "@/db";
import { countries, currencies, educationLevels, industries, jobCategories, languages, qualificationTypes, skills, states } from "@/db/schema";
import { humanize } from "@/lib/format";
import { paginated, toCsv, type PageQuery, type Paginated } from "@/lib/http";

import { STATIC_OPTIONS, TAXONOMIES, type OptionSource, type TaxonomyKind } from "./config";

/**
 * Admin reads for reference data (includes inactive and pending records, unlike the public taxonomy
 * module reads). Callers authorise with requireStaff("settings.view") first.
 */

export type TaxonomyRow = {
  id: string;
  name: string;
  secondary: string | null;
  badges: string[];
  isActive: boolean;
  status: string | null;
  /** Field values for the edit form (keys match TAXONOMIES[kind].fields). */
  values: Record<string, string | number | boolean | null>;
};

export type TaxonomyFilters = { q?: string; status?: "active" | "inactive" | "pending"; country?: string; category?: string; /** exact record id / code */ id?: string };

const like = (q: string) => `%${q.replace(/[%_\\]/g, "")}%`;

function activeFilter(col: SQL | Parameters<typeof eq>[0], status?: TaxonomyFilters["status"]) {
  if (status === "active") return eq(col as Parameters<typeof eq>[0], true);
  if (status === "inactive") return eq(col as Parameters<typeof eq>[0], false);
  return undefined;
}

async function nameMap(kind: "industries" | "jobCategories"): Promise<Map<string, { name: string; parentId: string | null }>> {
  const table = kind === "industries" ? industries : jobCategories;
  const rows = await db.select({ id: table.id, name: table.name, parentId: table.parentId }).from(table);
  return new Map(rows.map((r) => [r.id, { name: r.name, parentId: r.parentId }]));
}

export async function listTaxonomy(kind: TaxonomyKind, f: TaxonomyFilters, page: PageQuery): Promise<Paginated<TaxonomyRow>> {
  const q = f.q?.trim();
  switch (kind) {
    case "countries": {
      const where = and(f.id ? eq(countries.code, f.id) : undefined, q ? or(ilike(countries.name, like(q)), ilike(countries.code, like(q)), ilike(countries.nativeName, like(q))) : undefined, activeFilter(countries.isActive, f.status));
      const [rows, [total]] = await Promise.all([
        db.select().from(countries).where(where).orderBy(asc(countries.sortOrder), asc(countries.name)).limit(page.pageSize).offset(page.offset),
        db.select({ value: count() }).from(countries).where(where),
      ]);
      return paginated(
        rows.map((r) => ({
          id: r.code,
          name: r.name,
          secondary: [r.code, r.marketRegion ? humanize(r.marketRegion) : null, r.currencyCode, r.phoneCode ? `+${r.phoneCode}` : null].filter(Boolean).join(" · "),
          badges: r.isDestination ? ["Destination"] : [],
          isActive: r.isActive,
          status: null,
          values: { code: r.code, iso3: r.iso3, name: r.name, nativeName: r.nativeName, phoneCode: r.phoneCode, currencyCode: r.currencyCode, continent: r.continent, marketRegion: r.marketRegion, sortOrder: r.sortOrder, isActive: r.isActive, isDestination: r.isDestination },
        })),
        total?.value ?? 0,
        page,
      );
    }
    case "states": {
      const where = and(f.id ? eq(states.id, f.id) : undefined, q ? or(ilike(states.name, like(q)), ilike(states.code, like(q))) : undefined, f.country ? eq(states.countryCode, f.country) : undefined, activeFilter(states.isActive, f.status));
      const [rows, [total]] = await Promise.all([
        db
          .select({ s: states, countryName: countries.name })
          .from(states)
          .innerJoin(countries, eq(countries.code, states.countryCode))
          .where(where)
          .orderBy(asc(countries.name), asc(states.name))
          .limit(page.pageSize)
          .offset(page.offset),
        db.select({ value: count() }).from(states).where(where),
      ]);
      return paginated(
        rows.map(({ s, countryName }) => ({
          id: s.id,
          name: s.name,
          secondary: [countryName, s.code].filter(Boolean).join(" · "),
          badges: [],
          isActive: s.isActive,
          status: null,
          values: { countryCode: s.countryCode, name: s.name, code: s.code, isActive: s.isActive },
        })),
        total?.value ?? 0,
        page,
      );
    }
    case "languages": {
      const where = and(f.id ? eq(languages.code, f.id) : undefined, q ? or(ilike(languages.name, like(q)), ilike(languages.code, like(q)), ilike(languages.nativeName, like(q))) : undefined, activeFilter(languages.isActive, f.status));
      const [rows, [total]] = await Promise.all([
        db.select().from(languages).where(where).orderBy(asc(languages.sortOrder), asc(languages.name)).limit(page.pageSize).offset(page.offset),
        db.select({ value: count() }).from(languages).where(where),
      ]);
      return paginated(
        rows.map((r) => ({
          id: r.code,
          name: r.nativeName && r.nativeName !== r.name ? `${r.name} (${r.nativeName})` : r.name,
          secondary: r.code,
          badges: r.isUiLocale ? ["Interface language"] : [],
          isActive: r.isActive,
          status: null,
          values: { code: r.code, name: r.name, nativeName: r.nativeName, sortOrder: r.sortOrder, isActive: r.isActive, isUiLocale: r.isUiLocale },
        })),
        total?.value ?? 0,
        page,
      );
    }
    case "currencies": {
      const where = and(f.id ? eq(currencies.code, f.id) : undefined, q ? or(ilike(currencies.name, like(q)), ilike(currencies.code, like(q))) : undefined, activeFilter(currencies.isActive, f.status));
      const [rows, [total]] = await Promise.all([
        db.select().from(currencies).where(where).orderBy(asc(currencies.code)).limit(page.pageSize).offset(page.offset),
        db.select({ value: count() }).from(currencies).where(where),
      ]);
      return paginated(
        rows.map((r) => ({
          id: r.code,
          name: `${r.code} — ${r.name}`,
          secondary: `Symbol ${r.symbol} · ${r.minorUnits} decimal${r.minorUnits === 1 ? "" : "s"}`,
          badges: [],
          isActive: r.isActive,
          status: null,
          values: { code: r.code, name: r.name, symbol: r.symbol, minorUnits: r.minorUnits, isActive: r.isActive },
        })),
        total?.value ?? 0,
        page,
      );
    }
    case "industries":
    case "job-categories": {
      const isInd = kind === "industries";
      const table = isInd ? industries : jobCategories;
      const where = and(f.id ? eq(table.id, f.id) : undefined, q ? or(ilike(table.name, like(q)), ilike(table.slug, like(q))) : undefined, activeFilter(table.isActive, f.status));
      const [rows, [total], parents, inds] = await Promise.all([
        db.select().from(table).where(where).orderBy(asc(table.sortOrder), asc(table.name)).limit(page.pageSize).offset(page.offset),
        db.select({ value: count() }).from(table).where(where),
        nameMap(isInd ? "industries" : "jobCategories"),
        isInd ? Promise.resolve(null) : nameMap("industries"),
      ]);
      return paginated(
        rows.map((r) => {
          const industryId = "industryId" in r ? (r.industryId as string | null) : null;
          const path = ancestry(r.parentId, parents);
          return {
            id: r.id,
            name: r.name,
            secondary: [path.length ? `Under ${path.join(" › ")}` : "Top level", industryId && inds ? inds.get(industryId)?.name : null, r.slug].filter(Boolean).join(" · "),
            badges: [],
            isActive: r.isActive,
            status: null,
            values: { name: r.name, slug: r.slug, parentId: r.parentId, ...(isInd ? {} : { industryId }), description: r.description, sortOrder: r.sortOrder, isActive: r.isActive },
          };
        }),
        total?.value ?? 0,
        page,
      );
    }
    case "skills": {
      const where = and(
        f.id ? eq(skills.id, f.id) : undefined,
        q ? or(ilike(skills.name, like(q)), ilike(skills.slug, like(q)), sql`exists (select 1 from unnest(${skills.synonyms}) s where s ilike ${like(q)})`) : undefined,
        f.status === "pending" ? eq(skills.status, "pending") : activeFilter(skills.isActive, f.status),
        f.category ? sql`${skills.category} = ${f.category}` : undefined,
      );
      const [rows, [total]] = await Promise.all([
        db
          .select()
          .from(skills)
          .where(where)
          .orderBy(sql`case when ${skills.status} = 'pending' then 0 else 1 end`, asc(skills.name))
          .limit(page.pageSize)
          .offset(page.offset),
        db.select({ value: count() }).from(skills).where(where),
      ]);
      return paginated(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          secondary: [humanize(r.category), r.synonyms.length ? `Also: ${r.synonyms.slice(0, 4).join(", ")}${r.synonyms.length > 4 ? "…" : ""}` : null].filter(Boolean).join(" · "),
          badges: [],
          isActive: r.isActive,
          status: r.status,
          values: { name: r.name, slug: r.slug, category: r.category, synonyms: r.synonyms.join(", "), isActive: r.isActive },
        })),
        total?.value ?? 0,
        page,
      );
    }
    case "education-levels": {
      const where = and(f.id ? eq(educationLevels.id, f.id) : undefined, q ? or(ilike(educationLevels.name, like(q)), ilike(educationLevels.key, like(q))) : undefined, activeFilter(educationLevels.isActive, f.status));
      const [rows, [total]] = await Promise.all([
        db.select().from(educationLevels).where(where).orderBy(asc(educationLevels.rank), asc(educationLevels.name)).limit(page.pageSize).offset(page.offset),
        db.select({ value: count() }).from(educationLevels).where(where),
      ]);
      return paginated(
        rows.map((r) => ({ id: r.id, name: r.name, secondary: `Rank ${r.rank} · ${r.key}`, badges: [], isActive: r.isActive, status: null, values: { key: r.key, name: r.name, rank: r.rank, isActive: r.isActive } })),
        total?.value ?? 0,
        page,
      );
    }
    case "qualification-types": {
      const where = and(f.id ? eq(qualificationTypes.id, f.id) : undefined, q ? or(ilike(qualificationTypes.name, like(q)), ilike(qualificationTypes.key, like(q))) : undefined, activeFilter(qualificationTypes.isActive, f.status));
      const [rows, [total]] = await Promise.all([
        db.select().from(qualificationTypes).where(where).orderBy(asc(qualificationTypes.name)).limit(page.pageSize).offset(page.offset),
        db.select({ value: count() }).from(qualificationTypes).where(where),
      ]);
      return paginated(
        rows.map((r) => ({ id: r.id, name: r.name, secondary: `${humanize(r.kind)} · ${r.key}`, badges: [], isActive: r.isActive, status: null, values: { key: r.key, name: r.name, kind: r.kind, isActive: r.isActive } })),
        total?.value ?? 0,
        page,
      );
    }
  }
}

function ancestry(parentId: string | null, map: Map<string, { name: string; parentId: string | null }>): string[] {
  const out: string[] = [];
  let cur = parentId;
  for (let i = 0; cur && i < 10; i++) {
    const node = map.get(cur);
    if (!node) break;
    out.unshift(node.name);
    cur = node.parentId;
  }
  return out;
}

/** One record's edit values (null when it does not exist). */
export async function getTaxonomyValues(kind: TaxonomyKind, id: string): Promise<TaxonomyRow | null> {
  if (TAXONOMIES[kind].idField === "id" && !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await listTaxonomy(kind, { id }, { page: 1, pageSize: 1, offset: 0 });
  return res.items[0] ?? null;
}

/** Options for the edit form's select fields. */
export async function loadTaxonomyOptions(sources: readonly OptionSource[]): Promise<Partial<Record<OptionSource, SelectOption[]>>> {
  const out: Partial<Record<OptionSource, SelectOption[]>> = {};
  await Promise.all(
    [...new Set(sources)].map(async (s) => {
      if (s === "currencies") out[s] = (await db.select({ code: currencies.code, name: currencies.name }).from(currencies).where(eq(currencies.isActive, true)).orderBy(asc(currencies.code))).map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));
      else if (s === "countries") out[s] = (await db.select({ code: countries.code, name: countries.name }).from(countries).orderBy(asc(countries.name))).map((c) => ({ value: c.code, label: c.name, keywords: [c.code] }) as SelectOption);
      else if (s === "industries" || s === "jobCategories") {
        const map = await nameMap(s);
        out[s] = [...map.entries()]
          .map(([id, n]) => {
            const path = ancestry(n.parentId, map);
            return { value: id, label: path.length ? `${path.join(" › ")} › ${n.name}` : n.name };
          })
          .sort((a, b) => a.label.localeCompare(b.label));
      } else out[s] = STATIC_OPTIONS[s];
    }),
  );
  return out;
}

/** Record counts per list (hub page), plus skills awaiting review. */
export async function taxonomyCounts(): Promise<Record<TaxonomyKind, number> & { pendingSkills: number }> {
  const c = async (t: typeof countries | typeof states | typeof languages | typeof currencies | typeof industries | typeof jobCategories | typeof skills | typeof educationLevels | typeof qualificationTypes) =>
    (await db.select({ value: count() }).from(t))[0]?.value ?? 0;
  const [a, b, l, cur, i, j, s, e, qt, pending] = await Promise.all([
    c(countries),
    c(states),
    c(languages),
    c(currencies),
    c(industries),
    c(jobCategories),
    c(skills),
    c(educationLevels),
    c(qualificationTypes),
    db.select({ value: count() }).from(skills).where(eq(skills.status, "pending")),
  ]);
  return { countries: a, states: b, languages: l, currencies: cur, industries: i, "job-categories": j, skills: s, "education-levels": e, "qualification-types": qt, pendingSkills: pending[0]?.value ?? 0 };
}

const yn = (v: unknown) => (v === true ? "yes" : v === false ? "no" : "");

/** Full list as CSV with the same headers the importer accepts. */
export async function exportTaxonomyCsv(kind: TaxonomyKind): Promise<string> {
  const cfg = TAXONOMIES[kind];
  let rows: Record<string, unknown>[] = [];
  switch (kind) {
    case "countries":
      rows = (await db.select().from(countries).orderBy(asc(countries.sortOrder), asc(countries.name))).map((r) => ({ ...r, isActive: yn(r.isActive), isDestination: yn(r.isDestination) }));
      break;
    case "states":
      rows = (await db.select().from(states).orderBy(asc(states.countryCode), asc(states.name))).map((r) => ({ ...r, isActive: yn(r.isActive) }));
      break;
    case "languages":
      rows = (await db.select().from(languages).orderBy(asc(languages.sortOrder), asc(languages.name))).map((r) => ({ ...r, isActive: yn(r.isActive), isUiLocale: yn(r.isUiLocale) }));
      break;
    case "currencies":
      rows = (await db.select().from(currencies).orderBy(asc(currencies.code))).map((r) => ({ ...r, isActive: yn(r.isActive) }));
      break;
    case "industries":
    case "job-categories": {
      const isInd = kind === "industries";
      const table = isInd ? industries : jobCategories;
      const all = await db.select().from(table).orderBy(asc(table.sortOrder), asc(table.name));
      const slugById = new Map(all.map((r) => [r.id, r.slug]));
      const indSlug = isInd ? slugById : new Map((await db.select({ id: industries.id, slug: industries.slug }).from(industries)).map((r) => [r.id, r.slug]));
      rows = all.map((r) => ({
        ...r,
        parentSlug: r.parentId ? (slugById.get(r.parentId) ?? "") : "",
        industrySlug: "industryId" in r && r.industryId ? (indSlug.get(r.industryId as string) ?? "") : "",
        isActive: yn(r.isActive),
      }));
      break;
    }
    case "skills":
      rows = (await db.select().from(skills).orderBy(asc(skills.name))).map((r) => ({ ...r, synonyms: r.synonyms.join(" | "), isActive: yn(r.isActive) }));
      break;
    case "education-levels":
      rows = (await db.select().from(educationLevels).orderBy(asc(educationLevels.rank))).map((r) => ({ ...r, isActive: yn(r.isActive) }));
      break;
    case "qualification-types":
      rows = (await db.select().from(qualificationTypes).orderBy(asc(qualificationTypes.name))).map((r) => ({ ...r, isActive: yn(r.isActive) }));
      break;
  }
  return toCsv(
    rows,
    cfg.csv.map(([header, field]) => ({ key: field, header })),
  );
}
