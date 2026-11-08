# Resume service (`src/modules/resume-service`)

"Prepare my resume": a **paid resume-writing service** (never a placement fee, never a condition of any job
application). Candidates send their details on `/resume-service`; staff with `candidates.manage` work the list at
`/admin/resume-requests`.

Flow: request → `awaiting_payment` (online checkout is off) → staff collect the fee on WhatsApp/phone and record it
(`paid`, with an optional reference) or waive it (`waived`) → DOCX + PDF generated in the business's own layout
(`generated`) → staff share a private 30-day link → the candidate's first download marks it `delivered`.
Cancelling bumps `downloadTokenVersion`, revoking every link issued before.

Data: `resume_requests` (details JSON validated by `resumeDetailsSchema`; the passport number is stored encrypted
outside the JSON). Files: purpose `resume_service` (photo + generated documents, private, staff read with
`candidates.manage`). Price: setting `resume_service.price` (`{ amountMinor, currency }`, 0 = "Price on request"),
edited on `/admin/resume-requests`. Flags: `services.resume_writing` (public form), `services.resume_online_payments`
(future Razorpay checkout, default off — see `payment.ts`).

| File | Public API |
|---|---|
| `schemas.ts` (client-safe) | `resumeDetailsSchema`, `resumeRequestSchema`, statuses/labels, action schemas |
| `experience.ts` (pure) | `experienceMonths`, `formatExperienceTotal`, `formatDateDots`, `periodTo` |
| `render/docx.ts`, `render/pdf.ts` | `renderResumeDocx(details \| null, { photoJpeg })`, `renderResumePdf(...)` — `null` = blank template |
| `price.ts` (client-safe) | `resumePriceLabel`, `hasFixedPrice`, `requestPriceLabel` |
| `payment.ts` | `getResumePaymentMode()` — `"offline"` until Razorpay is switched on |
| `service.ts` | `createResumeRequest`, `listResumeRequests`, `getResumeRequest`, `markResumeRequestPaid`, `generateResumeDocuments`, `setResumeRequestStatus`, `setResumeRequestNotes`, `updateResumeRequestDetails`, `issueResumeDownloadLink`, `resolveResumeDownload`, `openResumeDownload`, `renderBlankResumeTemplate`, `listResumeRequestsWithPassport`, `getResumeServicePrice` |

Every staff read of a request and every candidate download is written to the data-access log; status changes,
payments, generation and links are audited.
