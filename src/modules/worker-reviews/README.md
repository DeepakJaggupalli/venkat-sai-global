# worker-reviews

Reviews from placed workers, collected with their permission and approved by staff before they show on the
website. Never seeded, never written or edited by staff: the text is always the worker's own.

Tables (`src/db/schema/worker-reviews.ts`): `worker_reviews` (one per CV submission; status pending → approved /
rejected, approved ⇄ hidden; `consentToPublish` must be true to publish, enforced by the service and a check
constraint) and `worker_review_requests` (who sent the review link, when, and how).

## Flow

1. A CV submission reaches the stage **Departed**. It appears on `/admin/reviews` → "Ask for a review" (the CV page
   links to `/admin/reviews?ask=<id>`).
2. Staff tap **Send on WhatsApp** (wa.me to the worker's own number, message + link prefilled) or **Copy link**.
   Either is recorded (`worker_review_requests`, audit `worker_review.requested`).
3. The worker opens `/review/<token>` (signed, 30 days, no account): stars, a few words, name to show (default
   "first name + last initial"), trade, country, and the optional "You may show my review on your website".
4. Staff approve (only with consent), reject, hide or show again. Only approved + consented reviews are public.

## Public API

| Function | File | Use |
|---|---|---|
| `listPublicWorkerReviews(limit)`, `countPublicWorkerReviews()` | `queries.ts` | Public listing (React `cache`, per request) |
| `WorkerReviewsSection({ tone, limit, eyebrow?, heading?, intro?, showAllLink?, allLabel?, id? })` | `src/components/public/worker-reviews.tsx` | Server component; renders nothing when there are no public reviews (the text props take translations) |
| `ReviewStars`, `WorkerReviewCard` | same | Presentational |
| `resolveWorkerReviewLink(token)`, `submitWorkerReview(input, { ipHash })` | `service.ts` | Public review page |
| `workerReviewCounts`, `listReviewAskQueue`, `getReviewAskItem`, `recordReviewRequest`, `listWorkerReviewsForStaff`, `moderateWorkerReview` | `service.ts` | Command Centre (all need `candidates.manage`) |
| `issueWorkerReviewToken`, `readWorkerReviewToken`, `workerReviewPath` | `tokens.ts` | Signed links (`src/lib/signed-token`, purpose `worker_review`) |
| schemas, labels, `defaultDisplayName`, `nextWorkerReviewStatus`, `mentionsContactDetails` | `schemas.ts` | Client-safe |

## Rules

- Permissions: everything on `/admin/reviews` needs `candidates.manage`; phone numbers and WhatsApp links also need
  `candidates.view_contact` (the view is logged with `logDataAccess`); the CV name/reference next to a review needs
  `candidates.view`.
- One review per CV submission: the submission row is locked while saving and `worker_reviews_cv_submission_uq`
  is the final guard. A token for another purpose (e.g. CV document upload links) is refused.
- Public form: honeypot (`website`), rate limits per network (10 / 10 min, 40 / day) and per link (5 / hour),
  `ipHash` only. The review page is `noindex` and sends no referrer (the token stays private).
- Audit actions: `worker_review.received` (anonymous, without the text), `worker_review.requested`,
  `worker_review.approved`, `worker_review.rejected`, `worker_review.hidden`, `worker_review.unhidden`.

## Tests

`tokens.test.ts`, `schemas.test.ts` (pure) and `worker-reviews.integration.test.ts`:

```
node scripts/test-db.mjs vsg_t_reviews
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_t_reviews npx vitest run src/modules/worker-reviews --no-file-parallelism
node scripts/test-db.mjs vsg_t_reviews --drop
```
