import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { countries, currencies, educationLevels, industries, jobCategories, languages, qualificationTypes, skills, states } from "@/db/schema";
import { MARKET_REGIONS, QUALIFICATION_KINDS, SKILL_CATEGORIES } from "@/db/schema/_constants";
import { LOCALES } from "@/i18n/config";
import { ActionError } from "@/lib/actions";
import { slugify } from "@/lib/http";
import { audit } from "@/modules/audit";
import { getSettings } from "@/modules/settings";
import { afterCategoryChanged, afterSkillChanged } from "@/modules/taxonomy/service";

import { csvBool, csvRecords } from "../../_lib/csv";
import { createsCycle, csvToInput, splitSynonyms, TAXONOMIES, type TaxonomyKind } from "./config";
import { getTaxonomyValues } from "./queries";

/**
 * Taxonomy writes for the Command Centre (settings.taxonomies). One validation path for forms and CSV
 * imports. Renaming a skill / changing its synonyms / renaming a job category calls the taxonomy
 * module's refresh hooks inside the same transaction so search text is rebuilt in the background.
 * Records are never hard-deleted (other data refers to them) — they are deactivated instead.
 */

type Source = "form" | "csv";
type Values = Record<string, string | number | boolean | null | string[] | undefined>;
type FieldErrors = Record<string, string[]>;

const CODE2 = /^[A-Z]{2}$/;
const KEY = /^[a-z0-9_]{2,60}$/;

function normalise(kind: TaxonomyKind, input: Record<string, unknown>, source: Source, isCreate: boolean): { values: Values; errors: FieldErrors } {
  const cfg = TAXONOMIES[kind];
  const values: Values = {};
  const errors: FieldErrors = {};
  const err = (k: string, m: string) => (errors[k] ??= []).push(m);
  for (const field of cfg.fields) {
    if (field.createOnly && !isCreate) continue;
    const raw = input[field.name];
    const str = typeof raw === "string" ? raw.trim() : raw === undefined || raw === null ? "" : String(raw).trim();
    if (field.kind === "checkbox") {
      if (source === "form") values[field.name] = raw === true || raw === "true" || raw === "on" || raw === "1";
      else {
        const b = csvBool(str);
        if (b === null) err(field.name, "Use yes or no");
        else values[field.name] = b;
      }
      continue;
    }
    if (field.kind === "number") {
      if (str === "") {
        if (field.required && isCreate) err(field.name, `${field.label} is required`);
        continue;
      }
      const n = Number(str);
      if (!Number.isInteger(n)) err(field.name, "Enter a whole number");
      else if (field.min !== undefined && n < field.min) err(field.name, `Must be at least ${field.min}`);
      else if (field.max !== undefined && n > field.max) err(field.name, `Must be at most ${field.max}`);
      else values[field.name] = n;
      continue;
    }
    const max = field.kind === "textarea" ? 2000 : 200;
    if (str.length > max) err(field.name, `Use at most ${max} characters`);
    else if (!str && field.required) err(field.name, `${field.label} is required`);
    else values[field.name] = str || null;
  }
  // CSV-only reference columns.
  for (const extra of ["parentSlug", "industrySlug", "status"]) {
    if (source === "csv" && typeof input[extra] === "string") values[extra] = (input[extra] as string).trim() || null;
  }
  return { values, errors };
}

function kindChecks(kind: TaxonomyKind, v: Values, err: (k: string, m: string) => void) {
  const up = (k: string) => {
    if (typeof v[k] === "string") v[k] = (v[k] as string).toUpperCase();
  };
  switch (kind) {
    case "countries":
      up("code");
      up("iso3");
      up("currencyCode");
      if (v.code !== undefined && !CODE2.test(String(v.code))) err("code", "Use the two-letter ISO code");
      if (v.iso3 && !/^[A-Z]{3}$/.test(String(v.iso3))) err("iso3", "Use the three-letter ISO code");
      if (v.phoneCode && !/^\d{1,4}(-\d{1,4})?$/.test(String(v.phoneCode).replace(/^\+/, ""))) err("phoneCode", "Digits only, e.g. 971");
      if (typeof v.phoneCode === "string") v.phoneCode = v.phoneCode.replace(/^\+/, "");
      if (v.marketRegion && !(MARKET_REGIONS as readonly string[]).includes(String(v.marketRegion))) err("marketRegion", "Choose a market region");
      break;
    case "states":
      up("countryCode");
      if (v.countryCode !== undefined && !CODE2.test(String(v.countryCode))) err("countryCode", "Choose a country");
      break;
    case "languages":
      if (typeof v.code === "string") v.code = v.code.toLowerCase();
      if (v.code !== undefined && !/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(String(v.code))) err("code", "Use a code like en, hi, te or pt-br");
      break;
    case "currencies":
      up("code");
      if (v.code !== undefined && !/^[A-Z]{3}$/.test(String(v.code))) err("code", "Use the three-letter ISO code");
      if (typeof v.symbol === "string" && v.symbol.length > 8) err("symbol", "Use at most 8 characters");
      break;
    case "skills":
      if (v.category && !(SKILL_CATEGORIES as readonly string[]).includes(String(v.category))) err("category", "Choose a category");
      if (v.synonyms !== undefined) v.synonyms = splitSynonyms(v.synonyms as string | null);
      if (v.status && !["approved", "pending", "rejected"].includes(String(v.status))) err("status", "Use approved, pending or rejected");
      break;
    case "education-levels":
    case "qualification-types":
      if (typeof v.key === "string") v.key = v.key.toLowerCase();
      if (v.key !== undefined && !KEY.test(String(v.key))) err("key", "Lowercase letters, numbers and underscores (2–60)");
      if (kind === "qualification-types" && v.kind && !(QUALIFICATION_KINDS as readonly string[]).includes(String(v.kind))) err("kind", "Choose a kind");
      break;
    default:
      break;
  }
  if ((kind === "industries" || kind === "job-categories" || kind === "skills") && v.slug !== undefined) {
    const s = v.slug ? slugify(String(v.slug), 80) : v.name ? slugify(String(v.name), 80) : "";
    v.slug = s || null;
  }
}

/** Find an existing record by its natural key (CSV imports). */
async function findByNaturalKey(kind: TaxonomyKind, v: Values, tx: DbOrTx): Promise<string | null> {
  const s = (k: string) => String(v[k] ?? "");
  switch (kind) {
    case "countries":
      return (await tx.select({ id: countries.code }).from(countries).where(eq(countries.code, s("code"))).limit(1))[0]?.id ?? null;
    case "languages":
      return (await tx.select({ id: languages.code }).from(languages).where(eq(languages.code, s("code"))).limit(1))[0]?.id ?? null;
    case "currencies":
      return (await tx.select({ id: currencies.code }).from(currencies).where(eq(currencies.code, s("code"))).limit(1))[0]?.id ?? null;
    case "states":
      return (await tx.select({ id: states.id }).from(states).where(and(eq(states.countryCode, s("countryCode")), eq(states.name, s("name")))).limit(1))[0]?.id ?? null;
    case "industries":
      return (await tx.select({ id: industries.id }).from(industries).where(eq(industries.slug, s("slug"))).limit(1))[0]?.id ?? null;
    case "job-categories":
      return (await tx.select({ id: jobCategories.id }).from(jobCategories).where(eq(jobCategories.slug, s("slug"))).limit(1))[0]?.id ?? null;
    case "skills":
      return (await tx.select({ id: skills.id }).from(skills).where(eq(skills.slug, s("slug"))).limit(1))[0]?.id ?? null;
    case "education-levels":
      return (await tx.select({ id: educationLevels.id }).from(educationLevels).where(eq(educationLevels.key, s("key"))).limit(1))[0]?.id ?? null;
    case "qualification-types":
      return (await tx.select({ id: qualificationTypes.id }).from(qualificationTypes).where(eq(qualificationTypes.key, s("key"))).limit(1))[0]?.id ?? null;
  }
}

/** Drop undefined keys and CSV helper keys before writing. */
function columns(v: Values, omit: string[] = []): Record<string, unknown> {
  return Object.fromEntries(Object.entries(v).filter(([k, x]) => x !== undefined && !omit.includes(k) && !["parentSlug", "industrySlug"].includes(k)));
}

type SaveResult = { id: string; created: boolean };

/**
 * Validate and write one record. `id` = update that record (forms); without it a CSV row is matched by
 * natural key, a form submission creates a new record.
 */
async function saveOne(kind: TaxonomyKind, input: Record<string, unknown>, opts: { id?: string; source: Source }, tx: DbOrTx): Promise<SaveResult> {
  let existingId = opts.id ?? null;
  // CSV: decide create vs update from the natural key, normalised the same way as a create.
  if (!existingId && opts.source === "csv") {
    const probe = normalise(kind, input, "csv", true);
    kindChecks(kind, probe.values, () => {});
    existingId = await findByNaturalKey(kind, probe.values, tx);
  }
  const isCreate = !existingId;
  const { values: v, errors } = normalise(kind, input, opts.source, isCreate);
  const err = (k: string, m: string) => (errors[k] ??= []).push(m);
  kindChecks(kind, v, err);
  if (Object.keys(errors).length) throw new ActionError("Please correct the highlighted fields.", { fieldErrors: errors });

  // Defaults for new records imported without these columns.
  if (isCreate && v.isActive === undefined) v.isActive = true;

  // Cross-record rules.
  const guards = await getSettings(["commercial.default_currency", "platform.home_country"]);
  if (kind === "currencies" && existingId === guards["commercial.default_currency"] && v.isActive === false) err("isActive", "This is the default billing currency. Change the default first.");
  if (kind === "countries" && existingId === guards["platform.home_country"] && v.isActive === false) err("isActive", "This is the home country. Change it in settings first.");
  if (kind === "languages") {
    const code = String(existingId ?? v.code ?? "");
    if (v.isUiLocale === true && !(LOCALES as readonly string[]).includes(code)) err("isUiLocale", "The interface is not translated into this language yet.");
    if (code === "en" && v.isActive === false) err("isActive", "English is the default interface language and stays active.");
  }
  if (kind === "states" && v.countryCode) {
    const [c] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, String(v.countryCode))).limit(1);
    if (!c) err("countryCode", "Unknown country");
  }
  if (kind === "countries" && v.currencyCode) {
    const [c] = await tx.select({ code: currencies.code }).from(currencies).where(eq(currencies.code, String(v.currencyCode))).limit(1);
    if (!c) err("currencyCode", "Unknown currency");
  }
  if (kind === "industries" || kind === "job-categories") {
    const table = kind === "industries" ? industries : jobCategories;
    if (opts.source === "csv") {
      if (v.parentSlug !== undefined) {
        v.parentId = v.parentSlug ? ((await tx.select({ id: table.id }).from(table).where(eq(table.slug, String(v.parentSlug))).limit(1))[0]?.id ?? null) : null;
        if (v.parentSlug && !v.parentId) err("parentSlug", `Parent “${v.parentSlug}” not found (import parents first)`);
      }
      if (kind === "job-categories" && v.industrySlug !== undefined) {
        v.industryId = v.industrySlug ? ((await tx.select({ id: industries.id }).from(industries).where(eq(industries.slug, String(v.industrySlug))).limit(1))[0]?.id ?? null) : null;
        if (v.industrySlug && !v.industryId) err("industrySlug", `Industry “${v.industrySlug}” not found`);
      }
    }
    if (v.parentId) {
      const all = await tx.select({ id: table.id, parentId: table.parentId }).from(table);
      const map = new Map(all.map((r) => [r.id, r.parentId]));
      if (!map.has(String(v.parentId))) err("parentId", "Unknown parent");
      else if (existingId && createsCycle(existingId, String(v.parentId), map)) err("parentId", "A record cannot sit under itself or one of its children");
    }
  }
  if ((kind === "industries" || kind === "job-categories" || kind === "skills") && v.slug) {
    const table = kind === "industries" ? industries : kind === "job-categories" ? jobCategories : skills;
    const [clash] = await tx
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.slug, String(v.slug)), existingId ? ne(table.id, existingId) : undefined))
      .limit(1);
    if (clash) err("slug", "Another record already uses this slug");
  }
  if (isCreate && (kind === "industries" || kind === "job-categories" || kind === "skills") && !v.slug) err("name", "Enter a name");
  if (isCreate && TAXONOMIES[kind].idField === "code") {
    if (await findByNaturalKey(kind, v, tx)) err("code", "This code already exists");
  }
  if (isCreate && (kind === "education-levels" || kind === "qualification-types") && (await findByNaturalKey(kind, v, tx))) err("key", "This key already exists");
  if (Object.keys(errors).length) throw new ActionError("Please correct the highlighted fields.", { fieldErrors: errors });

  const data = columns(v, isCreate ? [] : ["code", "key"]);
  const now = new Date();
  switch (kind) {
    case "countries":
      if (existingId) await tx.update(countries).set({ ...(data as Partial<typeof countries.$inferInsert>), updatedAt: now }).where(eq(countries.code, existingId));
      else existingId = (await tx.insert(countries).values(data as typeof countries.$inferInsert).returning({ id: countries.code }))[0]!.id;
      break;
    case "languages":
      if (existingId) await tx.update(languages).set({ ...(data as Partial<typeof languages.$inferInsert>), updatedAt: now }).where(eq(languages.code, existingId));
      else existingId = (await tx.insert(languages).values(data as typeof languages.$inferInsert).returning({ id: languages.code }))[0]!.id;
      break;
    case "currencies":
      if (existingId) await tx.update(currencies).set({ ...(data as Partial<typeof currencies.$inferInsert>), updatedAt: now }).where(eq(currencies.code, existingId));
      else existingId = (await tx.insert(currencies).values(data as typeof currencies.$inferInsert).returning({ id: currencies.code }))[0]!.id;
      break;
    case "states":
      if (existingId) await tx.update(states).set({ ...(data as Partial<typeof states.$inferInsert>), updatedAt: now }).where(eq(states.id, existingId));
      else existingId = (await tx.insert(states).values(data as typeof states.$inferInsert).returning({ id: states.id }))[0]!.id;
      break;
    case "industries":
      if (existingId) await tx.update(industries).set({ ...(data as Partial<typeof industries.$inferInsert>), updatedAt: now }).where(eq(industries.id, existingId));
      else existingId = (await tx.insert(industries).values(data as typeof industries.$inferInsert).returning({ id: industries.id }))[0]!.id;
      break;
    case "job-categories": {
      const before = existingId ? (await tx.select({ name: jobCategories.name }).from(jobCategories).where(eq(jobCategories.id, existingId)).limit(1))[0] : undefined;
      if (existingId) await tx.update(jobCategories).set({ ...(data as Partial<typeof jobCategories.$inferInsert>), updatedAt: now }).where(eq(jobCategories.id, existingId));
      else existingId = (await tx.insert(jobCategories).values(data as typeof jobCategories.$inferInsert).returning({ id: jobCategories.id }))[0]!.id;
      if (before && v.name !== undefined && before.name !== v.name) await afterCategoryChanged(existingId, tx);
      break;
    }
    case "skills": {
      const before = existingId ? (await tx.select({ name: skills.name, synonyms: skills.synonyms, status: skills.status }).from(skills).where(eq(skills.id, existingId)).limit(1))[0] : undefined;
      if (existingId) await tx.update(skills).set({ ...(data as Partial<typeof skills.$inferInsert>), updatedAt: now }).where(eq(skills.id, existingId));
      else existingId = (await tx.insert(skills).values({ status: "approved", ...(data as typeof skills.$inferInsert) }).returning({ id: skills.id }))[0]!.id;
      if (before) {
        const renamed = v.name !== undefined && before.name !== v.name;
        const synonymsChanged = Array.isArray(v.synonyms) && JSON.stringify(before.synonyms) !== JSON.stringify(v.synonyms);
        const statusChanged = v.status !== undefined && v.status !== null && before.status !== v.status;
        if (renamed || synonymsChanged || statusChanged) await afterSkillChanged(existingId, tx);
      }
      break;
    }
    case "education-levels":
      if (existingId) await tx.update(educationLevels).set({ ...(data as Partial<typeof educationLevels.$inferInsert>), updatedAt: now }).where(eq(educationLevels.id, existingId));
      else existingId = (await tx.insert(educationLevels).values(data as typeof educationLevels.$inferInsert).returning({ id: educationLevels.id }))[0]!.id;
      break;
    case "qualification-types":
      if (existingId) await tx.update(qualificationTypes).set({ ...(data as Partial<typeof qualificationTypes.$inferInsert>), updatedAt: now }).where(eq(qualificationTypes.id, existingId));
      else existingId = (await tx.insert(qualificationTypes).values(data as typeof qualificationTypes.$inferInsert).returning({ id: qualificationTypes.id }))[0]!.id;
      break;
  }
  return { id: existingId!, created: isCreate };
}

async function assertExists(kind: TaxonomyKind, id: string): Promise<void> {
  const cfg = TAXONOMIES[kind];
  if (cfg.idField === "id" && !/^[0-9a-f-]{36}$/i.test(id)) throw new ActionError("Record not found.");
  const probe: Values = cfg.idField === "code" ? { code: id } : {};
  const found =
    cfg.idField === "code"
      ? await findByNaturalKey(kind, probe, db)
      : await (async () => {
          const t = { states, industries, "job-categories": jobCategories, skills, "education-levels": educationLevels, "qualification-types": qualificationTypes }[kind as "states"];
          return (await db.select({ id: t.id }).from(t).where(eq(t.id, id)).limit(1))[0]?.id ?? null;
        })();
  if (!found) throw new ActionError("Record not found.");
}

export async function saveTaxonomyRecord(kind: TaxonomyKind, input: Record<string, unknown>, id?: string): Promise<SaveResult> {
  if (id) await assertExists(kind, id);
  const result = await db.transaction((tx) => saveOne(kind, input, { id, source: "form" }, tx));
  await audit({ action: result.created ? "taxonomy.created" : "taxonomy.updated", entityType: kind, entityId: result.id, metadata: { name: typeof input.name === "string" ? input.name.slice(0, 120) : null } });
  return result;
}

export async function setTaxonomyActive(kind: TaxonomyKind, id: string, active: boolean): Promise<void> {
  const current = await getTaxonomyValues(kind, id);
  if (!current) throw new ActionError("Record not found.");
  // Re-save through the validated path so the same guards apply (default currency, home country, English).
  const input: Record<string, unknown> = { ...current.values, isActive: active ? "true" : undefined };
  for (const [k, val] of Object.entries(input)) if (typeof val === "boolean" && k !== "isActive") input[k] = val ? "true" : undefined;
  await db.transaction((tx) => saveOne(kind, input, { id, source: "form" }, tx));
  await audit({ action: active ? "taxonomy.activated" : "taxonomy.deactivated", entityType: kind, entityId: id, metadata: { name: current.name } });
}

/** Approve or reject a user-suggested skill. Approval makes it searchable and refreshes search text. */
export async function decideSkill(id: string, decision: "approved" | "rejected"): Promise<void> {
  const [skill] = await db.select({ id: skills.id, name: skills.name, status: skills.status }).from(skills).where(eq(skills.id, id)).limit(1);
  if (!skill) throw new ActionError("Skill not found.");
  if (skill.status === decision) return;
  await db.transaction(async (tx) => {
    await tx.update(skills).set({ status: decision, isActive: decision === "approved", updatedAt: new Date() }).where(eq(skills.id, id));
    await afterSkillChanged(id, tx);
  });
  await audit({ action: `taxonomy.skill_${decision}`, entityType: "skills", entityId: id, metadata: { name: skill.name, from: skill.status } });
}

export type ImportSummary = { created: number; updated: number; failed: number; errors: { row: number; message: string }[]; missingHeaders: string[] };

export const IMPORT_MAX_ROWS = 2000;

/** Upsert rows from CSV text (headers as exported). Invalid rows are skipped and reported; others are saved. */
export async function importTaxonomyCsv(kind: TaxonomyKind, text: string): Promise<ImportSummary> {
  const cfg = TAXONOMIES[kind];
  const { headers, records } = csvRecords(text);
  const known = new Set(cfg.csv.map(([h]) => h));
  const required = cfg.fields.filter((f) => f.required).map((f) => cfg.csv.find(([, field]) => field === f.name)?.[0]).filter((h): h is string => Boolean(h));
  const missingHeaders = required.filter((h) => !headers.includes(h));
  const summary: ImportSummary = { created: 0, updated: 0, failed: 0, errors: [], missingHeaders };
  if (!headers.some((h) => known.has(h))) {
    summary.missingHeaders = cfg.csv.map(([h]) => h);
    return summary;
  }
  if (missingHeaders.length) return summary;
  if (records.length > IMPORT_MAX_ROWS) throw new ActionError(`Import at most ${IMPORT_MAX_ROWS} rows at a time.`);

  for (const [i, record] of records.entries()) {
    try {
      const result = await db.transaction((tx) => saveOne(kind, csvToInput(kind, record), { source: "csv" }, tx));
      if (result.created) summary.created++;
      else summary.updated++;
    } catch (error) {
      summary.failed++;
      if (summary.errors.length < 25) {
        const message =
          error instanceof ActionError
            ? error.fieldErrors
              ? Object.entries(error.fieldErrors)
                  .map(([k, m]) => `${cfg.csv.find(([, f]) => f === k)?.[0] ?? k}: ${m.join(", ")}`)
                  .join("; ")
              : error.message
            : "Could not be saved";
        summary.errors.push({ row: i + 2, message });
      }
    }
  }
  await audit({ action: "taxonomy.imported", entityType: kind, metadata: { created: summary.created, updated: summary.updated, failed: summary.failed, rows: records.length } });
  return summary;
}
