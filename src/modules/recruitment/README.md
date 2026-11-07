# Recruitment module (`src/modules/recruitment`)

Server-side business logic for the hiring pipeline: workflows and stages, applications (candidate
applies, staff assigns, partner submission accepted), pipeline moves with a permission matrix,
internal notes, talent lists, profile unlocks, interviews and reminders, offers, placements,
overseas mobilisation, and the recruitment-partner workflow (assignments, submissions, duplicate
detection, attribution, performance). Schema: `src/db/schema/recruitment.ts` (see
`docs/SCHEMA_NOTES.md` §4.8). Portal pages are built on top of this API.

Everything is server-only except the client-safe files marked ✓ below. **Every service takes the
acting party and re-checks permission keys (403 → `ActionError` code `forbidden`) and scope (an
entity outside the actor's scope is reported as `not_found`, so ids cannot be probed).** Expected
failures throw `ActionError` (`message` is user-facing, `code` is stable, `fieldErrors` keyed by
field); inputs are parsed with the zod schemas in `schemas.ts`.

```ts
import { createApplication, transitionApplication, asEmployer, asStaff } from "@/modules/recruitment/service"; // writes
import { getPipelineBoard, listApplicationsForCandidate } from "@/modules/recruitment/queries";            // reads
import { PIPELINE_COLUMNS, canTransition } from "@/modules/recruitment/workflow";                          // ✓ client-safe
```

| File | Contents |
|---|---|
| `service.ts` / `queries.ts` | Public write / read barrels (use these) |
| `actions.ts` | `"use server"` actions for every portal (thin: guard → zod → service → revalidate) |
| `schemas.ts` ✓ | Zod schemas + input types (`CandidateApplyInput`, `ScheduleInterviewInput`, …) |
| `constants.ts` ✓ | Enum option lists mirroring the schema (parity-checked) + UI labels (`REJECTION_REASON_LABELS`, `NOTE_VISIBILITY_LABELS`, `INTERVIEW_MODE_LABELS`, `RECOMMENDATION_LABELS`, `OFFER_STATUS_LABELS`, `SUBMISSION_STATUS_LABELS`; mobilisation labels in `mobilisation-rules.ts`) |
| `types.ts` ✓ | Actor types and every read-model type |
| `workflow.ts` ✓ | Stage helpers, `canTransition`, `PIPELINE_COLUMNS`, `REQUIREMENT_PIPELINE_COLUMNS` |
| `default-workflow.ts` ✓ | The seeded "Standard recruitment" workflow (17 stages) |
| `matching.ts` ✓ | Duplicate matching + attribution-window rules (pure) |
| `screening.ts` ✓, `rules.ts` ✓, `visibility.ts` ✓, `mobilisation-rules.ts` ✓, `interview-rules.ts` ✓, `timezone.ts` ✓, `links.ts` ✓, `actors.ts` ✓ | Pure rules and helpers |
| `applications.ts`, `stage-move.ts`, `lifecycle.ts`, `snapshot.ts`, `application-queries.ts`, `candidate-cards.ts`, `notes.ts`, `talent-lists.ts`, `unlocks.ts`, `interviews.ts`, `offers.ts`, `placements.ts`, `mobilisation.ts`, `partner-assignments.ts`, `partner-submissions.ts`, `partner-queries.ts` | Services by sub-domain |
| `seed.ts`, `tasks.ts` | Production seed, background tasks |

## Actors

```ts
type RecruitmentActor =
  | { kind: "staff"; ctx: StaffContext }                         // asStaff(await requireStaff())
  | { kind: "employer"; ctx: OrgContext<"employer"> }            // asEmployer(await requireOrgMember("employer"))
  | { kind: "partner"; ctx: OrgContext<"recruitment_partner"> }  // asPartner(await requireOrgMember("recruitment_partner"))
  | { kind: "candidate"; userId: string; candidateId: string }   // asCandidate(await requireCandidate())  or requireCandidateActor()
  | { kind: "system"; userId: string | null };                   // systemActor(userId?)
type HiringActor = StaffActor | EmployerActor;
```

Helpers: `asStaff`, `asEmployer`, `asPartner`, `asCandidate({ user, candidate })`, `systemActor()`,
`actorUserId(actor)`, `actorType(actor)`, `actorOrganizationId(actor)`, `requireCandidateActor()`
(delegates to the candidates module's `requireCandidate()`).

Permission keys used: staff `recruitment.view` / `recruitment.manage` / `recruitment.mobilisation`,
`partners.view` / `partners.assign` / `partners.manage`, `candidates.view` / `candidates.manage` /
`candidates.view_contact`; employer `employer.pipeline.view|manage`, `employer.interviews.manage`,
`employer.offers.manage`, `employer.candidates.lists|unlock|search`; partner
`partner.requirements.view`, `partner.candidates.submit`, `partner.submissions.view`,
`partner.documents.manage`, `partner.performance.view`.

## Workflow and stages (`workflow.ts` ✓, `default-workflow.ts` ✓, `seed.ts`)

Default workflow key `"standard"` ("Standard recruitment"), installed by `seed()` /
`seedDefaultWorkflow(executor?) → { workflowId, workflowCreated, stagesInserted }` (idempotent;
never overwrites admin edits; becomes the platform default only if none exists).

| # | key | Pipeline name | category | Candidate label | terminal | notifies candidate |
|---|---|---|---|---|---|---|
| 1 | `submitted` | Submitted | applied | Application submitted | | – (application.submitted) |
| 2 | `under_review` | Under review | screening | Under review | | ✓ |
| 3 | `shortlisted` | Shortlisted | screening | Shortlisted | | ✓ |
| 4 | `assessment_pending` | Assessment pending | assessment | Assessment pending | | ✓ |
| 5 | `assessment_completed` | Assessment completed | assessment | Assessment completed | | – |
| 6 | `interview_scheduled` | Interview scheduled | interview | Interview scheduled | | – (interview.scheduled) |
| 7 | `interview_completed` | Interview completed | interview | Interview completed | | – |
| 8 | `employer_decision_pending` | Employer decision pending | decision | Awaiting employer decision | | – |
| 9 | `selected` | Selected | decision | Selected | | ✓ |
| 10 | `offer_issued` | Offer issued | offer | Offer received | | – (offer.issued) |
| 11 | `offer_accepted` | Offer accepted | offer | Offer accepted | | – |
| 12 | `documentation` | Documentation | pre_joining | Documentation in progress | | ✓ |
| 13 | `mobilisation` | Mobilisation | pre_joining | Preparing for joining | | ✓ |
| 14 | `joined` | Joined | joined | Joined | ✓ | ✓ |
| 15 | `closed` | Closed | closed | Closed | ✓ | ✓ |
| 16 | `rejected` | Rejected | rejected | Not selected | ✓ | ✓ |
| 17 | `withdrawn` | Withdrawn | withdrawn | Withdrawn | ✓ | – |

Every stage has a candidate description and Hindi / Telugu translations (`candidateTranslations`);
**have them reviewed by native speakers**. No SLA is seeded (administrators set `slaDays`).
`applications.status` is derived: joined → `hired`, rejected → `rejected`, withdrawn →
`withdrawn`, closed → `closed`, else `active`.

Pure helpers: `STAGE_KEYS`, `CATEGORY_RANK`, `statusForCategory(category)`, `isFinalStage(stage)`,
`orderedStages`, `findStageByKey`, `firstStageInCategory`, `initialStage`, `resolveStage(stages, key, fallbackCategory?)`,
`isForwardMove(from, to)`, `canTransition(actorType, from, to) → { allowed } | { allowed: false, reason, message }`,
`allowedTargetStages(actorType, from, stages)`, `PIPELINE_COLUMNS`, `pipelineColumnForStage(stage)`,
`dropTargetStage(stages, columnKey)`, `REQUIREMENT_PIPELINE_COLUMNS`, `requirementPipelineColumn(status)`.

### Transition matrix (`canTransition`)

| Actor | May move |
|---|---|
| staff (`recruitment.manage`) | to any active stage, including re-opening rejected / closed / joined — never out of **Withdrawn** (the candidate re-applies instead) |
| employer (`employer.pipeline.manage`, own job, application shared) | from applied / screening / assessment / interview / decision / offer stages to screening, interview, decision, offer or rejected stages — never into **Offer accepted** (candidate action) or anything once pre-joining has started |
| partner | nothing |
| candidate | withdraw only, from any non-final stage |
| system (domain events) | anywhere except staying put |

Rejections need a structured `rejectionReasonCode` (`APPLICATION_REJECTION_REASONS`: job-related only).
Domain events advance stages automatically and only forward (`autoAdvance`): interview scheduled /
completed, offer issued / accepted, mobilisation progress (documentation / mobilisation), joining confirmed.

### Employer pipeline columns (spec 9.5)

`PIPELINE_COLUMNS` (key → default stages → drop target): `screening` (submitted, under_review → under_review),
`shortlisted`, `trade_test` (assessment_*), `client_interview` (interview_*, employer_decision_pending →
interview_scheduled), `selected`, `offer` (offer_issued, offer_accepted → offer_issued), `documentation`,
`mobilisation`, `joined`, `closed` (closed, rejected, withdrawn → rejected). Custom stages map by category.
Requirement-level columns `REQUIREMENT_PIPELINE_COLUMNS`: `new` (submitted, under_review), `approved`,
`sourcing` (sourcing, in_progress, partially_filled).

## Applications (`applications.ts`)

```ts
createApplication(actor: CandidateActor, input: CandidateApplyInput): Promise<CreatedApplication>
createApplication(actor: StaffActor, input: StaffAssignInput): Promise<CreatedApplication>   // recruitment.manage
// CreatedApplication = { id, code, reopened, knockoutFlagCount }
transitionApplication(applicationId, toStageKey, actor: RecruitmentActor, opts?: { internalNote?, candidateVisibleNote?, rejectionReasonCode?, rejectionReason? }): Promise<StageMoveResult>
bulkTransitionApplications(actor, { applicationIds (≤200), toStageKey, ...opts }): Promise<BulkResult[]>   // independent moves
withdrawApplication(actor: CandidateActor, applicationId, { reason? }): Promise<StageMoveResult>
shareApplicationsWithEmployer(staffCtx, applicationIds): Promise<BulkResult[]>     // managed jobs → employer
assignApplicationOwner(staffCtx, { applicationId, assignedToUserId | null }): Promise<void>
updateApplicationReview(actor: HiringActor, { applicationId, rating?: 1-5|null, isShortlisted? }): Promise<void>
createApplicationInTx(tx, origin: ApplicationOrigin, input: ApplicationCoreInput)  // internal; used by partner acceptance
```

Creation rules: the job must be **published and live (a future `publishedAt` means scheduled: refused),
platform-apply, not past its deadline / expiry, its employer not suspended**; **minors** (candidates' `isMinor`:
under 18 by date of birth, or a guardian-consent record) are refused for overseas jobs whoever applies
(`minor_overseas`); one application per job + candidate (`duplicate_application`), except that
a candidate may **re-apply after withdrawing** (the row is reopened with fresh consent, answers and
snapshot); **required screening answers** are enforced for candidate applications only (staff and
partners never answer on a candidate's behalf); knockout rules only **flag** (`knockoutFlags`,
`application_answers.isFlagged`) — never reject; the **profile snapshot** (no identity numbers, DOB,
gender, nationality, contacts) and **resume** are frozen; consent `share_profile_with_employers`
(context `application`) is recorded (staff: `consentMethod` + note; partner: linked to the partner's
consent record); code `VSG-APP-…`; initial stage + history; `jobs.applicationCount` +1 (not on
re-apply). Applications on jobs with an organisation are **shared with the employer at once** unless
the job is Venkat Sai-managed (then staff call `shareApplicationsWithEmployer`). Sharing grants the
employer organisation read access to the resume and the candidate's **shareable** documents
(`file_access_grants`, context `application`); withdrawal revokes them, revokes the organisation's candidate-profile
grants (candidates `revokeOrganizationProfileGrants`) and records consent withdrawal. A candidate's own application
records `application_submitted { jobId }` server-side (`trackServer`) after it commits. `jobs.applicationCount` counts
application rows (one per job + candidate): withdrawing keeps it, re-applying reopens the same row.
Staff / partner applications are refused if the candidate blocked the employer (`candidate_blocked_org`).
Closing an application (rejected / closed / withdrawn) cancels scheduled interviews and withdraws open
offers; withdrawal also cancels a not-yet-joined placement and its mobilisation.

Error codes: `job_unavailable`, `job_closed`, `job_expired`, `external_apply`, `duplicate_application`, `minor_overseas`,
`screening_incomplete` (fieldErrors `answers.<questionId>`), `candidate_inactive`, `candidate_blocked_org`,
`workflow_missing`, `unknown_stage`, transition reasons (`same_stage`, `stage_inactive`, `actor_not_allowed`,
`from_final`, `withdrawn_is_final`, `target_not_allowed`), `not_found`, `forbidden`.

## Read models (`application-queries.ts`)

```ts
listApplicationsForCandidate(actor: CandidateActor, { status?: "open" | "closed" | ApplicationStatus }, page): Promise<Paginated<CandidateApplicationListItem>>
getApplicationForCandidate(actor: CandidateActor, applicationId): Promise<CandidateApplicationDetail>
  // candidate labels + translations, candidate-visible history notes only, answers, interviews, offers (issued+), placement, mobilisation
listApplicationsForJob(actor: HiringActor, jobId, { stageKey?, column?, status?, flaggedOnly?, q? }, page): Promise<Paginated<PipelineCard>>
getPipelineBoard(actor: HiringActor, jobId, { perColumnLimit? = 100 }): Promise<PipelineBoard>   // columns by PIPELINE_COLUMNS, exact counts
getEmployerPipelineOverview(employerCtx): Promise<EmployerPipelineOverview>                      // requirements New/Approved/Sourcing + per-job column counts
listApplicationsForStaff(staffCtx, StaffApplicationFilters, page): Promise<Paginated<ApplicationListItem>>
  // filters: requirementId, jobId, stageKey, status, partnerOrganizationId, source, assignedToUserId, organizationId, sharedWithEmployer, createdFrom/To, q
getApplicationForStaff(staffCtx, applicationId): Promise<StaffApplicationDetail>       // everything incl. history notes, notes, feedback, partner submission
getApplicationForEmployer(employerCtx, applicationId): Promise<EmployerApplicationDetail>
getApplicationStageOptions(actor: HiringActor, applicationId): Promise<{ current, allowed }>
loadCandidateCards(viewer: { kind: "staff" } | { kind: "organization"; organizationId }, candidateIds): Promise<CandidateCard[]>
```

Employers see only **shared** applications of **their own** jobs; partner identity is never shown to
employers (`source` is `"direct"` or `"venkat_sai"`); history notes are shown to an employer only when
written by its own members. Cards never contain contact details; names are masked unless the candidate
shows full names, applied (consent) or was unlocked.

## Internal notes (`notes.ts`)

```ts
addApplicationNote(actor: Staff|Employer|Partner, { applicationId, body, visibility? }): Promise<{ id }>
updateApplicationNote(actor, { noteId, body?, isPinned? }), deleteApplicationNote(actor, noteId)
listApplicationNotes(actor: RecruitmentActor, applicationId): Promise<ApplicationNoteView[]>   // candidates: always []
noteVisibilityFor(kind)
```
Staff write any visibility; employers always write `staff_and_employer`; partners (`partner.candidates.submit`,
credited applications) always write `staff_and_partner`. Notes never reach candidates.

## Talent lists (`talent-lists.ts`) — employer (`employer.candidates.lists`) or staff lists

```ts
createTalentList(actor: HiringActor, TalentListInput): Promise<{ id }>
updateTalentList(actor, UpdateTalentListInput), deleteTalentList(actor, listId)
addCandidatesToList(actor, { listId, candidateIds (≤100), note? }): Promise<BulkResult[]>   // only candidates the org may see
removeCandidateFromList(actor, { listId, candidateId }), updateTalentListItem(actor, { listId, candidateId, note?, stage?, sortOrder? })
listTalentLists(actor, { includeArchived?, jobId? }): Promise<TalentListSummary[]>
getTalentList(actor, listId): Promise<TalentListDetail>          // members the org can no longer see are counted in unavailableCount
getTalentListCompareData(actor, { listId, candidateIds (2–4) }): Promise<TalentCompareRow[]>
```
Private lists are visible to their creator, shared lists to the organisation (or all staff).

## Profile unlocks (`unlocks.ts`)

```ts
unlockCandidate(employerCtx, candidateId, { jobId?, reason? }): Promise<UnlockResult>
  // employer.candidates.unlock, verified org, flag employer.candidate_search, candidate discoverable + not blocked;
  // consumes "candidate_unlocks" (consumeEntitlement), unlock valid 90 days, logDataAccess(reveal), returns contact.
  // Repeat within 90 days: no credit. Candidate already applied to the org: entitledBy "application", no credit.
  // checkEntitlement runs before the transaction (consumeEntitlement re-checks under the ledger lock). Renewing a
  // lapsed / revoked unlock reuses the row and is charged again (ledger reference `<unlockId>:<expiresAt ISO>`).
revealCandidateContact(employerCtx, candidateId): Promise<CandidateContact>            // applied or unlocked; logged
revealCandidateContactForStaff(staffCtx, candidateId, reason): Promise<CandidateContact>  // candidates.view_contact; logged
revokeUnlocksForCandidate(candidateId, { organizationIds?, reason, actorUserId?, tx? }): Promise<number>  // candidates calls it on block; also revokes profile grants
revokeGrantsForLapsedUnlocks(now?, limit?): Promise<number>  // task recruitment.expire_unlocks: profile grants of lapsed unlocks
listUnlocksForOrg(employerCtx, page, { activeOnly? }), listUnlocksForCandidate(candidateActor)
```

## Interviews (`interviews.ts`)

```ts
scheduleInterview(actor: HiringActor, ScheduleInterviewInput): Promise<{ id, code }>
  // { applicationId, roundName, roundNumber?, mode, startsAtLocal "YYYY-MM-DDTHH:mm", timezone (IANA), durationMinutes,
  //   location?, meetingUrl?, candidateInstructions?, participants[{ userId?, name, email?, role }], conductedBy? (staff), skillAssessmentId? (staff) }
rescheduleInterview(actor, RescheduleInterviewInput), cancelInterview(actor, { interviewId, reason })
completeInterview(actor, { interviewId, status: "completed" | "no_show", outcome })
updateInterviewParticipants(actor, { interviewId, participants })
submitInterviewFeedback(actor, { interviewId, rating?, recommendation, scorecard[], strengths?, concerns?, notes? })   // one per author (upsert)
respondToInterview(candidateActor, { interviewId, response: "confirmed" | "declined" | "reschedule_requested", note? })
listInterviewsForCandidate(candidateActor, { upcomingOnly?, applicationId? }): Promise<CandidateInterviewView[]>
listInterviewsForApplication(actor, applicationId), listInterviewsForEmployer(employerCtx, filters, page),
listInterviewsForStaff(staffCtx, filters, page), listInterviewsForPartner(partnerCtx, filters, page), getInterview(actor, interviewId)
sendDueInterviewReminders(now?): Promise<number>     // task
```
Times are stored as UTC + the zone; nothing assumes India time (`timezone.ts`: `zonedLocalToUtc`,
`utcToZonedLocal`, `formatInTimeZone`, `isValidTimeZone`). Panel members with accounts must belong to
the employer (staff: staff or the job's employer). Feedback: staff see all, employers their own org's,
partners none; participants' emails only to organisers. Reminders 24 h and 2 h before (`interview-rules.ts`),
dedupe key includes the scheduled time.

## Offers (`offers.ts`) — staff `recruitment.mobilisation`, employer `employer.offers.manage`

```ts
createOffer(actor, CreateOfferInput): Promise<{ id, code }>         // draft; one open offer per application
updateOffer(actor, UpdateOfferInput)                                 // drafts only
issueOffer(actor, { offerId, expiresAt? })                           // candidate notified (offer.issued); offer letter shared with the candidate
withdrawOffer(actor, { offerId, reason }), reviseOffer(actor, offerId, fields) → new draft superseding the issued one
respondToOffer(candidateActor, { offerId, response: "accept" | "decline", declineReason?, signedOfferFileId? })
  // accept → stage Offer accepted + placement (pending_joining) + mobilisation for overseas jobs → { placementId, mobilisationId }
expireDueOffers(now?): Promise<number>                              // task
listOffersForApplication(actor, applicationId), listOffersForCandidate(candidateActor, { applicationId? }),
listOffersForEmployer(employerCtx, { status? }, page), listOffersForStaff(staffCtx, filters, page)
```
Offer letters: files of purpose `application_attachment` uploaded by the acting user. Candidates never
see drafts, internal notes or withdrawal reasons.

## Placements and mobilisation (`placements.ts`, `mobilisation.ts`, `mobilisation-rules.ts` ✓)

```ts
confirmJoined(actor: HiringActor, { placementId, joinedOn }): Promise<void>   // → Joined (hired); notifies employer, staff, partner
updatePlacement(actor, UpdatePlacementInput)        // staff: status/fee/deadline/notes; employer: only "replacement_required" + reason
linkReplacementPlacement(staffCtx, { placementId, replacesPlacementId })     // replaced placement → completed
startMobilisation(staffCtx, { placementId, destinationCountryCode })          // when none was created automatically
updateMobilisation(staffCtx, UpdateMobilisationInput)   // gated statuses; visa number encrypted (+ last 4); candidate notified
addChecklistItem(staffCtx, …), submitChecklistItem(candidate | partner | staff, { itemId, fileId?, note? }),
reviewChecklistItem(staffCtx, { itemId, decision: verified | rejected | not_applicable | pending, rejectionReason?, notes? })
listPlacementsForStaff, listPlacementsForEmployer, getPlacementForApplication,
getMobilisationForStaff, getMobilisationForPartner, getMobilisationForCandidate, listMobilisationsForStaff
```
Default checklist (`defaultMobilisationChecklist`): passport validity, medical fitness, employment
visa, emigration clearance via eMigrate (required unless the candidate declared ECNR / non-Indian
passport), pre-departure orientation training (PDOT — stored in `pdosCompleted`), signed contract,
travel ticket, insurance (PBBY for ECR workers). Gates (`mobilisationTransitionGate`): booking travel
needs emigration clearance granted / not required, visa approved / issued / not required and a fit
medical; departure needs every required item verified or not applicable. These follow
`docs/research/regulatory-notes.md` and must be confirmed by counsel.

## Partner workflow

```ts
// partner-assignments.ts (staff partners.assign)
createPartnerAssignment(staffCtx, CreateAssignmentInput): Promise<{ id, warnings: AssignmentWarning[] }>
  // verified partner only; requirement open for sourcing / job not closed; notifies the partner (partner.assignment_created);
  // warning "partner_without_verified_recruiting_agent_licence" for overseas targets (audited, not blocking)
updatePartnerAssignment(staffCtx, UpdateAssignmentInput)   // pause/resume/complete/revoke(reason) → partner.assignment_updated

// partner-submissions.ts
submitCandidateByPartner(partnerCtx, assignmentId, { jobId?, candidate: { kind: "new", fullName, email?, phone?, dateOfBirth?, passportNumber?, … } | { kind: "existing", candidateId }, partnerNotes?, consent: { attested: true, method, capturedOn?, evidenceFileId? } }): Promise<SubmissionResult>
withdrawPartnerSubmission(partnerCtx, submissionId)
startSubmissionReview(staffCtx, submissionId)
acceptPartnerSubmission(staffCtx, { submissionId, jobId?, reviewNotes?, partnerFeedback? }): Promise<{ applicationId, applicationCode }>
rejectPartnerSubmission(staffCtx, { submissionId, rejectionReasonCode, partnerFeedback?, reviewNotes? })
reopenDuplicateSubmission(staffCtx, { submissionId, reviewNotes? })
resolveDuplicateFlag(staffCtx, { flagId, status, resolutionNotes? })          // candidates.manage (merging is the candidates module's job)
updateAttribution(staffCtx, { attributionId, status, resolutionNotes })       // partners.manage
expireAttributions(now?)                                                       // task

// partner-queries.ts
listAssignmentsForPartner(partnerCtx, { status? }, page), getAssignmentForPartner(partnerCtx, id), listAssignmentsForStaff(staffCtx, filters, page)
listSubmissionsForPartner(partnerCtx, filters, page), getSubmissionForPartner(partnerCtx, id)
listSubmissionsForStaff(staffCtx, { status?, queue?, partnerOrganizationId?, assignmentId? }, page)   // review queue with duplicate/attribution/privacy hints
getPartnerPerformance({ kind: "partner", ctx } | { kind: "staff", ctx, partnerOrganizationId }, { from?, to? }): Promise<PartnerPerformance>
```

Submission flow: verified partner, active assignment, submission limit, entitlement
`partner_submissions`. A **new person** gets an unclaimed account (`users.status = pending_verification`,
no password, `signupSource = partner_submission`) + a profile (`source = partner`,
`sourcedByPartnerOrgId`, visibility `venkat_sai_only`, partner submissions allowed) and is sent the
mandatory notice `candidate.partner_submission_notice` by email / SMS with the link
`/sign-up?intent=candidate` (signing up with the same email / phone claims the profile — the identity
module reuses pending accounts). An email / phone matching an existing account links to that person
(profile created if they had none). The partner's consent attestation is stored as a consent record
(purpose `partner_submission`, `capturedByUserId` = partner user, evidence incl. the attestation text).
**Duplicate detection** (`matching.ts`): email, phone (same account), passport number (keyed hash),
passport last 4 + DOB, normalised name + DOB → `duplicate_flags` (score 70–100). **Attribution**: first
valid submission wins for the window (setting `recruitment.partner_attribution_days`, default 90, read
from `platform_settings`); a submission of a candidate (or strong look-alike) attributed to another
partner inside the window is marked `duplicate` and cannot be accepted until staff reopen it.
Partners can re-submit only candidates they sourced or submitted before. Withdrawing (or rejecting as
`duplicate`) releases the attribution the submission created. Acceptance creates the application with
`source = partner` and `partnerOrganizationId`. Performance figures are live counts (submitted, unique,
verified profiles, accepted / rejected / duplicates / pending, shortlist / interview / placement /
joined conversion, on-time rate vs. assignment due date, median hours to first submission, and — staff
only — complaint / grievance tickets linked to the partner).

## Notifications sent (`notify` / `notifyOrganization` / `notifyStaff`)

| Event | To | `data` keys |
|---|---|---|
| `application.submitted` | candidate | applicationCode, jobTitle, employerName, submittedBy (`self` / `partner` / `venkat_sai`) |
| `application.received` | employer org (`employer.pipeline.view`) when shared; staff (`recruitment.manage`) for managed jobs | applicationCode, jobTitle, jobCode, source |
| `application.status_changed` | candidate (stage `notifyCandidate`; also offer withdrawn / expired) | applicationCode, jobTitle, employerName, status (candidate label), statusDescription, statusTranslations, message (candidate-visible note) |
| `application.withdrawn` | candidate | applicationCode, jobTitle |
| `interview.scheduled` / `.rescheduled` / `.cancelled` / `.reminder` | candidate (`audience: "candidate"`) and panel (`audience: "panel"`) | interviewCode, applicationCode, jobTitle, employerName, roundName, mode, startsAt, timezone, startsAtLocal, location, meetingUrl, instructions (+ reason / previousStartsAt / reminder) |
| `interview.response_received` **(new)** | organiser + panel (else employer / staff) | interviewCode, applicationCode, jobTitle, response, note, startsAt, timezone |
| `offer.issued` | candidate | offerCode, applicationCode, jobTitle, employerName, expiresAt |
| `offer.responded` | employer (`employer.offers.manage`), staff (`recruitment.mobilisation`) | offerCode, applicationCode, jobTitle, response (`accepted` / `declined` / `expired`) |
| `placement.mobilisation_update` | candidate (status changes, rejected checklist items); staff when a replacement is needed | mobilisationCode, jobTitle, status, statusKey / item, message |
| `placement.joined` | employer, staff (`recruitment.view`), sourcing partner | placementCode, applicationCode, jobTitle, joinedOn |
| `partner.assignment_created` / `partner.assignment_updated` **(new)** | partner (`partner.requirements.view`) | title, requirementCode, jobCode, positionsTarget, dueDate / status, reason |
| `partner.submission_received` **(new)** | staff (`recruitment.manage`) | submissionCode, partnerName, assignmentTitle, duplicate, possibleDuplicates |
| `partner.submission_status_changed` | partner (`partner.submissions.view`) | submissionCode, status, feedback, reason, applicationCode |
| `candidate.partner_submission_notice` **(new, mandatory)** | the submitted person (email / SMS, or user) | partnerName, opportunityTitle, isNewProfile, submissionCode |

Links come from `links.ts` (route contract for portal teams): `/talent/applications/[id]`,
`/talent/interviews`, `/employer/pipeline/[jobId]?application=[id]`, `/employer/interviews`,
`/employer/offers`, `/recruiter/requirements/[assignmentId]`, `/recruiter/submissions/[id]`,
`/admin/pipeline/[applicationId]`, `/admin/interviews`, `/admin/mobilisation/[id]`,
`/admin/partners/[assignmentId]`, `/admin/partners/submissions/[id]`, `/sign-up?intent=candidate`.

## Audit actions

`application.created|reopened|stage_changed|shared_with_employer|owner_assigned|review_updated|note_added|note_updated|note_deleted`,
`interview.scheduled|rescheduled|cancelled|completed|panel_updated|feedback_submitted|candidate_responded`,
`offer.created|updated|issued|withdrawn|accepted|declined|expired`, `placement.created|joined|updated|<status>|replacement_linked`,
`mobilisation.started|updated|status_changed|checklist_item_added|checklist_item_submitted|checklist_item_<decision>`,
`talent_list.created|updated|deleted|candidates_added|candidate_removed`, `candidate.unlocked|unlock_renewed|unlock_revoked`,
`candidate.profile_created`, `user.created_by_partner`, `partner_assignment.created|updated|<status>`,
`partner_submission.created|under_review|accepted|rejected|withdrawn|duplicate_cleared`, `duplicate_flag.<status>`,
`candidate_attribution.updated|expired`. Contact reveals → `data_access_logs` (category `contact`, access `reveal`).

## Background tasks (`tasks.ts`)

- `recruitment.interview_reminders` (every 15 min, in `schedule.ts`): 24 h / 2 h reminders; also enqueues
  the two tasks below once per hour (dedupe key per hour) until they are scheduled on their own.
- `recruitment.expire_offers`: issued offers past `expiresAt` → expired (+ notifications).
- `recruitment.expire_attributions`: active attributions past their window → expired.
- `recruitment.expire_unlocks` (hourly, in `schedule.ts`): unlocks that lapsed in the last 2 days → the organisation's
  candidate-profile file grants are revoked unless a shared application still entitles it (the viewer re-grants on view).

## Server actions (`actions.ts`)

People Portal: `applyToJobAction` (form: `answers:json`, decimal expected salary, consent checkbox),
`withdrawApplicationAction`, `respondToInterviewAction`, `respondToOfferAction`,
`submitChecklistItemAction` (`portal: "talent" | "recruiter" | "admin"`).
Employer + Command Centre (`portal: "employer" | "admin"`): `transitionApplicationAction`,
`bulkTransitionApplicationsAction`, `updateApplicationReviewAction`, `add|update|deleteApplicationNoteAction`
(also `portal: "recruiter"`), `schedule|reschedule|cancel|completeInterviewAction`, `submitInterviewFeedbackAction`,
`updateInterviewParticipantsAction`, `create|update|issue|withdraw|reviseOfferAction`, `confirmJoinedAction`,
`updatePlacementAction`, `create|update|deleteTalentListAction`, `addCandidatesToListAction`,
`removeCandidateFromListAction`, `updateTalentListItemAction`.
Employer: `unlockCandidateAction`, `revealCandidateContactAction`.
Command Centre: `assignCandidateToJobAction`, `shareApplicationsWithEmployerAction`, `assignApplicationOwnerAction`,
`create|updatePartnerAssignmentAction`, `startSubmissionReviewAction`, `accept|rejectPartnerSubmissionAction`,
`reopenDuplicateSubmissionAction`, `resolveDuplicateFlagAction`, `updateAttributionAction`, `startMobilisationAction`,
`updateMobilisationAction`, `addChecklistItemAction`, `reviewChecklistItemAction`, `linkReplacementPlacementAction`,
`revealCandidateContactForStaffAction`.
Partner Portal: `submitCandidateAction`, `withdrawSubmissionAction`.
All return `ActionResult` (`createAction` / `createFormAction`).

## Settings and flags

- `recruitment.partner_attribution_days` (platform_settings, number, default 90; clamped 1–3650) —
  not yet in `src/config/settings.ts`, read directly (`getAttributionWindowDays()`).
- Flag `employer.candidate_search` (unlocks); `commercial.enforce_limits` via the entitlements API.

## Tests

```powershell
npx vitest run src/modules/recruitment      # pure tests always run (57)
node scripts/test-db.mjs vsg_test_recruitment
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_recruitment'; npx vitest run src/modules/recruitment   # + 24 integration tests (81 total)
```
Pure: transition permission matrix, stage → column mapping, default workflow, duplicate matching,
attribution window, screening validation / knockouts, application creation rules, privacy rules,
mobilisation checklist and gates, time-zone conversion (DST), reminder timing. Integration: seed
idempotency; application creation rules (job state, screening, consent, duplicates, re-apply), file
grants, notifications; transition matrix with ownership; reject / reopen; candidate-safe views; note
visibility; pipeline board; managed-job sharing; staff assignment; interviews + reminder dedupe;
unlocks; talent lists; partner assignment / submission / duplicate / attribution window / acceptance /
performance; offer → placement → mobilisation gates → joining; offer expiry; task handlers; remaining
read models (calendars, offer / placement / mobilisation lists, assignment and submission views) and
review actions (reschedule / cancel / complete / feedback, placement updates, reject / withdraw /
reopen submissions, duplicate flags, attribution disputes, partner notes). Fixtures are unique per run,
so the suite can be re-run on the same database.
