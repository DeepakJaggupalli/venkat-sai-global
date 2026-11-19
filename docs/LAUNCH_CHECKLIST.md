# Venkat Sai Global — Launch checklist

Everything that must be true before the website goes live for the public. **Owner** = the business owner (or
the person they delegate); **Engineer** = whoever does the technical steps. Do the rows in order within each
block; most Owner rows are decisions or documents, most Engineer rows take minutes once the Owner row is done.
Setup detail is in `OPERATIONS.md` (section numbers below); Command Centre detail in `ADMIN_GUIDE.md`.

Tick the Done column in a copy of this file or in the shared notes, with the date and the name.

## A. Hosting and domain

| # | Item | Owner | Engineer | Where / how | Done |
|---|---|---|---|---|---|
| A1 | Choose and buy the domain (e.g. `venkatsaiglobal.com`); keep the registrar login in the password manager | Buy, decide the name | Advise | Registrar of choice | |
| A2 | Move the Vercel project to **Pro** (Hobby is non-commercial and daily-cron only) and put the billing card on it | Approve cost, card | Upgrade | Vercel → Settings → Plan | |
| A3 | Attach the domain to the Vercel project and add the DNS records it shows (A/CNAME for the root and `www`) | Give registrar access | Do it; confirm HTTPS works | Vercel → Settings → Domains | |
| A4 | Set `APP_URL=https://<domain>` in Production; redeploy; set the GitHub repository variable `APP_URL` to the same | — | Do it | Vercel env; GitHub → Settings → Variables (§2, §4) | |
| A5 | Production environment variables complete: `DATABASE_URL` (pooled), `DATABASE_SSL=true`, `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `IP_HASH_SALT`, `STORAGE_DRIVER=blob` with the Blob store connected | — | Do it; copies in the password manager | Vercel env (§2) | |
| A6 | Neon: history retention raised to the plan maximum; a first `pg_dump` taken and stored off-site; restore tested once | Decide where backups live | Do it | Neon → Settings; §8 | |

## B. Email

| # | Item | Owner | Engineer | Where / how | Done |
|---|---|---|---|---|---|
| B1 | Decide the sending address (business Gmail with an app password now; `no-reply@<domain>` later) | Decide; create the app password | Advise | Google Account → Security → App passwords (§5.1) | |
| B2 | `EMAIL_TRANSPORT=smtp` and `SMTP_*`, `EMAIL_FROM` set in Production; redeploy | Hand over the app password privately | Do it | Vercel env | |
| B3 | Test e-mail arrives at the owner's inbox (not spam) | Check inbox | Send | `/admin/settings/integrations` → Send a test e-mail | |
| B4 | If sending from the custom domain: SPF, DKIM and DMARC records published and verified | Approve | Do it | Registrar DNS; provider shows the records | |
| B5 | Business inbox for CV/enquiry/requirement copies confirmed (`notifications.business_inbox_email`) | Decide the address | Set it | `/admin/settings` → Notifications | |

## C. Background tasks

| # | Item | Owner | Engineer | Where / how | Done |
|---|---|---|---|---|---|
| C1 | `CRON_SECRET` generated and set on Vercel **and** as the GitHub repository secret `CRON_SECRET` | — | Do it | §4 | |
| C2 | Scheduler workflow runs green every 5 minutes; `/admin/system/tasks` shows no dead tasks | — | Check after 15 minutes | GitHub → Actions → Background task scheduler | |

## D. Sign-in and payments

| # | Item | Owner | Engineer | Where / how | Done |
|---|---|---|---|---|---|
| D1 | Google Cloud OAuth client created (consent screen published, redirect `https://<domain>/auth/google/callback`) | Own the Google Cloud project | Create it | §6 | |
| D2 | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` set; "Continue with Google" works on `/sign-in` | — | Do it; test with a personal account | Vercel env; `/admin/settings/integrations` | |
| D3 | Phone OTP sign-in switched **off** until an SMS provider exists (`auth.phone_otp`); SMS and WhatsApp notification flags off | Decide | Set | `/admin/settings/modules` | |
| D4 | Razorpay account activated (KYC) — or decide to launch with offline payments only | Decide; complete KYC | — | Razorpay dashboard (§7) | |
| D5 | If online: test keys + webhook set, sandbox invoice paid and shown **Paid**; then live keys, ₹1 live test refunded | Approve | Do it | §7; `/admin/commercial/invoices` | |
| D6 | Flags `commercial.online_payments` (and later `services.resume_online_payments`, once the resume checkout is built) set as decided | Decide | Set | `/admin/settings/modules` | |
| D7 | Resume service price set (amount + currency, or 0 = price on request) | Decide the price | — | `/admin/resume-requests` → Price | |

## E. Finance and legal

| # | Item | Owner | Engineer | Where / how | Done |
|---|---|---|---|---|---|
| E1 | Seller details: legal name, full address, GST state code 37, **GSTIN** (only if registered), bank/UPI instructions for unpaid invoices | Provide and check | Enter | `/admin/commercial/seller` | |
| E2 | GST rates for services under **SAC 9985** (CGST 9 % + SGST 9 %, IGST 18 %) confirmed with the accountant and marked **Confirmed**; export zero-rating (LUT) decision confirmed | Accountant confirms | Mark confirmed | `/admin/commercial/tax-rates`; `/admin/settings` → Commercial | |
| E3 | Invoice due days, footer note, default currency reviewed | Decide | Set | `/admin/settings` → Commercial | |
| E4 | **Grievance officer** appointed (name, designation, email, phone, address) and published; grievance timelines (24 h acknowledgement, 7 days resolution) and data request deadline (30 days) confirmed by counsel | Appoint; get counsel's confirmation | Enter | Site settings → Grievance officer; `/admin/settings` → Privacy; shown at `/grievance` | |
| E5 | Legal pages reviewed by counsel: privacy policy, terms, cookie policy, data rights, accessibility, grievance redressal, disclaimers; `privacy.policy_version` and `privacy.terms_version` updated to the review date | Send to counsel; approve | Publish; update versions | `/admin/content` → Legal pages; `/admin/settings` → Privacy | |
| E6 | Regulatory notes in `docs/research/regulatory-notes.md` validated by counsel (overseas recruitment, DPDP, IT Rules) | Counsel | — | — | |

## F. Security and staff

| # | Item | Owner | Engineer | Where / how | Done |
|---|---|---|---|---|---|
| F1 | Every staff member has an account with the right role and **two-factor set up**; "Require two-factor authentication for staff" is on | Name the staff and roles | Create accounts; check the 2FA list | `/admin/users`, `/admin/settings/roles`, `/admin/settings/security` | |
| F2 | `SEED_ADMIN_PASSWORD` removed from Vercel; no test accounts (`E2E …`) exist in production (the E2E seed cannot run there — just confirm) | — | Check | Vercel env; `/admin/users` | |
| F3 | `/admin/system` shows no warnings; `/admin/settings/integrations` shows no "switched on without a provider" | — | Check | Command Centre | |
| F4 | Password manager holds every secret, shared between owner and engineer; nobody else has Vercel/Neon/GitHub owner access | Decide who | Set up | — | |

## G. Website content

| # | Item | Owner | Engineer | Where / how | Done |
|---|---|---|---|---|---|
| G1 | Site settings complete: phones, email, WhatsApp number, **WhatsApp group link** (or leave empty to show the channel), address and map, social links, footer | Provide | Enter | `/admin/content` → Site settings | |
| G2 | **Replace stock photos** with the business's own photos and videos (workshop, training, testing, teams, departures) — with recorded consent for every person shown | Provide photos/videos and consents | Upload, alt text, consent records | `/admin/media` | |
| G3 | About page: MSME/Udyam, GST, licence and other registration documents — **pending from the owner**; enter only verified numbers, upload the certificates | Provide the documents | Enter and publish | `/admin/content` → About → Registrations | |
| G4 | Services, training courses, industries, destinations reviewed; unused drafts stay unpublished | Review the text | Publish | `/admin/content` | |
| G5 | **Hindi and Telugu**: People Portal text and public pages reviewed by a native speaker; corrections applied | Arrange reviewers | Apply | Language switcher on the site | |
| G6 | Homepage statistics: only live counters or approved figures with evidence; nothing invented | Decide which to show | Configure | `/admin/public-metrics` | |
| G7 | First requirement posters published from the phone (Android share tested, iPhone path tested) | Post 2–3 real posters | Check they show at `/requirements` | `REQUIREMENT_POSTERS.md` | |
| G8 | Cookie/analytics consent banner reviewed; Clarity/GA4 stay off unless decided (and then only with consent) | Decide | Set | `/admin/analytics/settings`, `/cookie-preferences` | |

## H. Final checks

| # | Item | Owner | Engineer | Where / how | Done |
|---|---|---|---|---|---|
| H1 | **Smoke test on the live domain**: homepage, `/requirements/<slug>`, `/send-cv` (a real CV arrives in `/admin/cv-submissions` and the business inbox), `/resume-service` request, `/contact` enquiry, sign-up with email code, sign-in with Google, a poster from the phone, `/api/v1/health` is `ok` | Do the phone parts | Do the rest; fix anything red | Live site | |
| H2 | Uptime monitor pointed at `https://<domain>/api/v1/health` alerting the owner | Receive alerts | Set up | §9 | |
| H3 | Backup verified again after launch content is in (dump + restore into a scratch branch) | — | Do it | §8 | |
| H4 | Staff walked through `ADMIN_GUIDE.md` §1–§3 (posters, CVs, resume requests) and §16 (never do) | Run the session | Support | — | |
| H5 | Old website/links (Google Business profile, WhatsApp channel description, social bios) point to the new domain | Update | — | — | |
