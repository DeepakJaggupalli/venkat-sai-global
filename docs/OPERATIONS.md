# Venkat Sai Global — Operations guide

How to run, configure, deploy, monitor and recover the platform. Written for the business owner and the
person who helps with the technical side. Day-to-day use of the Command Centre is in `ADMIN_GUIDE.md`; the
pre-launch list is in `LAUNCH_CHECKLIST.md`; tests are in `TESTING.md`. Engineering detail lives in
`ARCHITECTURE.md`, `CONVENTIONS.md` and each module's `README.md` under `src/modules/`.

Never paste real secrets into chat, tickets, documents or this repository. They live only in `.env.local`
(development, not committed), in the Vercel project settings (cloud) and in GitHub repository secrets.

## 1. Environments

| | Local development | Staging | Production |
|---|---|---|---|
| Where | Your computer, `E:\VenkatSaiGlobal` | Vercel preview deployment (any branch that is not `main`) or a second Vercel project | Vercel, Production environment, branch `main` |
| App URL | `http://localhost:3000` | `https://<branch>-….vercel.app` | `https://venkat-sai-global.vercel.app` until the custom domain is attached |
| Region | — | `sin1` (Singapore, set in `vercel.json`) | `sin1` |
| Database | Bundled **PostgreSQL 17** started by `scripts/db-local.mjs` (`npm run db:start`): `127.0.0.1:5433`, database `venkatsai`, data in `.data/postgres` | A separate Neon database or branch (never the production one) | **Neon, PostgreSQL 18**, Singapore (`aws-ap-southeast-1`) |
| Files | `./storage` on disk (`STORAGE_DRIVER=local`) | A separate Vercel Blob store | **Vercel Blob**, private store, `sin1` (`STORAGE_DRIVER=blob`) |
| Email | Dev outbox at `/admin/system/dev-outbox` (`EMAIL_TRANSPORT=dev`) | Dev outbox, or SMTP with a test address | SMTP (`EMAIL_TRANSPORT=smtp`) |
| Background tasks | `npm run worker` in a second terminal (optional) | The tick endpoint, called by hand when needed | Vercel daily cron + GitHub Actions every 5 minutes (§4) |

Local, staging and production must never share a database, a Blob store or a secret. The E2E seed
(`npm run db:seed:e2e`) refuses to run against anything but `127.0.0.1` / `localhost`.

**Local database commands:** `npm run db:start`, `npm run db:stop`, `npm run db:status`,
`npm run db:reset` (stops, deletes `.data/postgres`, re-creates — destroys local data). Settings come from
`.env.local` (`LOCAL_PG_PORT`, `LOCAL_PG_PASSWORD`, `LOCAL_PG_DATABASE`, `LOCAL_PG_DATA_DIR`). The script refuses
to run with `NODE_ENV=production`.

## 2. Environment variables

All variables are read through `src/lib/env.ts` unless marked *direct*. "Required" means the app refuses to start
without it (in production; development has insecure fallbacks for the three security keys).

### Application and security

| Variable | Required | Purpose |
|---|---|---|
| `APP_URL` | production | Public base URL with `https://` and no trailing slash (links in emails, the Google sign-in redirect, sitemap). Default `http://localhost:3000`. |
| `DEFAULT_TIMEZONE` | no | Default `Asia/Kolkata`. |
| `NODE_ENV` | set by Vercel | `production` on Vercel. |
| `DATABASE_URL` | **yes** | PostgreSQL connection string. On Vercel: the Neon **pooled** URL (host contains `-pooler`). |
| `DATABASE_SSL` | with Neon | *direct* — `true` for Neon and any managed database. |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | no | *direct* — certificate check, default on. Leave unset. |
| `DATABASE_POOL_MAX` | no | *direct* — connections per server process (default 10). Keep small on Vercel (for example 5). |
| `SESSION_SECRET` | **production** | At least 32 characters; signs sessions and tokens. Changing it signs everyone out. |
| `DATA_ENCRYPTION_KEY` | **production** | 32-byte base64 key that encrypts passport numbers and two-factor secrets. **Losing it makes those fields unreadable forever** — keep a copy in a password manager. |
| `IP_HASH_SALT` | **production** | At least 16 characters; pseudonymises IP addresses in logs and analytics. |
| `CRON_SECRET` | for background tasks | Bearer token for `/api/v1/cron/tick`. Without it the endpoint answers 503 and no background work runs. Same value in Vercel and in the GitHub repository secret. |

Generate each secret with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` —
a different value per environment.

### Sign-in and messaging

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google sign-in | OAuth client from Google Cloud (§6). Both set = Google sign-in is available (plus the flag `auth.google`). |
| `EMAIL_TRANSPORT` | no | `dev` (default: messages go to the dev outbox, nothing is sent) or `smtp`. |
| `EMAIL_FROM` | with smtp | Sender shown to recipients, e.g. `Venkat Sai Global <hrvsweld@gmail.com>`. Must be an address the SMTP account may send from. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | with smtp | Mail server login (§5). Port 587 with `SMTP_SECURE=false` (STARTTLS) or 465 with `SMTP_SECURE=true`. |
| `SMS_PROVIDER` | no | `dev` (default), `msg91` or `twilio`. SMS is off by flag until a provider and DLT templates exist. |
| `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_TEMPLATE_ID` | with msg91 | MSG91 credentials (Indian SMS needs TRAI DLT registration of entity, header and every template). |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | with twilio | Twilio credentials. |
| `WHATSAPP_PROVIDER` | no | `dev` (default) or `meta`. **Not used yet** — WhatsApp is manual (§5). |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` | with meta | WhatsApp Cloud API credentials (future). |
| `WHATSAPP_GRAPH_API_VERSION` | no | *direct* — Graph API version, default `v23.0`. |

### File storage and scanning

| Variable | Required | Purpose |
|---|---|---|
| `STORAGE_DRIVER` | **production** | `local` (default, development only), `blob` (Vercel Blob — use this on Vercel) or `s3`. |
| `BLOB_READ_WRITE_TOKEN` | with blob | Set automatically by Vercel when the Blob store is connected to the project. The store must be **private**. |
| `STORAGE_LOCAL_DIR` | no | Local driver folder, default `./storage`. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | with s3 | Any S3-compatible private bucket (AWS S3, Cloudflare R2, MinIO). |
| `STORAGE_S3_PRESIGNED_DOWNLOADS` | no | *direct* — `true` sends downloads to short-lived presigned S3 URLs after the access check. |
| `STORAGE_PUBLIC_HOST` | no | Only for `next/image` remote patterns; files are always served through `/media/…` and `/api/v1/files/…`. |
| `CLAMAV_HOST`, `CLAMAV_PORT` | no | ClamAV daemon for malware scanning of uploads (not available on Vercel; uploads are marked "not scanned" without it). |

Each stored file remembers which driver wrote it, so switching drivers keeps old files readable while both
remain configured.

### Payments

| Variable | Required | Purpose |
|---|---|---|
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | for online payment | Razorpay API keys (§7). Both set = Razorpay checkout can be switched on by flag. |
| `RAZORPAY_WEBHOOK_SECRET` | with Razorpay | *direct* — secret chosen when creating the webhook; verifies `POST /api/v1/webhooks/razorpay`. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | no | Stripe (international cards), optional. Webhook `POST /api/v1/webhooks/stripe`. |

Offline payments (bank transfer, UPI, cheque, cash recorded by staff) always work without any of these.

### Scripts only

| Variable | Used by | Purpose |
|---|---|---|
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | `npm run db:seed` | First Super Admin, created only while no Super Admin exists. Remove the password from the environment afterwards. |
| `SEED_ONLY_REFERENCE` | `npm run db:seed` | `1` = reference data and roles only, skip module seeds. |
| `CONTENT_REFRESH_EMAIL` | `npm run content:refresh` | Which Super Admin the refresh is recorded as (defaults to `SEED_ADMIN_EMAIL`, then the first Super Admin). |
| `MIGRATIONS_DIR` | `npm run db:migrate` | Override `./drizzle` (CI checks only). |
| `WORKER_CONCURRENCY`, `WORKER_SHUTDOWN_TIMEOUT_MS` | `npm run worker` | Parallel tasks (default 4) and graceful stop limit (default 30 s). |
| `LOCAL_PG_*` | `scripts/db-local.mjs` | Local PostgreSQL port, password, database name, data folder. |
| `E2E_BASE_URL`, `E2E_ENV_FILE`, `E2E_DISABLE_RATE_LIMITS`, `PLAYWRIGHT_BROWSERS_PATH`, `VSG_TEST_STORAGE_DIR` | tests | See `TESTING.md`. `E2E_DISABLE_RATE_LIMITS` is ignored in production and on Vercel. |

There are no `NEXT_PUBLIC_*` variables; nothing in the browser reads the environment.

## 3. Deploying

### 3.1 Code: push to `main`

1. Vercel builds every push. `main` becomes production; other branches become preview deployments with the
   Preview environment variables.
2. The Vercel project holds the variables of §2 per environment (Settings → Environment Variables). Changing
   a variable needs a redeploy (Deployments → ⋯ → Redeploy) to take effect.
3. After a production deploy, open `https://<domain>/api/v1/health` (expect `{"status":"ok",…}`) and sign in
   to `/admin/system`.

### 3.2 Database migrations: run by hand, before the code that needs them

Migrations are **not** run by the deploy. An engineer runs them from a trusted machine (their own computer,
with the repository checked out at the commit being deployed):

```bash
# Neon → project → Connection details → untick "Pooled connection" → copy the UNPOOLED URL (host without -pooler)
DATABASE_URL='<unpooled Neon URL>' DATABASE_SSL=true npm run db:migrate
```

PowerShell: `$env:DATABASE_URL='<unpooled Neon URL>'; $env:DATABASE_SSL='true'; npm run db:migrate`, then
`Remove-Item env:DATABASE_URL`.

- Use the **unpooled** URL: the migrator holds a lock and runs DDL in a transaction, which the pooled
  (PgBouncer) endpoint does not support reliably. The app itself uses the pooled URL.
- The script creates the extensions `pg_trgm`, `citext`, `unaccent`, applies the SQL files in `./drizzle` that
  have not been applied yet (tracked in `drizzle.__drizzle_migrations`) and is safe to run twice.
- Order: migrate first, then push. Migrations are additive (new tables and columns), so the running old code
  keeps working between the two steps.
- After a migration that adds reference data or roles, also run the idempotent seed against the same URL:
  `DATABASE_URL='<unpooled Neon URL>' DATABASE_SSL=true npm run db:seed` (no `SEED_ADMIN_*` needed once a
  Super Admin exists). It only inserts what is missing and never overwrites what staff edited.
- Never run `npm run db:push` or `npm run db:reset` against Neon.

### 3.3 Website copy: `npm run content:refresh`

The seed is insert-only, so improved default website text never reaches an existing database by itself.
`DATABASE_URL='<unpooled Neon URL>' DATABASE_SSL=true npm run content:refresh` updates the seeded CMS entries
(site settings, homepage, navigation, About, every service including the training course families):

- a **missing** entry is created (and published if the seed publishes it);
- an entry **still at the seeded text** gets a new version with the current seed text, published;
- an entry already identical is left alone;
- **anything staff edited, re-published, scheduled, unpublished or binned is skipped and reported** — staff work
  always wins. It never deletes, never touches media, news, FAQs, legal pages or any other collection, and
  records every change in the audit log as the Super Admin named by `CONTENT_REFRESH_EMAIL` /
  `SEED_ADMIN_EMAIL`.

Read the printed summary (`inserted / updated / up to date / skipped / failed`); a non-zero exit means a
failure to look at.

## 4. Background tasks

Work that does not happen inside a page request — sending notifications, scanning files, publishing scheduled
content, reminders, SLA checks, retention — is queued in the `background_jobs` table and run by a task
processor. Recurring tasks are listed in `src/server/tasks/schedule.ts`:

| Task | Every | What it does |
|---|---|---|
| `content.publish_scheduled` | 5 min | Publish/expire scheduled website entries and announcements |
| `recruitment.interview_reminders` | 15 min | Interview reminders |
| `operations.reminders` | 30 min | Remind staff of due tasks and lead follow-ups |
| `identity.cleanup`, `jobs.close_expired`, `recruitment.expire_offers`, `recruitment.expire_unlocks`, `analytics.aggregate`, `support.sla_watch` | 1 h | Session cleanup, close jobs past deadline, expire offers and employer unlocks, roll up analytics, flag tickets breaching SLA and escalate grievances |
| `system.cleanup`, `jobs.alerts_digest`, `recruitment.expire_attributions`, `commercial.renewals`, `analytics.retention`, `privacy.sla_watch`, `organizations.verification_expiry`, `training.batch_reminders` | daily | Housekeeping, job-alert digests, partner attribution expiry, subscription renewals and invoices, analytics retention, data-request deadline alerts, verification/licence expiry, batch reminders |

Plus one-off tasks queued by the app (`notifications.dispatch`, `files.process`, `privacy.export`, …). A failed
task retries with increasing delay up to 5 attempts (3 for recurring ones), then becomes **dead**.

### 4.1 Who calls the processor in production

The endpoint `GET|POST /api/v1/cron/tick` runs the scheduler, recovers stuck tasks and processes due tasks for
about 45 seconds. It requires `Authorization: Bearer <CRON_SECRET>`. Two callers:

1. **Vercel cron** (`vercel.json`): once a day at 02:30 UTC (08:00 IST). Vercel adds the bearer token itself
   from the `CRON_SECRET` environment variable. The Hobby plan allows only daily schedules, which is why there
   is a second caller.
2. **GitHub Actions scheduler** (`.github/workflows/scheduler.yml`): every 5 minutes, `POST` to
   `${APP_URL}/api/v1/cron/tick`. It needs the **repository secret `CRON_SECRET`** (GitHub → repository →
   Settings → Secrets and variables → Actions → New repository secret) with the same value as on Vercel. Until
   the secret exists the job prints "skipping" and does nothing. The optional repository **variable** `APP_URL`
   overrides the default `https://venkat-sai-global.vercel.app` — set it when the custom domain goes live. It
   can be run by hand from the Actions tab ("Run workflow"). GitHub may delay scheduled runs by a few minutes
   under load; that is normal.

Expect notifications (except one-time codes, which are sent inline) to arrive within about 5 minutes.

### 4.2 Watching and fixing the queue

- `/admin/system` — database check, task counts, configuration warnings.
- `/admin/system/tasks` — the queue by status (`queued`, `running`, `succeeded`, `failed`, `dead`) with the last
  error of each task. **Retry dead tasks** re-queues them with a fresh retry budget (fix the cause first, for
  example a wrong SMTP password); **Run now** on a recurring task enqueues it immediately; tasks can also be
  deleted.
- `/admin/notifications/deliveries` — every email/SMS/in-app delivery with its status.
- GitHub → Actions → "Background task scheduler" — green runs every 5 minutes; a red run shows the HTTP status
  returned by the tick endpoint (401 = wrong secret, 503 = `CRON_SECRET` not set on Vercel, 500 = look at the
  Vercel logs).

On a normal server (VM, container) run `npm run worker` under a supervisor instead; it does the same work
continuously.

## 5. Email and WhatsApp

### 5.1 Email

- **Development / before launch:** `EMAIL_TRANSPORT=dev`. Every message, including sign-in codes, is stored
  in the dev outbox at `/admin/system/dev-outbox` and nothing leaves the server.
- **Production:** `EMAIL_TRANSPORT=smtp` with the `SMTP_*` variables. Works with Gmail / Google Workspace,
  Zoho, Microsoft 365, Amazon SES, Brevo, etc.

**Gmail with an app password (simplest start):**

1. Use the business Google account that will send mail (for example the HR address). In Google Account →
   Security, switch **2-Step Verification** on (app passwords are only offered afterwards).
2. Google Account → Security → **App passwords** (search "App passwords" in the account settings) → name it
   `Venkat Sai Global` → Create. Google shows a 16-character password once; store it in a password manager.
3. On Vercel set: `EMAIL_TRANSPORT=smtp`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`,
   `SMTP_USER=<the Gmail address>`, `SMTP_PASSWORD=<the app password>`,
   `EMAIL_FROM="Venkat Sai Global <the same Gmail address>"`. Redeploy.
4. Sign in, open `/admin/settings/integrations`, check that E-mail shows **Configured** and use **Send a test
   e-mail** (it goes to your own verified address).
5. Gmail limits sending (roughly 500 messages a day on a free account, 2,000 on Google Workspace). If the
   platform grows past that, move to a transactional provider (Amazon SES, Brevo, Zoho ZeptoMail) — only the
   `SMTP_*` values change.

**Own domain (recommended once a domain exists):** send as `no-reply@<domain>` from Google Workspace or a
transactional provider and publish **SPF**, **DKIM** and **DMARC** DNS records for that domain, otherwise
Gmail and Outlook will put the platform's mail in spam. Each provider shows the exact records to add.

The setting `notifications.business_inbox_email` (`/admin/settings`, default `vsweld@gmail.com`) receives a
copy of every new CV, contact enquiry and workforce requirement; blank switches it off.

### 5.2 WhatsApp

WhatsApp is **manual** today, by design: the Command Centre shows a **WhatsApp** button next to every phone
number (a `wa.me` link with a prefilled message, opened on the staff member's own phone or WhatsApp Web), the
website offers "Join our WhatsApp group" (site settings → Contact → **WhatsApp group link**) and the official
WhatsApp channel (`src/config/contact.ts`). Nothing is sent automatically, so there is nothing to configure.

The WhatsApp Cloud API is prepared in code (`WHATSAPP_PROVIDER=meta`, flag `notifications.whatsapp`) but needs
Meta Business verification, a dedicated number and pre-approved message templates. Keep the flag **off** until
that exists.

## 6. Google sign-in

Lets candidates and employers sign in with a Google account (scope `openid email profile` only; the account is
matched or created by verified email). Steps:

1. Google Cloud Console (`console.cloud.google.com`) → create or pick a project, e.g. "Venkat Sai Global".
2. **APIs & Services → OAuth consent screen**: External; app name "Venkat Sai Global", support email and
   developer contact = the business email; add the website domain under Authorised domains; links to
   `https://<domain>/legal/privacy-policy` and `https://<domain>/legal/terms`. Publish the app
   (otherwise only test users can sign in).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → Web application:
   - Authorised JavaScript origins: `https://<domain>` (and `http://localhost:3000` for a local client).
   - Authorised redirect URIs: **`https://<domain>/auth/google/callback`** (exactly; the app builds it from
     `APP_URL` + `/auth/google/callback`).
4. Copy the Client ID and Client secret into Vercel as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
   Redeploy.
5. The feature flag **`auth.google`** at `/admin/settings/modules` is on by default; the button appears on
   `/sign-in` only when both the flag is on and both variables are set. `/admin/settings/integrations` shows
   "Google sign-in: Configured".

Use a separate OAuth client (with the localhost redirect) for development; never reuse the production secret.

## 7. Payment gateway (Razorpay)

Nothing has to be paid online for the platform to work: staff record bank transfers, UPI and cash at
`/admin/commercial/payments` and on each resume request. Online payment is an upgrade with three switches.

1. **Keys.** Razorpay Dashboard → Account & Settings → API Keys → generate. Start with **test mode** keys
   (`rzp_test_…`). Put them on Vercel as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
2. **Webhook.** Dashboard → Account & Settings → Webhooks → Add: URL `https://<domain>/api/v1/webhooks/razorpay`,
   a secret you generate (store it as `RAZORPAY_WEBHOOK_SECRET`), events `payment.captured`, `order.paid`,
   `payment.failed`, `refund.processed`, `refund.failed`. Forged or unsigned calls are rejected.
3. **Flags** at `/admin/settings/modules`:
   - `commercial.online_payments` — "Pay online" on invoices (employer, partner and institution billing).
   - `services.resume_online_payments` — online payment for the resume service. **Note:** the resume service's
     payment hook (`src/modules/resume-service/payment.ts`) reports "razorpay" mode when this flag, the
     commercial flag and the keys are all set, but the checkout button on the resume confirmation page and
     the signature verification described in that file's steps 3–4 are still to be built. Until then leave
     this flag off; staff keep recording resume payments by hand.
4. **Sandbox test:** with test keys, issue a small test invoice to a test organisation, pay it with Razorpay's
   test card/UPI, confirm the invoice turns **Paid** at `/admin/commercial/invoices` and the webhook event
   appears (webhook log in the Razorpay dashboard; the platform stores each event once). Then switch to live
   keys and repeat with a real ₹1 payment, refunded afterwards.

Payments are recorded in the invoice's currency; refunds go through approval and produce a GST credit note.
Stripe works the same way for international cards (`STRIPE_SECRET_KEY`, webhook `/api/v1/webhooks/stripe`).

## 8. Backups and restore

**Database (Neon).** Neon keeps a history of every change and can restore the database to any moment inside
its retention window (Neon project → Settings → History retention; raise it from the default to the maximum
the plan allows). To recover from a bad change: Neon → Branches → **Restore** the `main` branch to a timestamp
before the incident (Neon keeps the current state as a backup branch), then redeploy if the app needs a
restart. Restoring is a point-in-time copy of the whole database, so note the exact time of the incident
first.

Also take a monthly logical backup from a trusted machine and keep it off-site (encrypted drive or private
cloud folder):

```bash
pg_dump --format=custom --no-owner "<unpooled Neon URL>" > vsg-$(date +%F).dump
# restore into an EMPTY database (never over production): pg_restore --no-owner --dbname "<target URL>" vsg-YYYY-MM-DD.dump
```

**Files (Vercel Blob).** Blob has no automatic versioning. Deleted files are only soft-deleted by the app and
purged 30 days later (`files.purge`), which covers accidental deletion through the Command Centre. For a true
copy, periodically download the store (Vercel → Storage → the store, or a script using the token) to the same
off-site place as the database dump; file rows and objects must be restored together.

**Secrets.** Keep `DATA_ENCRYPTION_KEY`, `SESSION_SECRET`, `IP_HASH_SALT`, `CRON_SECRET`, SMTP, Google and
Razorpay secrets in a password manager shared by the owner and the engineer. A restored database without the
original `DATA_ENCRYPTION_KEY` has unreadable passport numbers and two-factor secrets.

**Test the restore** once before launch and once a quarter: restore the dump into a scratch Neon branch or the
local PostgreSQL and open a few records.

## 9. Monitoring

| Check | Where | Healthy looks like |
|---|---|---|
| Is the site up? | `https://<domain>/api/v1/health` | `200` and `{"status":"ok","checks":{"database":{"status":"ok"}}}`; `503` means the database is unreachable. Point a free uptime monitor (e.g. UptimeRobot, Better Stack) at it, every 5 minutes, alerting the owner by email/WhatsApp. |
| Errors and slow pages | Vercel → project → **Logs** (filter `error`) and **Observability** | No repeating 5xx lines; each log line carries a request id |
| Background work | `/admin/system`, `/admin/system/tasks`; GitHub → Actions | No dead tasks; scheduler runs green every 5 minutes |
| Deliveries | `/admin/notifications/deliveries` | Emails `sent`, not `failed` |
| Security | `/admin/audit/security` | Lock-outs and quarantined files are rare and explainable |
| Database size and compute | Neon console → Monitoring | Within the plan's storage and compute hours |
| Blob usage | Vercel → Storage | Within the plan's size and bandwidth |

## 10. Incident checklist

1. **Confirm** — open `/api/v1/health` and the homepage from a phone on mobile data. Note the time.
2. **Database down** (`503` from health): Neon console → is the project paused/over quota? Check the Neon status
   page. Neon's free/low tiers suspend compute after idling; the first request wakes it (a few seconds).
3. **Site down after a deploy**: Vercel → Deployments → open the previous good deployment → ⋯ → **Promote to
   Production** (instant rollback). Then read the failed build/runtime logs.
4. **Emails not arriving**: `/admin/settings/integrations` (E-mail configured?), `/admin/system/tasks` (dead
   `notifications.*` tasks? read the error), `/admin/notifications/deliveries`. Common causes: app password
   revoked, Gmail daily limit, scheduler secret missing (nothing is processed at all).
5. **Nothing happens in the background** (no reminders, scheduled posts not published): GitHub → Actions →
   is the scheduler running and green? `CRON_SECRET` set in both places?
6. **Uploads failing**: files over 4.5 MB cannot be uploaded on Vercel (§12); check Blob store connection
   (`BLOB_READ_WRITE_TOKEN` present, `STORAGE_DRIVER=blob`).
7. **Suspected account compromise**: `/admin/users/<id>` → revoke all sessions, set the account inactive, reset
   two-factor if needed; rotate the affected secret; check `/admin/audit` and `/admin/audit/data-access` for
   what was viewed.
8. **Wrong data change or deletion**: stop further edits, note the time, restore from Neon history (§8).
9. **Write down** what happened, when, what was done, in the shared notes; if personal data may have leaked,
   the DPDP Act requires notifying the Data Protection Board and affected people — contact counsel the same
   day.

## 11. Security settings to confirm before launch

- `/admin/settings/security`: **Require two-factor authentication for staff** on (`security.require_staff_2fa`;
  default on in production), password minimum length 10+, lock-out after 8 failed sign-ins. Every staff member
  has set up two-factor (`/account/security`); the page lists who has not.
- `/admin/settings/roles`: each staff member has the smallest role that fits (Super Admin, Administrator,
  Operations Manager, Venkat Sai Recruiter, Content Manager, Finance, Support Agent, Compliance & Grievance
  Officer). Super Admin for the owner and one engineer only.
- `/admin/users`: no leftover test or seed accounts with staff access; `SEED_ADMIN_PASSWORD` removed from Vercel.
- `/admin/settings/integrations`: no warning "switched on without a working provider"; SMS and WhatsApp flags off
  until providers exist.
- `/admin/system`: no warnings (`APP_URL` not localhost, files not on local disk, 2FA required).
- `/admin/settings` → Privacy: `privacy.policy_version` / `privacy.terms_version` match the published legal pages;
  grievance timelines (24 h acknowledgement, 7 days resolution) and data request SLA (30 days) confirmed with counsel.
- Site settings (`/admin/content` → Site settings) → Grievance officer filled in.
- Vercel: the custom domain uses HTTPS only (automatic); Production variables set; no secrets in Preview that
  point at production.
- Secrets are unique per environment and stored in a password manager; `.env.local` never leaves the computer.

## 12. Known limits

- **Vercel Hobby** is for non-commercial use and allows only daily cron jobs. A business site should be on
  **Vercel Pro** before launch; until then the GitHub Actions scheduler supplies the 5-minute tick.
- **4.5 MB request limit on Vercel.** Uploads go through the app, so every upload is **one file at a time** and
  at most about 4 MB per file (CV submissions and their documents are capped at 4 MB; phone photos for posters
  are resized in the browser first). The larger per-purpose limits in the files module (10–25 MB for resumes,
  course material, media) only apply on a normal server.
- **Local PostgreSQL 17, Neon PostgreSQL 18.** Migrations are plain SQL that works on both, but always test a
  new migration locally, then on a Neon branch, before production. Do not use features that exist only in 18.
- **Blob and S3 are private stores**; public images are still served through the app (`/media/...`) and cached
  for a year by browsers and CDNs — making a public file private later does not recall copies already served.
- **No SMS/WhatsApp sending** until providers, DLT registration and templates exist; one-time codes by phone
  therefore do not work in production yet (the sign-in flags `auth.phone_otp` can be switched off at
  `/admin/settings/modules` to avoid a dead end).
- **Malware scanning** is not available on Vercel (ClamAV needs a server); uploads are type-checked and
  re-encoded but marked "not scanned".
- **Invoice PDFs** are produced by the browser's print dialog ("Print or save as PDF" on `/billing/invoices/<id>`).
- **Neon compute pauses when idle** on small plans; the first request after a quiet period is slower.
