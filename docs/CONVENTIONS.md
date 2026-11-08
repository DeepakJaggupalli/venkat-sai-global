# Venkat Sai Global — Engineering conventions

Read this before writing code. It is the contract that lets many people (and agents) build one coherent product.

## 0. Golden rules

1. **Truthfulness.** Never fabricate statistics, placements, testimonials, client logos, licences, certifications, partnerships, reviews or success figures. Public numbers come from live database counts or admin-approved entries with an "as of" date (`public_metrics`). When there is no data, show a helpful empty state — never placeholder numbers or fake names in the product UI.
2. **Candidates never pay to see or apply for a job.** No pay-to-apply, no implication that payment guarantees a job, visa or placement.
3. **Privacy by default.** Contact details and documents are masked unless the viewer is entitled (consent + permission + commercial rules). Log every sensitive reveal with `logDataAccess()`. Never put personal data in analytics events or logs.
4. **Authorization on every read and write.** Every page, action and route handler checks the caller (`requireUser` / `requireStaff(permission)` / `requireOrgMember(type, permission)` / candidate ownership) **and scopes queries** to what the caller may see (organisation id, candidate id, assignment). Never trust ids from the client.
5. **Prices, plans, limits, taxes and currencies are data**, administered in the database. Never hardcode prices or assume INR.
6. **Venkat Sai Global is the primary brand** across every portal; partners and employers appear under it.
7. **E: drive only.** Never write files to C:. Temporary files go under `E:\VenkatSaiGlobal-work\`.
8. **Do not install packages, do not run git, do not run `next build`/`next dev`** unless your task explicitly says so. Everything you need is installed (see `package.json`).

## 1. Stack

| Concern | Choice |
|---|---|
| Framework | **Next.js 16.4** App Router, React 19.3, TypeScript strict. This version differs from older Next.js — read `node_modules/next/dist/docs/` for any API you are unsure about. |
| Rendering | Dynamic per request (root layout reads cookies). **Cache Components is OFF — never use `"use cache"`, `cacheLife`, `cacheTag`.** `params`/`searchParams`/`cookies()`/`headers()` are async. Middleware is now `src/proxy.ts`. |
| Styling | Tailwind CSS 4 (CSS-first, tokens in `src/app/globals.css`), shadcn/ui (style `radix-nova`, Radix primitives) in `src/components/ui`, icons from `lucide-react`. |
| Database | PostgreSQL 15+ via Drizzle ORM 0.45 (`node-postgres`), `casing: "snake_case"`. |
| Validation | Zod 4 (`z.email()`, `z.uuid()`, `z.url()` are top-level; `error` option replaces `message` for custom messages, string shorthand still works). |
| Auth | Custom: argon2id passwords, DB sessions, OTP (email/SMS), TOTP 2FA, optional Google OAuth. |
| Jobs | PostgreSQL task queue (`background_jobs`) processed by `npm run worker` or `/api/v1/cron/tick`. |
| Files | Storage drivers (local disk under `./storage`, or S3-compatible) behind `src/modules/files`. |
| Tests | Vitest (`*.test.ts` next to the code), Playwright for E2E (`e2e/`). |

## 2. Directory layout

```
src/
  app/
    (public)/…            public website (/, /about, /services/[slug], /jobs, …)
    (auth)/…              /sign-in, /sign-up, /forgot-password, /reset-password, /verify, /invite/[token]
    account/…             shared account pages (security, notifications, privacy) for every signed-in user
    talent/…              People Portal
    employer/…            Employer Portal
    recruiter/…           Recruitment Partner Portal
    institution/…         Institution & Training Portal
    admin/…               Venkat Sai Command Centre
    api/v1/…              route handlers (uploads, files, collect, webhooks, cron, health, public feeds)
  components/
    ui/                   shadcn primitives (do not restyle per page; extend via variants)
    shared/               cross-portal building blocks (PageHeader, DataTable, EmptyState, StatusBadge, FileUpload…)
    layout/               PortalShell, PublicHeader/Footer, AccountShell
    <area>/               area-specific client components (e.g. components/employer/pipeline-board.tsx)
  config/                 site, navigation (route contract), permissions, features, settings
  db/                     client (index.ts) + schema/
  i18n/                   locale config, server/client translators, message catalogues
  lib/                    framework-agnostic helpers (actions, validation, format, http, crypto, env, codes, rate-limit…)
  modules/<domain>/       domain logic (server-only): queries.ts, service.ts, actions.ts, schemas.ts, types.ts, tasks.ts, approval-handlers.ts, README.md
  server/tasks/           task queue, registry, schedule, processor
```

**Ownership:** each module/route folder has one owner at a time. Only edit files you own. If you need something from another module, import its public API; if it is missing, write a small local query in your own module (read-only) and note it in your report — never edit another owner's files unless your task says so. Shared registries (`src/db/schema/index.ts`, `src/server/tasks/registry.ts`, `src/modules/approvals/registry.ts`, `src/i18n/messages/index.ts`, `src/config/*`) already reference every module's file — just fill in your own file.

## 3. Database

See `docs/DATA_MODEL.md` (layering, column conventions, domain briefs).

- Import: `import { db } from "@/db"; import { jobs, applications } from "@/db/schema";` + operators from `drizzle-orm` (`eq, and, or, inArray, desc, asc, sql, count, ilike, isNull, gte, lte`).
- Transactions: `await db.transaction(async (tx) => { … })`. Functions that may run inside a transaction accept `tx: DbOrTx = db`.
- Row types: `typeof jobs.$inferSelect` / `$inferInsert`.
- Pagination: `parsePage(searchParams)` → `{ page, pageSize, offset }`; return `paginated(items, total, page)`.
- Counting: `db.select({ value: count() }).from(t).where(...)`.
- Raw SQL only through the `sql` template (parameterised). Never interpolate user input into SQL strings.
- Human codes: `await nextCode("APP", { tx })`.
- **Local DB:** `npm run db:start` (bundled PostgreSQL on 127.0.0.1:5433, data in `.data/`). Isolated test databases: `create database my_test template vsg_template` (once the template exists) — see your task brief.

## 4. Modules (server-side domain logic)

```
src/modules/jobs/
  schemas.ts      zod schemas shared by forms and actions (client-safe — no server imports)
  queries.ts      read functions (import "server-only")
  service.ts      writes + business rules (import "server-only"); transactions, audit, notify, approvals
  actions.ts      "use server" Server Actions — thin: authorize → validate → call service → revalidatePath
  types.ts        exported types
  tasks.ts        background task handlers (registered automatically)
  approval-handlers.ts   apply approval decisions (registered automatically)
  README.md       public API of the module (functions other modules may call)
```

- Every server module file starts with `import "server-only";` (except `schemas.ts`, `types.ts`, `events.ts`).
- Business rules live in `service.ts`, not in pages or actions. Actions and route handlers call services.
- Services take an explicit actor/context argument (e.g. `ctx: OrgContext<"employer">` or `StaffContext`) and re-check authorization for the entity they touch.

## 5. Authentication & authorization

```ts
import { requireUser, getCurrentUser } from "@/modules/identity/session";
import { requireStaff, requireOrgMember, staffCan, orgCan, getOrgContext } from "@/modules/identity/authz";
import { requireCandidate } from "@/modules/candidates/guard";   // provided by the candidates module

const user = await requireUser();                                  // any signed-in user
const staff = await requireStaff("jobs.approve");                  // Venkat Sai staff + permission (403 otherwise)
const emp = await requireOrgMember("employer", "employer.jobs.manage");  // employer member + permission
const { user, candidate } = await requireCandidate();              // People Portal (creates/loads candidate profile)
```

- Permission keys: `src/config/permissions.ts`. Check permissions, never role keys.
- Portal layouts call the guard once; **pages and actions must still call it** (layouts don't protect actions).
- Scope every query: employer pages filter by `emp.organization.id`; partner pages by assignment/partner org; candidate pages by `candidate.id`; staff pages by permission.
- `forbidden()` / `notFound()` / `redirect()` from `next/navigation` may be used in pages and actions.
- Organisation verification gates (e.g. publishing jobs requires `organization.status === "verified"`) are enforced in services.

## 6. Server Actions & forms

```ts
// modules/jobs/actions.ts
"use server";
import { createFormAction, ok, ActionError } from "@/lib/actions";
import { revalidatePath } from "next/cache";
export const saveJob = createFormAction(jobFormSchema, async (input) => {
  const ctx = await requireOrgMember("employer", "employer.jobs.manage");
  const job = await upsertJob(ctx, input);
  revalidatePath("/employer/jobs");
  return ok({ id: job.id }, "Job saved");
});
```

```tsx
// client form
"use client";
const [state, formAction, pending] = useActionState(saveJob, null);
<form action={formAction}> … <FieldError errors={state?.ok === false ? state.fieldErrors?.title : undefined} /> … </form>
```

- Results: `ActionResult<T>` = `{ ok: true, data?, message? } | { ok: false, error, fieldErrors? }`. Throw `ActionError("…")` for expected failures.
- Field builders: `f.text()`, `f.optionalText()`, `f.email()`, `f.phone()`, `f.bool()`, `f.int()`, `f.amount()`, `f.uuid()`, `f.stringArray()`, `f.date()`, `f.enumOf()` from `@/lib/validation`.
- Arrays in forms: `name="skills[]"`; JSON payloads: `name="lines:json"`.
- Programmatic actions (buttons/menus): `createAction(schema, handler)`.
- After mutations: `revalidatePath()` for affected routes, or `redirect()` to the new resource.
- Show success with `toast.success(state.message)` (sonner) and errors inline + in a form-level alert.

## 7. UI & design system

- Use shadcn components from `@/components/ui/*` and shared blocks from `@/components/shared/*` (built by the design-system owner — see `src/components/shared/README.md`).
- Tokens (Tailwind classes): `bg-navy`, `bg-navy-deep`, `text-teal-strong` (AA text), `bg-teal` (fills), `bg-teal-soft`, `text-gold-strong`, `bg-gold-soft`, `bg-surface-subtle`, `text-muted-foreground`, status pairs `bg-success-soft text-success-strong`, `bg-warning-soft text-warning-strong`, `bg-danger-soft text-danger-strong`, `bg-info-soft text-info`. Fonts: `font-heading` / `font-display` (Figtree; 800 with tight tracking for public headlines) and Inter body. The palette is white + near-black + ONE blue-aqua accent (see `DESIGN.md`); the legacy names map onto it (navy → near-black, teal → accent, gold → accent soft).
- **Never put the accent fill (`text-teal`, #0EA5E9), `text-success` or `text-warning` text on white** — they fail WCAG AA. Use the `-strong` variants for text; the base hues are for fills, icons and borders.
- Charts: colours from `src/components/shared/charts/palette.ts` (validated for colour-vision deficiency); `--chart-1..5` match it.
- Upload components live in `@/components/files` (`FileUpload`, `FilePreview`, `FileLink`), not `@/components/shared`.
- Public legal routes (fixed): `/legal/privacy-policy`, `/legal/terms`, `/legal/cookie-policy`, `/legal/data-rights`, `/legal/accessibility`, `/legal/disclaimers`, `/cookie-preferences`, `/grievance`.
- Sort and filter params: whitelist sort keys (`parseSort()` in the shared components) and validate filters with zod before they reach a query.
- Layout: `.container-page` (16px gutter on mobile). No horizontal scroll at 360px. Tables collapse to cards or scroll inside their own container on mobile.
- Every list has an empty state, every async boundary a loading state (`loading.tsx` with skeletons), every form inline errors.
- Light theme only for now (dark tokens exist for later).
- Accessibility (WCAG 2.2 AA): labelled inputs (`<Label htmlFor>`), `aria-invalid` + described-by errors, visible focus, keyboard-operable menus/dialogs (Radix handles it), alt text on images, headings in order, `<main id="main-content">` in every layout, colour is never the only signal.
- Motion: subtle (150–250ms), respect `prefers-reduced-motion` (global CSS does).
- Icons: lucide-react only. Images: `next/image`; user/CMS media through the files module URLs.

## 8. Cross-cutting services (use, don't reimplement)

| Need | API |
|---|---|
| Audit trail | `audit({ action: "job.approved", entityType: "job", entityId, organizationId, metadata, tx })` — `@/modules/audit` |
| Security events | `logSecurityEvent({ userId, type, severity })` |
| Sensitive data access | `logDataAccess({ subjectType, subjectId, subjectUserId, dataCategory, accessType, reason })` |
| Approvals | `submitForApproval({ type, entityType, entityId, title, payload, submittedByUserId, organizationId }, tx)`; implement decisions in your module's `approval-handlers.ts` — `@/modules/approvals/service` |
| Notifications | `notify({ event, recipients: [{ userId }], data, link }, { tx })`, `notifyStaff({ event, permission, … })`, `notifyOrganization({ event, organizationId, permission, … })` — events in `src/modules/notifications/events.ts` |
| Background work | `enqueueTask("module.task", payload, { runAt, dedupeKey, tx })`; handlers in your module's `tasks.ts` |
| Entitlements / credits | `checkEntitlement(orgId, key)`, `consumeEntitlement(orgId, key, { reference, actorUserId, tx })` — `@/modules/commercial/entitlements` |
| Files | `<FileUpload purpose="resume" name="resumeFileId" />` (client) posts to `/api/v1/uploads`; server: `getFile`, `fileUrl`, `grantFileAccess`, `canAccessFile` — `@/modules/files` (see its README) |
| Consent | `recordConsent({ userId, purpose, granted, source, contextType, contextId }, tx)`, `hasConsent(userId, purpose)` — `@/modules/identity/consent` |
| Settings / flags | `getSetting("security.require_staff_2fa")`, `isFeatureEnabled("portal.recruiter")` — `@/modules/settings` (keys incl. `platform.home_country`, `recruitment.partner_attribution_days`, `recruitment.profile_unlock_days`) |
| Tax invoices / credit notes | `nextGstDocumentNumber("invoice" \| "credit_note", { tx })` — `@/lib/codes` (GST Rule 46: ≤ 16 chars, per financial year; assign only on issue) |
| Taxonomies | `listCountries()`, `countryOptions()`, `industryOptions()`, `jobCategoryOptions()`, `searchSkills(q)`, `listLanguages()`, `currencyOptions()` — `@/modules/taxonomy/queries` |
| Human codes | `nextCode("REQ")` — `@/lib/codes` |
| Rate limits | `rateLimit(key, limit, windowSeconds)` — `@/lib/rate-limit` (all public forms, OTP, login) |
| Analytics | client `track("application_submitted", { jobId })` — `@/modules/analytics/client`; names in `events.ts` |
| Formatting | `formatMoney`, `formatSalaryRange`, `formatDate`, `formatDateTime`, `formatRelative`, `maskEmail`, `maskPhone`, `humanize` — `@/lib/format` |
| Env | `env()`, `absoluteUrl()` — `@/lib/env` (server only) |

## 9. People Portal i18n

The People Portal (`/talent/**`) and auth screens are multilingual (English, Hindi, Telugu). Use translation keys, English text in `src/i18n/messages/en/<namespace>.json`:

```ts
const t = await getT("talent-jobs");          // server components — "@/i18n/server"
const t = useT("talent-jobs");                // client components inside <I18nProvider> — "@/i18n/client"
```

Namespaces: `common` (shared words + nav), `auth`, `talent-dashboard`, `talent-profile`, `talent-jobs`, `talent-training`, `talent-account`. Own only your namespace file. Keys are flat dotted strings (`"apply.submit": "Submit application"`). Placeholders `{name}`; plurals `key_one` / `key_other` with `{count}`. Business portals (employer, recruiter, institution, admin) are English-only.

## 10. Security checklist (every change)

- Validate all input with zod (actions, route handlers, search params that hit the DB).
- Authorize + scope (rule 4). Check entity ownership before update/delete (IDOR).
- Route Handlers that mutate state: check `isSameOrigin(request)` (CSRF) unless authenticated by a signature (webhooks) or bearer secret (cron).
- Rate-limit public endpoints and expensive actions.
- Rich text from users/CMS: sanitise on write (`sanitizeRichText` from `@/lib/sanitize`) and render with `<SafeHtml html={...} />`. Never `dangerouslySetInnerHTML` raw input.
- Uploads only through the files module (type/size limits, magic-byte sniffing, malware scan status).
- Secrets only in env; never send server env to the client; never log secrets/OTPs/passwords/tokens.
- Use `safeReturnTo()` for any redirect target taken from input.

## 11. Privacy checklist

- Candidate contact details/documents: visible to the candidate, to staff with `candidates.view_contact` / `candidates.view_documents` (logged), to employers only after consent (application, share, or unlock rules), never to other partners.
- Internal notes, recruiter notes, employer feedback and rejection reasons are never shown to candidates (use `candidateVisibleNote` fields for candidate-facing text).
- Partners never see Venkat Sai finances or other partners' data.
- Analytics: pseudonymous, consent-gated, no form contents, no keystrokes, masked session insights.
- Respect `candidate_privacy_settings` and `visibility` in every employer/partner/public query.

## 12. Testing & verification

- `npm run typecheck` (or `npx tsc --noEmit`) must pass for files you own. Other owners may be mid-change — ignore errors outside your files, but never leave errors in yours.
- Unit-test pure logic with Vitest (`src/**/x.test.ts`): `npx vitest run src/modules/jobs`.
- Do not start dev/prod servers unless your brief says so.

## 13. Environment (PowerShell on Windows)

```powershell
$env:TEMP='E:\VenkatSaiGlobal-work\tmp'; $env:TMP='E:\VenkatSaiGlobal-work\tmp'; $env:NEXT_TELEMETRY_DISABLED='1'
Set-Location E:\VenkatSaiGlobal
npx tsc --noEmit
```

`.env.local` holds local secrets (never print them). DB: `postgres://postgres:postgres@127.0.0.1:5433/venkatsai`.

## 14. Style

- TypeScript strict; no `any` (use `unknown` + narrowing); explicit return types on exported service functions.
- Named exports (pages/layouts default-export as Next requires).
- Small files: split components over ~250 lines.
- Comments explain *why*, not *what*. Every module has a README listing its public API.
- User-facing copy: clear, plain English, sentence case, no hype, no exclamation marks, no unverifiable claims.

## 15. Product rules from the regulatory research

Source: `docs/research/regulatory-notes.md` (to be validated by counsel). Enforce or support these in every relevant feature:

1. **Employer pays.** Candidates are never charged to discover, apply, be submitted, be interviewed or be trade-tested for a role. A trade test linked to a requirement/application is paid by the employer or Venkat Sai. Course fees are never a condition of an application, offer or placement.
2. **Recruiting-agent transparency.** Overseas jobs advertised by or for a recruiting agent show the agent's name and eMigrate registration/certificate number. Venkat Sai's own registration is only shown once it is recorded and verified (never assumed).
3. **Fraud awareness.** The public site has a "We never charge candidates" page explaining how to verify an agent on eMigrate and the government helpline (Pravasi Bharatiya Sahayata Kendra).
4. **Honest credentials.** Venkat Sai trade/skill test results are labelled "Venkat Sai assessment" with the procedure reference — never presented as an accredited certification. Public verification lives at `/verify-certificate`.
5. **Pre-departure:** call it "PDOT (Pre-Departure Orientation Training)" in UI copy.
6. **Children's data (DPDP Rules 2025).** Sign-up confirms the person is 18+; under-18 users need verifiable guardian consent (`guardian_consent`) before anything beyond age confirmation, are excluded from overseas matching and employer search for overseas roles, and get no tracking, heatmaps or marketing.
7. **Grievances** follow the settings-driven timelines (`privacy.grievance_ack_hours`, `privacy.grievance_resolution_days`); never hardcode them.
8. **Invoices** use GST-compliant numbering (`nextGstDocumentNumber`).
