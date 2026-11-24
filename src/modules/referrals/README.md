# Referrals (`src/modules/referrals`)

"Refer a friend": anyone (a worker or an agent) gets a personal link at `/refer`; when someone who applied through
the link is placed abroad (their CV submission reaches status `departed`), the referrer's reward is due; staff pay
it and record the payment at `/admin/referrals`.

Tables (`src/db/schema/referrals.ts`): `referrers` (code, name, E.164 phone — one per number, optional email,
status `active | blocked`, ipHash, privacy notice version) and `referral_payouts` (one per CV submission:
amount in minor units + currency chosen by staff, paid by, note). The link between a CV and a referrer is
`cv_submissions.referralCode` = `referrers.code` (upper-case).

**The reward status is derived, never stored** (`deriveRewardStatus`): payout recorded → `paid`; CV `departed` →
`due`; `not_suitable` → `not_eligible`; any other stage → `in_progress`.

## Contract with `/send-cv` (apply flow)

`/r/<CODE>` (`src/app/(public)/r/[code]/route.ts`) checks the code (exists and active), sets the cookie
`REFERRAL_COOKIE` = `vsg_ref` (30 days, httpOnly, SameSite=Lax, Secure in production, path `/`) and redirects to
`/` (unknown or blocked codes redirect without a cookie). `/send-cv` reads `?ref=` or the cookie and stores
`normaliseReferralCode(value)` on `cv_submissions.referralCode`. Optionally check it first with
`findActiveReferrerByCode(value)` so blocked or unknown codes are not stored.

## Public API

| File | Exports |
|---|---|
| `schemas.ts` (client-safe) | `REFERRAL_COOKIE`, `REFERRAL_COOKIE_MAX_AGE_SECONDS`, `REFERRAL_CODE_ALPHABET`, `normaliseReferralCode`, `referralCookie`, `referralLinkPath`, `referralShareText`, `referralWhatsAppShareHref`, `deriveRewardStatus`, `publicReferralStage`, `publicReferredName`, `referrerNamesMatch`, `phoneSearchDigits` (staff search by a number typed as WhatsApp shows it), labels/tones, zod schemas (`referrerLinkSchema`, `referralCheckSchema`, `markReferralPaidSchema`, `linkCvToReferrerSchema`, `referralFiltersSchema`, …) |
| `codes.ts` | `generateReferralCode()` (6 characters, unambiguous alphabet, `crypto.randomInt`) |
| `service.ts` | public: `getReferrerLink`, `lookupMyReferrals`, `findActiveReferrerByCode`, `resolveReferralLanding`, `getReferralRewardText`, `referralShareUrl`; staff (`candidates.manage`, audited): `markReferralPaid`, `undoReferralPayout`, `setReferrerStatus`, `linkCvToReferrer`, `unlinkCvReferral` |
| `queries.ts` | staff (`candidates.manage`): `listReferredCvs`, `listReferrers`, `getReferrerSummary`, `referralSummary`, `listReferredCvsForExport`, `listReferrersForExport`; `countDueReferralRewards()` (no personal data, for dashboards) |

## Rules

- **Never invent a reward.** The public page shows only the wording in the setting `referrals.reward_text`
  (Settings → Referrals); blank shows no amount. Payouts carry the currency staff choose (no default).
- **Privacy.** A referrer sees only first name + last initial, trade, a coarse stage and the reward status of the
  people they referred, after giving the mobile number and the code ("Check my referrals": rate limited per network
  and per code, constant-time number check, one generic error). A number that already has a link gets it back only
  when the typed name has two words of the stored one (see referrerNamesMatch: a guessed surname is not enough).
  Staff see full numbers only with `candidates.view_contact`
  (lists that show them are logged).
- **Candidates never pay.** The referred person pays nothing; the page says so.
- Payout only for a `departed` CV of an active referrer, one per CV; blocked referrers cannot be paid or linked.
  Linking or unlinking a CV is refused once a payment is recorded (undo the payment first).

Tests: `referrals.test.ts` (pure rules) and `referrals.integration.test.ts` (PostgreSQL, see its header).
