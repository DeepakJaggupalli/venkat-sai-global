# Venkat Sai Global

**The Global Opportunity Network** — *One Platform. Every Opportunity. One Trusted Destination.*

Venkat Sai Global is the website and operations platform of Venkat Sai Welding Works and Testing Center
(Auto Nagar, Visakhapatnam, India). It brings overseas and domestic recruitment, manpower supply, welding
training and testing, internships and workforce services together in one place, and gives the Venkat Sai team
one Command Centre to run the business.

## What is in the platform

| Experience | Route | Who uses it |
|---|---|---|
| Public website | `/` | Visitors: requirement posters (`/requirements`), **Send your CV** (`/send-cv`), jobs, training, services, news, contact, legal pages (CMS-managed) |
| People Portal | `/talent` | Students, jobseekers, skilled workers (English, Hindi, Telugu) |
| Employer Portal | `/employer` | Companies, HR teams, contractors, international employers |
| Partner Portal | `/recruiter` | Verified recruitment agencies and sourcing partners |
| Institution Portal | `/institution` | Colleges, ITIs, training centres, assessment providers |
| Command Centre | `/admin` | The Venkat Sai team: CVs, resume requests, approvals, recruitment, website content, billing, settings |

Rules that hold everywhere: candidates never pay to discover or apply for jobs (the only paid candidate service
is the "Prepare my resume" service); no fabricated statistics, testimonials or logos; privacy by default (masked
contact details, logged reveals, consent records, data-subject requests); every action is authorised and audited.

## Stack

- **Next.js 16** (App Router), **React 19**, **TypeScript**, Tailwind CSS 4 and shadcn/ui (WCAG 2.2 AA target)
- **PostgreSQL** with **Drizzle ORM** — a bundled PostgreSQL 17 for local development, **Neon** (PostgreSQL 18,
  Singapore) in the cloud
- **Vercel** hosting (region `sin1`) with a private **Vercel Blob** store for uploaded files
- Own authentication: argon2id passwords, database sessions, email/phone one-time codes, TOTP two-factor,
  optional Google sign-in
- A PostgreSQL-backed background task queue, run by a daily Vercel cron plus a GitHub Actions scheduler
  (every 5 minutes), or by `npm run worker` on a normal server
- Optional integrations, all switched on by environment variables: SMTP email, SMS (MSG91 / Twilio),
  WhatsApp Cloud API, Razorpay / Stripe, ClamAV, S3-compatible storage

## Local setup

Requirements: Node.js 20.9+ (24 recommended) and Git. No database install is needed: PostgreSQL binaries ship as a
dev dependency. Keep the repository and all scratch files on the E: drive (`E:\VenkatSaiGlobal`,
`E:\VenkatSaiGlobal-work`).

```bash
npm install
cp .env.example .env.local      # fill SESSION_SECRET, DATA_ENCRYPTION_KEY, IP_HASH_SALT, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
npm run db:start                # local PostgreSQL 17 on 127.0.0.1:5433, database "venkatsai", data in ./.data
npm run db:migrate              # creates the extensions and applies ./drizzle migrations
npm run db:seed                 # reference data, roles, default website content, first Super Admin
npm run dev                     # http://localhost:3000
```

Generate the three secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
Sign in at `/sign-in` with the `SEED_ADMIN_*` account and open `/admin`. Emails sent locally land in the dev
outbox at `/admin/system/dev-outbox` (one-time codes included). Background tasks run only while
`npm run worker` runs in a second terminal (optional for most development).

Test accounts and test data for the browser tests: `npm run db:seed:e2e` (local database only; it writes the
accounts and passwords to `E:\VenkatSaiGlobal-work\e2e\e2e.env`). The accounts are listed in
[docs/TESTING.md](docs/TESTING.md).

Other useful commands: `npm run db:stop`, `npm run db:status`, `npm run db:reset` (destroys local data),
`npm run db:studio`, `node scripts/test-db.mjs vsg_test_<name>` (isolated test database),
`npm run content:refresh` (bring seeded website copy up to date without touching staff edits).

## Tests

```bash
npm run typecheck               # TypeScript
npm run lint                    # ESLint
npm test                        # Vitest unit tests (integration suites run only against a vsg_test_* database)
npm run test:e2e                # Playwright, against a running app (E2E_BASE_URL) and the E2E seed
```

How to run each kind, the isolated test databases, the E2E seed and its accounts: [docs/TESTING.md](docs/TESTING.md).

## Deployment in one paragraph

Pushing to `main` deploys to production on Vercel (the Production environment holds the real environment
variables; preview deployments are built from other branches). **Database migrations are not run by the
deploy**: an engineer runs `npm run db:migrate` against the *unpooled* Neon connection string from a trusted
machine before the push that needs them. Background work is driven by the daily Vercel cron and the GitHub
Actions scheduler (`.github/workflows/scheduler.yml`, every 5 minutes, needs the `CRON_SECRET` repository
secret). Everything else — environment variables, email, Google sign-in, Razorpay, backups, monitoring, the
incident checklist — is in [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Repository layout

| Path | What is there |
|---|---|
| `src/app/(public)` · `(auth)` · `account` | Public website, sign-in/sign-up flows, account pages |
| `src/app/talent` · `employer` · `recruiter` · `institution` · `admin` | The five portals (the Command Centre is `admin`) |
| `src/app/api/v1` | Route handlers: health, cron tick, uploads, files, notifications, consent, webhooks |
| `src/modules/*` | One folder per business module (identity, candidates, jobs, recruitment, operations, content, commercial, …), each with its own `README.md` |
| `src/db/schema` · `drizzle/` | Drizzle schema (source of truth) and the generated SQL migrations |
| `src/config` | Settings catalogue, feature flags, navigation (route contract), permissions, contact details, brand |
| `src/server/tasks` | Background task queue, scheduler and the recurring schedule |
| `src/components` · `src/lib` | Shared UI and helpers |
| `scripts/` | `db-local.mjs`, `migrate.ts`, `seed.ts`, `seed-e2e.ts`, `content-refresh.ts`, `worker.ts`, `test-db.mjs` |
| `e2e/` | Playwright specs and helpers |
| `docs/` | The documents below |
| `public/` · `storage/` | Static assets · local uploads (development only, not committed) |

## Documentation

For the business owner and staff:

- [Operations guide](docs/OPERATIONS.md) — environments, variables, deploying, background tasks, email, Google sign-in, payments, backups, monitoring, incidents
- [Command Centre guide](docs/ADMIN_GUIDE.md) — how staff do the daily work, task by task, with every route
- [Launch checklist](docs/LAUNCH_CHECKLIST.md) — what must be done before going live, and by whom
- [Requirement posters and Send your CV](docs/REQUIREMENT_POSTERS.md) — posting a poster from a phone, where CVs land

For engineers:

- [Testing](docs/TESTING.md) — unit, integration and end-to-end tests, the E2E seed and accounts
- [Architecture](docs/ARCHITECTURE.md) · [Engineering conventions](docs/CONVENTIONS.md) · [Data model](docs/DATA_MODEL.md) · [Schema notes](docs/SCHEMA_NOTES.md)
- [Design system](DESIGN.md) · [Design tooling](docs/DESIGN_TOOLING.md) · [Web interface guidelines](docs/WEB_INTERFACE_GUIDELINES.md)
- [Regulatory notes](docs/research/regulatory-notes.md) (to be validated by counsel) · [Competitor benchmark](docs/research/competitor-benchmark.md)

## License

Copyright © 2026 Venkat Sai Welding Works and Testing Center. All rights reserved.
