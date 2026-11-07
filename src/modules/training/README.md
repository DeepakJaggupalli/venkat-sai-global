# Training module (`src/modules/training`)

Courses and syllabuses (Venkat Sai and institutions), course publication approval, batches and
instructors, enrolments with capacity enforcement, attendance, course assessments and results,
certificates (issue / revoke / reissue / public verification), Venkat Sai skill assessments and
assessment centres, campus drives, internship programmes, placement outcomes, the public training
catalogue and the institution dashboard. Owner: core:orgs-training.

All files are server-only except `constants.ts`, `schemas.ts`, `rules.ts`, `types.ts` (client-safe).

| File | What it holds |
|---|---|
| `access.ts` | `TrainingActor` (= `StaffContext` or institution `OrgContext`), scoped loaders (`loadCourseForActor`, `loadBatchForActor`, `loadEnrolmentForActor`) with instructor scoping |
| `candidate.ts` | `CandidateActor`, `getCandidateActor(userId)` (lookup), `requireCandidateActor()` (built on the candidates module's `requireCandidate()`) |
| `courses.ts` | course CRUD, modules, publication (direct for Venkat Sai, approval for institutions), archive / restore / delete, featured |
| `approval-handlers.ts` | `course_publication` decisions |
| `batches.ts` | batches, status transitions, cancellation, instructors, `startDueBatches` |
| `enrolments.ts` | apply / withdraw (candidate), confirm / waitlist / reject / cancel / drop / complete, fees, staff enrolment, `takeSeat` / `releaseSeat` |
| `attendance.ts` | sessions, attendance register, attendance percentage |
| `grading.ts` | course assessments, scores, publishing, final results |
| `certificates.ts` | issuing rules, credentials, revoke / reissue, public verification, expiry |
| `skill-assessments.ts` | Venkat Sai trade / welding / practical tests: schedule, reschedule, cancel, results, publishing |
| `centres.ts` | assessment centres (staff) + public list |
| `campus.ts` | campus drives and registrations (+ consent) |
| `internships.ts` | internship programmes |
| `outcomes.ts` | placement outcomes (self-reported → verified) |
| `queries.ts` | public catalogue, course page, institution dashboard, management lists, candidate views |
| `tasks.ts` | `training.batch_reminders` (daily) |
| `actions.ts`, `candidate-actions.ts`, `staff-actions.ts` | Server Actions |
| `rules.ts` | pure rules: certificate matrix, state machines, seats, attendance, results, verification codes |

## Authorisation model

- **Institution members** (`requireOrgMember("institution")`) act only on records of their institution:
  `institution.courses.manage` (courses, modules), `institution.batches.manage` (batches, instructors, fees),
  `institution.students.manage` (enrolments, attendance), `institution.assessments.manage` (assessments,
  scores, results), `institution.certificates.issue` (certificates), `institution.placements.manage` (drives,
  internships, outcomes), `institution.dashboard` (dashboard). Members **without** `institution.batches.manage`
  (e.g. the Instructor role) can manage students / attendance / scores only for batches they are assigned to
  (`batch_instructors.userId`).
- **Staff** (`requireStaff()`): `training.manage` (Venkat Sai courses — organisation null — batches, centres,
  oversight of every institution record), `training.view` (reads), `training.certificates` (Venkat Sai
  certificates; revoke any certificate), `recruitment.assessments` (skill assessments).
- **Candidates** (`CandidateActor`): only their own enrolments, registrations, assessments, certificates, outcomes.

Errors are `ActionError`s with `code` `forbidden`, `not_found`, `conflict`, `invalid_state`, `validation`, or
`certificate_<reason>` for issuing refusals.

## Public API

### Courses (`courses.ts`)

```ts
createCourse(actor, input: CourseInput): Promise<CourseRow>                       // draft; code CRS; unique slug; sanitised HTML; institutions need the "courses" entitlement
updateCourse(actor, courseId, input): Promise<CourseRow>
submitCourseForPublication(actor, courseId, now?): Promise<{ status; approvalRequestId; approvalCode }>
archiveCourse(actor, courseId), restoreCourse(actor, courseId), deleteCourse(actor, courseId)   // delete only without batches
setCourseFeatured(staff, courseId, isFeatured)
listCourseModules(courseId), addCourseModule(actor, courseId, input), updateCourseModule(actor, moduleId, input),
removeCourseModule(actor, moduleId), reorderCourseModules(actor, courseId, moduleIds)
countPublishedCourses(organizationId | null): Promise<number>
```

Publication: Venkat Sai courses publish directly; institution courses go to the approval centre
(`course_publication`, snapshot incl. modules and a `claimsVenkatSaiAssessment` flag). Requirements: summary or
description, duration, at least one module, a **verified** institution, and for `accredited_external` an
institution currently authorised as a certificate issuer. **Editing a published institution course (or its
modules) sends it back to review** and hides it from the catalogue until approved. Fees: `fixed` needs amount
+ currency (stored in minor units); `free` / `on_request` carry none.

### Batches (`batches.ts`)

```ts
createBatch(actor, courseId, input: BatchInput): Promise<BatchRow>                 // planned; code BAT
updateBatch(actor, batchId, input): Promise<BatchRow>                              // capacity ≥ seats taken
openBatch(actor, batchId)            // planned → open (course must be published); opens as "full" at capacity
pauseBatchEnrolment(actor, batchId)  // open → planned
startBatch(actor, batchId)           // → in_progress; confirmed learners → in_progress
completeBatch(actor, batchId)        // in_progress → completed
cancelBatch(actor, batchId, reason)  // every open enrolment cancelled with the reason, seats released, learners notified
listBatchInstructors(batchId), addBatchInstructor(actor, batchId, input), updateBatchInstructor(actor, id, input), removeBatchInstructor(actor, id)
startDueBatches(now?): Promise<number>
```

Platform instructors must be active members of the institution (staff users for Venkat Sai batches).

### Enrolments (`enrolments.ts`)

```ts
applyToBatch(candidate, batchId, now?): Promise<EnrolmentRow>       // open / full batch of a published course, before the deadline
withdrawEnrolment(candidate, enrolmentId, reason?)                  // → cancelled (in progress → dropped)
confirmEnrolment(actor, id), waitlistEnrolment(actor, id, note?), rejectEnrolment(actor, id, reason),
cancelEnrolment(actor, id, reason), markEnrolmentDropped(actor, id, reason), markEnrolmentInProgress(actor, id),
completeEnrolment(actor, id, result?: { resultStatus?, finalScore? })
updateEnrolmentFee(actor, id, { feeStatus, paymentReference? })     // offline payments / waivers
enrolCandidateByStaff(staff, batchId, candidateId)                  // Venkat Sai batches only; confirmed at once
takeSeat(tx, batchId): Promise<boolean>, releaseSeat(tx, batchId)
```

**Capacity** is enforced by one atomic `UPDATE batches … WHERE enrolled_count < capacity`: PostgreSQL re-checks
the condition after concurrent updates, so concurrent confirmations never exceed the capacity (integration-tested
with 5 parallel confirmations for 2 seats). `enrolledCount` counts confirmed + in progress + completed; an open
batch at capacity becomes `full` and re-opens when a seat is freed. Applications to a full batch are waitlisted
automatically. Re-applying after rejection / cancellation / drop reactivates the same row. The enrolment
snapshots the course fee (`feeStatus` pending for fixed / on-request fees). Applying **shares the candidate's
name, email and phone with the organisation running the batch** — the application form must say so
(`acknowledgeContactSharing`). Notifications: `training.enrolment_received` (institution or staff),
`training.enrolment_confirmed`, `training.enrolment_updated` (waitlisted / declined / cancelled / dropped).

### Attendance and results (`attendance.ts`, `grading.ts`)

```ts
createAttendanceSession(actor, batchId, input), updateAttendanceSession(actor, sessionId, input), deleteAttendanceSession(actor, sessionId)
recordAttendance(actor, sessionId, records: { enrolmentId; status; remarks? }[]): Promise<{ saved }>
getAttendanceRegister(actor, batchId): Promise<{ sessions; records }>
createCourseAssessment(actor, batchId, input), updateCourseAssessment(actor, id, input), deleteCourseAssessment(actor, id)
recordAssessmentScores(actor, assessmentId, scores: { enrolmentId; score?; isAbsent; remarks? }[]): Promise<{ saved }>
publishAssessmentResults(actor, assessmentId)
computeBatchResults(actor, batchId): Promise<{ updated; incomplete }>
setEnrolmentResult(actor, enrolmentId, { resultStatus, finalScore? })
getBatchGradebook(actor, batchId), listPublishedScoresForEnrolment(enrolmentId)
```

Attendance % = (present + late) / sessions not excused. Final score = weighted average of percentages (absent =
0; missing weights share the remainder). Result: passed when every assessment with a pass mark was passed;
`pending` when marks are missing or no assessment has a pass mark (no invented threshold); `not_applicable` for
completion-only courses. Learners see scores only after `publishAssessmentResults`.

### Certificates (`certificates.ts`)

```ts
issueCertificate(actor, input: IssueCertificateInput, now?): Promise<CertificateRow>
issueCertificateInTx(tx, actor, input, now?)                                      // for callers inside a transaction
revokeCertificate(actor, certificateId, reason, now?)
reissueCertificate(actor, certificateId, { reason, title?, description?, expiresOn?, externalCertificateNumber?, fileId? }, now?)
setCertificatePublicVerification(candidate, certificateId, enabled)
verifyCertificateByCode(code, now?): Promise<PublicCertificateVerification>      // rate-limit the caller
listCandidateCertificates(candidate), listCertificates(actor, filters, page)
expireLapsedCertificates(now?), generateVerificationCode(), credentialIssuerTypeFor(issuerType), certificateLapsesAt(expiresAt)
```

**Issuing matrix** (`rules.evaluateCertificateIssue`, unit-tested):

| Issuer type | Who | Source |
|---|---|---|
| `venkat_sai` | staff with `training.certificates` only | a passed Venkat Sai skill assessment, or a completed enrolment in a Venkat Sai course (venkat_sai_assessment → passed; completion_only → completed) |
| `institution_completion` | members of a **verified** institution with `institution.certificates.issue` | completed enrolments in their own course and batch (not for courses with certification "none") |
| `accredited_external` | **only** institutions with a current `isAuthorisedCertificateIssuer` authorisation (+ the permission, verified) | passed enrolments in their own `accredited_external` courses; the course's awarding body is printed |

Venkat Sai results are never issued or worded as accredited qualifications. Each certificate gets a sequential
`code` (CRT) and a separate, unguessable 12-character **verification code** (Crockford base32, 60 bits; shown as
`XXXX-XXXX-XXXX`). Issuing adds a verified `candidate_credentials` row with the **matching issuer type**
(venkat_sai / accredited_external; institution completion certificates → `institution`, read-only on the profile
like Venkat Sai ones), grants the candidate access to an attached certificate file
(purpose `certificate`) and notifies `training.certificate_issued`. Revoking marks the credential rejected and
notifies `training.certificate_revoked`. Public verification returns only holder, title, issuer, wording,
awarding body, dates, status and the printed course / trade details; hidden or unknown codes return
`{ found: false }`. Printed expiry dates are stored at 00:00 UTC and valid through that day.

### Skill assessments and centres (`skill-assessments.ts`, `centres.ts`)

```ts
scheduleSkillAssessment(staff, input): Promise<SkillAssessmentRow>        // recruitment.assessments; code ASM; notifies assessment.scheduled
rescheduleSkillAssessment(staff, input), cancelSkillAssessment(staff, { assessmentId, reason }), markSkillAssessmentNoShow(staff, id)
recordSkillAssessmentResult(staff, input, now?): Promise<{ assessment; certificate | null }>
publishSkillAssessmentResult(staff, id)
listSkillAssessments(staff, filters, page), getSkillAssessment(staff, id), listCandidateSkillAssessments(candidate),
listUpcomingSkillAssessments(from, to), listAssessmentsForApplications(applicationIds)
createAssessmentCentre(staff, input), updateAssessmentCentre(staff, id, input), setAssessmentCentreActive(staff, id, isActive),
deleteAssessmentCentre(staff, id), listAssessmentCentres(staff, opts), listPublicAssessmentCentres()
```

Scheduling validates the candidate, an active centre (or a venue), optional application (must be the
candidate's), requirement, enrolment, skill, assessor (active staff) and retests (chain to a failed / retest
attempt, `attemptNumber + 1`, respecting `retestAvailableFrom`). Recording a **pass** marks the assessed skill
verified on the candidate profile (`candidate_skills` source `assessment`, unless `verifySkill: false`); recording,
correcting and publishing a result then let the candidates module recompute the derived columns
(`recomputeVerificationLevel`: skill caches, and `skills_assessed` once a pass is published or a skill is
assessment-verified — a corrected pass lowers it again). Recording can issue a
`venkat_sai` certificate in the same transaction (`issueCertificate`, needs `training.certificates`). A pass
cannot be corrected while its certificate is active; after revocation the correction removes the skill
verification. Candidates see results only once published; internal notes and evidence are staff-only.
Process / position / standard are free text and never imply an external certification.

### Campus drives, internships, outcomes

```ts
createCampusDrive(actor, input), updateCampusDrive(actor, id, input), setCampusDriveStatus(actor, id, status, reason?)
registerForCampusDrive(candidate, driveId, { consentToShare }, now?), withdrawCampusDriveRegistration(candidate, registrationId)
updateCampusRegistrationStatus(actor, registrationId, status)
listCampusDrives(actor, filters, page), listDriveRegistrations(actor, driveId), listPublicCampusDrives(page, now?), listCandidateCampusRegistrations(candidate)
createInternship(actor, input), updateInternship(actor, id, input), setInternshipStatus(actor, id, status), listInternships(actor, filters, page), listPublicInternships(page)
recordPlacementOutcome(actor, input), updatePlacementOutcome(actor, id, input), deletePlacementOutcome(actor, id)
verifyPlacementOutcome(staff, id, verified), confirmPlacementOutcome(candidate, id), listPlacementOutcomes(actor, filters, page), listCandidatePlacementOutcomes(candidate)
```

Drives: public listing and linked employers require verified organisations; private institution drives accept
only the institution's learners; capacity checked under a row lock; registering for a drive with an employer
records `share_profile_with_employers` consent (withdrawal records the opposite). Outcomes: institutions report
only their own learners (enrolment or drive registration); rows stay self-reported until staff verify them
against evidence (required); only verified rows may feed public figures.

### Queries (`queries.ts`)

```ts
listPublicCourses(filters: CatalogueFilters, page, now?): Promise<Paginated<CatalogueCourse>>   // published, Venkat Sai or verified institutions, next open batch
getPublicCourse(slug, now?): Promise<PublicCourseDetail | null>
getInstitutionDashboardStats(ctx, now?): Promise<InstitutionDashboardStats>                       // live counts only
listCourses(actor, filters, page), getCourseForActor(actor, courseId)                            // + latest publication decision
listBatches(actor, filters, page), getBatchForActor(actor, batchId), listBatchEnrolments(actor, batchId, filters?)
listCandidateEnrolments(candidate), getTrainingOverview(staff)
```

### Server Actions

`actions.ts` (management; field `via: "institution" | "admin"`, default institution): course, module, batch,
instructor, enrolment, attendance, assessment, score, result, certificate, drive, internship and outcome actions
(`createCourseAction`, `submitCourseAction`, `setBatchStatusAction`, `confirmEnrolmentAction`,
`decideEnrolmentAction`, `recordAttendanceAction` (`records:json`), `recordAssessmentScoresAction` (`scores:json`),
`issueCertificateAction`, `revokeCertificateAction`, …). `candidate-actions.ts`: `applyToBatchAction` (feature flag
`talent.training`, rate-limited), `withdrawEnrolmentAction`, `registerForCampusDriveAction`,
`withdrawCampusDriveRegistrationAction`, `confirmPlacementOutcomeAction`, `setCertificatePublicVerificationAction`,
`verifyCertificateAction` (public, rate-limited per IP). `staff-actions.ts`: skill assessments, centres, staff
enrolment, outcome verification, featured courses.

## Notifications sent

| Event | To | `data` |
|---|---|---|
| `training.enrolment_received` *(new)* | institution (students.manage) or staff (training.manage) | courseTitle, batchTitle, batchCode, candidateName, status |
| `training.enrolment_confirmed` | candidate | courseTitle, batchTitle, batchCode, startsOn, venue, mode |
| `training.enrolment_updated` *(new)* | candidate | status, statusLabel, reason, batch fields |
| `training.batch_starting` | confirmed learners (≤ 3 days before) | courseTitle, batchTitle, batchCode, startsOn, schedule, venue, mode |
| `training.certificate_issued` | candidate | title, issuerName, certificateCode, verificationCode |
| `training.certificate_revoked` *(new)* | candidate | title, certificateCode, reason |
| `assessment.scheduled` | candidate | code, trade, assessmentType, scheduledAt, timezone, centreName, address, location, instructions, rescheduled |
| `assessment.cancelled` *(new)* | candidate | code, trade, scheduledAt, reason |
| `assessment.result` | candidate (when published) | code, trade, result |
| `assessment.reminder` *(new)* | candidate (≤ 48 h before) | kind, code / title, scheduledAt |
| `approval.decided` | course submitter | sent by the approvals service |

## Background task

`training.batch_reminders` (daily, `runBatchReminders(now?)`): starts batches whose start date arrived, reminds
confirmed learners of batches starting within 3 days, reminds candidates of skill / course assessments within 48
hours (dedupe keys per learner and date) and expires certificates past their printed expiry date.

## Tests

```powershell
npx vitest run src/modules/training/rules.test.ts
node scripts/test-db.mjs vsg_test_orgs_training
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_orgs_training'; npx vitest run src/modules/training
```

`rules.test.ts` (issuing matrix, state machines, results), `enrolments.integration.test.ts` (capacity race,
waitlist, withdrawal, scoping, batch cancellation, re-review on edit), `certificates.integration.test.ts`
(issuing rules end to end, credentials, public check, revocation, skill assessment pass → verified skill +
certificate), `catalogue.integration.test.ts` (catalogue, dashboard, attendance, grading, drives, internships,
outcomes, daily task), `management.integration.test.ts` (Venkat Sai courses / modules / batches / instructors,
attendance and assessment edits, reissue, centres, skill assessment lifecycle, drives with consent, verified
outcomes).
