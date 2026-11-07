# Organizations module (`src/modules/organizations`)

Employers, recruitment partners and institutions: onboarding, profiles, documents, verification
(approval centre), suspension, members / invitations / custom roles, partner licences, agreements and
territories, employer branches and contracts, institution certificate-issuer authorisation, and the
public employer / institution page queries. Owner: core:orgs-training.

All files are server-only except `constants.ts`, `schemas.ts`, `rules.ts`, `paths.ts` (client-safe).

| File | What it holds |
|---|---|
| `access.ts` | `OrgActor` (member `OrgContext` or `StaffContext`), `authorizeOrg()`, `ORG_PERMISSION` map |
| `service.ts` | create / update organisation, logo, public page toggle, documents, **submitVerification**, staff suspend / reactivate / expire, account manager |
| `verification-decisions.ts` | `applyVerificationDecision()` used by the approval handlers |
| `approval-handlers.ts` | `employer_verification`, `partner_verification`, `institution_verification` |
| `members.ts` | members, invitations (token → HMAC), acceptance, roles (template + custom) |
| `partner.ts` | partner profile, licences (+ staff verification), agreements, territories |
| `employer.ts` | company profile, branches, contracts (staff), `getPublicCompany`, `listPublicCompanies` |
| `institution.ts` | institution profile, certificate-issuer authorisation (staff), `getPublicInstitution`, `isAuthorisedIssuerNow` |
| `queries.ts` | overview / readiness / documents / verification history for a member or staff; staff organisation list |
| `readiness.ts` | loads everything the verification checklist needs |
| `rules.ts` | pure rules (readiness, licence rule, status transitions, expiry, reminders, invitations, role grants) |
| `tasks.ts` | `organizations.verification_expiry` (daily) |
| `actions.ts`, `member-actions.ts`, `partner-actions.ts`, `employer-actions.ts`, `institution-actions.ts` | Server Actions |
| `constants.ts` | client-safe enum mirrors + labels (compile-time parity with the schema) |
| `paths.ts` | portal / admin paths, `invitationPath(token)` |
| `errors.ts` | `forbiddenError`, `notFoundError`, `conflictError`, `invalidStateError`, `validationError`, `pgErrorInfo`, `withConstraintMessages` (also used by training) |

## Authorisation model

Every service takes an actor and re-checks it for the organisation it touches (`authorizeOrg`):

- **Member** (`OrgContext` from `requireOrgMember(type)`): must belong to that organisation and hold the
  per-type permission — profile: `employer.company.manage` / `partner.profile.manage` /
  `institution.profile.manage`; team: `employer.team.manage` / `partner.team.manage` / `institution.team.manage`.
- **Staff** (`StaffContext` from `requireStaff()`): `orgs.view` (read), `orgs.manage` (edit, suspend, members),
  `orgs.verify` (documents, licences, issuer authorisation), `partners.manage` (agreements, territories, notes).

Failures throw `ActionError` with `code`: `forbidden`, `not_found`, `conflict`, `invalid_state`, `validation`
(plus `invitation_<reason>` for acceptance). Actions turn them into `{ ok: false, error }`.

## Public API

### Organisation (`service.ts`)

```ts
createOrganization(type: OrgType, input: OrganizationDetailsInput, owner: { id; status }, opts?: { createdByUserId? }): Promise<OrganizationRow>
updateOrganization(actor: OrgActor, organizationId: string, input: OrganizationDetailsInput): Promise<OrganizationRow>
setOrganizationLogo(actor, organizationId, fileId: string | null): Promise<void>      // purpose org_logo, made public
setOrganizationPublic(actor, organizationId, isPublic: boolean): Promise<void>
addOrganizationDocument(actor, organizationId, input: OrganizationDocumentInput): Promise<OrganizationDocumentRow>  // purpose org_document (or partner_licence for RA licences)
removeOrganizationDocument(actor, documentId): Promise<void>                          // blocked once part of a submitted / approved verification
reviewOrganizationDocument(staff, { documentId, reviewStatus: "accepted" | "rejected", reviewNotes? }): Promise<void>   // orgs.verify
submitVerification(ctx: OrgContext, now?): Promise<{ verificationId; approvalRequestId; approvalCode; renewal }>   // + trackServer("organization_verification_submitted", { orgType, renewal }) after commit
suspendOrganization(staff, organizationId, reason): Promise<void>                     // orgs.manage; cancels open verification requests
reactivateOrganization(staff, organizationId, note?): Promise<OrganizationRow>        // → verified | expired | draft
expireOrganizationVerification(staff, organizationId, reason): Promise<void>          // orgs.manage or orgs.verify
setAccountManager(staff, organizationId, userId | null): Promise<void>
countUserOrganizations(userId, type): Promise<number>
assertCountryExists(tx, code, field?): Promise<void>
```

- `createOrganization`: unique slug, status `draft`, owner membership with the template role `owner` of
  that scope, empty type profile (`company_profiles` / `partner_profiles` / `institution_profiles`), audited.
- `updateOrganization`: while the status is pending / under review / verified / suspended, **members cannot
  change the verified identity fields** (name, legal name, registration number, tax id, country); staff can.

### Verification rules (`rules.ts`, documented here)

`submitVerification` requires `evaluateVerificationReadiness()` to pass:

| Type | Profile fields | Documents (current = not rejected, not expired) |
|---|---|---|
| employer | name, country, city, email or phone | `registration_certificate` |
| recruitment_partner | + business type | `registration_certificate` + the licence rule below |
| institution | + institution kind | `registration_certificate` and (`accreditation` or `affiliation`) |

**Recruitment licence rule.** A partner performs *regulated recruitment* when it recruits workers (business
type `agency` / `staffing`, or the service `candidate_sourcing`) **for employment outside their home country**
(a declared overseas service — `emigration_clearance`, `visa_processing`, `pre_departure_orientation` — or a
placement territory in a country other than the partner's own). Such a partner needs an **active recruitment
licence record**: type `india_recruiting_agent` or `foreign_recruitment_licence`, not deleted / rejected /
expired, inside its validity window. When the partner is based in India or sources from India, it must be an
`india_recruiting_agent` registration (Emigration Act 1983, eMigrate). At submission the licence may still be
pending staff verification; **approval requires it to be verified** (the approval handler refuses otherwise).
A verified partner cannot later declare overseas recruitment services without such a verified licence.

Submission creates an `organization_verifications` row, links all current documents to it, sets the status
to `pending` (a **renewal** of a still-valid verification keeps `verified`), files the approval request
(`employer_verification` / `partner_verification` / `institution_verification`) with a full snapshot
(organisation, profile, documents, licences, territories, readiness) and notifies the organisation
(`org.verification_submitted`).

**Decisions** (`applyVerificationDecision`, inside the approval transaction):

- approved → `verified`, `verifiedAt = now`, `verificationExpiresAt` = earliest expiry of the submission's
  documents (valid through the printed date) and, for partners, verified licences; pending documents become
  accepted. Refused if something already expired or a regulated partner has no verified licence.
- rejected → `rejected` + reason; changes_requested → `draft` + reason (edit and resubmit).
  A renewal of a still-valid verification stays `verified` until it lapses.
- notifies holders of the profile permission (owners / admins included): `org.verification_approved` /
  `_rejected` / `_changes_requested`; audited.

`organization_documents.expiresAt` stores the **printed expiry date at 00:00 UTC**; the document is valid
through that day (`documentLapsesAt()`). Render it with `<DateText dateOnly />`.

### Members, invitations, roles (`members.ts`)

```ts
listMembers(actor, organizationId): Promise<MemberListItem[]>               // team permission or staff orgs.view
listMemberOptions(actor, organizationId): Promise<{ userId; displayName; roleName }[]>   // any member: pickers (no contact details)
listInvitations(actor, organizationId, now?): Promise<InvitationListItem[]>
inviteMember(actor, organizationId, { email, roleId }): Promise<{ invitationId; email; expiresAt }>
resendInvitation(actor, invitationId): Promise<{ expiresAt }>                // rotates the token
revokeInvitation(actor, invitationId): Promise<void>
getInvitationPreview(token, viewer | null, now?): Promise<InvitationPreview>  // for /invite/<token>
acceptInvitation(token, user, now?): Promise<{ organizationId; orgType; organizationName; portalPath; alreadyMember }>
changeMemberRole(actor, memberId, roleId): Promise<void>
setMemberStatus(actor, memberId, "active" | "disabled"): Promise<void>     // also disableMember(actor, memberId) / enableMember(actor, memberId)
updateMemberDetails(actor, { memberId, jobTitle?, department?, branchId? }): Promise<void>
removeMember(actor, memberId): Promise<void>
leaveOrganization(ctx: OrgContext): Promise<void>
transferOwnership(actor, organizationId, toMemberId): Promise<void>
listOrgRoles(actor, organizationId): Promise<OrgRoleItem[]>                  // templates + custom roles, member counts
createOrgRole(actor, organizationId, { name, description?, permissions }): Promise<OrgRoleItem>
updateOrgRole(actor, roleId, input): Promise<void>
deleteOrgRole(actor, roleId): Promise<void>
hashInvitationToken(token): string
```

- **Invitations**: token valid for the `orgs.invitation_ttl_days` setting (default 7, `INVITATION_TTL_DAYS`; clamped
  1–90 by `rules.invitationTtlDays`, read before the transaction), `randomToken(32)`; only `hmacToken(token, "org-invitation")` is stored; the
  link `/invite/<token>` is sent with `notify({ event: "org.invitation", recipients: [{ email }] })`. A second
  invitation to the same address rotates the pending one. The link is a secret: the notifications module strips it
  from the stored dispatch task once the email has been handled (`hasSecretLink`). Verification decisions notify
  the organisation themselves (`org.verification_*`), so the approval handler sets `notifiesSubmitter`. Seats: `checkEntitlement(orgId, "team_seats")`;
  when the plan has a limit, active members + pending invitations must stay within it.
- **Acceptance**: token valid, not expired / cancelled / used; the signed-in user's email must equal the
  invited address (case-insensitive) **and be verified**; the user must be active; suspended organisations
  cannot add members. Reasons: `INVITATION_REJECTION_MESSAGES`.
- **Escalation guards**: only owners grant the owner role; other members may only grant (or create custom
  roles with) permissions they hold, and may only change members whose role they could grant.
  Custom role keys are prefixed `custom-` (never collide with `owner` / `admin`). Permissions must come from
  `PERMISSIONS_BY_SCOPE[type]`.
- **Last owner protection**: the last active owner cannot be demoted, disabled, removed or leave;
  `transferOwnership` makes the target owner and the previous (member) owner an admin.

### Recruitment partners (`partner.ts`)

```ts
getPartnerProfile(actor, orgId): Promise<PartnerProfileView | null>         // internal score / notes only for staff
updatePartnerProfile(actor, orgId, input: PartnerProfileInput): Promise<void>
setPartnerStatusNotes(staff, orgId, notes | null): Promise<void>            // partners.manage
listPartnerLicences(actor, orgId): Promise<PartnerLicenceView[]>
addPartnerLicence(actor, orgId, input: PartnerLicenceInput): Promise<PartnerLicenceRow>   // pending; scan purpose partner_licence
updatePartnerLicence(actor, licenceId, input): Promise<void>                // partner edits / renewals → pending again
deletePartnerLicence(actor, licenceId): Promise<void>                       // partners cannot delete verified licences
verifyPartnerLicence(staff, { licenceId, method, notes? }, now?): Promise<void>   // orgs.verify; needs scan, not expired
rejectPartnerLicence(staff, { licenceId, reason, notes? }): Promise<void>
expirePartnerLicence(staff, { licenceId, notes? }): Promise<void>
listLicencesForReview(staff, { status? }, page): Promise<Paginated<LicenceReviewItem>>
issuePartnerAgreement(staff, orgId, input: PartnerAgreementInput): Promise<PartnerAgreementRow>
issuePartnerAgreementToPartners(staff, input, { organizationIds? }): Promise<{ issued; skipped }>   // default: all verified partners
listPartnerAgreements(actor, orgId): Promise<PartnerAgreementRow[]>
getActivePartnerAgreement(orgId, tx?): Promise<PartnerAgreementRow | null>
acceptPartnerAgreement(ctx, { agreementId, acceptedByName }, { ipHash, userAgent }, now?): Promise<void>
terminatePartnerAgreement(staff, { agreementId, reason }): Promise<void>
listPartnerTerritories(actor, orgId), addPartnerTerritory(actor, orgId, input), updatePartnerTerritory(actor, territoryId, input),
removePartnerTerritory(actor, territoryId), setTerritoryAuthorisation(staff, { territoryId, isAuthorised, notes? })
normalizeLicenceNumber(value): string
```

Agreements are **per-partner rows** (no template table): staff publish a versioned text (sanitised, frozen with
SHA-256) to one partner or to many; an older pending offer is superseded; on acceptance the previously active
agreement is superseded, so exactly one is active (`partner_agreements_one_active_uq`). Evidence: user, typed
name, time, hashed IP, user agent. Licence decisions notify `partner.licence_reviewed`; new offers
`partner.agreement_issued`.

### Employers (`employer.ts`)

```ts
getCompanyProfile(actor, orgId), updateCompanyProfile(actor, orgId, input: CompanyProfileInput)   // aboutHtml sanitised; images purpose org_logo (public)
listBranches(actor, orgId, { includeInactive? }), createBranch(actor, orgId, input), updateBranch(actor, branchId, input),
setBranchActive(actor, branchId, isActive)                                 // one headquarters; deactivated branches lose HQ
listEmployerContracts(actor, orgId)                                        // employer.billing.view / staff orgs.view|commercial.view
createEmployerContract(staff, orgId, input), updateEmployerContract(staff, contractId, input),
activateEmployerContract(staff, contractId), terminateEmployerContract(staff, { contractId, reason })   // orgs.manage
getPublicCompany(slug, now?): Promise<PublicCompany | null>                 // verified (not lapsed) + isPublic only
listPublicCompanies({ q?, countryCode?, hiringRegion?, overseasOnly? }, page, now?): Promise<Paginated<PublicCompanyListItem>>
```

Contract fee amounts are entered as decimals and stored in minor units of the contract currency.

### Institutions (`institution.ts`)

```ts
getInstitutionProfile(actor, orgId, tx?), updateInstitutionProfile(actor, orgId, input)
setCertificateIssuerAuthorisation(staff, { organizationId, authorised, scope?, authorisedUntil?, note? }, now?)   // orgs.verify; org must be verified
isAuthorisedIssuerNow(profile, now?): boolean
getPublicInstitution(slug, now?): Promise<PublicInstitution | null>         // accreditation bodies are labelled "declared"
```

### Queries (`queries.ts`)

```ts
getOrganizationForActor(actor, orgId): Promise<OrganizationRow>
getOrganizationOverview(actor, orgId, now?): Promise<OrganizationOverview>  // org, logo, profile, readiness, latest verification, counts
getVerificationReadiness(actor, orgId): Promise<VerificationReadiness>
listOrganizationDocuments(actor, orgId): Promise<OrganizationDocumentItem[]>
listVerificationHistory(actor, orgId): Promise<VerificationHistoryItem[]>
listOrganizations(staff, { type?, status?, q?, countryCode?, expiringWithinDays? }, page, now?): Promise<Paginated<OrganizationListItem>>
countOrganizationsByStatus(staff): Promise<{ type; status; count }[]>
```

### Server Actions

`actions.ts`: `createOrganizationAction` (redirects to the portal profile), `updateOrganizationAction`,
`staffUpdateOrganizationAction`, `setOrganizationLogoAction`, `setOrganizationPublicAction`,
`addOrganizationDocumentAction`, `removeOrganizationDocumentAction`, `submitVerificationAction`,
`reviewOrganizationDocumentAction`, `suspendOrganizationAction`, `reactivateOrganizationAction`,
`expireOrganizationVerificationAction`, `setAccountManagerAction`.
`member-actions.ts`: `inviteMemberAction`, `staffInviteMemberAction`, `resendInvitationAction`, `revokeInvitationAction`,
`acceptInvitationAction` (redirects to the portal), `changeMemberRoleAction`, `setMemberStatusAction`,
`updateMemberDetailsAction`, `removeMemberAction`, `leaveOrganizationAction`, `transferOwnershipAction`,
`staffSetMemberStatusAction`, `staffTransferOwnershipAction`, `createOrgRoleAction`, `updateOrgRoleAction`, `deleteOrgRoleAction`.
`partner-actions.ts`, `employer-actions.ts`, `institution-actions.ts`: one action per service above.
Portal actions take `orgType` (hidden field) and act on the active organisation of that portal.

## Notifications sent

| Event | To | `data` |
|---|---|---|
| `org.invitation` | invited email | organizationName, organizationType, roleName, inviterName, expiresAt (link `/invite/<token>`) |
| `org.member_added` | team managers | organizationName, memberName, roleName |
| `org.verification_submitted` / `_approved` / `_rejected` / `_changes_requested` | profile managers | organizationName, reason, verificationExpiresAt, stillVerified |
| `org.verification_expiring` | profile managers | subject (`verification` / `licence`), state (`expiring` / `expired`), daysLeft, expiresAt, licenceType, licenceNumber |
| `org.status_changed` *(new)* | all members (dashboard permission) | organizationName, status, reason |
| `partner.licence_reviewed` *(new)* | partner profile managers | licenceType, licenceNumber, decision, reason |
| `partner.agreement_issued` *(new)* | partner profile managers | organizationName, version, title |

## Background task

`organizations.verification_expiry` (daily, `runVerificationExpiry(now?, log?)`): expires lapsed organisation
verifications and verified partner licences, warns 30 and 7 days before (idempotent: org
`metadata.verificationExpiryReminderSentAt`, licence `expiryReminderSentAt`, plus notification dedupe keys),
expires active employer contracts past `endsOn` (not auto-renewing) and active partner agreements past
`effectiveUntil`, and withdraws lapsed certificate-issuer authorisations. Item failures are logged and make the
task retry; completed items are idempotent.

## Invitation page

`src/app/(auth)/invite/[token]/page.tsx` (+ `accept-invitation-form.tsx`, `actions.ts`): shows organisation,
role, inviter and (masked) invited email; signed-out visitors get sign-in / sign-up links with
`returnTo=/invite/<token>`; a different signed-in account can sign out and switch (server action); an
unverified email is sent to `/account`; the accept button calls `acceptInvitationAction`, which switches the
session's active organisation and redirects to the portal. `noindex`, `no-referrer`.

## Tests

```powershell
npx vitest run src/modules/organizations/rules.test.ts
node scripts/test-db.mjs vsg_test_orgs_training
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_orgs_training'; npx vitest run src/modules/organizations
```

- `rules.test.ts` — readiness per type, licence rule, status transitions, expiry and reminder thresholds,
  invitation acceptance rules, role-grant escalation guard.
- `members.integration.test.ts` — token hashing, preview masking, acceptance rules (email match, verified,
  used / expired / cancelled, rotation), seat limit with pending invitations, escalation and last-owner protection.
- `verification.integration.test.ts` — submission, changes requested → resubmit → approved (expiry from the
  document), rejection, renewal kept verified, partner licence gate, suspension / reactivation, identity lock.
- `lifecycle.integration.test.ts` — 30 / 7-day reminders and expiry, licence / contract expiry, one active
  agreement with acceptance evidence, public employer / institution pages.
- `admin.integration.test.ts` — documents, logo, account manager, Command Centre lists, team management, custom
  roles, licence review cycle, territories, bulk agreements, contracts.
- `testing.ts` — fixtures shared with the training integration tests (never imported by app code).
