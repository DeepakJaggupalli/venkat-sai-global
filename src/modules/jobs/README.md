# Jobs module (`src/modules/jobs`)

Job postings end to end: the job form and its validation, drafts, review and publication
(approval type `job_publication`), lifecycle (pause / resume / close / reopen / extend / schedule /
archive / delete / duplicate), promotions, information-source and recruiting-agent badges, view
counting, public / talent / employer / admin search with facets, the public job page, schema.org
JSON-LD, explainable recommendations, saved jobs and job alerts, and the background tasks. Server-only
except the client-safe files marked ✱.

| File | What it holds |
|---|---|
| `job-service.ts` | `createJob`, `updateJob`, `duplicateJob`, `deleteJob`, review snapshot |
| `lifecycle-service.ts` | submit, withdraw, publish (staff), pause, resume, close, reopen, extend, reschedule, archive |
| `promotion-service.ts` | promote (employer), feature / unfeature (staff), info source, recruiting agent |
| `publication.ts` | `applyPublication()` and owner notifications (shared with the approval handler and tasks) |
| `access.ts` | actor checks, row locking, slug, overseas flag, derived search columns |
| `filters.ts` | **the** public-visibility rule and the SQL for every search filter |
| `search.ts` | `searchJobs()` with facets |
| `queries.ts` | public job page, management detail, lists, featured jobs, apply context |
| `present.ts` | job cards (confidential handling, salary visibility, logos, skills, saved/applied flags) |
| `recommendations.ts` + ✱ `recommendation-scoring.ts` | explainable rules-based "jobs for you" |
| `saved-alerts-service.ts`, `alerts.ts` | saved jobs, job alerts, alert matching |
| `views.ts` | cookie-less view counting |
| ✱ `structured-data.ts` | JobPosting JSON-LD |
| `approval-handlers.ts`, `tasks.ts`, `actions.ts`, `service.ts` (barrel) | |
| ✱ `schemas.ts`, `types.ts`, `constants.ts`, `lifecycle.ts` | client-safe schemas, types, enums, pure lifecycle rules |

## Actors

```ts
type JobActor = { kind: "employer"; ctx: OrgContext<"employer"> } | { kind: "staff"; ctx: StaffContext };
const employer = { kind: "employer", ctx: await requireOrgMember("employer", "employer.jobs.manage") } as const;
const staff = { kind: "staff", ctx: await requireStaff("jobs.manage") } as const;
```

Employers reach only their organisation's jobs (others look like "not found") and need
`employer.jobs.manage` (reads: `employer.jobs.view`); the flag `employer.self_serve_jobs` gates employer
posting. Staff need `jobs.manage` (edit), `jobs.approve` (publish, info source, recruiting agent),
`jobs.feature` (promotions), `jobs.view` (reads). Every write locks the job, runs in one transaction and is audited.

## Write API (`@/modules/jobs/service`)

| Function | Notes |
|---|---|
| `createJob(actor, input: JobFormInput): Promise<JobRow>` | Draft with code `VSG-JOB-nnnnnn`, slug `title-city-nnnnnn`, sanitised `descriptionHtml` (`sanitizeRichText`), skills / extra locations / screening questions, `skillsText` (+ synonyms), `categoryNameCache`, `isOverseas` (vs setting `platform.home_country`). Staff may set `organizationId` (an employer) or leave it empty for a **Venkat Sai-managed confidential job** (`confidentialEmployerName` required); also `managedByVenkatSai`, `requirementId`, `workflowId`. |
| `updateJob(actor, jobId, input): Promise<{ job, sentForReview }>` | Allowed in draft, pending, changes requested, rejected, published, paused, closed. An **employer's change to what candidates read on a live job** (`REVIEWED_FIELDS` in `lifecycle.ts`, or skills / locations / questions) sends it back to `pending_approval` (hidden until approved); openings, deadline, start date, own reference change live. An open review gets the new snapshot. Slugs never change after first publication; an empty listing-end field keeps the current one. |
| `submitJob(actor, jobId, { scheduledPublishAt? })` | → `pending_approval` + approval `job_publication` (snapshot with compliance flags). Employers: organisation **verified**, flag on, `checkEntitlement(org, "job_posts")`. Problems listed by `publicationProblems()`. |
| `withdrawJobSubmission(actor, jobId)` | pending → draft, review cancelled |
| `publishJob(staff, jobId, { scheduledPublishAt?, infoVerified? })` | staff `jobs.manage` + `jobs.approve`; cancels an open review |
| `pauseJob`, `resumeJob` | resume refuses a job past its deadline / listing end |
| `closeJob(actor, jobId, reason)` | `filled` · `cancelled` · `duplicate` · `other` (`expired` is system-only) |
| `extendJob(actor, jobId, { applicationDeadline?, expiresAt? })` | later dates (≤ 180 days); a job closed as `expired` is reopened |
| `reopenJob(actor, jobId, dates?)` | closed jobs that were published before; new dates required when the old ones passed |
| `rescheduleJob(actor, jobId, at)` | approved job that is not live yet |
| `archiveJob`, `deleteJob` (soft; drafts, closed, rejected, archived only), `duplicateJob` (new draft incl. skills/questions; recruiting-agent details are not copied) | |
| `promoteJob(employer, jobId, days)` | featured window from the `featured_jobs` entitlement (consumed per promotion) |
| `featureJob(staff, jobId, { type: featured\|boosted\|homepage, until })`, `unfeatureJob(staff, jobId, type?)` | admin promotions (≤ 90 days); featured jobs are always labelled |
| `setJobInfoSource(staff, jobId, infoSource)` | `verified` · `employer_supplied` · `pending_review` badge |
| `setJobRecruitingAgent(staff, input)` | regulatory notes rec. 8 — see below |
| `recordJobView(jobId, { userId? })` | counts once per user / IP-hash per 24 h via `rate_limit_buckets` keys `job-view:<job>:u:<user>` / `:ip:<hash>`; crawlers ignored; does not touch `updated_at` |
| `saveJob(user, jobId)`, `unsaveJob`, `getSavedJobIds`, `listSavedJobs(user, page, { candidateId? })` (+ `unavailableCount`), `clearUnavailableSavedJobs(user)` | saved jobs (≤ 500, publicly listed jobs only) |
| `listJobAlerts(user)`, `getJobAlert(user, id)`, `saveJobAlert(user, input)`, `setJobAlertActive(user, id, on)`, `deleteJobAlert(user, id)` | ≤ 10 alerts; new / re-activated alerts report only jobs published afterwards |
| `matchJobsForAlert(alert, { publishedAfter?, publishedBefore?, limit?, excludeOverseas?, userId? })`, `alertCriteriaToFilters(criteria)` | alert preview + digest |
| `applyPublication(job, opts)`, `notifyJobOwner(job, event, data, opts)` | for other modules' background work |

### Publication (`applyPublication`, used by approvals and staff publish)

Organisation must be verified (re-checked); `publishedAt` = first publication date (re-approval never
makes a job look new) or the scheduled time; `expiresAt` = kept if still valid, else
`recruitment.job_default_duration_days` (default 30) after go-live, at least until the deadline, capped
at 180 days; `verifiedEmployer` snapshot; `infoSource` = `employer_supplied` for employer jobs,
`verified` for Venkat Sai jobs or when staff confirm; one `job_posts` credit consumed per job (not for
managed jobs; idempotent per job); organisation notified (`job.approved`). A scheduled job is simply
`published` with a future `publishedAt` — public queries hide it until then (`jobDisplayStatus()` → `scheduled`).

### Approval handler (`job_publication`)

approved → `applyPublication`; changes_requested / rejected → status + `moderationNote` (shown to the
employer) and `job.changes_requested` / `job.rejected`. Aborts when the job was deleted / withdrawn or the
organisation is no longer verified.

### Recruiting-agent transparency

Overseas jobs advertised by or for an Indian recruiting agent show the agent's name and eMigrate
certificate number (`PublicJobDetail.recruitingAgent`) — **only** when staff recorded it
(`setJobRecruitingAgent`): `mode: "licence"` copies a partner's **verified, unexpired**
`india_recruiting_agent` licence; `mode: "manual"` records a certificate staff checked (e.g. Venkat Sai's
own, once it exists — never assumed); `mode: "clear"`. Expired certificates are never shown. The review
snapshot flags overseas jobs without one (`compliance.recruitingAgentRecorded`).

## Read API

```ts
import { searchJobs } from "@/modules/jobs/search";
import { parseJobSearchParams } from "@/modules/jobs/schemas";
searchJobs(parseJobSearchParams(searchParams), audience, { facets? }): Promise<JobSearchResult>
// audience: { kind: "public" } | { kind: "talent", userId, candidateId? } | { kind: "employer", ctx } | { kind: "admin", ctx }
```

- **Public visibility** (filters.ts, single source of truth): published, not deleted, `publishedAt ≤ now`,
  listing end and deadline in the future, organisation not deleted / suspended / rejected; overseas,
  internship and freelance jobs hidden when the flags `talent.overseas`, `talent.internships`,
  `talent.freelance` are off.
- Filters (spec 8.4): `q` (prefix full-text: title, category, skills + synonyms, summary, city),
  `categoryIds` (with sub-categories), `industryIds`, `location` (city/state incl. extra locations),
  `countryCodes` (incl. extra locations), `overseas`, `experienceYears` (jobs whose range includes it),
  `experienceLevels`, `salaryMin/salaryMax` + `salaryCurrency` + `salaryPeriod` (same currency and
  period, overlapping ranges; public audiences only match **visible** salaries), `educationLevelId`
  (jobs requiring at most that level), `employmentTypes`, `workModes`, `verifiedOnly` (verified employer
  or Venkat Sai-managed), `postedWithinDays`, `closingWithinDays`, `featuredOnly`, `skillIds`; employer /
  admin: `statuses`, `infoSource`; admin: `organizationId`, `managedOnly`, `includeDeleted`.
- URL aliases: `type`, `mode`, `country`, `category`, `industry`; repeated or comma-separated values;
  invalid values are dropped, never an error.
- Sort: `relevance` (featured, then boosted, then text rank / newest), `newest`, `closing`, `salary`.
- Facets (disjunctive): categories, countries, employment types, work modes, overseas count, verified count.
- Cards (`JobCard`): confidential jobs show `confidentialEmployerName` and never the organisation's
  name, logo, slug or id to public / talent audiences; hidden salaries are `null` for them; management
  audiences get `status`, `viewCount`, `applicationCount`, `organizationName`; talent gets `isSaved`, `hasApplied`.

`queries.ts` (also re-exports `searchJobs` and `getRecommendedJobs`):

| Function | Notes |
|---|---|
| `getPublicJobBySlug(slug, { userId?, candidateId? }): Promise<PublicJobDetail \| null>` | public page: description, responsibilities, requirements, skills, extra locations, screening questions **without knockout rules**, employer profile (not for confidential jobs), recruiting agent |
| `getManagedJob(actor, jobId)`, `getJobForEmployer(ctx, jobId)`, `getJobForStaff(ctx, jobId)` | editor / management detail incl. knockout rules, latest review (code, status, reason), active promotions |
| `listEmployerJobs(ctx, filters)`, `listAdminJobs(ctx, filters)` | paginated management lists (admin with facets; ids for bulk actions) |
| `countEmployerJobsByStatus(ctx)` | dashboard counts |
| `listFeaturedJobs({ placement: "featured" \| "homepage", limit })` | promoted public jobs |
| `getJobForApplication(jobId)` | for recruitment's apply flow: publicly listed + `applyMode = platform`, questions with knockout rules (flag only) |

`getRecommendedJobs(candidateId, viewer, { limit? })` (`recommendations.ts`) — viewer `{ kind: "self", user, candidate }`
or staff (`candidates.view` + `jobs.view`). Scoring (`recommendation-scoring.ts`, documented table): skills 30,
role / category 20, location 20, experience 15, salary 10 (same currency + period only), work style 5;
every point is a `reason { code, points, params, text }`; overseas jobs excluded unless the candidate is an
adult open to overseas work; already-applied jobs excluded; a location alone never makes a job relevant.

`buildJobPostingJsonLd(detail, { url, siteName? })` + `serializeJsonLd(data)` (`structured-data.ts`):
render `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />`
on public job pages only (published, unexpired). Employment types map via `GOOGLE_EMPLOYMENT_TYPE`.

## Server Actions (`actions.ts`)

Job form: `saveEmployerJobAction`, `saveStaffJobAction` (`createFormAction(jobFormSchema)`; hidden `id` to
update; lists as `skills:json`, `locations:json`, `screeningQuestions:json`, `benefits[]`). Lifecycle
(`{ id, portal: "employer" | "admin" }`): `submitJobAction` (+ `scheduledPublishAt`), `withdrawJobAction`,
`pauseJobAction`, `resumeJobAction`, `closeJobAction` (+ `reason`), `extendJobAction`, `reopenJobAction`,
`rescheduleJobAction`, `archiveJobAction`, `deleteJobAction`, `duplicateJobAction`; employer
`promoteJobAction`; staff `publishJobAction`, `featureJobAction`, `unfeatureJobAction`,
`setJobInfoSourceAction`, `setJobRecruitingAgentAction`. People Portal: `saveJobBookmarkAction`,
`unsaveJobBookmarkAction`, `clearUnavailableSavedJobsAction`, `saveJobAlertAction`, `toggleJobAlertAction`,
`deleteJobAlertAction`.

## Background tasks (`tasks.ts`, both on the recurring schedule)

- `jobs.close_expired` (hourly): published / paused jobs past deadline or listing end → `closed`
  (`expired`) + `job.expired` to the organisation (or the staff poster); `job.closing_soon` once per
  closing date, 3 days ahead; ended featured windows cleared; spent schedule markers cleared.
- `jobs.alerts_digest` (daily): due alerts (daily ≈ 24 h / weekly ≈ 7 days since the last run) →
  `job.alert_digest` on the alert's channels with up to 10 new jobs (`alertName`, `count`, `jobs[{ title,
  employer, location, salary, url }]`), watermark `lastRunAt`, `lastSentAt`; minors never get overseas jobs;
  200 alerts per run, self-continuing. Idempotent (dedupe keys per alert and day).
- `jobs.refresh_skill { id }` / `jobs.refresh_category { id }` (on demand, not scheduled): recompute
  `skillsText` / `categoryNameCache` of jobs using a renamed skill or category (200 per run,
  self-continuing). Enqueue with `enqueueJobSkillRefresh(skillId, tx?)` / `enqueueJobCategoryRefresh(categoryId, tx?)`
  (and the candidates module's `enqueueSkillRefresh` / `enqueueCategoryRefresh` for profiles).

## Notifications and audit

Events used: `job.submitted`, `job.approved`, `job.changes_requested`, `job.rejected`, `job.closing_soon`,
`job.expired` (added), `job.alert_digest`. Audit actions: `job.created`, `job.updated`, `job.duplicated`,
`job.deleted`, `job.submitted`, `job.submission_withdrawn`, `job.published`, `job.changes_requested`,
`job.rejected`, `job.paused`, `job.resumed`, `job.closed`, `job.extended`, `job.reopened`, `job.rescheduled`,
`job.archived`, `job.promoted`, `job.featured`, `job.unfeatured`, `job.info_source_changed`,
`job.recruiting_agent_set`, `job.expired`, `job_alert.created`.

## Schema additions (jobs.ts)

`recruitingAgentLicenceId` (FK partner_licences, set null), `recruitingAgentName`,
`recruitingAgentCertificateNumber`, `recruitingAgentCertificateValidUntil`, `recruitingAgentVerifiedAt`,
`recruitingAgentVerifiedByUserId` (FK users) + indexes + `jobs_recruiting_agent_chk` (verified ⇒ name and
number). No migration generated here (central follow-up migration).

## Tests

```powershell
npx vitest run src/modules/jobs                             # pure tests always
node scripts/test-db.mjs vsg_test_candjobs
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_candjobs'; npx vitest run src/modules/jobs
```

`lifecycle.test.ts`, `recommendation-scoring.test.ts`, `structured-data.test.ts`, `schemas.test.ts`, and
`jobs.integration.test.ts` (draft sanitising, verification gate, approval transitions incl. changes
requested / rejected / re-review, confidential staff jobs, every search filter + facets + sorting +
salary visibility, employer scoping, recommendations, minors, saved jobs, view counting, alert digest,
lifecycle, expiry task, recruiting-agent rules).
