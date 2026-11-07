# Venkat Sai Global

**The Global Opportunity Network** — *One Platform. Every Opportunity. One Trusted Destination.*

Venkat Sai Global is the technology platform of Venkat Sai Welding Works and Testing Center (Auto Nagar, Visakhapatnam, India). It brings together overseas and domestic recruitment, manpower supply, welding training and testing, internships, skill development and workforce services in one ecosystem.

> **Status:** under active development. Modules land in phases; see the roadmap below.

## What's in the platform

| Experience | Route | For |
|---|---|---|
| Public website | `/` | Visitors, employers, candidates, partners (CMS-managed) |
| People Portal | `/talent` | Students, jobseekers, skilled workers, professionals (English, Hindi, Telugu) |
| Employer Portal | `/employer` | Companies, HR teams, contractors, international employers |
| Recruitment Partner Portal | `/recruiter` | Verified recruitment agencies and sourcing partners |
| Institution & Training Portal | `/institution` | Colleges, ITIs, training centres, assessment providers |
| Command Centre | `/admin` | The Venkat Sai team: operations, approvals, CMS, analytics, billing, settings |

Core principles: candidates never pay to discover or apply for jobs; no fabricated statistics, testimonials or logos; privacy by default (masked contact details, consent ledger, data-subject requests); every action authorised and audited.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **PostgreSQL 17** with **Drizzle ORM**
- **Tailwind CSS 4** and **shadcn/ui** (Radix primitives), WCAG 2.2 AA target
- Custom authentication: argon2id passwords, database sessions, email/SMS one-time codes, TOTP two-factor, optional Google sign-in
- PostgreSQL-backed background task queue (worker process or cron endpoint)
- Pluggable storage (local disk or S3-compatible), email (SMTP), SMS (MSG91 / Twilio), WhatsApp Cloud API, Razorpay / Stripe — all optional and configured by environment variables

## Getting started (local development)

Requirements: Node.js 20.9+ (24 recommended). No database install is needed: PostgreSQL binaries ship as a dev dependency.

```bash
npm install
cp .env.example .env.local      # then fill SESSION_SECRET, DATA_ENCRYPTION_KEY, IP_HASH_SALT, SEED_ADMIN_*
npm run db:start                # starts a local PostgreSQL on 127.0.0.1:5433 (data in ./.data)
npm run db:migrate              # creates extensions and applies migrations
npm run db:seed                 # reference data, roles, first Super Admin
npm run dev                     # http://localhost:3000
npm run worker                  # background tasks (separate terminal)
```

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

Useful scripts: `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run db:stop`, `npm run db:studio`, `node scripts/test-db.mjs <name>` (isolated test database).

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — system shape, key decisions, security model, deployment
- [Engineering conventions](docs/CONVENTIONS.md) — the contract every module follows
- [Data model](docs/DATA_MODEL.md) — schema layering and domain design

## Deployment

Runs on Vercel + Neon (cron hits `/api/v1/cron/tick`) or any Node host / Azure App Service / VM with PostgreSQL 15+ (`npm run build && npm start` plus `npm run worker`). See [Architecture → Deployment](docs/ARCHITECTURE.md#4-deployment).

## Roadmap

1. Foundation — configuration, core schema, identity, permissions, platform services ✔
2. Domain schemas and services — candidates, jobs, recruitment, organisations, training, operations, billing, notifications, CMS, analytics
3. Portal interfaces — public website, People, Employer, Partner, Institution and Admin portals
4. Quality — end-to-end journeys, security, privacy and accessibility reviews, production hardening

## License

Copyright © 2026 Venkat Sai Welding Works and Testing Center. All rights reserved.
