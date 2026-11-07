# E2E support helpers (`e2e/support`)

Shared Playwright helpers for every spec. Import from `./support` (barrel) or the individual files.
They read the accounts written by `npm run db:seed:e2e` (see `docs/TESTING.md` for the seed, the env file
and the local dev servers).

```ts
import { expect, test } from "@playwright/test";
import { expectNoA11yViolations, expectNoHorizontalScroll, hasCredentials, latestOtpCode, missingCredentials, signIn } from "./support";

test.describe("employer jobs", () => {
  test.skip(!hasCredentials("employer"), missingCredentials("employer"));

  test("job list", async ({ page }) => {
    await signIn(page, "employer", { returnTo: "/employer/jobs" });
    await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
    await expectNoA11yViolations(page);
    await expectNoHorizontalScroll(page);
  });
});
```

## `auth.ts` — signing in

| Export | What it does |
|---|---|
| `signIn(page, role, { returnTo?, expectPath? })` | Password sign-in at `/sign-in?returnTo=…`, waits until the app leaves the auth screens and the URL is inside `returnTo` (default: the role's portal home; `/account` for fresh accounts so nothing is consumed). Fails with a clear message on a staff 2FA screen. |
| `signInWith(page, { email, password }, opts)` | Same for any account (e.g. one a spec registered itself). |
| `fillPasswordSignInForm(page, creds)` | Fills and submits the password form only. Use it instead of `getByLabel(/password/i).first()`: the **"Password" tab panel is itself labelled "Password"**, so that locator resolves to the panel and `fill()` fails. |
| `signOut(page)` | POST `/sign-out` and clear cookies. |
| `credentials(role)`, `hasCredentials(role)`, `missingCredentials(role)` | Read `E2E_<KEY>_EMAIL` / `E2E_<KEY>_PASSWORD`; use for `test.skip`. |
| `PORTAL_HOME`, `ROLE_ENV`, `FRESH_ROLES` | Role → landing path, role → env prefix, roles that specs consume. |

Roles: `admin` (Super Admin), `ops` (Operations Manager), `finance` (Finance), `content` (Content Manager),
`employer` (owner of the verified "E2E Employer Co"), `employerMember` (HR Manager there), `partner` (owner of
the verified "E2E Recruitment Partner"), `otherPartner` (owner of "E2E Other Recruitment Partner"),
`institution` (owner of "E2E Training Institute"), `otherInstitution`, `candidate` (adult, age gate done),
`minor` (16, no guardian consent), and the fresh accounts `newUser`, `newCandidate`, `newPartner`.

Existing specs keep their own env names (`E2E_ADMIN_EMAIL`, `E2E_EMPLOYER_JOB_ID`, …); all of them are in the
env file. New specs should use `signIn(page, role)`.

## `outbox.ts` — one-time codes and links

Local development stores outgoing email / SMS / WhatsApp in the `dev_outbox` table (`EMAIL_TRANSPORT=dev`,
`SMS_PROVIDER=dev`). The helpers connect with `E2E_DATABASE_URL`, else `DATABASE_URL` from `.env.local`, and
refuse any host other than 127.0.0.1 / localhost.

```ts
const since = new Date(Date.now() - 1000);          // just before triggering the send
await page.getByRole("button", { name: "Send code" }).click();
const code = await latestOtpCode(email, { channel: "email", since });
const link = await latestLink(email, "/reset-password", { since });   // path + query → page.goto(link)
const message = await latestOutboxMessage(email, { subjectIncludes: "invitation", since });
```

Each helper polls for up to 15 s (`timeoutMs`). One-time codes have a **60-second resend cooldown per
address** even with rate limits disabled — don't request two codes for the same address within a minute
(e.g. in the chromium and mobile runs of one spec back to back); use a fresh or spec-registered address.

## `a11y.ts` — axe-core

`expectNoA11yViolations(page, { exclude?, include?, disableRules?, failOn? })` runs axe with the WCAG 2.0 / 2.1
A and AA tags and fails on `serious` and `critical` violations, listing rule, help link and up to five
targets each. `scanA11y(page, opts)` returns the violations without asserting (for reports). Wait for the
content you want checked to render first; switch rules off only with a written reason.

## `layout.ts` — mobile layout

`expectNoHorizontalScroll(page, { tolerance = 1 })` fails when the page scrolls sideways and names the
widest elements that are not inside their own scroll container. Use it with the `mobile` project (Pixel 7)
or after `page.setViewportSize({ width: 360, height: 800 })` (CONVENTIONS §7: no horizontal scroll at 360 px).

## Writing specs that run in parallel with other engineers

- Never rely on data another spec creates; use the seeded ids from the env file and unique names
  (`E2E … ${Date.now().toString(36)}`) for anything you create.
- Fresh accounts are single-use per seed run. `E2E_NEW_USER_*` is shared by the employer **and** institution
  onboarding specs (one organisation of each type); `E2E_NEW_CANDIDATE_*` by the age-gate spec;
  `E2E_NEW_PARTNER_*` by partner onboarding. Re-run `npm run db:seed:e2e -- --keep-passwords` to reset them.
- Don't change shared state that other specs assert on (e.g. don't close `E2E_EMPLOYER_JOB_ID`, don't change
  seeded passwords, don't submit wrong passwords for seeded accounts — 8 failures lock the account).
- Interactive checks need a hydrated page; `e2e/accounts.spec.ts` has a guard test for that.
