# Candidates module (`src/modules/candidates`)

The People Portal candidate profile and everything that reads it: the profile guard, profile section
services, completeness scoring and hints, document / credential verification (approval centre),
privacy and discoverability, the privacy-aware **viewer** used by every other portal, candidate
**search** for employers and staff, and the data-export bundle. Server-only except the client-safe
files marked ✱.

| File | What it holds |
|---|---|
| `guard.ts` | `requireCandidate()`, `ensureCandidateProfile()`, lookups |
| `actor.ts` | `selfActor()`, `staffActor()`, row locking + authorisation of edits |
| `profile-service.ts` | personal, professional, preferences, resume, photo |
| `career-service.ts` | education, experience, reorder, staff verification of entries |
| `skills-service.ts` | skills (taxonomy ids), languages, preferred locations |
| `documents-service.ts` | documents, credentials, submission for verification |
| `portfolio-service.ts` | portfolio items |
| `privacy-service.ts` | privacy settings, block list, visibility, candidate consents |
| `derived.ts` | recompute completeness, search text, verification level |
| `viewer.ts` | `getCandidateView()` / `getCandidateAccess()` — privacy-aware projections |
| `search.ts` | `searchCandidates()` — employer and staff discovery |
| `queries.ts` | profile editor detail, dashboard summary, access history, block-list helpers |
| `export.ts` | `buildCandidateDataExport()` |
| `approval-handlers.ts` | decisions for `candidate_document`, `candidate_credential` |
| `tasks.ts` | `candidates.refresh_derived`, `candidates.refresh_skill` |
| `actions.ts` | Server Actions (People Portal + a few staff / organisation actions) |
| `service.ts` | barrel of the write API |
| ✱ `schemas.ts`, `types.ts`, `constants.ts`, `completeness.ts`, `policy.ts`, `profile-rules.ts` | client-safe schemas, types, enums, pure rules |

## Guard

```ts
import { requireCandidate } from "@/modules/candidates/guard";
const session = await requireCandidate();            // { user: SessionUser, candidate: CandidateProfileRow }
```

- Signed-in user (→ sign-in redirect), People Portal flag `portal.talent` (→ 404), creates the profile
  on first use with **visibility `venkat_sai_only`** and a privacy row with protective defaults, records
  activity (`lastActiveAt`, at most every 15 min). Erased (anonymised) profiles → 403.
- Call it in **every** `/talent` page and every People Portal action.
- `ensureCandidateProfile(userId, { source?, sourcedByPartnerOrgId?, createdByUserId?, tx? }): Promise<CandidateProfileRow>`
  — for modules creating profiles on a candidate's behalf (partner submissions, imports). The caller authorises.
- `getCandidateByUserId(userId, tx?)`, `getCandidateById(candidateId, tx?)` — no authorisation (scope yourself).

## Actors

Every write takes a `CandidateActor`:

```ts
import { selfActor, staffActor } from "@/modules/candidates/service";
selfActor(await requireCandidate())               // the candidate
staffActor(await requireStaff("candidates.manage"), candidateId)   // staff on the candidate's behalf (audited "onBehalf")
```

Writes lock the profile row (`FOR UPDATE`), run in one transaction, then recompute the derived
columns. Staff uploads are granted to the candidate (`candidate_upload` file grant).

## Write API (`@/modules/candidates/service`)

All return the saved row (or `void`) and throw `ActionError` (with `fieldErrors` / `code`) for expected failures.

| Function | Input schema (`schemas.ts`) | Notes |
|---|---|---|
| `updatePersonalDetails(actor, input)` | `personalSchema` | legal name, DOB, gender (never searchable), nationality, current location, passport (status, number — **write-only**, encrypted + last 4 + keyed hash, cleared when status is none/applied), emigration category. Audits changed identity field **names** only. |
| `updateProfessionalSummary(actor, input)` | `professionalSchema` | headline, about, objective, experience level + years/months, current title/employer, industry, notice period |
| `updateJobPreferences(actor, input)` | `preferencesSchema` | categories, roles, employment types, work modes, availability, expected salary (major units → minor with the chosen currency), relocation, overseas. **Minors cannot turn on overseas** (`code: "minor_overseas"`). |
| `setCandidateResume(actor, fileId \| null)` / `setCandidatePhoto(actor, fileId \| null)` | `fileRefSchema` | files of purpose `resume` / `avatar`; old file's organisation grants revoked |
| `saveEducation(actor, input)` / `deleteEducation(actor, id)` / `reorderEducation(actor, ids)` | `educationSchema` / `reorderSchema` | editing verified facts resets verification |
| `saveExperience(actor, input)` / `deleteExperience` / `reorderExperience` | `experienceSchema` | reference contact is private |
| `replaceCandidateSkills(actor, input)` | `skillsSchema` (`skills:json`) | diff-based; verification of kept skills preserved; ≤ 50 skills, ≤ 5 primary |
| `upsertCandidateSkill(actor, item)` / `removeCandidateSkill(actor, skillId)` | `skillItemSchema` | |
| `replaceCandidateLanguages(actor, input)` | `languagesSchema` (`languages:json`) | |
| `replacePreferredLocations(actor, input)` | `preferredLocationsSchema` (`locations:json`) | priority = list order |
| `saveCandidateDocument(actor, input)` | `documentSchema` | number encrypted + last 4; a new file / number on a reviewed document resets it and cancels the open review |
| `setDocumentSharing(actor, id, isShareable)` | `documentSharingSchema` | turning sharing off revokes organisation grants immediately |
| `deleteCandidateDocument(actor, id)` | | soft delete, cancels review, revokes grants |
| `submitDocumentForVerification(actor, id)` | | → approval `candidate_document` (status `pending`); returns `{ approvalId, code }` |
| `saveCandidateCredential(actor, input)` / `deleteCandidateCredential(actor, id)` | `credentialSchema` | `linkedSkillIds` become `source: credential` skills; platform-issued credentials (`issuerType` `venkat_sai`, or `institution` for an institution completion certificate — both created by the training module) are read-only |
| `submitCredentialForVerification(actor, id)` | | needs an uploaded copy → approval `candidate_credential` |
| `savePortfolioItem(actor, input)` / `deletePortfolioItem` / `reorderPortfolio` | `portfolioItemSchema` | YouTube/Vimeo https only; private items never leave the candidate + staff |
| `updatePrivacySettings(actor, input)` | `privacySettingsSchema` | name/contact/photo/current-employer disclosure, direct contact, partner submissions (consent `partner_submission`), **block list** (revokes that organisation's file access and its contact unlock — recruitment `revokeUnlocksForCandidate`, imported directly from `@/modules/recruitment/unlocks`; that file does not import back into candidates, so there is no cycle) |
| `updateVisibility(actor, input)` | `visibilitySchema` | `public_to_employers` · `verified_employers` · `venkat_sai_only` · `hidden` + open to work; consent `profile_discoverable` recorded on change |
| `updateCandidateConsents(actor, input)` | `candidateConsentsSchema` | **self only**: `share_assessment_results`, `contact_references` |
| `setEducationVerification(staff, input)` / `setExperienceVerification(staff, input)` | `itemVerificationSchema` | staff `candidates.verify`; notifies the candidate |
| `refreshCandidateDerived(candidateId, tx?)`, `recomputeVerificationLevel(candidateId, tx?)`, `computeCandidateCompleteness(candidateId)` | | for other modules (training recomputes after recording / publishing an assessment result) |
| `refreshSkillCaches(candidateId, tx?): Promise<{ skillNamesCache, skillsText }>` | | only the skill caches (names primary → verified → A–Z; search text with synonyms), same format as the full refresh |
| `enqueueCandidateRefresh(candidateId, tx?)`, `enqueueSkillRefresh(skillId, tx?)` | | background refresh (taxonomy rename, assessment published) |
| `revokeOrganizationProfileGrants(candidateId, orgIds, actorUserId, tx?)`, `revokeProfileGrantsForFiles(fileIds, actorUserId, tx?)` | | used by recruitment when an application is withdrawn and when an unlock is revoked or lapses |
| `buildCandidateDataExport(requester)` | | see Data export |

## Verification flow (approval centre)

`submit…ForVerification` → `approval_requests` (`candidate_document` / `candidate_credential`, payload
snapshot without identity numbers) → staff decide in `/admin/approvals` → `approval-handlers.ts`:

| Decision | Item | Notes |
|---|---|---|
| approved | `verified`, `verifiedBy/At` | linked credential skills become `verified` |
| rejected | `rejected` + reason (shown to the candidate) | request closed; a new submission opens a new request |
| changes_requested | `unverified` + reason | the next submission re-opens the same request |

Then `verificationLevel` is recomputed. Notification: when the candidate submitted, the approvals
service's `approval.decided` reaches them; when staff/partners submitted on their behalf the handler
sends `candidate.verification_updated`.

**Verification level** (`profile-rules.ts computeVerificationLevel`): `skills_assessed` (published passed
Venkat Sai assessment or assessment-verified skill) › `documents_verified` (verified passport / ID
proof) › `basic` (verified email or phone) › `none`.

## Completeness (`completeness.ts`, client-safe)

`computeProfileCompleteness(input): { score, items, nextActions }`, weights (sum 100): headline 5 ·
location 5 · summary 5 · verified contact 10 · preferences 15 (roles 5, work style 3, availability 4,
salary 3) · experience 15 (or fresher) · education 10 · skills 15 (1–2 skills = 8) · languages 5 ·
resume 10 · photo 5. Sensitive data is never scored. Stored in `profileCompleteness` after every change.

`nextActions[]`: `{ key, section, points, href, label }`, highest gain first. Keys: `add_headline`,
`add_location`, `add_summary`, `verify_contact` (→ `/account`), `add_preferred_roles`, `add_work_style`,
`add_availability`, `add_expected_salary`, `add_experience`, `add_education`, `add_skills`,
`add_more_skills`, `add_languages`, `upload_resume`, `add_photo`, plus unscored advice
`add_passport_status`, `fix_rejected_documents`, `submit_documents_for_verification`,
`review_visibility`. Translate by `key` (talent-profile namespace); `label` is the English fallback.
`computeExperienceMonths(entries)` merges overlapping jobs (offered to the editor as `suggestedExperienceMonths`).

## Viewer — the only way other portals read a profile

```ts
import { getCandidateView, getCandidateAccess } from "@/modules/candidates/viewer";
getCandidateView(candidateId, viewer, { revealContact?, revealIdentity?, reason? }): Promise<CandidateView | null>
getCandidateAccess(candidateId, viewer): Promise<CandidateAccess | null>   // decision only, no logging
// viewer: { kind: "self", user, candidate } | { kind: "staff", ctx } | { kind: "employer", ctx: OrgContext<"employer"> }
//       | { kind: "partner", ctx: OrgContext<"recruitment_partner"> }
```

`null` = treat as not found (missing, blocked, not discoverable, not sourced, no permission). Rules
(`policy.ts resolveCandidateAccess`, unit-tested per viewer):

| Viewer | Sees |
|---|---|
| self | everything, contact shown |
| staff | needs `candidates.view`; contact **masked until revealed** with `candidates.view_contact` (logged, incl. reference contacts); documents, resume, identity details (on `revealIdentity`, logged) with `candidates.view_documents`; gender with `candidates.manage`; internal fields |
| employer | never when blocked by the candidate, or the organisation is suspended/rejected, or the candidate is a minor without guardian consent. **Discovery** (`employer.candidates.search`): open to work + `public_to_employers`, or `verified_employers` and the org is verified. **Relationship** (`employer.pipeline.view` / `candidates.search` / `candidates.unlock`): an application to one of its jobs with `consentToShareAt` **and** `sharedWithEmployerAt` (not withdrawn), or an active `profile_unlocks` row → full name, contact on reveal, resume, documents the candidate marked shareable (not rejected). Without a relationship: initials (unless `showFullNameToEmployers`), no contact (unless `showContactToUnlockedOnly` is off), no documents. Photo only with `showPhoto`; current employer only with `showCurrentEmployer`. Assessments: passed results only, and only with `share_assessment_results` consent. |
| partner | only candidates it sourced (active `candidate_attributions` or `sourcedByPartnerOrgId`); contact on reveal; documents its organisation uploaded |

Side effects: contact reveals and identity views → `logDataAccess`; organisation profile views logged
once per org/candidate/day (`dataCategory: "profile"`); organisation file grants (`candidate_profile`
context: photo, resume, shareable documents, public portfolio media) synced on every view.
`employerRelationship(candidateId, orgId)` and `isSourcingPartner(candidateId, partnerOrgId, sourcedBy)` are exported.

## Search

```ts
import { searchCandidates } from "@/modules/candidates/search";
import { parseCandidateSearchParams } from "@/modules/candidates/schemas";
searchCandidates(parseCandidateSearchParams(searchParams), viewer): Promise<CandidateSearchResult>   // Paginated<CandidateCard>
```

Viewers: employer (`employer.candidates.search`, flag `employer.candidate_search`, entitlement
`candidate_search`, 300 searches/hour/user) or staff (`candidates.view`). Filters: `q` (prefix
full-text over headline/title/roles/skills incl. synonyms/city), `skillIds` + `skillMatch` all|any,
`verifiedSkillsOnly`, `experienceMinYears/MaxYears`, `countryCode`, `stateRegion`, `city`,
`preferredCountryCode`, `availability[]`, `languageCodes[]` + `minLanguageProficiency` (all listed
languages), `educationLevelId` (minimum rank), `verifiedCredentialsOnly`, `assessedOnly` (employers:
only candidates who consented), `employmentTypes[]`, `workModes[]`, `openToOverseas`, `passportValid`,
`salaryMax` + `salaryCurrency` + `salaryPeriod` (same currency/period only; candidates without an
expectation are included), `minVerificationLevel`, `activeWithinDays`, `forOverseasRole`,
`includeHidden` (staff with `candidates.manage`), `sort` relevance|recent|experience|completeness,
`page`, `pageSize` ≤ 50. Cards are masked: no contact, **no photos** (reduces appearance bias), no identity.
Minors are excluded from overseas searches (`openToOverseas`, `forOverseasRole`, or a foreign employer).

## Queries (`queries.ts`)

Also re-exports `getCandidateView`, `getCandidateAccess` and `searchCandidates`.

- `getCandidateProfileDetail(actor): Promise<CandidateProfileDetail & { suggestedExperienceMonths } | null>` — editor data (self, or staff `candidates.manage`, logged).
- `getCandidateDashboardSummary(session, { hints? })` — completeness, top hints, verification, document counts.
- `listProfileAccessHistory(session, page)` — who viewed / revealed (organisation names; staff shown as Venkat Sai).
- `searchBlockableOrganizations(session, q)`, `listBlockedOrganizations(session, ids)` — block-list UI.
- `completenessFromBundle(bundle)`.

## Data export

`buildCandidateDataExport({ kind: "self", session } | { kind: "staff", ctx, candidateId, reason })` →
`CandidateDataExport` (account, profile incl. **decrypted** identity numbers, privacy, history, skills,
languages, credentials, documents, portfolio, assessments, saved jobs, alerts, profile unlocks, consent
history, referenced `files[]`). Staff need `privacy.requests` or `candidates.export` (logged). Audited.
Applications / interviews / offers are exported by the recruitment module.

## Server Actions (`actions.ts`)

People Portal (each calls `requireCandidate()`): `savePersonalAction`, `saveProfessionalAction`,
`savePreferencesAction`, `setResumeAction`, `setPhotoAction`, `saveEducationAction`,
`deleteEducationAction`, `reorderEducationAction`, `saveExperienceAction`, `deleteExperienceAction`,
`reorderExperienceAction`, `saveSkillsAction`, `removeSkillAction`, `saveLanguagesAction`,
`savePreferredLocationsAction`, `saveCredentialAction`, `deleteCredentialAction`,
`submitCredentialVerificationAction`, `saveDocumentAction`, `deleteDocumentAction`,
`setDocumentSharingAction`, `submitDocumentVerificationAction`, `savePortfolioItemAction`,
`deletePortfolioItemAction`, `reorderPortfolioAction`, `savePrivacySettingsAction`,
`saveVisibilityAction`, `saveCandidateConsentsAction`. Others: `revealCandidateContactAction({ candidateId, as: "staff"|"employer"|"partner", reason? })`
(100 reveals/hour), `verifyEducationAction`, `verifyExperienceAction` (staff `candidates.verify`).
Form actions use `createFormAction` (`useActionState`); list editors post `skills:json`,
`languages:json`, `locations:json`. Errors carry `code` for translation.

## Background tasks (`tasks.ts`)

- `candidates.refresh_derived { candidateId }` — recompute derived columns (deduplicated per minute).
- `candidates.refresh_skill { skillId }` — refresh every profile listing a skill, 200 per run, self-continuing.
- `candidates.refresh_category { categoryId }` — refresh every profile preferring a renamed job category.

None is on the recurring schedule; enqueue them with `enqueueCandidateRefresh(candidateId, tx?)`,
`enqueueSkillRefresh(skillId, tx?)`, `enqueueCategoryRefresh(categoryId, tx?)`. `requireCandidate()`
also self-heals the verification level when the user verified their contact after the profile was created.

## Notifications and audit

Event (added to `events.ts`): `candidate.verification_updated` (`itemType`, `itemLabel`, `decision`, `reason`).
Audit actions: `candidate.profile_created`, `candidate.personal_updated`, `candidate.professional_updated`,
`candidate.preferences_updated`, `candidate.resume_updated/removed`, `candidate.photo_updated`,
`candidate.education_*`, `candidate.experience_*`, `candidate.skills_updated`, `candidate.skill_removed`,
`candidate.document_added/updated/deleted/submitted/sharing_changed`, `candidate.credential_*`,
`candidate.portfolio_*`, `candidate.privacy_updated`, `candidate.visibility_changed`,
`candidate.consents_updated`, `candidate.data_exported` (+ `approval.*` from the approvals service).

## Privacy guarantees (summary)

Identity numbers encrypted (AES-GCM) with last 4 for display; DOB / gender / nationality / legal name
never indexed, searched or ranked; contact and documents masked unless entitled; every sensitive
reveal logged; block list enforced in viewer and search; minors (DOB < 18, or a guardian-consent
record) never in overseas matching, and never visible to organisations without granted guardian consent.

## Tests

```powershell
npx vitest run src/modules/candidates                       # pure tests always
node scripts/test-db.mjs vsg_test_candjobs
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_candjobs'; npx vitest run src/modules/candidates
```

`completeness.test.ts`, `policy.test.ts` (every viewer type), `profile-rules.test.ts` (rules + schemas),
`candidates.integration.test.ts` (sections, derived columns, search vector, minors, approval decisions,
staff uploads, credential skills, viewer projections and grants, search filters per viewer, export).
`test-fixtures.ts` is test-only.
