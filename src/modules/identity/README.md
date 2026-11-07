# Identity module (`src/modules/identity`)

Authentication, sessions, authorisation guards, consent ledger, account security and identity
flows for every person on Venkat Sai Global (candidates, organisation members and staff).
All files are server-only except `types.ts`, `schemas.ts` and `redirects.ts` (client-safe).

| File | What it holds |
|---|---|
| `session.ts` | Database sessions + cookie, `requireUser`, current user/session |
| `authz.ts` | Staff / organisation guards, permissions, portal access |
| `consent.ts` | Append-only consent ledger |
| `password.ts` | argon2id hashing and the password policy |
| `otp.ts` | One-time codes and single-use link tokens (`verification_tokens`) |
| `totp.ts` | TOTP (authenticator apps) and recovery codes |
| `google.ts` | Google OAuth/OIDC helpers (PKCE, state, nonce, ID-token claim checks, token exchange) |
| `service.ts` | **Public write API** (barrel over `registration.ts`, `sign-in.ts`, `password-reset.ts`, `account.ts`, `two-factor.ts`, `google-sign-in.ts`, `login.ts`) |
| `queries.ts` | Read models for `/account` and `/account/security` |
| `actions.ts` | Server Actions used by the auth screens and account pages |
| `flow.ts` | Encrypted short-lived cookie for multi-step flows (`/verify`, SMS reset) |
| `redirects.ts` | Post-auth destination rules (pure) |
| `errors.ts` | `AuthError` with translatable codes (`errors.<code>` in the `auth` namespace) |
| `messages.ts` | Localised code / reset-link e-mails and SMS |
| `tasks.ts`, `maintenance.ts` | Background task `identity.cleanup` |

## Routes and pages (owned by this module)

| Route | Purpose |
|---|---|
| `/sign-in` | Password / one-time-code tabs, Google button. Query: `returnTo`, `intent`, `reset=1`, `signedOut=1`, `error=<code>` |
| `/sign-in/two-factor` | TOTP or recovery-code challenge (`returnTo`) |
| `/sign-up` | Registration. Query: `intent=candidate\|employer\|partner\|institution`, `returnTo` |
| `/verify` | Code entry for sign-up / code sign-in (resend with cooldown) |
| `/forgot-password`, `/reset-password` | Reset by e-mailed link (`?token=`) or SMS code |
| `POST /sign-out` | Ends the current session (same-origin only), 303 → `/`. Use `<form action="/sign-out" method="post">` |
| `GET /auth/google`, `GET /auth/google/callback` | Google sign-in / connect (`mode=link`) |
| `/account`, `/account/security` | Profile, contacts; password, 2FA, connected accounts, sessions. Honours `?require=2fa&returnTo=` |

## Sessions — `session.ts`

```ts
createSession(userId, { isStaff, twoFactorVerified?, pendingTwoFactor? }): Promise<{ id, expiresAt }>
getCurrentSession(): Promise<CurrentSession | null>          // memoised; { session, user, needsTwoFactor }
getCurrentUser(): Promise<SessionUser | null>                 // null while the TOTP challenge is pending
requireUser({ returnTo? }?): Promise<SessionUser>             // → /sign-in or /sign-in/two-factor
markSessionTwoFactorVerified(sessionId, { isStaff? }?): Promise<Date | null>   // returns new expiry when isStaff given
refreshSessionCookieExpiry(expiresAt): Promise<void>
setActiveOrganization(sessionId, orgType, organizationId): Promise<void>
invalidateCurrentSession(): Promise<void>                     // sign out this device (deletes cookie correctly for __Host-)
invalidateSession(sessionId), invalidateUserSessions(userId, { exceptSessionId? })
listUserSessions(userId): Promise<UserSessionRow[]>
deleteExpiredSessions(): Promise<number>, hasTwoFactor(userId): Promise<boolean>
currentPathForReturn(): Promise<string>
SESSION_COOKIE, SESSION_TTL_MS (30 d, sliding), STAFF_SESSION_TTL_MS (12 h), PENDING_TWO_FACTOR_TTL_MS (15 min)
```

Sessions waiting for the second factor are short-lived (15 minutes) and never slide; completing the
challenge restores the normal lifetime and re-issues the cookie.

## Authorisation — `authz.ts`

`requireStaff(permission?, mode?)`, `getStaffContext()`, `staffCan(ctx, permission, mode?)`,
`requireOrgMember(orgType, permission?, mode?)`, `getOrgContext(orgType)`, `orgCan(ctx, permission, mode?)`,
`listUserMemberships(userId): Promise<UserMembership[]>`, `getPortalAccess(user)`, `portalHomePath(access)`,
`PORTAL_BASE_PATH`, `PORTAL_ONBOARDING_PATH`. When `security.require_staff_2fa` is on, `requireStaff`
sends staff without TOTP to `/account/security?require=2fa&returnTo=…` (handled by this module).

## Consent — `consent.ts`

`recordConsent(input, tx?)`, `recordConsents(base, choices, tx?)`, `getConsentState(userId, purposes?)`,
`hasConsent(userId, purpose)`, `listConsentHistory(userId)`.

## Passwords — `password.ts`

```ts
hashPassword(password): Promise<string>                       // argon2id, NFKC-normalised
verifyPassword(hash, password): Promise<boolean>              // never throws
verifyPasswordAgainstDummy(password): Promise<false>          // equal timing when there is no account
checkPasswordStrength(password, { email?, name? }): Promise<PasswordCheck>   // uses security.password_min_length
evaluatePasswordStrength(password, { minLength, email?, name? }): PasswordCheck  // pure
// PasswordCheck = { ok: true } | { ok: false, code: "short"|"long"|"common"|"variety"|"email"|"name", message, minLength }
```

## One-time codes and link tokens — `otp.ts`

```ts
issueOtp({ purpose, channel: "email"|"sms", target, userId?, locale?, metadata? }, { now?, deliver? }?): Promise<{ tokenId, expiresAt, resendAvailableAt }>
verifyOtp({ purpose, target, code, userId? }, { now? }?): Promise<VerifyOtpResult>   // reason: invalid | expired | too_many_attempts | not_found
issueLinkToken({ purpose, target, userId, ttlMinutes }, { now? }?): Promise<{ token, tokenId, expiresAt }>   // token = "<uuid>.<secret>"
peekLinkToken(token, purpose, { now? }?), consumeLinkToken(token, purpose, { now?, tx? }?): Promise<LinkTokenResult>
invalidateActiveTokens({ purpose, userId?, target? }, tx?), isOtpChannelEnabled(purpose, channel), hashOtpCode(...)
```

6 digits, HMAC-stored (bound to purpose + target), 10-minute expiry, 5 attempts, single use, newest
code supersedes older ones, 60-second resend cooldown, rate limits per target / IP. Codes are sent
directly through `sendEmail` / `sendSms` (never `notify()`), localised to the recipient. Flags:
SMS needs `auth.phone_otp`; email **sign-in** codes need `auth.email_otp`; email codes that prove
ownership of an address (sign-up, verification, change) are always allowed.

## TOTP and recovery codes — `totp.ts`

```ts
generateTotpSecret(), buildTotpUri(secret, label), totpQrCodeDataUrl(uri), formatManualKey(secret)
verifyTotpCode({ secret, code, lastUsedStep, now? }): { ok: true, step } | { ok: false, reason }   // ±1 step, replay-safe
generateRecoveryCodes(count = 10), hashRecoveryCode(code), hashRecoveryCodes(codes),
consumeRecoveryCode(entries, input, now?), countRemainingRecoveryCodes(entries), normalizeRecoveryCode(input)
verifySecondFactor(userId, { code, method?: "totp"|"recovery"|"auto" }, { now? }?): Promise<SecondFactorResult>  // row-locked
```

## Google — `google.ts` (helpers)

`isGoogleSignInEnabled()`, `createPkcePair()`, `pkceChallenge(verifier)`, `statesMatch(a, b)`,
`createGoogleOAuthState(input)`, `sealGoogleOAuthState(data)`, `unsealGoogleOAuthState(value, now?)`,
`buildGoogleAuthorizationUrl(...)`, `decodeJwtPayload(jwt)`, `validateGoogleIdTokenClaims(payload, { clientId, nonce, now? })`,
`exchangeGoogleAuthorizationCode({ code, verifier, redirectUri })`, `googleCredentials()`.

Linking rules (`google-sign-in.ts`): an existing Google link signs in; otherwise Google must report the
email as verified and — an **active user with the same verified email** is linked; a **never-verified
registration** holding the email is replaced (password wiped); an **active user whose email is not
verified** is refused (`google_email_conflict`: verify the email with a one-time code first — linking
could hand the account to someone else, and emails are unique so no duplicate can be created);
otherwise a new verified user is created. Routes: `GET /auth/google` (start, `mode=link` connects
Google to the signed-in account) and `GET /auth/google/callback`.

## Services — `service.ts`

All throw `AuthError` (translated by the actions) for expected failures.

```ts
// Registration (account created as pending_verification; consent recorded; code sent)
registerAccount(input: SignUpInput): Promise<void>                        // stores the /verify flow
completeSignupVerification(code): Promise<string>                         // activates + signs in → next path
recordSignupConsents(userId, { versions, marketing, source, evidence }, tx?), currentPolicyVersions()
// Sign-in
signInWithPassword({ identifier, password, returnTo?, intent? }): Promise<{ redirectTo }>
requestLoginOtp({ identifier, returnTo?, intent? }): Promise<void>
completeLoginOtp(code): Promise<string>
resendFlowCode(kinds): Promise<{ resendAvailableAt }>
completeTwoFactorChallenge({ method, code, returnTo? }): Promise<string>
// Password reset
requestPasswordReset(identifier): Promise<{ channel: "email" | "sms" }>
inspectPasswordResetToken(token): Promise<ResetTokenStatus>
resetPasswordWithToken(token, newPassword), resetPasswordWithCode(code, newPassword): Promise<void>
// Account (actor = { user, sessionId })
updateAccountBasics(user, { displayName, locale, timezone? }): Promise<void>
changePassword(actor, { currentPassword?, newPassword }): Promise<{ mode: "changed" | "set" }>
requestContactChange(user, { kind, value, currentPassword? }), confirmContactChange(user, { kind, value, code })
requestContactVerification(user, kind), confirmContactVerification(user, kind, code)
revokeSession(actor, publicSessionId), signOutEverywhere(actor, { includeCurrent })
// Two-factor
beginTwoFactorSetup(user): Promise<TwoFactorSetupData>, confirmTwoFactorSetup(actor, code): Promise<{ recoveryCodes }>
disableTwoFactor(user, { password?, code? }), regenerateRecoveryCodes(user, { password?, code? }), getTwoFactorStatus(userId)
// Google
startGoogleSignIn(params): Promise<string>, completeGoogleSignIn({ code, state, error }): Promise<string>
disconnectGoogle(user), listConnectedAccounts(userId), canSignInWithoutGoogle(row)
// Shared
establishSession(user, { method, returnTo?, intent?, isNewUser? }): Promise<string>   // TOTP hand-off, locale cookie, alerts
postAuthDestination(user, opts), recordSuccessfulLogin(user, method), sendSecurityAlert(recipients, kind, data?, opts?)
```

Post-auth destination (`redirects.ts`): safe `returnTo` → staff `/admin` → sign-up intent (employer →
`/employer/onboarding`, partner → `/recruiter/onboarding`, institution → `/institution/onboarding`,
candidate → `/talent/onboarding`; the portal itself if the user already has it) → `portalHomePath`.
Auth pages are never used as `returnTo`.

## Queries — `queries.ts`

`getAccountOverview(userId)`, `listSessionsForAccount(userId, currentSessionId)` (public session ids,
unexpired only), `getSecurityOverview(userId, currentSessionId)`.

## Server Actions — `actions.ts`

`signInWithPasswordAction`, `requestLoginOtpAction`, `signUpAction`, `verifyCodeAction`, `resendCodeAction`,
`twoFactorChallengeAction`, `forgotPasswordAction`, `resetPasswordWithTokenAction`, `resetPasswordWithCodeAction`,
`updateAccountBasicsAction`, `requestContactChangeAction`, `confirmContactChangeAction`,
`requestContactVerificationAction`, `confirmContactVerificationAction`, `changePasswordAction`,
`beginTwoFactorSetupAction`, `confirmTwoFactorSetupAction`, `disableTwoFactorAction`,
`regenerateRecoveryCodesAction`, `revokeSessionAction`, `signOutEverywhereAction`, `disconnectGoogleAction`.
Wrapped by `authFormAction` / `authAction` (`action-utils.ts`): same `ActionResult` contract as
`src/lib/actions.ts`, with messages translated into the visitor's language.

## Notifications sent (`notify`)

| Event | When | `data` |
|---|---|---|
| `account.welcome` | account activated (code, OTP claim, Google) | `name`, `intent` |
| `account.password_changed` | change / set / reset | `name`, `method` (`change`/`set`/`reset`), `time` |
| `account.security_alert` | new device, lock, 2FA on/off, recovery code used/regenerated, email/phone changed (also to the previous verified address), Google linked/unlinked, sign-up attempt on an existing account | `kind`, `summary` (English fallback), `time`, plus `device` / `remaining` / `minutes` |

## Security events (`logSecurityEvent`) and audit actions

Security events: `signup_started`, `signup_completed`, `signup_attempt_existing_account`, `otp_sent`, `otp_failed`,
`otp_locked`, `otp_rate_limited`, `otp_delivery_failed`, `login_succeeded` (with `deviceHash`), `login_failed`,
`login_rate_limited`, `login_blocked_locked`, `login_blocked_status`, `login_first_factor_succeeded`, `account_locked`,
`new_device_sign_in`, `login_otp_requested`, `two_factor_*`, `recovery_code_used`, `recovery_codes_regenerated`,
`reauth_failed`, `password_changed`, `password_set`, `password_reset_requested`, `password_reset`, `email_verified`,
`phone_verified`, `email_change_requested`, `email_changed`, `phone_changed`, `session_revoked`, `sessions_revoked_all`,
`signed_out`, `oauth_login`, `oauth_linked`, `oauth_unlinked`, `oauth_failed`, `oauth_cancelled`.
Audit: `user.registered`, `user.registration_restarted`, `user.activated`, `user.profile_updated`,
`user.password_changed`, `user.password_set`, `user.password_reset`, `user.email_changed`, `user.phone_changed`,
`user.email_verified`, `user.phone_verified`, `user.two_factor_enabled`, `user.two_factor_disabled`,
`user.recovery_codes_regenerated`, `user.oauth_linked`, `user.oauth_unlinked`, `user.session_revoked`, `user.sessions_revoked`.

## Settings and flags used

`security.password_min_length`, `security.max_failed_logins`, `security.lockout_minutes`,
`security.require_staff_2fa`, `privacy.terms_version`, `privacy.policy_version`;
flags `auth.email_otp`, `auth.phone_otp`, `auth.google` (plus `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`).

## Background task

`identity.cleanup` (hourly): deletes expired sessions and verification tokens that expired or were used
more than 7 days ago (`cleanupIdentityData(now?)`).

## Tests

```powershell
node scripts/test-db.mjs vsg_test_auth
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_auth'; npx vitest run src/modules/identity
```

Pure tests (TOTP, recovery codes, password policy, Google PKCE/state/nonce/claims, flow cookie,
redirects, messages) always run; integration tests (OTP lifecycle, link tokens, second factor, cleanup,
and end-to-end flows incl. Google linking rules) run only against a `vsg_test_*` database.
