# Testing

How to run the unit, integration and end-to-end tests locally. Everything runs on the E: drive and against
the **local** PostgreSQL only (127.0.0.1:5433). Never point a test, a seed or a helper at Neon or any shared
database.

Before any `npm` / `npx` command in bash:

```bash
export npm_config_cache=/e/VenkatSaiGlobal-work/npm-cache TEMP='E:\VenkatSaiGlobal-work\tmp' TMP='E:\VenkatSaiGlobal-work\tmp'
cd /e/VenkatSaiGlobal
```

PowerShell: `$env:TEMP='E:\VenkatSaiGlobal-work\tmp'; $env:TMP='E:\VenkatSaiGlobal-work\tmp'; $env:npm_config_cache='E:\VenkatSaiGlobal-work\npm-cache'`.

## 1. Static checks

```bash
npx tsc --noEmit              # whole project
npx eslint src/modules/jobs   # the paths you touched
```

## 2. Unit tests (Vitest)

Pure tests live next to the code (`src/**/*.test.ts`) and need no database.

```bash
npx vitest run                          # everything (integration suites skip themselves without a test DB)
npx vitest run src/modules/jobs         # one module
npx vitest run src/server/seed          # seed data + the E2E seed safety guard
```

## 3. Integration tests (Vitest + an isolated database)

Suites named `*.integration.test.ts` run only when `DATABASE_URL` points at a database whose name starts with
`vsg_test_`. Create your own, with the current schema pushed, and drop it when you are done:

```bash
npm run -s db:start                                     # local PostgreSQL on 127.0.0.1:5433 (if it is down)
node scripts/test-db.mjs vsg_test_<yourname>            # drop + create + extensions + schema
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_test_<yourname> npx vitest run src/modules/jobs
node scripts/test-db.mjs vsg_test_<yourname> --drop
```

Never use `venkatsai` (the dev database the E2E servers use) for integration tests.

## 4. End-to-end tests (Playwright)

### 4.1 Prepare the local database

```bash
npm run -s db:start
npm run -s db:migrate         # schema
npm run -s db:seed            # reference data, roles, default CMS content (production seed)
npm run -s db:seed:e2e        # test accounts and data (local only, below)
```

### 4.2 The E2E seed (`npm run db:seed:e2e`)

Runner `scripts/seed-e2e.ts`, logic in `src/server/seed/e2e*.ts`. It works through the domain services
(organisation verification through the approval centre, jobs created by the employer and published by staff,
a real candidate application, partner licence / agreement / assignment / submission, institution course
approval, batch and confirmed enrolment, plans, CMS entries), so the data is valid.

**Safety.** `src/server/seed/e2e-guard.ts` refuses to run unless `DATABASE_URL`'s host is `127.0.0.1` or
`localhost` (no `?host=` override), `NODE_ENV` is not `production` and it is not running on Vercel. The guard
runs before the database module loads, and the production seed never imports the E2E seed (unit-tested in
`e2e-guard.test.ts`). It also sets `security.require_staff_2fa = false` — in the local database only.

**Idempotent.** Re-running finds everything by natural key and resets it: accounts become active, verified and
unlocked; organisations stay verified; the seeded jobs are re-published / extended if a spec paused or closed
them; a withdrawn seeded application is re-submitted; the minor's guardian consent is withdrawn again.

**Passwords.** One random password per account per run (Node `crypto`), never printed.
`npm run db:seed:e2e -- --keep-passwords` keeps the persistent accounts' passwords from the current env file
(and their sessions) and only rotates the fresh accounts. **A plain re-run rotates every password and signs
those accounts out** — other engineers running specs must re-source the env file. Prefer `--keep-passwords`
while others are testing.

**What it creates** (all names start with "E2E" and are labelled as test data; no statistics, testimonials or
logos):

| Env prefix (`E2E_<P>_EMAIL` / `_PASSWORD`) | Account |
|---|---|
| `ADMIN` | Super Admin (staff) |
| `OPS` | Operations Manager role (staff) |
| `FINANCE` | Finance role (staff) |
| `CONTENT` | Content Manager role (staff) |
| `EMPLOYER` | Owner of **E2E Employer Co** (verified) |
| `EMPLOYER_MEMBER` | HR Manager of E2E Employer Co |
| `PARTNER` | Owner of **E2E Recruitment Partner** (verified, verified Recruiting Agent licence `E2E-TEST-RA-0001`, accepted agreement, active assignment on the overseas job, one submission) |
| `OTHER_PARTNER` | Owner of **E2E Other Recruitment Partner** (verified, domestic, assignment on the domestic job, its own submission) |
| `INSTITUTION` | Owner of **E2E Training Institute** (verified, certificate-issuer authorisation, published course, open batch with the adult candidate confirmed) |
| `OTHER_INSTITUTION` | Owner of **E2E Other Training Institute** (verified, its own published course and open batch) |
| `CANDIDATE` | Adult candidate (28), age gate and onboarding done, profile basics, applied to the domestic job, enrolled in the batch |
| `MINOR` | Candidate aged 16 **without** guardian consent (People Portal shows only the guardian step) |
| `NEW_USER` | **Fresh**: verified email, nothing else. Used by the employer and the institution onboarding specs |
| `NEW_CANDIDATE` | **Fresh**: verified email, no profile. Used by the age-gate spec (the date of birth locks) |
| `NEW_PARTNER` | **Fresh**: verified email, nothing else. Used by the partner onboarding spec |

Fresh accounts (and anything they created) are deleted and recreated on every run.

Ids and flags: `E2E_CANDIDATE_ID`, `E2E_MINOR_CANDIDATE_ID`, `E2E_EMPLOYER_ORG_ID`, `E2E_EMPLOYER_JOB_ID` (published
domestic job with the shared application), `E2E_EMPLOYER_JOB_SLUG`, `E2E_EMPLOYER_OVERSEAS_JOB_ID` /
`_SLUG` (Abu Dhabi, AED salary, recruiting agent recorded), `E2E_EMPLOYER_APPLICATION_ID`, `E2E_PARTNER_ORG_ID`,
`E2E_PARTNER_ASSIGNMENT_ID`, `E2E_PARTNER_SUBMISSION_ID`, `E2E_OTHER_PARTNER_ORG_ID`,
`E2E_OTHER_PARTNER_SUBMISSION_ID`, `E2E_INSTITUTION_ORG_ID`, `E2E_INSTITUTION_COURSE_ID`, `E2E_INSTITUTION_BATCH_ID`,
`E2E_OTHER_INSTITUTION_ORG_ID`, `E2E_OTHER_BATCH_ID`, `E2E_PLAN_INR_ID`, `E2E_PLAN_OTHER_CURRENCY_ID`,
`E2E_PLAN_OTHER_CURRENCY` (`USD`), `E2E_EMPLOYER_VERIFIED=1`, `E2E_PARTNER_VERIFIED=1`,
`E2E_INSTITUTION_VERIFIED=1`, `E2E_SEEDED_AT`.

Commercial: public employer plans `e2e_employer_inr` (INR 4,999 / month) and `e2e_employer_usd` (USD 79 / month),
each with 5 job posts a month, and seller details with test values (no GSTIN, so invoices are not tax invoices).
CMS: published `industries/e2e-test-industry`, `destinations/e2e-test-destination`, `faqs/e2e-test-faq` and
`news/e2e-test-news`; site settings, homepage, services and the legal pages (incl. `data-rights`) come from
`npm run db:seed`.

### 4.3 The env file

The seed writes `E:\VenkatSaiGlobal-work\e2e\e2e.env` (override with `E2E_ENV_FILE`): `KEY=value` lines,
quoted where needed. It holds passwords for the local database — never commit, print or paste it.

```bash
set -a; . /e/VenkatSaiGlobal-work/e2e/e2e.env; set +a
```

```powershell
Get-Content E:\VenkatSaiGlobal-work\e2e\e2e.env | Where-Object { $_ -match '^[A-Z0-9_]+=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2; Set-Item "env:$k" ($v -replace "^'(.*)'$", '$1')
}
```

To list every variable the specs read: `grep -rhoE "E2E_[A-Z_]+" e2e | sort -u`.

### 4.4 Local dev servers (`e2e-server.mjs`)

Each engineer runs an isolated Next.js dev server on a slot (1–9):

```bash
URL=$(node /e/VenkatSaiGlobal-work/tmp/e2e-server.mjs start <SLOT> | tail -1)   # http://127.0.0.1:32<SLOT>0
# … run specs …
node /e/VenkatSaiGlobal-work/tmp/e2e-server.mjs stop <SLOT>                     # always, also after failures
```

Slot N uses port `32N0`, its own build folder `.next-e2e-N`, the local `venkatsai` database from `.env.local`
and `E2E_DISABLE_RATE_LIMITS=1` (honoured only outside production and Vercel; see `src/lib/rate-limit.ts`).
Log: `E:\VenkatSaiGlobal-work\tmp\e2e-server-N.log` — read it for server-side errors.

- Dev mode compiles each route on first request: warm up with `curl -s -o /dev/null "$URL/<route>"` and pass
  `--timeout=60000` (or more) to Playwright.
- `next.config.ts` allows the `127.0.0.1` origin for dev resources (`allowedDevOrigins`). Without it Next.js
  refuses `/_next/hmr` and **the client never hydrates** (buttons, tabs, dialogs do nothing). Restart servers
  started before that setting existed.
- If pages reload by themselves ("HMR hash mismatch" in the browser console), the build folder is stale: stop
  the server, delete `.next-e2e-<SLOT>`, start again. `e2e/accounts.spec.ts` checks both conditions.

### 4.5 Running specs

Browsers are in `E:\VenkatSaiGlobal-work\ms-playwright` (`playwright.config.ts` sets `PLAYWRIGHT_BROWSERS_PATH`
on Windows). Never run `playwright install`. Always pass your own `--output` folder — other engineers run at
the same time.

```bash
E2E_BASE_URL=$URL npx playwright test e2e/<spec>.spec.ts --project=chromium --output=E:/VenkatSaiGlobal-work/e2e/results/<yourname> --reporter=list
E2E_BASE_URL=$URL npx playwright test e2e/<spec>.spec.ts --project=mobile   --output=E:/VenkatSaiGlobal-work/e2e/results/<yourname> --reporter=list
```

Projects: `chromium` (Desktop Chrome) and `mobile` (Pixel 7). Start with `e2e/smoke.spec.ts` and
`e2e/accounts.spec.ts` (every seeded account signs in and reaches its portal; the page hydrates).

### 4.6 Helpers

`e2e/support/` — `signIn(page, role)`, dev-outbox codes and links, axe checks, horizontal-scroll check. See
`e2e/support/README.md`.

### 4.7 Things that bite

- **OTP cooldown:** one-time codes can be re-requested for the same address only after 60 seconds, even with
  rate limits off.
- **Lock-out:** 8 failed sign-ins lock an account for 15 minutes. Test wrong passwords with unknown addresses,
  not seeded accounts (re-seeding unlocks).
- **Fresh accounts are single-use** per seed run; reset them with `npm run db:seed:e2e -- --keep-passwords` and
  re-source the env file (their passwords change).
- **Sign-in locators:** the "Password" tab panel is labelled "Password"; `getByLabel(/password/i).first()` finds
  the panel, not the input. Use `signIn()` / `fillPasswordSignInForm()`.
- **Shared data:** don't close, delete or re-verify the seeded organisations, jobs or batches; create your own
  uniquely named records for destructive flows.
