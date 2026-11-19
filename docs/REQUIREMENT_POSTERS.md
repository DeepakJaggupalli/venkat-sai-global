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

The share goes to `POST /share` (manifest `share_target`, field `file`, images, PDF and Word). Staff with the
poster permissions who share an **image** get the staff page above. Signed out, the share is treated like a
visitor's (next section); sign in and share again to publish directly. The older action
`/admin/requirements/posters/share` still works for apps installed before the change.

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

## Sharing from a phone (everyone)

Candidates, employers and signed-in users install the same app ("Install app" pill in the mobile menu, footer,
`/send-cv`, `/requirements` and `/share/choose`; on iPhone a tip says Share → Add to Home Screen, and to use the
**Choose photo** button because iOS cannot share into web apps). Sharing a photo or document:

1. `POST /share` checks the file through the files module (type sniffing, max 4 MB, scan status), stores it as a
   private **shared upload** (purpose `shared_upload`: owner = the signed-in user or nobody, never public, deleted
   after 2 hours by `files.expire_shared_upload`, `system.cleanup` as safety net), rate limited per IP (10 per
   10 minutes, 40 per day), then redirects to `/share/choose?t=<signed token>` (HMAC, 2 hours, bound to the file).
2. `/share/choose` shows the file (thumbnail or name) and two choices: **Send as my CV** (`/send-cv?shared=<t>`)
   and **Post a job requirement (I'm hiring)** (`/requirements/submit?shared=<t>`). Opened directly it offers a
   normal file picker (gallery on iPhone and Android) with the same two choices.
3. The token is spent once: as a CV the stored file is re-linked to `cv_submission`; as a poster its bytes are
   copied into the media library and the shared upload deleted.

## Requirements posted by the public (`/requirements/submit`)

Linked from `/requirements` and `/employers` as "Post a requirement". Short form: company, contact name,
phone/WhatsApp (required), email, country, trades and salary (one per line), notes, the poster photo (or the
shared one), consent; honeypot and rate limits (5 per 10 minutes and 20 per day per IP, 3 per hour per phone).
On submit, in one transaction:

- the poster becomes a private media-library image and an **internal** media item;
- a `requirement_posts` **draft** is created (title from the first trade and country; only country and trades in
  the entry, never contact details) and sent to the approval centre as a content publication marked
  **"Submitted by the public - check before publishing"**;
- the contact details go to an **employer enquiry** (ENQ code, linked to an employer lead, with a link to the
  draft); staff with `content.edit` get an in-app alert and the business inbox an email copy with the phone.

Nothing is public until a reviewer with `content.publish` approves: the approval makes the poster image public
and publishes the entry. The visitor sees "We will check and publish it after calling you" with WhatsApp, Call
and Email buttons.

## Public pages

- Homepage band: `<LatestRequirements />` (`src/components/public/requirements/latest-requirements.tsx`), hidden
  when there are no published posters.
- `/requirements`: all published posters, newest first, filter by destination country, paginated.
- `/requirements/<slug>`: large poster, trades and salary, benefits, then **WhatsApp** (prefilled with the
  requirement), **Call**, and **Apply: send your CV** (`/send-cv?requirement=<slug>`).
- Both are in `sitemap.xml`. Images are the files module's pre-generated WebP variants.

## Send your CV (`/send-cv`)

With `?shared=<token>` (from `/share/choose`) the shared file is shown as the CV and no new upload is needed; the
submit route accepts the `shared` token instead of the `cv` file (one-time use).

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
