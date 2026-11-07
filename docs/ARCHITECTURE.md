# Venkat Sai Global — Architecture

## 1. Shape

A **secure modular monolith**: one Next.js 16 application (TypeScript) that serves the public website, five role-based portals and the API, backed by one PostgreSQL database. Domain logic is split into modules under `src/modules/<domain>` with explicit public APIs, so any module can later be extracted into a service if scale demands it.

```
Browser ──► Next.js (proxy.ts: CSP nonce, security headers, coarse auth redirects)
              ├─ (public)      marketing site, job board, CMS pages            ─┐
              ├─ talent         People Portal                                   │  Server Components
              ├─ employer       Employer Portal                                 │  + Server Actions
              ├─ recruiter      Recruitment Partner Portal                      │  call domain modules
              ├─ institution    Institution & Training Portal                   │
              ├─ admin          Venkat Sai Command Centre                      ─┘
              └─ api/v1         uploads · files · collect (analytics) · webhooks · cron · health · feeds
                    │
             src/modules/*  (identity, organizations, candidates, jobs, recruitment, training,
                    │        operations, commercial, notifications, content, analytics, files,
                    │        approvals, audit, settings, privacy, taxonomy)
                    ▼
              PostgreSQL ◄── worker (npm run worker) / cron (/api/v1/cron/tick): background tasks
                    │
          Storage driver (local disk | S3-compatible) · Email (SMTP) · SMS (MSG91/Twilio) ·
          WhatsApp Cloud API · Razorpay / Stripe · ClamAV (optional) · Clarity / GA4 (consent-gated)
```

## 2. Key decisions

| # | Decision | Why |
|---|---|---|
| 1 | Single TypeScript codebase (Next.js App Router) instead of Next.js + separate .NET API | One language end-to-end, one deployable, server components talk to the DB directly; still layered (pages → actions → services → DB). The owner explicitly delegated technology choice. |
| 2 | PostgreSQL (not SQL Server) | First-class on every host (Neon, Supabase, Azure Database for PostgreSQL, RDS, self-hosted), full-text search + trigram, JSONB, partial indexes; local dev uses bundled binaries (no install). |
| 3 | Drizzle ORM with `snake_case` casing, text enums, explicit joins | Type-safe SQL, painless migrations, no hidden N+1 relation loading. |
| 4 | Custom auth (argon2id + DB sessions + OTP + TOTP + Google OAuth) | Full control over phone-first onboarding, 2FA for staff, multi-portal access and auditing; no vendor lock-in. |
| 5 | One identity, many capacities | A person can be a candidate, an employer member, a partner member and staff; portal access is derived from candidate profile, org memberships and staff roles. |
| 6 | Configurable roles + permission keys | Spec requires configurable permissions for staff and organisation members. Code checks permission keys only. |
| 7 | Organisations as one table with `type` | Employers, recruitment partners and institutions share verification, membership, documents and billing; type-specific data lives in profile tables. |
| 8 | Unified approval inbox with per-domain handlers | One place for every approval (spec 12.9); domain effects stay in their modules. |
| 9 | PostgreSQL task queue + recurring schedule | No Redis/Service Bus needed to start; works on serverless via cron and on VMs via a worker. |
| 10 | Generic typed CMS (collections + versions) | Non-technical admins manage every public page with drafts, preview, scheduling, history and rollback. |
| 11 | First-party, consent-gated analytics | Purpose-limited insight without covert tracking; optional Clarity/GA4 behind explicit consent. |
| 12 | Cache Components disabled, dynamic rendering | Data changes constantly (jobs, CMS, dashboards); simpler mental model for a large team. |

## 3. Security model

- **Authentication:** argon2id hashes, 256-bit session tokens (DB stores HMAC), httpOnly SameSite=Lax cookies (`__Host-` in production), sliding 30-day sessions (12h for staff), account lockout, OTP with attempt limits and rate limits, TOTP 2FA (mandatory for staff in production), recovery codes, session listing/revocation.
- **Authorization:** guards (`requireStaff`, `requireOrgMember`, `requireCandidate`) + permission keys + query scoping; 403 via `forbidden()`.
- **Data protection:** AES-256-GCM field encryption for identity numbers and TOTP secrets; masked display; data-access log for sensitive reveals; consent ledger; DSAR workflow; retention jobs.
- **Transport & headers:** HSTS, nonce-based CSP, X-Content-Type-Options, frame restrictions, Referrer-Policy, Permissions-Policy.
- **Input:** zod validation everywhere; sanitised rich text; uploads via magic-byte sniffing, size/type limits, optional ClamAV scanning; private files only via authorised route.
- **Abuse:** PostgreSQL-backed rate limits on login, OTP, public forms and the analytics collector.
- **Audit:** append-only audit, security-event and data-access logs.

## 4. Deployment

- **Vercel + Neon (recommended start):** set env vars from `.env.example`, `DATABASE_URL` to Neon pooled URL, `STORAGE_DRIVER=s3` (Cloudflare R2/S3), Vercel Cron → `/api/v1/cron/tick` every 5 minutes with `CRON_SECRET`.
- **Any Node host / Azure App Service / VM:** `npm run build && npm run start` plus `npm run worker` as a second process; PostgreSQL 15+; local or S3 storage.
- Migrations: `npm run db:migrate` (creates required extensions, applies `drizzle/` migrations). First run: `npm run db:seed` (reference data, roles, first Super Admin).
