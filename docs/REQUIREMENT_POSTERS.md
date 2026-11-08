# Requirement posters and "Send your CV"

The two things the business needs most: tradespeople's **CVs and trade**, then a **call or WhatsApp**
(94942 63388). Recruitment **posters** (for example "Urgent requirement for Dubai - Mechanical helper - 900 AED")
are published straight from a phone without any code change.

## Posting a requirement poster (staff)

Who: staff with **content.edit + media.manage** (the Content Manager role has both). With **content.publish**
the poster goes live at once; without it, "Send for approval" puts it in the approval centre (`/admin/approvals`)
and it appears on the website once a publisher approves it.

### Android (fastest: share from Gallery or WhatsApp)

1. Once: open the website in **Chrome**, sign in, then Chrome menu (⋮) → **Install app** (or **Add to Home
   screen**). The app "Venkat Sai Global" appears on the home screen and in the share sheet.
2. In **Gallery** or **WhatsApp**, open the poster image → **Share** → **Venkat Sai Global**.
3. The "Post requirement" page opens with the image already attached (WhatsApp text, if any, is used as the
   description and its first line as the title). Optionally pick the country and type the trades, then tap
   **Publish now**.

If you are signed out, the app asks you to sign in first; share the image again afterwards (the shared file
cannot survive the sign-in step).

### iPhone (and any other phone or computer)

iOS does not support sharing into installed web apps. Open **Command Centre → Requirement posters → Post
requirement** (`/admin/requirements/posters/new`), tap **Choose photo** and pick the poster from **Photos**
(or take a photo), then **Publish now**. Tip: in Safari use Share → **Add to Home Screen** for quick access.

### What happens on "Publish now"

1. The photo is uploaded to the media library (purpose `cms_media`; phone photos over 3.5 MB are resized in the
   browser first because Vercel limits a request to 4.5 MB). Metadata (GPS, camera) is stripped by the files
   module.
2. A public media item is created with a text alternative built from the title and country, marked "no
   identifiable people". **Posters that show photos of people** must go through the media library instead, so
   their consent is recorded.
3. A CMS entry of the collection **Requirement posters** (`requirement_posts`) is created and published (or
   sent for approval). Title defaults to "New requirement - <date>".

Trades are typed one per line, salary after a dash: `Mechanical helper - 900 AED + food allowance 350 AED`.
A trailing upper-case code (AED, SAR, QAR…) is stored as the currency; no currency is ever assumed.

### Managing posters

- `/admin/requirements/posters`: list with **Archive** (requirement closed, off the website), **Unarchive**
  (published again, or sent for approval) and **Delete** (moved to the content bin).
- Full editing (company name, benefits, apply-by date, SEO): **Edit** opens the generic CMS editor at
  `/admin/content/requirement_posts/<id>`.

## Public pages

- Homepage band: `<LatestRequirements />` (`src/components/public/requirements/latest-requirements.tsx`), hidden
  when there are no published posters.
- `/requirements`: all published posters, newest first, filter by destination country, paginated.
- `/requirements/<slug>`: large poster, trades and salary, benefits, then **WhatsApp** (prefilled with the
  requirement), **Call**, and **Apply: send your CV** (`/send-cv?requirement=<slug>`).
- Both are in `sitemap.xml`. Images are the files module's pre-generated WebP variants.

## Send your CV (`/send-cv`)

Short form, no account: name, mobile/WhatsApp (required), trade (job categories + "Other"), years of
experience, preferred country, passport yes/no, **passport number** (optional, 6–12 letters/digits, stored
encrypted like candidate profiles, last 4 shown to staff), **notes for us** (optional, 1000 characters), the CV
(PDF, DOC, DOCX, JPG or PNG, max 4 MB), the requirement it is for (prefilled from a poster) and consent to be
contacted. Honeypot + rate limits (5 per 10 minutes and 20 per day per IP, 3 per hour per phone). The form posts
to the route handler `/send-cv/submit` (works without JavaScript too).

After sending: "our team will call you" with **WhatsApp** (prefilled with name and trade), **Call**, **Email**,
and **Join our WhatsApp group** (site settings → contact → WhatsApp group link) or, when that is empty,
**Follow our WhatsApp channel** (`CONTACT.whatsappChannelUrl`).

### Where CVs appear

- **Command Centre → CV submissions** (`/admin/cv-submissions`, permission `candidates.view`): name, phone with
  call and WhatsApp links (needs `candidates.view_contact`, logged), trade, country, requirement, date, status
  (new / contacted / shortlisted / not suitable, `candidates.manage`) and a CV download.
- Detail view `/admin/cv-submissions/<id>`: all fields, the candidate's notes, staff-only **Remarks** (editable
  with `candidates.manage`, audited) and the passport number: last 4 by default, **Show full number** with
  `candidates.view_documents` (logged as a data-access reveal).
- CV files (purpose `cv_submission`) are private, sensitive, readable by staff with `candidates.view_documents`
  or `recruitment.manage`; every download goes through `/api/v1/files/<id>` (access check + data-access log).

Data model: table `cv_submissions` (migration `0002_cv_submissions`). Service API in
`src/modules/operations/cv-submissions.ts`: `submitCvSubmission`, `listCvSubmissions`, `getCvSubmission`,
`setCvSubmissionStatus`, `setCvSubmissionRemarks`, `cvSubmissionCounts`. Further documents (passport scans,
certificates) can attach to a submission id through the files module (e.g. a `cv_submission_documents` table or
`files.metadata.cvSubmissionId`); `candidateNotes` and `staffRemarks` are plain columns for exports.

## Notifications

- Every new CV: in-app alert to staff with `candidates.manage` (no phone number in the alert).
- **Business inbox** (setting `notifications.business_inbox_email`, default `vsweld@gmail.com`, blank = off,
  editable at `/admin/settings`): an email copy of every new **CV** (with phone and a link to the Command
  Centre, never the file), **contact enquiry** and **workforce requirement** (public form and employer portal).
- Emails use the configured transport. Until SMTP is configured in production, they land in the dev outbox;
  once SMTP settings are set, the same notifications are sent by SMTP with no code change.
