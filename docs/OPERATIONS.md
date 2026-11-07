# Venkat Sai Global — Operations guide

How to run, configure, seed, monitor and back up the platform. Architecture and conventions are in
`ARCHITECTURE.md` / `CONVENTIONS.md`; module details in each module's `README.md`.

## 1. What runs in production

| Component | What it is | Notes |
|---|---|---|
| Web app | `npm run build && npm run start` (or Vercel) | Next.js 16, Node.js 22+. Every page is rendered per request (nonce CSP). |
| Background work | `npm run worker` (VM / container) **or** `/api/v1/cron/tick` (serverless) | Runs the PostgreSQL task queue: notifications, file processing, cleanups, reminders. Never neither. |
| PostgreSQL 15+ | Neon, Azure Database for PostgreSQL, RDS, Supabase or self-hosted | Extensions `pg_trgm`, `citext`, `unaccent` (created by `npm run db:migrate`). |
| File storage | local disk (`./storage`) or any S3-compatible bucket | Use S3 (AWS S3 / Cloudflare R2 / MinIO) on serverless hosts. |
| Email / SMS / WhatsApp | SMTP · MSG91 or Twilio · Meta WhatsApp Cloud API | All optional; `dev` stores messages in the dev outbox instead of sending. |
| ClamAV (optional) | `clamd` reachable over TCP | Malware scanning of uploads. |

## 2. First deployment checklist

1. Create the database and set `DATABASE_URL` (plus `DATABASE_SSL=true` for managed databases).
2. Generate secrets (never reuse between environments):
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` for
   `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `IP_HASH_SALT`, `CRON_SECRET`.
3. Set `APP_URL` to the public https URL and `NODE_ENV=production`.
4. Configure storage (§6) and, when ready, email/SMS/WhatsApp (§7).
5. `npm run db:migrate` — creates the extensions and applies `./drizzle` migrations.
6. Set `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` (strong, ≥ 10 characters, not common) and run
   `npm run db:seed`. Sign in, set up two-factor authentication, then **remove
   `SEED_ADMIN_PASSWORD`** from the environment.
7. Start background processing: `npm run worker` as a second process, or Vercel Cron (§5).
8. Check `GET /api/v1/health` → `{"status":"ok"}`.

Every deploy afterwards: `npm run db:migrate && npm run db:seed` (both idempotent), then restart
the web app and the worker.

## 3. Environment variables

Read through `env()` (`src/lib/env.ts`) unless marked *direct*. Secrets live only in the
environment / secret store — never in the repository.

| Variable | Required | Purpose |
|---|---|---|
| `APP_URL` | prod | Public base URL (links in emails, OAuth callbacks). |
| `DEFAULT_TIMEZONE` | no | Default `Asia/Kolkata`. |
| `DATABASE_URL` | **yes** | PostgreSQL connection string. |
| `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_POOL_MAX` | no | *direct* — TLS (`true` for managed DBs), certificate check (default on), pool size (default 10; keep low on serverless). |
| `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `IP_HASH_SALT` | **prod** | Token hashing, AES-256-GCM field encryption (32-byte base64), IP pseudonymisation. Dev uses insecure fallbacks. |
| `CRON_SECRET` | with cron | Bearer token for `/api/v1/cron/tick`. Without it the endpoint answers 503. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Google sign-in. |
| `EMAIL_TRANSPORT`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | no | §7.1. |
| `SMS_PROVIDER`, `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_TEMPLATE_ID`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | no | §7.2. |
| `WHATSAPP_PROVIDER`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` | no | §7.3. |
| `WHATSAPP_GRAPH_API_VERSION` | no | *direct* — Graph API version, default `v23.0`. |
| `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR` | no | `local` (default, `./storage`) or `s3`. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | with s3 | §6.2. |
| `STORAGE_S3_PRESIGNED_DOWNLOADS` | no | *direct* — `true`: file downloads redirect to 5-minute presigned S3 URLs after the access check (recommended on Vercel). |
| `STORAGE_PUBLIC_HOST` | no | Only used for `next/image` remote patterns; files are always served through `/media` and `/api/v1/files`. |
| `CLAMAV_HOST`, `CLAMAV_PORT` | no | §6.4. |
| `RAZORPAY_*`, `STRIPE_*` | no | Online payments (commercial module). |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | first run | First Super Admin (§8). |
| `WORKER_CONCURRENCY`, `WORKER_SHUTDOWN_TIMEOUT_MS` | no | *direct* — worker parallelism (default 4) and graceful-shutdown limit (default 30 s). |
| `MIGRATIONS_DIR` | no | *direct* — override `./drizzle` for `db:migrate` (CI checks). |
| `E2E_BASE_URL`, `PLAYWRIGHT_BROWSERS_PATH` | tests | §11. |

## 4. Database

- `npm run db:generate` (developers) writes SQL migrations to `./drizzle` from `src/db/schema` —
  review and commit them. `npm run db:migrate` applies them (tracked in
  `drizzle.__drizzle_migrations`); it is safe to run repeatedly.
- `npm run db:push` is for throwaway local databases only — never production.
- Local development: `npm run db:start` runs a bundled PostgreSQL on `127.0.0.1:5433` (data in
  `.data/`). Isolated test databases: `node scripts/test-db.mjs vsg_test_<name>`.

## 5. Background tasks

Work is queued in `background_jobs` (`enqueueTask()`), handlers live in each module's `tasks.ts`,
recurring tasks are listed in `src/server/tasks/schedule.ts`.

- **Scheduler:** enqueues each recurring task once per interval (dedupe key
  `type:floor(epochMinutes / everyMinutes)`); types without a handler are skipped.
- **Processor:** claims due tasks with `FOR UPDATE SKIP LOCKED` (any number of workers / cron
  calls can run together), runs each with a timeout (2 min), marks success, or re-queues with
  exponential backoff (30 s · 2ⁿ, capped at 1 h, jittered) until `maxAttempts` (5; 3 for
  recurring tasks), then `dead`. Unknown types go straight to `dead`. Tasks stuck in `running`
  for 10 minutes (crashed worker) are re-queued.
- **Housekeeping (`system.cleanup`, daily):** expired rate-limit buckets, dev outbox > 30 days,
  succeeded tasks > 14 days, dead tasks > 90 days, overdue purges of deleted files' bytes.

### 5.1 Worker (VM, container, Azure App Service)

`npm run worker` — scheduler every 60 s, processor every 2 s (drains continuously while work is
available), `WORKER_CONCURRENCY` tasks in parallel. SIGINT/SIGTERM stops claiming, lets running
tasks finish (up to `WORKER_SHUTDOWN_TIMEOUT_MS`), closes the pool. Run it under a supervisor
(systemd, PM2, a container with `restart: always`). Several workers may run side by side.

### 5.2 Serverless (Vercel)

`vercel.json` schedules `GET /api/v1/cron/tick` every 5 minutes. Set `CRON_SECRET` in the project:
Vercel sends it as `Authorization: Bearer …`. Each tick runs the scheduler, recovers stale tasks
and processes due tasks for ~45 s (`maxDuration` 60 s). Notes:
- Vercel Hobby only allows daily cron jobs — use a Pro plan, or call the endpoint from any external
  scheduler (`curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/v1/cron/tick`).
- Background work is delayed by up to 5 minutes; that is expected (OTP codes are sent inline).

### 5.3 Monitoring the queue

```sql
select status, count(*) from background_jobs group by status;
select id, type, attempts, last_error, created_at from background_jobs where status = 'dead' order by id desc limit 50;
```
Fix the cause, then retry a dead task with
`update background_jobs set status = 'queued', attempts = 0, run_at = now() where id = …;`.
Task handlers run outside a request: they must not call `revalidatePath()`, `cookies()` or
`headers()`.

## 6. File storage, uploads and scanning

All binaries go through `src/modules/files` (README there): per-purpose type/size limits,
magic-byte sniffing, metadata stripping for images (GPS/EXIF removed), optional ClamAV scanning,
access-checked downloads.

### 6.1 Local disk (`STORAGE_DRIVER=local`)
Files are written under `STORAGE_LOCAL_DIR` (default `./storage`, outside `public/`). Only for a
single server with a persistent disk; include the directory in backups. Never use it on serverless
hosts (ephemeral file systems — a warning is logged).

### 6.2 S3-compatible (`STORAGE_DRIVER=s3`)
Keep the bucket **private** (no public ACLs or bucket policies); every read goes through the app's
access check. Enable default encryption and versioning or a lifecycle rule for deleted objects.

| Provider | `S3_ENDPOINT` | `S3_REGION` |
|---|---|---|
| AWS S3 | (empty — virtual-hosted URLs) | bucket region, e.g. `ap-south-1` |
| Cloudflare R2 | `https://<account-id>.r2.cloudflarestorage.com` | `auto` |
| MinIO / others | `https://minio.example.com` | as configured |

The access key needs `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on the bucket (no list or
admin rights). With `STORAGE_S3_PRESIGNED_DOWNLOADS=true`, downloads redirect to short-lived
presigned URLs (keeps large files off the app servers).

### 6.3 Upload size limits
Limits are per purpose (5–25 MB; see the files README). Uploads stream through
`POST /api/v1/uploads`. **On Vercel the request body is limited to 4.5 MB**, so larger uploads
fail there; host the app on a Node server (VM / container / App Service) if users need the full
limits, or reduce the policy limits. Reverse proxies must allow bodies of at least 26 MB
(e.g. nginx `client_max_body_size 26m;`).

### 6.4 Malware scanning (ClamAV)
Run `clamd` (e.g. the `clamav/clamav` container, which keeps signatures updated with freshclam) on
a private network, then set `CLAMAV_HOST`/`CLAMAV_PORT` (3310). Set clamd's `StreamMaxLength` to
at least `26M`. Behaviour: clean → served; infected → stored in quarantine, never served, the
upload is rejected and a `file_quarantined` security event is recorded; scanner unavailable → the
file stays `pending` (only its owner can open it) and `files.process` retries in the background.
Without ClamAV, files are marked `not_scanned`.

## 7. Email, SMS and WhatsApp

Selection is by environment; `dev` stores messages in the dev outbox (`/admin/system/dev-outbox`).
Provider calls time out after 10 s and never log message bodies or codes. The notification
feature flags (`notifications.email/sms/whatsapp`) and user preferences still apply.

### 7.1 Email (SMTP)
`EMAIL_TRANSPORT=smtp`, `EMAIL_FROM="Venkat Sai Global <no-reply@yourdomain>"`, `SMTP_HOST`,
`SMTP_PORT` (587 with STARTTLS and `SMTP_SECURE=false`, or 465 with `SMTP_SECURE=true`),
`SMTP_USER`, `SMTP_PASSWORD`. Works with Amazon SES SMTP, Microsoft 365, Google Workspace (app
password / relay), Zoho, Brevo, etc. Publish SPF, DKIM and DMARC records for the sending domain.

### 7.2 SMS
- **MSG91 (India):** `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` (default Flow
  template), `MSG91_SENDER_ID`. Indian SMS requires TRAI DLT registration: register the entity,
  the sender ID (header) and each template on a DLT portal, then create matching MSG91 Flow
  templates. Messages are sent by template id with variables (free text is not allowed).
- **Twilio:** `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`
  (E.164 number or Messaging Service SID `MG…`).

### 7.3 WhatsApp (Meta WhatsApp Cloud API)
`WHATSAPP_PROVIDER=meta`, `WHATSAPP_PHONE_NUMBER_ID` (from the WhatsApp Business account),
`WHATSAPP_ACCESS_TOKEN` (a permanent system-user token with `whatsapp_business_messaging`).
Business-initiated messages must use pre-approved templates; the notifications module maps events
to template names. Keep `notifications.whatsapp` off until templates are approved.

## 8. Seeding (`npm run db:seed`)

Idempotent: inserts what is missing (matched by natural keys) and never overwrites data that
administrators may have edited (it only fills empty fields). Seeds:
- all active ISO 4217 currencies (minor units follow `Intl`, the same source as `formatMoney`; for
  a few currencies CLDR uses fewer decimals than ISO 4217, e.g. PKR, IDR, HUF, COP use 0);
- all ISO 3166-1 countries (codes, native names, calling code, main currency, continent, market
  region), India's 28 states and 8 union territories, 34 languages (English, Hindi and Telugu are
  UI locales), 20 industries, ~90 job categories, ~320 skills with synonyms, education levels and
  qualification types;
- default roles (`DEFAULT_ROLES`); Super Admin's permissions are always reset to every platform
  permission, other roles keep their edits;
- the first Super Admin from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` — only while no Super Admin
  exists. An existing account with that email is promoted, its password replaced and its sessions
  revoked;
- then each module's own seed (recruitment, content, notifications, commercial, analytics,
  training); a failing module seed is reported and the run exits non-zero.

**Destinations:** countries flagged `isDestination` (GCC plus a configurable list of commonly
served overseas markets) are configuration only. Public pages show a destination only when a
published CMS destination entry exists. Adjust the flags at `/admin/settings/taxonomies`.
Nothing in the seed is demo or business data (no statistics, clients or testimonials).

## 9. Backups and recovery

- **Database:** use the provider's point-in-time recovery (Neon, Azure, RDS) and also take a daily
  logical backup kept off-site, e.g.
  `pg_dump --format=custom --no-owner "$DATABASE_URL" > vsg-$(date +%F).dump` (restore with
  `pg_restore --no-owner --dbname "$TARGET_URL" vsg-YYYY-MM-DD.dump`). Retain at least 30 days and
  test a restore every quarter.
- **Files:** S3/R2 versioning or replication; for local storage back up `STORAGE_LOCAL_DIR` together
  with the database (rows and objects must match).
- **Secrets:** store `DATA_ENCRYPTION_KEY` in a secret manager with its own backup. Losing it makes
  encrypted fields (passport numbers, TOTP secrets) unrecoverable; changing it requires
  re-encrypting those fields. Rotating `SESSION_SECRET` signs everyone out.

## 10. Monitoring, logs and security headers

- `GET /api/v1/health` — database ping (3 s timeout), app version, uptime; 503 when the database is
  down. Point uptime monitors / load-balancer probes at it.
- Logs are JSON lines in production (`src/lib/logger.ts`). Every page request carries an
  `x-request-id` (from the proxy) that audit logs record. `src/instrumentation.ts` logs unhandled
  render / route / action errors with route and request id (no headers, cookies or query strings).
- Watch: dead background tasks, `security_events` (`file_quarantined`, lockouts), 5xx rates.
- `src/proxy.ts` sets a per-request nonce Content-Security-Policy and redirects signed-out
  visitors away from portal pages; `next.config.ts` adds HSTS (production), `nosniff`, frame and
  referrer policies. Adding a third-party script or embed means adding its origin to the CSP lists
  in `src/proxy.ts` and loading the script with the nonce (`(await headers()).get("x-nonce")`).

## 11. End-to-end tests (Playwright)

Browsers must be stored on the E: drive:
```powershell
$env:PLAYWRIGHT_BROWSERS_PATH='E:\VenkatSaiGlobal-work\ms-playwright'
npx playwright install chromium          # once
# start the app (npm run dev or npm run start) in another terminal, then:
$env:E2E_BASE_URL='http://localhost:3000'; npm run test:e2e
```
`playwright.config.ts` runs desktop Chromium and a Pixel 7 profile, keeps traces on the first
retry, and defaults `PLAYWRIGHT_BROWSERS_PATH` to the E: path on Windows when it is unset.
`e2e/smoke.spec.ts` checks the homepage under CSP, the health endpoint and the portal redirect.
