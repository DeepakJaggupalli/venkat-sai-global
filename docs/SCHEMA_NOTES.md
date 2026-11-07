# Venkat Sai Global — Schema notes

Companion to `docs/DATA_MODEL.md` (the brief) and the code in `src/db/schema/*.ts` (the source of truth).
This file records what was actually built, how the domains connect, the state machines, the constraints
services should rely on, and every deliberate deviation from the brief. Written during schema integration
(November 2026); keep it current when you change a schema file.

## 1. Status

| Check | Result |
|---|---|
| `npx tsc --noEmit` (whole project) | 0 errors |
| Layering (a file imports only earlier layers + `_shared` / `_constants`) | no violations |
| Duplicate export names across schema files (`export *` in the barrel) | none |
| Spine exports (DATA_MODEL §3) | all present |
| Identifier length (≤ 63 bytes; longer names are silently truncated) | all within limit |
| Index / constraint relation names (global per schema) | all unique |
| Every FK column indexed | yes, schema-wide (foundation gaps closed in migration 0001, §8) |
| `node scripts/test-db.mjs vsg_schema_integration` (fresh `drizzle-kit push`) | succeeds |
| `npm run db:migrate` (0000 + 0001) on a blank database, then `drizzle-kit push --force` twice | "No changes detected" both times — migrations and schema are in sync and push is idempotent |
| `npm run db:seed` twice on an isolated database | idempotent (reference data, roles, Super Admin, module seeds) |

Database objects created by the full schema (PostgreSQL 17): **145 tables, 440 foreign keys, 256 CHECK
constraints, 33 unique constraints, 774 indexes** (including primary-key and unique-constraint indexes) and
7 generated `tsvector` columns.

| Layer | File | Tables | Columns |
|---|---|---|---|
| 1 | taxonomy.ts | 9 | 77 |
| 2 | core.ts | 3 | 74 |
| 3 | identity.ts | 7 | 64 |
| 4 | organizations.ts | 4 | 52 |
| 5 | system.ts | 13 | 130 |
| 6 | employers.ts | 3 | 55 |
| 7 | partners.ts | 4 | 68 |
| 8 | candidates.ts | 10 | 191 |
| 9 | operations.ts | 11 | 220 |
| 10 | jobs.ts | 7 | 117 |
| 11 | training.ts | 17 | 315 |
| 12 | recruitment.ts | 20 | 331 |
| 13 | commercial.ts | 17 | 284 |
| 14 | notifications.ts | 4 | 56 |
| 15 | content.ts | 8 | 149 |
| 16 | analytics.ts | 8 | 82 |
| | **total** | **145** | |

There are no SQL migrations yet (`drizzle/` does not exist). The first `npm run db:generate` captures this
schema; `npm run db:push` is for local and test databases only.

## 2. Rules every schema file follows (beyond DATA_MODEL §2)

These come from making `drizzle-kit push` idempotent with drizzle-kit 0.31 and from the integration review.
Follow them when you add tables, or the next push will re-create objects on every run.

1. **Empty-array defaults are insert-time defaults.** Array columns that default to empty use
   `.notNull().$defaultFn(() => [])` — Drizzle fills `[]` when an insert omits the column. There is no database
   default: drizzle-kit 0.31 reads an empty-array default back as `'{""}'` and would re-issue
   `ALTER COLUMN … SET DEFAULT` on every push. Consequence: **raw SQL inserts must supply these columns**
   (they fail with `23502 not_null_violation` otherwise). Do not use `emptyTextArray` from `_shared.ts` for new
   columns. Non-empty array defaults are written as JS arrays (`.default(["email", "in_app"])`), which round-trip.
2. **No `unique(...).nullsNotDistinct()`.** drizzle-kit 0.31 introspects every unique constraint as NULLS
   DISTINCT, so such constraints are dropped and re-added on every push. Where a nullable column must count as
   one value, use a unique **expression index** with `coalesce(col, sentinel)` (`''` for text,
   `'00000000-0000-0000-0000-000000000000'::uuid` for uuid). The index keeps the constraint-style `_uq` name, so
   unique violations still report it (`error.constraint`).
3. **Expression indexes are all-SQL.** drizzle-kit marks every column of an index that contains an expression as
   an expression, so write plain columns of such an index as `sql\`${t.col}\`` too. PostgreSQL still stores them as
   plain key columns (the leading column of such an index serves an FK on that column).
4. **Operator classes via `.op()`**: `index("x").using("gin", t.name.op("gin_trgm_ops"))`, never
   `sql\`${t.name} gin_trgm_ops\`` (seen as an expression → re-created on every push).
5. **Column order of composite keys.** drizzle-kit's FK introspection returns composite-FK columns either in
   table column (attnum) order or in alphabetical order, depending on the catalog query plan (observed:
   alphabetical right after the tables are created, attnum once statistics exist). A composite FK is stable only when its column
   lists follow **both** orders on **both** tables. That is why `applications.currentStageId` is declared before
   `workflowId` (→ `workflow_stages (id, workflow_id)`), and why `currency` is declared before the id columns in
   invoices, invoice_lines, payments, coupon_redemptions, refunds, partner_settlements and partner_settlement_lines
   (FKs reference `(currency, id)`). Unique constraints and composite primary keys are read back in table column
   order: declare their columns in that order (`invoices_currency_id_uq` on `(currency, id)`).
6. **Name an FK explicitly** (`foreignKey({ name: "<table>_<what>_fk", … })`) when the generated name
   `<table>_<cols>_<target>_<cols>_fk` would exceed 63 bytes.
7. **Money**: `*Minor` bigint + an ISO-4217 currency column that references `currencies.code` (and is indexed,
   like every FK). Ranges keep min ≤ max by CHECK; amount and currency come together by CHECK.
8. **Codes**: every human code column has a unique index (`<table>_code_uq`).
9. **Search**: generated `tsvector` columns use only IMMUTABLE expressions — `setweight(to_tsvector('simple'::regconfig,
   coalesce(col, '')), 'A') || …` over text columns. Arrays and joined names are denormalised into text columns
   the owning service maintains (`skillsText`, `categoryNameCache`, `preferredRolesText`, `searchText`).

### Upserts against the coalesce unique indexes

PostgreSQL cannot infer an expression index from a column list, so `onConflictDoNothing({ target: [cols] })` /
`onConflictDoUpdate({ target })` do **not** work for: `job_locations_place_uq`, `candidate_preferred_locations_place_uq`,
`partner_territories_org_area_uq`, `application_workflows_org_key_uq`, `tax_rates_definition_uq`,
`media_folders_parent_name_uq`, `partner_assignments_open_uq`, `application_workflows_default_uq`,
`duplicate_flags_pair_uq`. Use `onConflictDoNothing()` without a target (any unique violation), or
select-then-insert/update inside a transaction, or replace child lists (delete + insert) in one transaction.

## 3. Spine and cross-domain relationships

```
users ─1:1─ candidate_profiles ──< applications >── jobs >── organizations (nullable: Venkat Sai-managed)
  │               │                    │   │            └── requirement_requests >── organizations / leads
  │               │                    │   └── workflow (application_workflows) + current stage (workflow_stages, composite FK)
  │               │                    ├──< interviews ──< interview_participants / interview_feedback
  │               │                    ├──< offers ── placements (1 per application) ── mobilisation_records ──< checklist items
  │               │                    └──< application_stage_history / answers / notes
  │               ├──< enrolments >── batches >── courses (org nullable = Venkat Sai course)
  │               ├──< skill_assessments >── assessment_centres ;  certificates >── course / batch / enrolment / skill_assessment
  │               └──< partner_submissions >── partner_assignments >── requirement_requests | jobs ;  candidate_attributions
organizations ─1:1─ company_profiles | partner_profiles | institution_profiles | billing_profiles
organizations ──< subscriptions >── plans ;  credit_ledger ;  invoices ──< invoice_lines / payments ──< refunds
```

Soft references (uuid without FK, because the target is in a later layer or polymorphic) — services validate them:

| Column | Points at | Why soft |
|---|---|---|
| `candidate_credentials.certificateId` (unique) | `certificates.id` | later layer (training) |
| `candidate_skills.skillAssessmentId` (indexed) | `skill_assessments.id` | later layer |
| `requirement_lines.jobId` (indexed) | `jobs.id` | later layer |
| `jobs.workflowId` | `application_workflows.id` | later layer (null = org default, else platform default) |
| `job_promotions.referenceId` | subscription / credit_ledger / invoice | later layer |
| `skill_assessments.applicationId`, `campus_drive_registrations.applicationId` (indexed) | `applications.id` | later layer |
| `placement_outcomes.placementId` (partial unique) | `placements.id` | later layer |
| `profile_unlocks.creditLedgerId` | `credit_ledger.id` | later layer |
| `placements.invoiceId` | `invoices.id` | later layer |
| `organization_members.branchId` | `company_branches.id` | later layer |
| `*Ids` arrays (`preferredCategoryIds`, `blockedOrganizationIds`, `mediaFileIds`, `attachmentFileIds`, `jobIds`, `skillIds`, `planIds`, …) | various | arrays cannot carry FKs |
| `internal_notes.entityId`, `media_usages.entityId`, `support_tickets.relatedId`, `tasks.relatedId`, `message_threads.contextId` | any entity | polymorphic |

## 4. Domains

Format per domain: tables (one line each) · key relationships · state machines · notable constraints ·
deviations from DATA_MODEL and why. "Business record" = deletion of the parent is blocked (`restrict`) instead of
silently cascading.

### 4.1 Foundation (layers 1–5, owned by the foundation team)

- **taxonomy**: currencies, countries, states, languages, industries, job_categories, skills (trigram index on
  name), education_levels, qualification_types.
- **core**: users (every person), organizations (`type` employer | recruitment_partner | institution; soft delete),
  files (all binaries; storage driver + scan status).
- **identity**: sessions, oauth_accounts, verification_tokens, user_two_factor, roles (`roles_scope_key_org_uq`:
  unique expression index over scope, key, coalesce(organization_id, nil uuid)), user_roles, consent_records
  (append-only ledger).
- **organizations**: organization_members, organization_invitations, organization_verifications, organization_documents.
- **system**: file_access_grants, background_jobs, code_sequences, platform_settings, feature_flags,
  rate_limit_buckets, audit_logs, security_events, data_access_logs, data_requests, approval_requests
  (`approval_requests_open_uq`: one open request per type + entity), approval_events, dev_outbox.

### 4.2 employers.ts (layer 6) — 3 tables

| Table | Purpose |
|---|---|
| company_profiles | Employer-specific public profile, 1:1 `organizations` (PK = organizationId, cascade). Self-declared; shown only while the org is public and verified. |
| company_branches | Offices, plants, project sites and camps (job locations, interview venues, member assignment). Deactivate with `isActive`. |
| employer_contracts | Commercial agreements with Venkat Sai (subscription, managed recruitment, RPO, bulk supply, enterprise, testing, training). Business record. |

- Relationships: all three hang off `organizations`; `company_profiles.defaultCurrency` → currencies;
  `employer_contracts.accountManagerUserId` → users (staff).
- State machine: `employer_contracts.status` draft → active → expired | terminated (`terminatedAt` required).
- Constraints: `company_branches_org_name_uq`, `company_branches_org_hq_uq` (one headquarters),
  `employer_contracts_start_required_chk` (non-draft needs `startsOn`), `employer_contracts_dates_chk`.
- Deviations: `headquartersCountry` → `headquartersCountryCode` (FK); added `publicContactPhone`, typed
  `socialLinks`; branches gained address, timezone, `isActive`; contract types add `testing_services` and
  `training_services` (the business also sells welding tests and training); contract `terms` is a typed JSON
  (fees in minor units + currency, SLA).

### 4.3 partners.ts (layer 7) — 4 tables

| Table | Purpose |
|---|---|
| partner_profiles | Recruitment-partner profile, 1:1 `organizations`. Self-declared claims are internal; `qualityScore` is computed from outcomes. |
| partner_licences | Licences / registrations (India Recruiting Agent under the Emigration Act 1983, foreign licences, …) with Venkat Sai verification. Soft delete. |
| partner_agreements | Versioned, immutable agreement snapshots (SHA-256) + acceptance evidence. Business record. |
| partner_territories | Sourcing / placement territories; `isAuthorised` set by staff. |

- State machines: licence `verificationStatus` pending → verified | rejected → expired (task);
  agreement `status` pending → active → superseded | expired | terminated.
- Constraints: `partner_licences_org_number_uq` (one live record per licence), `partner_licences_verified_chk`
  (verified needs file + `verifiedAt`), `partner_licences_india_ra_country_chk` / `_foreign_country_chk`,
  `partner_agreements_one_active_uq`, `partner_agreements_active_accepted_chk`,
  `partner_territories_org_area_uq` (coalesce index: one whole-country row per partner and country).
- Deviations: country columns named `*CountryCode` (FK); licence types add `travel_agency_licence`; agreements add
  `termsSha256`, issuer, typed acceptance name and supersession chain; status adds `expired`; territories add
  staff authorisation. Partner fees are paid by Venkat Sai (no candidate charges).

### 4.4 candidates.ts (layer 8) — 10 tables

| Table | Purpose |
|---|---|
| candidate_profiles | One profile per person (1:1 users, cascade). Career data, preferences, overseas readiness, discovery settings, search vector. |
| candidate_education | Education history with per-row staff verification. |
| candidate_experience | Work history; reference contacts are private (staff only, logged). |
| candidate_credentials | Certificates / licences / qualifications; Venkat Sai credentials must link a platform certificate. Soft delete. |
| candidate_skills | Skills from the taxonomy; `verified` only via assessment or credential. |
| candidate_languages | Working languages and proficiency. |
| candidate_documents | Identity, education, experience, medical, travel documents (private files; numbers encrypted + last 4). Soft delete. |
| candidate_portfolio_items | Work samples; videos limited to YouTube / Vimeo https URLs. Soft delete. |
| candidate_privacy_settings | Candidate-controlled disclosure (PK = candidateId); protective defaults. |
| candidate_preferred_locations | Preferred work locations in priority order. |

- Relationships: children cascade from `candidate_profiles`; `sourcedByPartnerOrgId` → organizations (set null);
  profiles referenced by applications, submissions, enrolments, assessments or certificates cannot be hard-deleted —
  erasure anonymises (privacy module).
- State machines: item `verificationStatus` unverified → pending → verified | rejected; profile
  `verificationLevel` none → basic → documents_verified → skills_assessed (staff / services only);
  `visibility` public_to_employers | verified_employers | venkat_sai_only (default) | hidden.
- Constraints: `candidate_profiles_user_uq`, `candidate_profiles_expected_salary_chk`,
  `candidate_credentials_issuer_chk`, `candidate_credentials_certificate_uq`, `candidate_skills_verified_chk`,
  `candidate_skills_candidate_skill_uq`, `candidate_languages_candidate_language_uq`,
  `candidate_portfolio_items_video_url_chk`, `candidate_preferred_locations_place_uq` (coalesce index).
- Privacy: gender, date of birth, legal name and nationality are never indexed or in the search vector; the
  passport number is encrypted with a keyed blind index (`passportNumberHash`) for duplicate detection only.
  Search vector: headline + current title (A), roles + skills (B), city + region (C).
- Services maintain: `skillNamesCache`, `skillsText`, `preferredRolesText`, `profileCompleteness`,
  `passportNumberHash = hmacToken(normalised, "passport")`, `*Encrypted` + `*Last4`.
- Deviations: added `legalName`, `currentEmployerName`, `genderSelfDescription`, `emigrationCheckStatus`
  (ECR / ECNR / not_applicable — India eMigrate), `passportNumberHash`, `createdByUserId`, denormalised search
  text columns; `sourcedByPartnerOrgId` is a real FK (organizations is an earlier layer); visibility defaults to
  `venkat_sai_only` (privacy by default); `expectedSalaryCurrency` references currencies (integration).

### 4.5 operations.ts (layer 9) — 11 tables

| Table | Purpose |
|---|---|
| leads | CRM pipeline for prospective employers, partners, institutions, candidates (code LEAD). Trigram search on name / organisation. |
| requirement_requests | Workforce / bulk manpower requirement header (code REQ); public submissions have no organisation. Search vector. |
| requirement_lines | One trade / role per requirement (positions, experience, salary range + currency + period). |
| support_tickets | Helpdesk incl. formal grievances (code TKT, grievance code GRV), SLA timestamps. Search vector. |
| ticket_messages | Append-only ticket conversation; `isInternal` = staff-only note. |
| enquiries | Public contact-form submissions (code ENQ) → leads or tickets. |
| tasks | Internal staff to-dos linked to any entity. |
| internal_notes | Staff-only or organisation-internal notes on any entity. Soft delete. |
| message_threads | Staff ↔ organisation / candidate conversations with a context. |
| message_thread_participants | Who can read / post; read position (PK thread + user). |
| messages | Append-only thread messages; moderation hides via `deletedAt`. |

- State machines: lead new → contacted → qualified → proposal → won | lost (nurturing aside);
  requirement draft → submitted → under_review → approved → sourcing → in_progress → partially_filled → filled →
  closed (on_hold, cancelled); ticket open → pending_staff ⇄ pending_requester → on_hold → resolved → closed;
  enquiry new → in_progress → responded → closed (spam); task todo → in_progress → done | cancelled;
  thread open → closed.
- Constraints: `requirement_requests_submitted_chk` (non-draft needs `submittedAt`), `_quote_chk` (amount ⇔
  currency), `requirement_lines_salary_chk`, `support_tickets_grievance_chk` (grievance ⇔ grievance type; GRV code
  only on grievances), `support_tickets_grievance_code_uq`, `ticket_messages_internal_chk` (requesters cannot post
  internal notes), `enquiries_contact_chk` (email or phone), `internal_notes_scope_chk`.
- Deviations: requirement status adds `draft` (Employer Portal drafts); requirement `source`, contact consent and
  privacy-notice version, attachments and approval link added; tickets add channel, tags, locale, grievance type
  and register code, SLA breach / escalation stamps, data-request link; tasks add organisation scope.

### 4.6 jobs.ts (layer 10) — 7 tables

| Table | Purpose |
|---|---|
| jobs | Job postings (code JOB, unique slug); `organizationId` null = Venkat Sai-managed confidential job. Search vector + trigram on title. Soft delete. |
| job_skills | Skills a job asks for (PK job + skill). |
| job_locations | Extra locations with openings for multi-location postings. |
| job_screening_questions | Application-time questions; knockout rules only flag, never auto-reject. |
| saved_jobs | Bookmarks (PK user + job). |
| job_alerts | Saved searches sending daily / weekly digests. |
| job_promotions | Featured / boosted / homepage windows paid by subscription, purchase or admin grant. |

- Relationships: jobs → organizations (restrict), requirement_requests (set null), job_categories, industries,
  education_levels, currencies; children cascade from jobs.
- State machine: draft → pending_approval → published ⇄ paused → closed → archived; pending_approval →
  changes_requested | rejected. `closedReason` filled | cancelled | expired | duplicate | other.
- Constraints: `jobs_owner_chk` (no organisation ⇒ Venkat Sai-managed), `jobs_salary_range_chk`,
  `jobs_salary_currency_chk`, `jobs_experience_range_chk`, `jobs_external_apply_chk`,
  `job_screening_questions_options_chk`, `job_locations_place_uq` (coalesce index), `job_promotions_window_chk`.
- Fairness: no age, gender, religion, caste or marital-status columns by design; the search vector contains no
  employer name (confidential jobs).
- Services maintain: `skillsText`, `categoryNameCache`, `isOverseas`, `viewCount`, `applicationCount`,
  `verifiedEmployer` (snapshot at publication).
- Recruiting agent (CONVENTIONS §15.2, overseas job ads must show the recruiting agent's licence):
  `recruitingAgentLicenceId` (FK partner_licences, set null), `recruitingAgentName`,
  `recruitingAgentCertificateNumber`, `recruitingAgentCertificateValidUntil` (date),
  `recruitingAgentVerifiedAt`, `recruitingAgentVerifiedByUserId` (FK users, set null); indexes
  `jobs_recruiting_agent_licence_idx`, `jobs_recruiting_agent_verified_by_idx`; check `jobs_recruiting_agent_chk`
  (verified ⇒ name and certificate number present). Added in migration 0001.
- Deviations: added `isConfidential`, `employerReference`, `moderationNote`, `closedReason`, soft `workflowId`;
  accommodation / food / transport are tri-state (null = not stated); alert `lastRunAt` watermark; promotion
  `cancelledAt`; `salaryCurrency` references currencies (integration).

### 4.7 training.ts (layer 11) — 17 tables

| Table | Purpose |
|---|---|
| institution_profiles | Institution profile, 1:1 organizations; `isAuthorisedCertificateIssuer` set only by staff. |
| courses | Training programmes (code CRS); organisation null = Venkat Sai course; explicit fee type. Search vector. Soft delete. |
| course_modules | Syllabus units. |
| batches | Scheduled runs of a course (code BAT). |
| batch_instructors | Instructors (platform users or external names). |
| enrolments | A candidate's place in a batch (one per candidate + batch); fee snapshot. |
| attendance_sessions / attendance_records | Sessions and per-enrolment attendance. |
| course_assessments / assessment_scores | Tests within a batch and learner scores. |
| assessment_centres | Venkat Sai testing facilities (capabilities are equipment, not accreditation). |
| skill_assessments | Venkat Sai trade / welding / practical tests (code ASM); retests chain to the earlier attempt. |
| certificates | Issued credentials (code CRT) with explicit issuer type and an unguessable public verification code. Never deleted — revoke or replace. |
| campus_drives / campus_drive_registrations | Hiring drives (code DRV) and candidate registrations. |
| internship_programmes | Internships with explicit stipend type. |
| placement_outcomes | Learner employment outcomes; self-reported until verified. |

- Relationships: enrolments, skill_assessments, certificates and placement_outcomes reference candidate_profiles
  with restrict (business records); certificates link course / batch / enrolment / skill_assessment.
- State machines: course draft → pending_approval → published | changes_requested | rejected → archived;
  batch planned → open → full → in_progress → completed (cancelled); enrolment applied → confirmed | waitlisted |
  rejected → in_progress → completed | dropped | cancelled; skill assessment scheduled → completed | no_show |
  cancelled with result pending → pass | fail | retest; certificate active → revoked | expired; campus drive
  planned → open → completed | cancelled; internship draft → open → closed → completed (cancelled).
- Constraints: `courses_fee_chk` (fixed ⇔ amount + currency), `courses_accreditation_body_chk`,
  `certificates_issuer_chk` (venkat_sai ⇒ no issuer org; institution_completion ⇒ issuer org; accredited_external ⇒
  accreditation body), `certificates_active_assessment_uq` / `_active_enrolment_uq` (idempotent issuance),
  `skill_assessments_result_chk` (a result only when completed), `enrolments_batch_candidate_uq`,
  `internship_programmes_stipend_chk`, `placement_outcomes_verified_chk`.
- Honesty rules: Venkat Sai results are never presented as externally accredited; process / position / standard
  are free text that never implies an external certification; public outcome figures use verified rows only.
- Deviations: `skill_assessments.certificateId` from the brief is replaced by `certificates.skillAssessmentId`
  (the authoritative link, avoids two-way soft references); courses use `feeType` + `languageCodes`; status adds
  `changes_requested` / `rejected`; enrolment status adds `rejected`, result adds `not_applicable`; institution kinds
  add `polytechnic`, `other`; batches link requirement requests (training for an employer requirement).

### 4.8 recruitment.ts (layer 12) — 20 tables

| Table | Purpose |
|---|---|
| application_workflows | Configurable pipelines; organisation null = platform workflow, looked up by `key`. |
| workflow_stages | Ordered stages mapped onto fixed categories, with candidate labels (+ Hindi / Telugu translations). |
| applications | Candidate × job (code APP), unique per pair; frozen profile snapshot and consent. |
| application_stage_history | Append-only stage moves with internal and candidate-visible notes. |
| application_answers | Screening answers with a snapshot of the question. |
| application_notes | Internal notes with visibility staff_only / staff_and_employer / staff_and_partner. |
| talent_lists / talent_list_items | Shortlists, saved candidates, projects, talent pools. |
| profile_unlocks | Contact-detail access an organisation obtained (one row per org + candidate). |
| interviews / interview_participants / interview_feedback | Interview rounds and trade tests (code INT), panel, structured feedback. |
| offers | Employment offers (code OFR); at most one open offer per application. |
| placements | Confirmed hires (code PLC), one per application; replacement chain; fee. |
| mobilisation_records / mobilisation_checklist_items | Overseas deployment (code MOB): medical, visa, eMigrate clearance, PDOS, travel; checklist with responsible party. |
| partner_assignments | Requirement / job assigned to a partner with targets and commission terms. |
| partner_submissions | Candidates submitted by partners (code SUB); consent required to accept. |
| candidate_attributions | Which partner owns a candidate for commission (one active per candidate). |
| duplicate_flags | Possible duplicate profiles (one row per unordered pair). |

- Relationships: applications → jobs, candidate_profiles, workflow and current stage (composite FK guarantees the
  stage belongs to the workflow); offers / placements → applications (restrict); mobilisation → placement
  (cascade); submissions → assignment of the same partner (composite FK) → application once accepted.
- State machines: stage categories applied → screening → assessment → interview → decision → offer → pre_joining →
  joined, plus terminal closed / rejected / withdrawn; `applications.status` is derived (joined → hired,
  rejected → rejected, withdrawn → withdrawn, closed → closed, else active); interview scheduled ⇄ rescheduled →
  completed | cancelled | no_show, outcome pending → passed | failed | on_hold, candidate response pending →
  confirmed | declined | reschedule_requested; offer draft → issued → accepted | declined | withdrawn | expired;
  placement pending_joining → mobilising → joined → completed (replacement_required, cancelled); mobilisation
  not_started → documents_pending → medical → visa_processing → emigration_clearance → travel_booked → departed →
  arrived → completed (on_hold, cancelled); assignment active ⇄ paused → completed | revoked; submission submitted →
  under_review → accepted | rejected | duplicate (withdrawn); attribution active → expired | disputed | revoked;
  duplicate flag open → confirmed_duplicate | not_duplicate | merged.
- Constraints: see the catalogue in §5 (`applications_job_candidate_uq`, `applications_current_stage_fk`,
  `offers_application_open_uq`, `placements_application_uq`, `partner_submissions_consent_chk`, …). Note:
  `partner_submissions.consentRecordId` is `ON DELETE SET NULL`, but `partner_submissions_consent_chk` makes a
  consent record referenced by an *accepted* submission undeletable (evidence is kept).
- Privacy: rejection reasons are structured and job-related only (no personal characteristics); medical fields
  hold outcomes, never diagnoses; visa numbers encrypted + last 4.
- Deviations: interviews track `candidateResponse` + `candidateRespondedAt` instead of `candidateConfirmedAt`;
  added `rejectionReasonCode`, `sharedWithEmployerAt`, `consentRecordId`, offer supersession, placement
  replacement chain and partner copy, mobilisation dates / references, checklist responsible party; duplicate
  match fields add `passport_number` (keyed hash); `partner_submissions.consentRecordId` is a real FK (identity is an
  earlier layer); attribution status adds `revoked`; `application_workflows_org_key_uq` is a coalesce index (§2);
  salary / fee currencies reference currencies (integration).

### 4.9 commercial.ts (layer 13) — 17 tables

| Table | Purpose |
|---|---|
| plans / plan_prices / plan_features | Plans per audience (base or add-on), prices per currency + interval, entitlement limits. Nothing seeded. |
| subscriptions | An organisation's plan; at most one live base subscription; price snapshotted. |
| credit_ledger | Append-only entitlement / credit ledger with per-key sequence and idempotency key. |
| billing_profiles | Organisation billing details (1:1), copied into invoices at issue. |
| tax_rates | Tax definitions (GST CGST / SGST / IGST, VAT…) versioned by effective date. |
| invoices / invoice_lines | Invoices and credit notes in their own currency (code VSG-INV-YYYY-…, assigned at issue). |
| coupons / coupon_redemptions | Discount codes and their uses. |
| payments | Gateway and offline payments (code PAY); unique per provider payment id. |
| refunds | Refunds (code RFD) through the approval inbox; credit note link. |
| disputes | Billing disputes and chargebacks. |
| payment_webhook_events | Idempotent inbox of signature-verified gateway webhooks. |
| partner_settlements / partner_settlement_lines | Periodic partner payouts (code STL) with normalised lines. |

- Relationships: invoice lines, payments and coupon redemptions on an invoice are held to the invoice currency by
  composite FKs `(currency, invoice_id) → invoices (currency, id)` (lines also `ON UPDATE CASCADE`, so changing a
  draft's currency moves its lines); refunds to the payment currency; settlement lines to the settlement
  currency. Targets: `invoices_currency_id_uq`, `payments_currency_id_uq`, `partner_settlements_currency_id_uq`.
- State machines: subscription trialing → active ⇄ past_due / paused → cancelled | expired; invoice draft → issued →
  partially_paid → paid → refunded (overdue; void); payment pending → succeeded | failed → partially_refunded →
  refunded; refund requested → approved → processing → completed | failed (rejected); dispute open → under_review →
  resolved | rejected; settlement draft → pending_approval → approved → paid (disputed, cancelled); webhook
  received → processed | failed | ignored.
- Constraints: `subscriptions_live_base_uq`, `credit_ledger_org_key_seq_uq` (concurrent writers collide and retry),
  `credit_ledger_idempotency_uq`, `credit_ledger_delta_chk`, `invoices_totals_chk` (total = subtotal − discount +
  tax), `invoices_issued_chk` (issued ⇒ code + snapshots), `invoices_credit_note_chk`, `invoice_lines_amount_chk`,
  `coupons_redemptions_chk` (never over the cap), `payments_provider_ref_uq`, `payments_refund_status_chk`,
  `payment_webhook_events_provider_event_uq`, `partner_settlements_period_uq`,
  `partner_settlement_lines_placement_fee_uq` (a placement fee is settled once), `tax_rates_definition_uq` (coalesce index).
- Deviations: plans add `kind` (base | add_on), `isDefault`, `contactSalesOnly`; invoices add document type
  (credit notes), tax treatment, buyer / seller snapshots (instead of one `billingSnapshot`), refunded amount;
  invoice lines carry `currency` and frozen tax components; partner settlement `lineItems` JSON became the
  `partner_settlement_lines` table (each placement fee settled at most once, enforced); refunds add `failed`,
  settlements add `cancelled`. `plan_features.entitlementKey` and `credit_ledger.entitlementKey` are typed with
  `EntitlementKey` (type-only import from `src/modules/commercial/entitlements.ts`).

### 4.10 notifications.ts (layer 14) — 4 tables

| Table | Purpose |
|---|---|
| notification_templates | Admin overrides of code templates per event + channel + locale (WhatsApp / DLT template ids). |
| notifications | In-app notification centre entries (relative links only, CHECK). |
| notification_deliveries | One row per recipient × channel with status and skip reason; masked recipient + hash. |
| notification_preferences | Opt-in / opt-out per user, category and channel (PK of the three). |

- State machine: delivery queued → sent → delivered | failed, or skipped (with `skipReason`, CHECK).
- Constraints: `notification_templates_event_channel_locale_uq`, `notifications_user_dedupe_uq`,
  `notification_deliveries_dedupe_uq`, `notifications_link_chk`, `notification_deliveries_skip_chk`.
- Deviations: added organisation scope and dedupe keys, template version tracking, more skip reasons
  (`no_template`, `recipient_inactive`, `duplicate`) and preference `source`. Event keys / categories are typed from
  `src/modules/notifications/events.ts` (type-only import).

### 4.11 content.ts (layer 15) — 8 tables

| Table | Purpose |
|---|---|
| media_folders | Media library folders (sibling names unique, also at top level). |
| media_assets | Uploaded files or YouTube / Vimeo embeds with alt text and consent tracking. Search vector. Soft delete. |
| media_usages | Where each asset is used (for "where used", deletion guard, consent withdrawal). |
| logo_permissions | Evidence that an organisation allowed its logo to be shown, per location. |
| cms_entries | Generic typed CMS entries with drafts, scheduling, versions, consent. Search vector. Soft delete. |
| cms_entry_versions | Immutable snapshot per save (history, preview, rollback). |
| announcements | Banners, tickers and notification-centre posts targeted by portal. |
| public_metrics | Credibility counters: live (computed) or manual with approval snapshot; never invented. |

- State machines: CMS entry draft → scheduled → published → archived (versions: current ≥ published);
  announcement draft → scheduled → published → expired → archived; logo permission pending → approved → expired |
  revoked; media asset active | archived; public metric mode live | manual | hidden.
- Constraints (truthfulness and consent): `media_assets_public_chk` (public ⇒ people assessed, consent not
  outstanding, images have alt text), `media_assets_consent_evidence_chk`, `cms_entries_consent_required_chk`
  (testimonials, case studies, team members publish only with consent), `cms_entries_logo_permission_chk`,
  `logo_permissions_approved_chk`, `public_metrics_display_chk` (a visible manual figure needs evidence and an
  approval snapshot equal to the current value), `announcements_link_chk`, `media_folders_parent_name_uq`
  (coalesce index).
- Deviations: media assets add `embedProvider`, `showsIdentifiablePeople`, consent dates; CMS entries add
  `scheduledVersion`, consent fields, `logoPermissionId`, `searchText`; logo permissions add `relationship`
  (a partner is never shown as a client) and evidence reference; public metrics add approval snapshot, live-value
  cache and display threshold.

### 4.12 analytics.ts (layer 16) — 8 tables

| Table | Purpose |
|---|---|
| analytics_sessions | One visit; random client ids; coarse geography; consent level. |
| analytics_events | Append-only event stream (non-personal props ≤ 4 KB). |
| analytics_heatmap_points | Click positions (not linked to sessions). |
| analytics_scroll_depth | Deepest scroll per session + path. |
| analytics_campaigns | utm_campaign descriptions and manually entered cost (minor units + currency). |
| analytics_funnels | Funnel definitions (2–20 steps). |
| analytics_daily_metrics | Daily roll-ups (PK date + metric + dimension + value), kept after raw data is deleted. |
| analytics_consent_logs | Cookie-consent receipts (random anonymous id). |

- Personal data: none stored directly — ids must match `^[A-Za-z0-9_-]{16,64}$` (cannot hold an email or phone),
  no IP address or user-agent string, paths without query strings, UTM values containing "@" rejected, heatmap
  selectors without attribute values. The only link to a person is `analytics_sessions.userId` (signed-in sessions
  with analytics consent; restricted permission, access logged). Essential-consent sessions carry no visitor or
  user id (CHECK).
- Deviations: events add `source` (client | server); sessions add `locale`, `isNewVisitor`; daily metrics add
  additive `bounces` / `total_duration` and more dimensions; funnels add a seed `key`; consent logs add `method`.

## 5. Constraint catalogue for services

Catch these (`error.code` + `error.constraint`) and turn them into user-facing messages. `23505` unique,
`23503` foreign key, `23514` check, `23502` not null.

| Constraint | Meaning |
|---|---|
| applications_job_candidate_uq | The candidate has already applied to this job (re-open the existing application). |
| applications_current_stage_fk | The stage is not part of the application's workflow. |
| offers_application_open_uq | The application already has an open (draft / issued / accepted) offer. |
| placements_application_uq | The application already has a placement. |
| partner_submissions_assignment_partner_fk | The submitting partner does not own the assignment. |
| partner_submissions_assignment_candidate_uq | The partner already submitted this candidate to this assignment. |
| partner_submissions_consent_chk | A submission cannot be accepted without a consent record. |
| partner_assignments_open_uq | The partner already has an open assignment for this requirement / job. |
| candidate_attributions_active_uq | The candidate already has an active partner attribution. |
| duplicate_flags_pair_uq | These two profiles are already flagged as a pair. |
| profile_unlocks_org_candidate_uq | The organisation already has an unlock row for this candidate (a renewal updates it). |
| application_workflows_org_key_uq / application_workflows_default_uq | Workflow key already used / the scope already has a default workflow. |
| workflow_stages_terminal_chk | The terminal flag does not fit the stage category. |
| candidate_credentials_issuer_chk | A Venkat Sai credential needs a platform certificate. |
| candidate_skills_verified_chk | A self-declared skill cannot be marked verified. |
| candidate_preferred_locations_place_uq / job_locations_place_uq | This location is already listed. |
| jobs_owner_chk | A job without an organisation must be Venkat Sai-managed. |
| jobs_salary_range_chk / jobs_salary_currency_chk | Salary minimum above maximum / salary without currency and period. |
| jobs_slug_uq | The job URL slug is taken. |
| partner_licences_org_number_uq | This licence is already recorded for the partner. |
| partner_licences_verified_chk | A licence can be verified only with its scan and a verification date. |
| partner_agreements_one_active_uq | The partner already has an active agreement (supersede it first). |
| partner_territories_org_area_uq | This territory is already declared. |
| company_branches_org_hq_uq / company_branches_org_name_uq | Only one headquarters / branch name already used. |
| requirement_requests_submitted_chk | A non-draft requirement needs a submission time. |
| support_tickets_grievance_chk | Grievance fields are inconsistent (type, register code, category). |
| enquiries_contact_chk | An enquiry needs an email address or a phone number. |
| enrolments_batch_candidate_uq | The candidate is already enrolled in this batch. |
| certificates_active_assessment_uq / certificates_active_enrolment_uq | An active certificate already exists for this assessment / enrolment. |
| certificates_issuer_chk | Issuer type and issuer details do not match. |
| skill_assessments_result_chk | A pass / fail / retest result needs a completed assessment. |
| courses_fee_chk | A fixed fee needs an amount and currency; free / on-request courses carry none. |
| subscriptions_live_base_uq | The organisation already has a live base plan. |
| credit_ledger_org_key_seq_uq | Concurrent ledger write — retry with the new balance. |
| credit_ledger_idempotency_uq | This grant / consumption was already recorded (treat as success). |
| coupons_redemptions_chk | The coupon has reached its redemption limit. |
| payments_provider_ref_uq / payment_webhook_events_provider_event_uq | Payment / webhook already recorded (idempotent replay). |
| partner_settlement_lines_placement_fee_uq | This placement fee is already in a settlement. |
| cms_entries_collection_slug_locale_uq | The slug is taken in this collection and language. |
| cms_entries_consent_required_chk | Testimonials, case studies and team members need recorded consent to publish. |
| media_assets_public_chk | A public asset needs a people assessment, consent and (images) alt text. |
| public_metrics_display_chk | A visible manual figure needs a definition, evidence and a current approval. |
| media_folders_parent_name_uq | A folder with this name already exists here. |

## 6. Changes made during schema integration

Domain files (owned by the integrator after the domain schema work):

- All empty-array defaults (38 columns: employers 5, partners 3, candidates 8, operations 6, jobs 1,
  training 9, commercial 2, content 4) → `.$defaultFn(() => [])` (rule 1); the per-file `emptyUuidArray`
  helpers were removed.
- `job_alerts.channels` default → JS array `["email", "in_app"]` (round-trips).
- `unique().nullsNotDistinct()` → coalesce unique indexes with the same names (rule 2):
  `job_locations_place_uq`, `candidate_preferred_locations_place_uq`, `partner_territories_org_area_uq`,
  `application_workflows_org_key_uq`, `tax_rates_definition_uq`, `media_folders_parent_name_uq`; added
  `application_workflows_org_idx` and `media_folders_parent_idx` because the coalesce expression no longer
  indexes those FKs.
- `partner_assignments_open_uq`: plain column written as SQL (rule 3).
- `jobs_title_trgm_idx`, `leads_name_trgm_idx`, `leads_org_name_trgm_idx`: `.op("gin_trgm_ops")` (rule 4).
- `applications`: `currentStageId` declared before `workflowId` so `applications_current_stage_fk` round-trips (rule 5).
- Commercial composite currency FKs made plan-independent (rule 5): `currency` declared first in invoices, payments
  and partner_settlements and before the parent id in invoice_lines, coupon_redemptions, refunds and
  partner_settlement_lines; the five FKs now list `(currency, <parent>_id) → (currency, id)`; their targets were
  renamed `*_id_currency_uq` → `invoices_currency_id_uq`, `payments_currency_id_uq`,
  `partner_settlements_currency_id_uq` with columns `(currency, id)`; `partner_settlements_currency_idx` was
  dropped as redundant with the new unique constraint.
- Currency FKs + indexes added for consistency with the other domains: `candidate_profiles.expectedSalaryCurrency`,
  `jobs.salaryCurrency`, `applications.expectedSalaryCurrency`, `offers.salaryCurrency`,
  `placements.salaryCurrency`, `placements.feeCurrency`.
- Added `candidate_skills_skill_assessment_idx` (soft-reference lookup when an assessment result changes).

Foundation files (changed only where `drizzle-kit push` was not idempotent):

- `taxonomy.ts`: `skills.synonyms` → insert-time default; `skills_name_trgm_idx` → `.op("gin_trgm_ops")`.
- `core.ts`: `users_display_name_trgm_idx`, `organizations_name_trgm_idx` → `.op("gin_trgm_ops")`.
- `identity.ts`: `roles.permissions` → insert-time default.
- `organizations.ts`: the `organization_documents.verificationId` FK got the explicit name
  `organization_documents_verification_fk` (the generated 72-byte name was truncated by PostgreSQL).

Applying to an existing local database with `npm run db:push`: drops the database defaults of those array
columns, replaces the six unique constraints with unique indexes, renames one FK and three unique constraints,
re-creates six trigram indexes and the composite currency FKs, and adds six currency FKs. Nothing is
data-destructive, but column order in an existing table never changes — rule 5 only holds on databases created
from this schema (fresh test databases, and production once migrations are generated). On an older local
database, push still works but may keep re-creating the composite currency FKs; recreate that database to clear
it (`node scripts/test-db.mjs <name>` for test databases; note that `npm run db:reset` wipes the whole local
cluster, every database included).

## 7. Open items

Items 1–4 of the integration list are resolved (see §8). Remaining:

1. `_shared.ts` still exports `emptyTextArray` (unused, kept for raw-SQL backfills); prefer insert-time
   `$defaultFn(() => [])` per rule 1.
2. Composite-FK column order: local databases created before integration may keep re-creating the commercial
   composite FKs on push; recreate them (`node scripts/test-db.mjs <name>`).

## 8. Stage 1 service-layer changes (migration `0001_stage1_domain_services`)

Generated with `drizzle-kit generate`; applied with `npm run db:migrate`. Verified on a blank database:
0000 + 0001 apply cleanly, `drizzle-kit push --force` then reports "No changes detected" twice, and
`npm run db:seed` is idempotent (second run inserts nothing).

- **jobs**: recruiting-agent columns, indexes and check (§4.6).
- **commercial**: `subscriptions.startedAt` (timestamptz not null default now(), anchors monthly / yearly
  allowance windows); new `pending` subscription status (TS enum only: created and invoiced, not live until
  paid); `tax_rates.taxCode` (per SAC / HSN), `notes`, `confirmedAt`, `confirmedByUserId` (FK users, set null) +
  `tax_rates_confirmed_by_idx` — seeded rates stay unconfirmed until finance confirms them;
  `tax_rates_definition_uq` now includes `coalesce(tax_code, '')`. Invoice numbers come from
  `nextGstDocumentNumber` (`VSG/2627/000123`, credit notes `VSGC/2627/000045`).
- **identity**: `roles_scope_key_org_uq` converted from `unique().nullsNotDistinct()` to an all-SQL coalesce unique
  index (same name and semantics); the roles seed now uses `onConflictDoNothing()` without a target.
- **foundation FK indexes**: `_idx` indexes on every previously unindexed FK column (organizations, consent_records,
  user_roles, organization_documents / invitations / members / verifications, approval_requests / events,
  data_access_logs, data_requests, feature_flags, file_access_grants, platform_settings, countries, industries,
  job_categories).
- **TypeScript-only (no DDL)**: CMS singleton `footer` replaced by `about` (footer columns live in `navigation`,
  footer text in `site_settings`); media consent withdrawal makes the asset internal instead of unpublishing
  entries; announcements never fan out as notifications (`sendNotification` always false);
  `AnalyticsFunnelStep.match` accepts `props` (exact-match event properties).
