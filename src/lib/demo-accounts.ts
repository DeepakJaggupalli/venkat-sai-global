import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * Demo accounts (`npm run db:seed:demo`, src/server/seed/demo.ts): sign-in accounts on the reserved domain
 * demo.venkatsai.test that let Venkat Sai try every portal, also on the live site. Their organisations
 * (organizations.metadata) and the people (users.preferences) carry `demoAccount: true`.
 *
 * Public listings leave marked rows out: jobs (search, job pages, sitemap, alerts, recommendations), public
 * company and institution pages, training courses, campus drives, internships, partner announcements, the People
 * Portal career page and the public counters on the homepage. Employers' candidate search never shows a demo
 * person to a real employer.
 *
 * Client-safe: constants, a pure check and SQL fragments (no database access here).
 */

export const DEMO_EMAIL_DOMAIN = "demo.venkatsai.test";
export const DEMO_MARKER_KEY = "demoAccount";
/** jsonb merged into organizations.metadata / users.preferences of every demo row. */
export const DEMO_MARKER: Readonly<{ demoAccount: true }> = Object.freeze({ demoAccount: true });

const DEMO_MARKER_JSON = JSON.stringify(DEMO_MARKER);

/** An address on the reserved demo domain (case-insensitive, exact domain). */
export function isDemoEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

/** Organisation metadata or user preferences that carry the demo marker. */
export function hasDemoMarker(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>)[DEMO_MARKER_KEY] === true;
}

/** SQL: the jsonb value (organizations.metadata, users.preferences, or a raw alias such as sql`o.metadata`) is NOT marked as demo. */
export function notDemoSql(jsonb: SQLWrapper): SQL {
  return sql`not coalesce(${jsonb} @> ${DEMO_MARKER_JSON}::jsonb, false)`;
}

/** SQL for a nullable organisation reference: no organisation, or one that is not a demo organisation. */
export function notDemoOrganizationRefSql(organizationId: SQLWrapper): SQL {
  return sql`(${organizationId} is null or not exists (
    select 1 from organizations demo_org where demo_org.id = ${organizationId} and demo_org.metadata @> ${DEMO_MARKER_JSON}::jsonb))`;
}

/** SQL for a candidate profile reference: the person behind it is not a demo account. */
export function notDemoCandidateRefSql(candidateId: SQLWrapper): SQL {
  return sql`not exists (
    select 1 from candidate_profiles demo_cp join users demo_u on demo_u.id = demo_cp.user_id
    where demo_cp.id = ${candidateId} and demo_u.preferences @> ${DEMO_MARKER_JSON}::jsonb)`;
}
