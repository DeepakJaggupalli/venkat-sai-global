# Operations module (`src/modules/operations`)

The service layer for Venkat Sai's day-to-day operations: the CRM (leads, public enquiries), workforce
requirement requests (public form + Employer Portal + staff processing + approval decisions), the helpdesk
(support tickets, grievances, SLA watch), internal tasks and notes, and message threads between staff and
organisations / candidates. Server-only except `constants.ts`, `schemas.ts`, `types.ts`, `links.ts`, `sla.ts`
and `thread-access.ts` (client-safe).

| File | Contents |
|---|---|
| `constants.ts` | Labels, value lists and state machines (`*_TRANSITIONS`, `canTransition`) |
| `schemas.ts` | Zod schemas for every form / action (public forms carry the honeypot `website`) |
| `links.ts` | Route contract for operations pages (`staffLeadHref`, `requesterTicketHref`, `threadHrefFor`, …) |
| `sla.ts` | Pure SLA rules (`computeTicketSla`, `evaluateSla`, `escalationLevelFor`) |
| `thread-access.ts` | Pure thread access rules (`threadAccess`) |
| `leads.ts` / `leads-queries.ts` | CRM pipeline |
| `enquiries.ts` / `enquiries-queries.ts` | Public contact form + staff processing |
| `requirements.ts` / `requirements-queries.ts` / `requirement-decisions.ts` / `requirement-notify.ts` | Workforce requirements |
| `support.ts` / `support-queries.ts` | Helpdesk, grievances, SLA watch |
| `work.ts` / `work-queries.ts` | Internal tasks, internal notes, reminders |
| `threads.ts` / `threads-queries.ts` | Message threads |
| `entities.ts` | Existence / organisation-ownership checks for polymorphic references |
| `service.ts`, `queries.ts` | Barrels of the write and read API |
| `actions.ts`, `admin-actions.ts` | Server Actions (public / requester / employer / participants; Command Centre) |
| `tasks.ts`, `approval-handlers.ts` | Background tasks, approval decisions |

## Authorisation summary

| Area | Reads | Writes |
|---|---|---|
| Leads | `leads.view` | `leads.manage` (assignees need `leads.view`; conversion also `orgs.view`) |
| Enquiries | `leads.view` (grievance enquiries only with `support.grievances`) | `leads.manage`; converting to a ticket also `support.manage` |
| Requirements (staff) | `requirements.view` | `requirements.manage` (owners need `requirements.manage`); approval via the approval centre (`approvals.decide` + `requirements.manage`) |
| Requirements (employer) | `OrgContext<"employer">`, scoped to `ctx.organization.id`, never `internalNotes` / IP hash / lead / owner | `employer.requirements.manage`; suspended organisations cannot submit; flag `employer.bulk_requirements` |
| Tickets (staff) | `support.view` (grievances `support.grievances`) | `support.manage` (+ `support.grievances` for grievances) |
| Tickets (requester) | own tickets only (`requesterUserId`), internal notes never selected | own tickets only |
| Tasks | any staff member | creator, assignee or super admin |
| Notes | staff: entity permission (`ENTITY_STAFF_PERMISSION`); org members: their organisation's `org_internal` notes on records their organisation is party to | same; edit = author; delete = author / super admin / org owner |
| Threads | `thread-access.ts` (participants; staff with the context permission; members of the thread's organisation with the portal permission — partners need `partner.messages`) | same; only staff reopen threads, add / remove participants or hide messages |

Every service re-checks the actor it receives, scopes queries, uses a transaction for multi-row writes and
writes `audit()` entries (no message bodies in metadata). Internal helpers that take no actor
(`findOrCreateInboundLead`, `insertTicket`, `loadRequirementLines`, `leadsWithDueFollowUps`) are not part of
the barrels and must only be called from this module's own services.

## Public API

### Leads (`service.ts` / `queries.ts`)

```ts
createLead(ctx: StaffContext, input: LeadCreateInput): Promise<{ id; code }>
updateLead(ctx, input: LeadUpdateInput): Promise<void>
assignLead(ctx, id, assigneeUserId | null): Promise<void>                       // notifies work.assigned
changeLeadStatus(ctx, id, status, { lostReason? }): Promise<void>                // LEAD_TRANSITIONS; lost needs a reason
recordLeadFollowUp(ctx, id, { note?, contactedAt?, nextFollowUpAt? }): Promise<void>  // new → contacted; note kept as staff note
convertLead(ctx, id, organizationId): Promise<void>                              // type must match; status won
listLeads(ctx, filters: LeadListFilters, page): Promise<Paginated<LeadListItem>>
getLead(ctx, id): Promise<LeadDetail | null>
leadPipelineCounts(ctx, { assignedTo? }?): Promise<Record<LeadStatus, number>>
```

### Enquiries

```ts
submitPublicEnquiry(input: PublicEnquiryInput, meta: { ipHash; userId? }): Promise<{ accepted: true; code: string | null }>
assignEnquiry(ctx, id, assigneeUserId | null): Promise<void>
setEnquiryStatus(ctx, id, status, { note? }): Promise<void>                      // ENQUIRY_TRANSITIONS
respondToEnquiry(ctx, id, note): Promise<void>                                   // records the response (status responded)
markEnquirySpam(ctx, id): Promise<void>
closeEnquiry(ctx, id, note?): Promise<void>
convertEnquiryToTicket(ctx, id): Promise<{ ticketId; code }>
linkEnquiryToLead(ctx, id, leadId | null): Promise<{ leadId }>                   // null = create a lead from it
listEnquiries(ctx, filters, page), getEnquiry(ctx, id), enquiryCounts(ctx)
```

Public form controls: honeypot `website` (dropped silently, `form_honeypot_triggered` security event, code
`null`), rate limits per IP hash (5 / 10 min, 20 / day), email and phone (5 / hour), consent to be contacted
required, privacy notice version stored. Employer / partner / institution enquiries create or attach an open
lead of that type (matched by email or phone). Grievance enquiries become grievance tickets immediately.
Staff with `leads.view` get `enquiry.received` (grievances: `support.grievances`); the sender gets the
acknowledgement by email (SMS for phone-only senders).

### Workforce requirements

```ts
submitPublicRequirement(input: PublicRequirementInput, meta): Promise<{ accepted: true; code: string | null }>
submitEmployerRequirement(ctx: OrgContext<"employer">, input: EmployerRequirementInput): Promise<{ id; code; status }>  // asDraft
updateEmployerRequirement(ctx, id, input): Promise<{ status }>                  // drafts only; asDraft:false resubmits
submitEmployerRequirementDraft(ctx, id): Promise<void>
cancelEmployerRequirement(ctx, id, reason): Promise<void>                        // cancels open approvals
changeRequirementStatus(ctx: StaffContext, id, status, { reason? }): Promise<void>   // REQUIREMENT_STAFF_TRANSITIONS
assignRequirementOwner(ctx, id, userId | null), setRequirementQuotation(ctx, id, { amount, currency } | null)
updateRequirementDetails(ctx, input), setRequirementInternalNotes(ctx, id, notes)
upsertRequirementLine(ctx, requirementId, line), removeRequirementLine(ctx, lineId)
linkRequirementLineToJob(ctx, lineId, jobId | null), setRequirementLineFilled(ctx, lineId, filledCount)
listRequirements(ctx, filters, page), getRequirement(ctx, id), requirementStatusCounts(ctx)
listOrgRequirements(ctx: OrgContext<"employer">, { status? }, page), getOrgRequirement(ctx, id)
applyRequirementDecision({ request, decision, reason, actorUserId, tx })        // approval handler body
```

Employer submissions (not drafts) first check `checkEntitlement(orgId, "bulk_requirements")` before the transaction
(`entitlement_exhausted` with the plan's reason). Conversions are recorded server-side after the commit:
`requirement_submitted { kind }` (public form and employer submissions), `employer_enquiry_submitted { formId }`
(enquiry type employer) and `contact_form_submitted { formId, enquiryType }` (every other enquiry type).
The approval handler sets `notifiesSubmitter` (every decision sends `requirement.status_changed`).

Flow: submitted requirements go to the approval centre (`requirement_request`, priority from urgency) and staff
with `requirements.view` get `requirement.received` (the owner only, once assigned); the submitter gets an
acknowledgement. Decisions: approved → `approved`; rejected → `cancelled` (reason); changes requested →
`draft` for employer submissions (edit + resubmit reopens the same approval request) or `on_hold` for public
ones (staff move it back to `under_review`, which returns it to the approval centre). Approval is the only
way into the delivery stages; every status change notifies the employer (organisation members with
`employer.requirements.manage`, or the public contact) with `requirement.status_changed`. Money is stored in
minor units with the chosen currency (`toMinorUnits`). Public form rate limits: 3 / hour and 10 / day per IP
hash, 3 / hour per email.

### Support tickets

```ts
createSupportTicket(requester: { kind: "user"; user; portal; organizationId? } | { kind: "guest"; name; email; phone?; locale?; ipHash }, input): Promise<{ id; code; grievanceCode }>
createTicketForRequester(ctx: StaffContext, input: StaffTicketInput)            // phone / email / walk-in
replyToOwnTicket(user, ticketId, { body, attachmentFileIds? }), closeOwnTicket(user, ticketId), rateOwnTicket(user, ticketId, { rating, comment? })
replyToTicket(ctx, ticketId, { body, attachmentFileIds?, internal?, status? })   // internal notes never reach requesters
assignTicket(ctx, ticketId, userId | null), changeTicketStatus(ctx, ticketId, status, { resolution? })
setTicketPriority(ctx, ticketId, priority), escalateTicket(ctx, ticketId, { note, assigneeUserId? })
markTicketAsGrievance(ctx, ticketId, grievanceType), setTicketTags(ctx, ticketId, tags)
runSlaWatch(now?): Promise<SlaWatchSummary>
listMyTickets(user, { status?, organizationId? }, page), getMyTicket(user, ticketId)       // requester-safe
listTickets(ctx, filters, page), getTicket(ctx, ticketId), ticketQueueCounts(ctx), countOpenTicketsPastDue(now?)
```

- SLA: first response = `support.sla_hours_<priority>`; grievances (`category = grievance` or a grievance type)
  get a GRV register code, at least high priority, acknowledgement within `privacy.grievance_ack_hours` (or the
  shorter priority SLA) and resolution within `privacy.grievance_resolution_days` or the statutory timeline
  (content removal 72 h, impersonation / intimate content 24 h). Regular tickets have no resolution deadline.
- The first public staff reply stamps `firstRespondedAt`, assigns the ticket to the replier when unassigned and
  moves it to "awaiting your reply"; requester replies move it to "awaiting support" (a resolved ticket reopens;
  closed ones cannot be replied to). Resolving needs a resolution summary. Ratings only after resolution.
- Attachments (`ticket_attachment` files owned by the author) are validated; staff attachments on public replies
  are shared with the requester's account (`grantFileAccess`); guests cannot receive attachments.
- Notifications: `support.ticket_created` (requester; staff in-app, grievance officers also by email),
  `support.ticket_reply` (both directions), `support.ticket_resolved`, `work.assigned`, `support.sla_breached`.
- Guest form: honeypot, rate limits per IP hash and email (5 / hour), guest categories only, consent required.

### Internal tasks and notes

```ts
createStaffTask(ctx, input), updateStaffTask(ctx, input), assignStaffTask(ctx, id, userId | null)
setStaffTaskStatus(ctx, id, status), completeStaffTask(ctx, id)
listStaffTasks(ctx, { scope?: "mine" | "created" | "all", status?, priority?, due?, relatedType?, relatedId?, organizationId? }, page)
getStaffTask(ctx, id), myTaskCounts(ctx)
addInternalNote(actor: { kind: "staff"; ctx } | { kind: "org"; ctx }, input), updateInternalNote(actor, id, { body?, pinned? })
deleteInternalNote(actor, id), listInternalNotes(actor, entityType, entityId)
runOperationsReminders(now?): Promise<{ tasks; leads }>
```

### Message threads

```ts
type ThreadActor = { kind: "staff"; ctx: StaffContext } | { kind: "org"; ctx: OrgContext } | { kind: "user"; user: SessionUser };
createThread(actor, input: ThreadCreateInput): Promise<{ id }>                   // staff or org members; candidates use tickets
postThreadMessage(actor, threadId, { body, attachmentFileIds? }): Promise<{ id }>
markThreadRead(actor, threadId), setThreadMuted(actor, threadId, muted), setThreadStatus(actor, threadId, status)
addThreadParticipant(ctx, threadId, userId), removeThreadParticipant(ctx, threadId, userId), hideThreadMessage(ctx, messageId)
listThreads(actor, { status?, contextType?, contextId?, unreadOnly? }, page): Promise<Paginated<ThreadListItem>>   // unreadCount per thread
getThread(actor, threadId): Promise<ThreadDetail | null>
unreadThreadCount(actor): Promise<number>, listThreadsForContext(actor, contextType, contextId)
```

Contexts: general, requirement, partner_assignment, partner_submission, application, placement, organization.
Staff threads with an organisation must use a record that organisation is party to; organisation members can
only use their own records. New messages notify active, unmuted participants (`message.received`, link per
capacity); until someone from the counterpart organisation or the staff side has joined, the eligible members
/ staff with the context permission are notified. Attachments (`message_attachment`) are shared with the
thread's organisation and individual participants.

### Server Actions

`actions.ts`: `submitEnquiryAction`, `submitRequirementAction`, `createGuestTicketAction`,
`createSupportTicketAction` (form `portal` — organisation portals attach the active organisation),
`replyToMyTicketAction`, `closeMyTicketAction`, `rateMyTicketAction`, `submitEmployerRequirementAction`,
`updateEmployerRequirementAction`, `submitEmployerRequirementDraftAction`, `cancelEmployerRequirementAction`,
`createThreadAction`, `postThreadMessageAction`, `markThreadReadAction`, `setThreadMutedAction`,
`setThreadStatusAction`, `addInternalNoteAction`, `updateInternalNoteAction`, `deleteInternalNoteAction`
(thread / note actions take `portal: "admin" | "employer" | "recruiter" | "institution" | "talent"` to pick the
guard). Forms post arrays as `name[]` and nested data as `lines:json` / `line:json`.

`admin-actions.ts` (Command Centre): leads (`createLeadAction`, `updateLeadAction`, `assignLeadAction`,
`changeLeadStatusAction`, `recordLeadFollowUpAction`, `convertLeadAction`), enquiries (`assignEnquiryAction`,
`setEnquiryStatusAction`, `respondToEnquiryAction`, `markEnquirySpamAction`, `convertEnquiryToTicketAction`,
`linkEnquiryToLeadAction`), requirements (`changeRequirementStatusAction`, `assignRequirementOwnerAction`,
`setRequirementQuotationAction`, `updateRequirementDetailsAction`, `setRequirementInternalNotesAction`,
`upsertRequirementLineAction`, `removeRequirementLineAction`, `linkRequirementLineToJobAction`,
`setRequirementLineFilledAction`), tickets (`createTicketForRequesterAction`, `staffReplyToTicketAction`,
`assignTicketAction`, `changeTicketStatusAction`, `setTicketPriorityAction`, `escalateTicketAction`,
`markTicketAsGrievanceAction`, `setTicketTagsAction`), tasks (`createStaffTaskAction`, `updateStaffTaskAction`,
`assignStaffTaskAction`, `setStaffTaskStatusAction`), threads (`addThreadParticipantAction`,
`removeThreadParticipantAction`, `hideThreadMessageAction`).

## Routes linked from notifications (`links.ts`)

`/admin/leads/[id]`, `/admin/leads/enquiries/[id]`, `/admin/requirements/[id]`, `/admin/support/[id]`,
`/admin/messages/[id]`, `/admin/tasks`, `/employer/requirements/[id]`, `/<portal>/support/[id]`,
`/<portal>/messages/[id]` (employer, recruiter, institution, talent). Portal teams implement these pages.

## Background tasks (`tasks.ts`)

| Task | Schedule | What it does |
|---|---|---|
| `support.sla_watch` | hourly (in `schedule.ts`) | stamps `slaBreachedAt` once, escalates grievances (level 1 missed acknowledgement, 2 missed resolution, priority urgent, internal system note), notifies the assignee (or the support team) about deadlines due within 2 hours or missed, and grievance officers about missed grievance deadlines — all with dedupe keys |
| `operations.reminders` | needs a schedule entry (see below) | task-due reminders (once per due time, `reminderSentAt`) and lead follow-up reminders (dedupe per follow-up time) |

## Approval handler

`requirement_request` → `applyRequirementDecision` (see the flow above); `adminHref` → `/admin/requirements/[id]`.

## Tests

```powershell
npx vitest run src/modules/operations        # pure: SLA, thread access, enums / state machines, form schemas
node scripts/test-db.mjs vsg_test_opsnotif
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_opsnotif'; npx vitest run src/modules/operations
```

`operations.integration.test.ts`: enquiry spam controls (honeypot, IP and email rate limits, consent), lead
creation / attachment, staff + sender notifications, grievance tickets; public and employer requirements through
approval decisions, employer scoping without internal notes, change requests and resubmission, cancellation;
ticket lifecycle with internal notes hidden from requesters, attachments shared, guest + grievance permissions,
SLA watch (breach once, escalation, no repeated notifications); thread access across organisations, candidates
and partner permissions with unread counts; notes visibility; lead pipeline; task reminders sent once.

## Send your CV: documents and packs

- `cv-submissions.ts`: public `submitCvSubmission` (returns a 2-hour `uploadToken`), staff list/detail/status/remarks,
  `listCvSubmissionsForExport` (Excel rows).
- `cv-submission-documents.ts`: one-file-per-request documents (`cv_submission_documents`, file purpose
  `cv_submission_document`): `addCvSubmissionDocument` (candidate via signed link, rate limited; or staff with
  candidates.manage), `listCvSubmissionDocuments`, `moveCvSubmissionDocument`, `deleteCvSubmissionDocument`,
  `issueCvDocumentUploadLink` (fresh 7-day link), `resolveCvDocumentLink`, `listDocumentsForLink`.
  Single kinds (passport cover / first / last page, photo) replace the previous file.
- `cv-document-tokens.ts`: HMAC upload tokens (`src/lib/signed-token.ts`, purpose `cv_submission_documents`).
- `cv-pack.ts`: `buildCvSubmissionPack(ctx, id, "cv" | "visa")` — resume (generated resume from the resume service when
  present), certificates, licences, other, passport cover, first page, last page, photo; logged download.

## Open items

- `operations.reminders` needs `{ type: "operations.reminders", everyMinutes: 30 }` in `src/server/tasks/schedule.ts`.
- Pages for `/admin/messages/[id]`, `/admin/tasks`, `/institution/messages/[id]`, `/talent/messages/[id]` are not in
  the navigation contract yet.
- No setting exists for regular-ticket resolution targets or auto-closing tickets awaiting the requester; only
  grievances get a resolution deadline today.
