import "server-only";

import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { cmsEntries, countries, cvSubmissions, jobs, requirementLines, requirementRequests } from "@/db/schema";
import type { CvSubmissionStatus } from "@/db/schema/cv-submissions";
import { ActionError } from "@/lib/actions";
import { absoluteUrl } from "@/lib/env";
import { maskPhone } from "@/lib/format";
import { logDataAccess } from "@/modules/audit";
import { candidateIsMinorSql } from "@/modules/candidates/minor-sql";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import { setCvSubmissionStatus } from "./cv-submissions";
import { assertStaff } from "./internal";

/**
 * Auto-matching of people to a requirement: "Send your CV" submissions and candidate profiles whose trade matches a
 * requirement poster (requirement_posts CMS entry: trades + destination country) or an operations requirement
 * (requirement lines: role, job category, skills). Read-only queries over cv_submissions (owned by cv-submissions.ts;
 * status changes go through its exported service).
 *
 * Matching (case-insensitive, punctuation folded, whole-word prefix so "welder" finds "Welders" but "fitter" does not
 * find "outfitter"):
 *   - same job category                               +4
 *   - trade equals a requirement trade                +4
 *   - trade contains / is contained in a trade        +2
 *   - matches a taxonomy synonym or a required skill  +2
 *   - prefers the destination country                 +1 (boost only, never a filter)
 * CVs marked "not suitable" are excluded; profiles must be active, open to work, not hidden and not minors.
 * Ties are newest first.
 *
 * Authorisation: candidates.view to list (phones always masked here); candidates.view_contact to reveal, copy or
 * WhatsApp a number (every reveal logged with logDataAccess); candidates.manage to mark CVs contacted.
 */

export type MatchTargetKind = "poster" | "requirement";
export type MatchTargetRef = { kind: MatchTargetKind; id: string };

export type MatchCriteria = {
  ref: MatchTargetRef;
  title: string;
  /** Code (requirements) or null (posters). */
  code: string | null;
  /** Trades / roles as written on the poster or the requirement lines. */
  trades: string[];
  /** Weaker terms: skills required on requirement lines. */
  relatedTerms: string[];
  /** Job categories set on requirement lines. */
  categoryIds: string[];
  countryCode: string | null;
  countryName: string | null;
  /** Absolute public URL (poster page or a published job of the requirement); null when nothing is public. */
  publicUrl: string | null;
  /** Staff page of the requirement or poster. */
  adminHref: string;
  status: string;
};

export type MatchPersonKind = "cv" | "profile";

export type MatchPerson = {
  kind: MatchPersonKind;
  id: string;
  /** VSG-CV-… for CV submissions, null for profiles. */
  code: string | null;
  name: string;
  trade: string;
  experienceYears: number | null;
  countryCode: string | null;
  countryName: string | null;
  prefersTargetCountry: boolean;
  /** CV submission status (null for candidate profiles). */
  status: CvSubmissionStatus | null;
  phoneMasked: string;
  hasPhone: boolean;
  createdAt: Date;
  score: number;
  reason: string;
};

export type MatchResult = { items: MatchPerson[]; cvCount: number; profileCount: number; capped: boolean };

/** Upper bound per source (CVs, profiles) for one requirement. */
export const MATCH_LIMIT = 200;

const MIN_TERM = 3;
const MAX_TERMS = 40;

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

/** Lower-case, punctuation folded to single spaces (mirrors normSql). */
export function normaliseTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function uniqueTerms(values: readonly string[], exclude: ReadonlySet<string> = new Set()): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const t = normaliseTerm(v);
    if (t.length >= MIN_TERM && !exclude.has(t)) out.add(t);
    if (out.size >= MAX_TERMS) break;
  }
  return [...out];
}

type Terms = { base: string[]; synonyms: string[]; categoryIds: string[] };

function textArray(values: readonly string[]): SQL {
  return values.length ? sql`array[${sql.join(values.map((v) => sql`${v}`), sql`, `)}]::text[]` : sql`'{}'::text[]`;
}

function uuidArray(values: readonly string[]): SQL {
  return values.length ? sql`array[${sql.join(values.map((v) => sql`${v}`), sql`, `)}]::uuid[]` : sql`'{}'::uuid[]`;
}

function normSql(expr: SQL): SQL {
  return sql`btrim(regexp_replace(lower(coalesce(${expr}, '')), '[^[:alnum:]]+', ' ', 'g'))`;
}

/** `needle` occurs in `hay` starting at a word boundary (both already normalised). */
function startsWordSql(hay: SQL, needle: SQL): SQL {
  return sql`(char_length(${needle}) >= ${MIN_TERM} and strpos(' ' || ${hay}, ' ' || ${needle}) > 0)`;
}

/**
 * Expand each criteria's trades through the taxonomy in two queries for the whole batch: a trade that names a job
 * category adds the category; a trade that names a skill (or one of its synonyms) adds the skill's other names.
 */
async function expandTerms(list: readonly MatchCriteria[]): Promise<Terms[]> {
  const bases = list.map((c) => uniqueTerms(c.trades));
  const all = [...new Set(bases.flat())];
  if (!all.length) return list.map((c, i) => ({ base: bases[i]!, synonyms: uniqueTerms(c.relatedTerms), categoryIds: [...new Set(c.categoryIds)] }));
  const terms = textArray(all);
  const [cats, skillRows] = await Promise.all([
    db.execute<{ id: string; norm: string }>(sql`select id, ${normSql(sql`name`)} as norm from job_categories where is_active and ${normSql(sql`name`)} = any(${terms})`),
    db.execute<{ names: string[] }>(sql`
      select array[name] || synonyms as names from skills
      where is_active and status = 'approved'
        and (${normSql(sql`name`)} = any(${terms}) or exists (select 1 from unnest(synonyms) x where ${normSql(sql`x`)} = any(${terms})))
      limit 200`),
  ]);
  const skillGroups = skillRows.rows.map((r) => uniqueTerms(r.names ?? []));
  return list.map((c, i) => {
    const base = bases[i]!;
    const baseSet = new Set(base);
    const categoryIds = new Set(c.categoryIds);
    for (const row of cats.rows) if (baseSet.has(row.norm)) categoryIds.add(row.id);
    const synonyms = skillGroups.filter((g) => g.some((t) => baseSet.has(t))).flat();
    return { base, synonyms: uniqueTerms([...synonyms, ...c.relatedTerms], baseSet), categoryIds: [...categoryIds] };
  });
}

// ---------------------------------------------------------------------------
// SQL building blocks (shared by the list and the batch counts)
// ---------------------------------------------------------------------------

const CV_TRADE = normSql(sql`s.trade_label`);

function cvFirstTerm(arr: SQL, mode: "exact" | "partial"): SQL {
  const cond = mode === "exact" ? sql`t = ${CV_TRADE}` : sql`${startsWordSql(CV_TRADE, sql`t`)} or ${startsWordSql(sql`t`, CV_TRADE)}`;
  return sql`(select t from unnest(${arr}) t where ${cond} limit 1)`;
}

/** Any match for a CV submission row `s` (partial covers exact). */
function cvMatchPredicate(terms: SQL, cats: SQL): SQL {
  return sql`(coalesce(s.job_category_id = any(${cats}), false) or ${cvFirstTerm(terms, "partial")} is not null)`;
}

const PROFILE_FROM = sql`
  candidate_profiles
  join users u on u.id = candidate_profiles.user_id
  cross join lateral (
    select
      array(select ${normSql(sql`x`)} from unnest(array[candidate_profiles.current_job_title] || candidate_profiles.preferred_roles) x where coalesce(btrim(x), '') <> '') as roles,
      array(select ${normSql(sql`x`)} from unnest(array[candidate_profiles.headline] || candidate_profiles.skill_names_cache) x where coalesce(btrim(x), '') <> '') as others
  ) pt`;

const PROFILE_WHERE = sql`candidate_profiles.deleted_at is null and u.status = 'active' and candidate_profiles.visibility <> 'hidden'
  and candidate_profiles.is_open_to_work and not ${candidateIsMinorSql}`;

function profileFirstTerm(arr: SQL, mode: "exact" | "partial"): SQL {
  const cond =
    mode === "exact"
      ? sql`t = any(pt.roles) or t = any(pt.others)`
      : sql`exists (select 1 from unnest(pt.roles) x where ${startsWordSql(sql`x`, sql`t`)} or ${startsWordSql(sql`t`, sql`x`)})
          or exists (select 1 from unnest(pt.others) x where ${startsWordSql(sql`x`, sql`t`)})`;
  return sql`(select t from unnest(${arr}) t where ${cond} limit 1)`;
}

function profileMatchPredicate(terms: SQL, cats: SQL): SQL {
  return sql`(candidate_profiles.preferred_category_ids && ${cats} or ${profileFirstTerm(terms, "partial")} is not null)`;
}

function scoreSql(): SQL {
  return sql`(case when m.cat_match then 4 else 0 end
    + case when m.exact_term is not null then 4 when m.partial_term is not null then 2 when m.synonym_term is not null then 2 else 0 end
    + case when m.country_match then 1 else 0 end)`;
}

// ---------------------------------------------------------------------------
// Criteria
// ---------------------------------------------------------------------------

function tradeNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((t: unknown) => {
    const trade = t && typeof t === "object" ? (t as { trade?: unknown }).trade : null;
    return typeof trade === "string" && trade.trim() ? [trade.trim()] : [];
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Criteria for a requirement poster (content.view), or null when it does not exist. */
export async function getPosterCriteria(ctx: StaffContext, id: string): Promise<MatchCriteria | null> {
  assertStaff(ctx, "content.view");
  if (!UUID.test(id)) return null;
  const [row] = await db
    .select({
      id: cmsEntries.id,
      slug: cmsEntries.slug,
      title: cmsEntries.title,
      status: cmsEntries.status,
      countryCode: sql<string | null>`${cmsEntries.data}->>'countryCode'`,
      trades: sql<unknown>`${cmsEntries.data}->'trades'`,
      countryName: countries.name,
    })
    .from(cmsEntries)
    .leftJoin(countries, sql`${countries.code} = ${cmsEntries.data}->>'countryCode'`)
    .where(and(eq(cmsEntries.id, id), eq(cmsEntries.collection, "requirement_posts"), isNull(cmsEntries.deletedAt)))
    .limit(1);
  if (!row) return null;
  return posterCriteriaFromRow(row);
}

function posterCriteriaFromRow(row: { id: string; slug: string; title: string; status: string; countryCode: string | null; countryName: string | null; trades: unknown }): MatchCriteria {
  return {
    ref: { kind: "poster", id: row.id },
    title: row.title,
    code: null,
    trades: tradeNames(row.trades),
    relatedTerms: [],
    categoryIds: [],
    countryCode: row.countryCode,
    countryName: row.countryName ?? row.countryCode,
    publicUrl: row.status === "published" ? absoluteUrl(`/requirements/${row.slug}`) : null,
    adminHref: `/admin/requirements/posters/${row.id}/matches`,
    status: row.status,
  };
}

/** Criteria for an operations requirement request (requirements.view), or null when it does not exist. */
export async function getRequirementCriteria(ctx: StaffContext, id: string): Promise<MatchCriteria | null> {
  assertStaff(ctx, "requirements.view");
  if (!UUID.test(id)) return null;
  const [req] = await db
    .select({ id: requirementRequests.id, code: requirementRequests.code, title: requirementRequests.title, status: requirementRequests.status, countryCode: requirementRequests.countryCode, countryName: countries.name })
    .from(requirementRequests)
    .leftJoin(countries, eq(countries.code, requirementRequests.countryCode))
    .where(eq(requirementRequests.id, id))
    .limit(1);
  if (!req) return null;
  const lines = await db
    .select({ roleTitle: requirementLines.roleTitle, jobCategoryId: requirementLines.jobCategoryId, requiredSkills: requirementLines.requiredSkills, jobSlug: jobs.slug })
    .from(requirementLines)
    .leftJoin(jobs, and(sql`${jobs.id} = ${requirementLines.jobId}`, eq(jobs.status, "published"), isNull(jobs.deletedAt)))
    .where(eq(requirementLines.requirementId, id))
    .orderBy(requirementLines.sortOrder);
  const jobSlug = lines.find((l) => l.jobSlug)?.jobSlug ?? null;
  return {
    ref: { kind: "requirement", id: req.id },
    title: req.title,
    code: req.code,
    trades: lines.map((l) => l.roleTitle),
    relatedTerms: lines.flatMap((l) => l.requiredSkills),
    categoryIds: lines.flatMap((l) => (l.jobCategoryId ? [l.jobCategoryId] : [])),
    countryCode: req.countryCode,
    countryName: req.countryName ?? req.countryCode,
    publicUrl: jobSlug ? absoluteUrl(`/jobs/${jobSlug}`) : null,
    adminHref: `/admin/requirements/${req.id}/matches`,
    status: req.status,
  };
}

export async function getMatchCriteria(ctx: StaffContext, ref: MatchTargetRef): Promise<MatchCriteria | null> {
  return ref.kind === "poster" ? getPosterCriteria(ctx, ref.id) : getRequirementCriteria(ctx, ref.id);
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

type CvRow = {
  id: string;
  code: string;
  name: string;
  phone: string;
  trade_label: string;
  experience_years: number | null;
  preferred_country_code: string | null;
  country_name: string | null;
  status: CvSubmissionStatus;
  created_at: Date | string;
  cat_match: boolean;
  exact_term: string | null;
  partial_term: string | null;
  synonym_term: string | null;
  country_match: boolean;
  score: number | string;
};

type ProfileRow = Omit<CvRow, "code" | "trade_label" | "experience_years" | "preferred_country_code" | "status" | "phone"> & {
  phone: string | null;
  trade: string | null;
  experience_months: number | null;
  country_code: string | null;
};

function reasonFor(r: { cat_match: boolean; exact_term: string | null; partial_term: string | null; synonym_term: string | null; country_match: boolean }, countryName: string | null): string {
  const parts: string[] = [];
  if (r.exact_term) parts.push(`Trade matches "${r.exact_term}"`);
  else if (r.partial_term) parts.push(`Similar trade ("${r.partial_term}")`);
  else if (r.synonym_term) parts.push(`Related term "${r.synonym_term}"`);
  if (r.cat_match) parts.push("same job category");
  if (r.country_match && countryName) parts.push(`prefers ${countryName}`);
  const text = parts.join(", ");
  return text ? text[0]!.toUpperCase() + text.slice(1) : "Match";
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

/**
 * Ranked matches (CV submissions and candidate profiles) for a poster or requirement. Phones are masked; use
 * revealMatchPhones() to see them (logged).
 */
export async function findMatches(ctx: StaffContext, criteria: MatchCriteria, opts: { limit?: number } = {}): Promise<MatchResult> {
  assertStaff(ctx, "candidates.view");
  const limit = Math.min(Math.max(opts.limit ?? MATCH_LIMIT, 1), MATCH_LIMIT);
  const [terms] = await expandTerms([criteria]);
  if (!terms || (!terms.base.length && !terms.synonyms.length && !terms.categoryIds.length)) return { items: [], cvCount: 0, profileCount: 0, capped: false };
  const base = textArray(terms.base);
  const syn = textArray(terms.synonyms);
  const all = textArray([...terms.base, ...terms.synonyms]);
  const cats = uuidArray(terms.categoryIds);
  const country = criteria.countryCode;

  const [cvRes, profileRes] = await Promise.all([
    db.execute<CvRow>(sql`
      with m as (
        select s.id, s.code, s.name, s.phone, s.trade_label, s.experience_years, s.preferred_country_code, s.status, s.created_at,
          coalesce(s.job_category_id = any(${cats}), false) as cat_match,
          ${cvFirstTerm(base, "exact")} as exact_term,
          ${cvFirstTerm(base, "partial")} as partial_term,
          ${cvFirstTerm(syn, "partial")} as synonym_term,
          coalesce(s.preferred_country_code = ${country}::text, false) as country_match
        from cv_submissions s
        where s.status <> 'not_suitable' and ${cvMatchPredicate(all, cats)}
      )
      select m.*, c.name as country_name, ${scoreSql()} as score
      from m left join countries c on c.code = m.preferred_country_code
      order by score desc, m.created_at desc
      limit ${limit + 1}`),
    db.execute<ProfileRow>(sql`
      with m as (
        select candidate_profiles.id, u.display_name as name, u.phone, candidate_profiles.updated_at as created_at,
          coalesce(nullif(btrim(candidate_profiles.current_job_title), ''), candidate_profiles.preferred_roles[1], nullif(btrim(candidate_profiles.headline), '')) as trade,
          candidate_profiles.total_experience_months as experience_months,
          coalesce(candidate_profiles.preferred_category_ids && ${cats}, false) as cat_match,
          ${profileFirstTerm(base, "exact")} as exact_term,
          ${profileFirstTerm(base, "partial")} as partial_term,
          ${profileFirstTerm(syn, "partial")} as synonym_term,
          (select l.country_code from candidate_preferred_locations l where l.candidate_id = candidate_profiles.id
            order by (l.country_code = ${country}::text) desc nulls last, l.priority limit 1) as country_code,
          exists (select 1 from candidate_preferred_locations l where l.candidate_id = candidate_profiles.id and l.country_code = ${country}::text) as country_match
        from ${PROFILE_FROM}
        where ${PROFILE_WHERE} and ${profileMatchPredicate(all, cats)}
      )
      select m.*, c.name as country_name, ${scoreSql()} as score
      from m left join countries c on c.code = m.country_code
      order by score desc, m.created_at desc
      limit ${limit + 1}`),
  ]);

  const capped = cvRes.rows.length > limit || profileRes.rows.length > limit;
  const cvs = cvRes.rows.slice(0, limit).map(
    (r): MatchPerson => ({
      kind: "cv",
      id: r.id,
      code: r.code,
      name: r.name,
      trade: r.trade_label,
      experienceYears: r.experience_years,
      countryCode: r.preferred_country_code,
      countryName: r.country_name,
      prefersTargetCountry: r.country_match,
      status: r.status,
      phoneMasked: maskPhone(r.phone),
      hasPhone: Boolean(r.phone),
      createdAt: toDate(r.created_at),
      score: Number(r.score),
      reason: reasonFor(r, criteria.countryName),
    }),
  );
  const profiles = profileRes.rows.slice(0, limit).map(
    (r): MatchPerson => ({
      kind: "profile",
      id: r.id,
      code: null,
      name: r.name,
      trade: r.trade ?? "Not given",
      experienceYears: r.experience_months == null ? null : Math.floor(r.experience_months / 12),
      countryCode: r.country_code,
      countryName: r.country_name,
      prefersTargetCountry: r.country_match,
      status: null,
      phoneMasked: maskPhone(r.phone),
      hasPhone: Boolean(r.phone),
      createdAt: toDate(r.created_at),
      score: Number(r.score),
      reason: reasonFor(r, criteria.countryName),
    }),
  );
  const items = [...cvs, ...profiles].sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime());
  return { items, cvCount: cvs.length, profileCount: profiles.length, capped };
}

/**
 * Match counts (CVs + profiles) for several targets in one round trip (poster list badges). Same predicates as
 * findMatches(). Targets without trades count 0.
 */
export async function countMatches(ctx: StaffContext, list: readonly MatchCriteria[]): Promise<Map<string, { cvs: number; profiles: number }>> {
  assertStaff(ctx, "candidates.view");
  const out = new Map<string, { cvs: number; profiles: number }>();
  if (!list.length) return out;
  const expanded = await expandTerms(list);
  const rows = list
    .map((c, i) => ({ key: c.ref.id, terms: [...expanded[i]!.base, ...expanded[i]!.synonyms], cats: expanded[i]!.categoryIds }))
    .filter((r) => {
      if (r.terms.length || r.cats.length) return true;
      out.set(r.key, { cvs: 0, profiles: 0 });
      return false;
    });
  if (!rows.length) return out;
  const values = sql.join(
    rows.map((r) => sql`(${r.key}::text, ${textArray(r.terms)}, ${uuidArray(r.cats)})`),
    sql`, `,
  );
  const res = await db.execute<{ key: string; cvs: number | string; profiles: number | string }>(sql`
    select p.key,
      (select count(*) from cv_submissions s where s.status <> 'not_suitable' and ${cvMatchPredicate(sql`p.terms`, sql`p.cats`)}) as cvs,
      (select count(*) from ${PROFILE_FROM} where ${PROFILE_WHERE} and ${profileMatchPredicate(sql`p.terms`, sql`p.cats`)}) as profiles
    from (values ${values}) as p(key, terms, cats)`);
  for (const r of res.rows) out.set(r.key, { cvs: Number(r.cvs), profiles: Number(r.profiles) });
  return out;
}

/** Posters → criteria for countMatches() from rows the posters list already loaded (no extra query). */
export function posterCriteriaFromList(p: { id: string; slug: string; title: string; status: string; countryCode: string | null; countryName: string | null; trades: string[] }): MatchCriteria {
  return posterCriteriaFromRow({ ...p, trades: p.trades.map((trade) => ({ trade })) });
}

// ---------------------------------------------------------------------------
// Contact (reveal / copy / WhatsApp) and bulk status
// ---------------------------------------------------------------------------

export type MatchPersonRef = { kind: MatchPersonKind; id: string };
export type RevealedPhone = MatchPersonRef & { name: string; phone: string };

/**
 * Phone numbers of matched people (candidates.view + candidates.view_contact). One data-access log row per person,
 * naming the requirement the numbers were revealed for.
 */
export async function revealMatchPhones(
  ctx: StaffContext,
  people: readonly MatchPersonRef[],
  opts: { target: MatchTargetRef; accessType: "reveal" | "export" | "share"; reason: string },
): Promise<RevealedPhone[]> {
  assertStaff(ctx, ["candidates.view", "candidates.view_contact"]);
  const cvIds = [...new Set(people.filter((p) => p.kind === "cv").map((p) => p.id).filter((id) => UUID.test(id)))];
  const profileIds = [...new Set(people.filter((p) => p.kind === "profile").map((p) => p.id).filter((id) => UUID.test(id)))];
  const [cvRows, profileRows] = await Promise.all([
    cvIds.length ? db.execute<{ id: string; name: string; phone: string; code: string }>(sql`select id, name, phone, code from cv_submissions where id = any(${uuidArray(cvIds)})`) : null,
    profileIds.length
      ? db.execute<{ id: string; name: string; phone: string | null; user_id: string }>(sql`
          select candidate_profiles.id, u.display_name as name, u.phone, u.id as user_id
          from ${PROFILE_FROM} where candidate_profiles.id = any(${uuidArray(profileIds)}) and ${PROFILE_WHERE}`)
      : null,
  ]);
  const metadata = { target: opts.target };
  const found: RevealedPhone[] = [];
  const logs: Promise<void>[] = [];
  for (const r of cvRows?.rows ?? []) {
    found.push({ kind: "cv", id: r.id, name: r.name, phone: r.phone });
    logs.push(logDataAccess({ actorUserId: ctx.user.id, subjectType: "cv_submission", subjectId: r.id, dataCategory: "contact", accessType: opts.accessType, reason: opts.reason, metadata: { ...metadata, code: r.code } }));
  }
  for (const r of profileRows?.rows ?? []) {
    if (!r.phone) continue;
    found.push({ kind: "profile", id: r.id, name: r.name, phone: r.phone });
    logs.push(logDataAccess({ actorUserId: ctx.user.id, subjectType: "candidate", subjectId: r.id, subjectUserId: r.user_id, dataCategory: "contact", accessType: opts.accessType, reason: opts.reason, metadata }));
  }
  await Promise.all(logs);
  return found;
}

/** First name for a friendly greeting. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** Prefilled WhatsApp text naming the requirement, its country and its public page. Plain text, no personal data beyond the first name. */
export function matchOutreachText(criteria: Pick<MatchCriteria, "title" | "countryName" | "publicUrl">, personName: string): string {
  const greeting = firstName(personName) ? `Hello ${firstName(personName)},` : "Hello,";
  const where = criteria.countryName ? ` in ${criteria.countryName}` : "";
  const lines = [`${greeting} this is Venkat Sai Global. We have a requirement that matches your trade: ${criteria.title}${where}.`];
  if (criteria.publicUrl) lines.push(`Details: ${criteria.publicUrl}`);
  lines.push("Reply here if you are interested.");
  return lines.join("\n");
}

/** wa.me link to one person with the prefilled message (E.164 → digits). */
export function whatsappChatHref(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D+/g, "")}?text=${encodeURIComponent(text)}`;
}

/**
 * One-tap WhatsApp for a matched person: reveals (and logs) the number and returns the wa.me link.
 *
 * TODO(whatsapp-api): when the WhatsApp Business API is connected (src/modules/messaging/whatsapp.ts), add a
 * `sendMatchOutreach(ctx, criteria, people)` here that queues template messages through the notifications
 * dispatcher (consent + opt-out checks, rate limits) instead of opening wa.me. Nothing is sent automatically today.
 */
export async function matchWhatsappHref(ctx: StaffContext, target: MatchTargetRef, person: MatchPersonRef): Promise<string> {
  const criteria = await getMatchCriteria(ctx, target);
  if (!criteria) throw new ActionError("This requirement could not be found.", { code: "not_found" });
  const [found] = await revealMatchPhones(ctx, [person], { target, accessType: "share", reason: `WhatsApp about ${criteria.code ?? criteria.title}` });
  if (!found) throw new ActionError("This person has no phone number we can use.", { code: "not_found" });
  return whatsappChatHref(found.phone, matchOutreachText(criteria, found.name));
}

/**
 * Mark matched CV submissions as contacted through the CV submissions service (candidates.manage). Only CVs that are
 * still "received" move; later stages are never moved back. Returns how many changed.
 */
export async function markMatchedCvsContacted(ctx: StaffContext, ids: readonly string[]): Promise<number> {
  assertStaff(ctx, "candidates.manage");
  const valid = [...new Set(ids.filter((id) => UUID.test(id)))].slice(0, MATCH_LIMIT);
  if (!valid.length) return 0;
  const rows = await db.select({ id: cvSubmissions.id }).from(cvSubmissions).where(and(inArray(cvSubmissions.id, valid), eq(cvSubmissions.status, "received")));
  for (const r of rows) await setCvSubmissionStatus(ctx, { id: r.id, status: "contacted" });
  return rows.length;
}

/** Whether the viewer may reveal / copy / WhatsApp numbers (UI gating; services re-check). */
export function canContactMatches(ctx: StaffContext): boolean {
  return staffCan(ctx, ["candidates.view", "candidates.view_contact"]);
}
