# Venkat Sai Global — Command Centre guide

How the Venkat Sai team does the daily work in the Command Centre (`/admin`). Organised by task. Every route
is relative to the website address (for example `https://<domain>/admin/cv-submissions`). What you can see
depends on your role (§15); if a page or button is missing, you do not have the permission for it.

Sign in at `/sign-in`. Staff must set up two-factor authentication at `/account/security` before the Command
Centre opens fully. The left-hand menu follows the sections of this guide; the bell shows notifications
(`/account/notifications`). The dashboard at `/admin` shows today's numbers; `/admin/tasks` lists your work items
and reminders; `/admin/messages` holds conversations with employers, partners and institutions.

## 1. Requirement posters (the phone job)

Posters such as "Urgent requirement for Dubai — Mechanical helper — 900 AED" go on the website straight from a
phone. Full details, including the one-time phone setup, are in `REQUIREMENT_POSTERS.md`.

- **Android:** install the website as an app once (Chrome ⋮ → Install app). Then in Gallery or WhatsApp open
  the poster → Share → **Venkat Sai Global**. The "Post requirement" page opens with the image attached; pick the
  country, type the trades (one per line, salary after a dash: `Mechanical helper - 900 AED`), tap **Publish now**.
- **iPhone, or any computer:** `/admin/requirements/posters/new` → Choose photo → Publish now.
- **Everyone else can share too** (same app, same Share button): candidates and employers who share a photo or
  document land on `/share/choose` and pick **Send as my CV** or **Post a job requirement (I'm hiring)**.
- **Requirements posted by the public** (`/requirements/submit`) never go live on their own: each one is a draft
  poster in the approval centre marked "Submitted by the public - check before publishing", with the contact
  details in an employer enquiry (Leads → Enquiries; the enquiry links to the draft). Call the employer, fix the
  draft in the content editor if needed (title, trades, company name), then **approve** it in `/admin/approvals`:
  approval makes the poster image public and publishes the entry. Reject it if it is not genuine.
- **Manage:** `/admin/requirements/posters` — Archive (closed, off the website), Unarchive, Delete (to the bin),
  Edit (opens the full editor at `/admin/content/requirement_posts/<id>` for company name, benefits, apply-by date).
- Needs the Content Manager role (or `content.edit` + `media.manage`). Without `content.publish` the poster goes to
  the approval centre first.
- **Posters that show people's faces** must go through the media library (§9) so consent is recorded.

Published posters appear on the homepage, at `/requirements` and `/requirements/<slug>`, with WhatsApp, Call and
"Apply: send your CV" buttons.
The six newest come first on the homepage, right below the opening headline, for every visitor (the main button there
reads "Apply for open jobs" while any requirement is published). Every card has two big buttons: **Apply** (the CV
form with that requirement already picked) and **WhatsApp** (a message to the office naming the job, with its link).
A poster without a public image still shows, as a text card. The apply-by date is not shown on the website.
The card beside the headline is always the route from Vizag with the small plane; a hero image or video set on the
Homepage entry is not shown there.

## 2. CV submissions (`/admin/cv-submissions`)

Every CV sent through `/send-cv` lands here, newest first, and a copy goes to the business inbox email (CVs shared
from a phone's Share button arrive the same way, with the shared file as the CV). The
list shows name, phone (with **Call** and **WhatsApp** buttons — using them is logged), trade, country, the
requirement it was for, date and status. Filter by status, trade, country or search by name.

1. **Call or WhatsApp the candidate.** The WhatsApp button opens a prefilled message.
2. **Set the status** on the list (quick update) or the detail page: **New → Contacted → Shortlisted** or **Not
   suitable**.
3. **Open the detail page** `/admin/cv-submissions/<id>`: all fields, the candidate's notes, the CV download, and
   **Remarks (staff only)** — never shown to the candidate, every change audited. Write what matters: "Called
   Monday, has passport, good TIG welder".
4. **Passport number:** only the last four digits show. **Show full number (logged)** reveals it and records who
   looked and when (needs `candidates.view_documents`). Reveal only when you are preparing the candidate's file.
5. **Documents** (same page): certificates, licences, passport cover / first page / last page, photo on white
   background, other. Add them yourself (one file at a time, max 4 MB) or **Copy upload link** and send it to the
   candidate on WhatsApp — the link is valid for 7 days, lets the candidate add files only and shows nothing that
   is stored. Passport pages and the photo replace the previous file of that kind.
6. **CV pack / Visa pack:** `Download CV pack` and `Download visa pack` build one PDF in the standard order
   (resume, certificates, licences, other, passport pages, photo). If the CV is a Word file it cannot be merged;
   download it separately and send it alongside. Both downloads are logged.
7. **Excel:** the **Download Excel** button on the list (`/admin/cv-submissions/export`) exports the filtered
   list. Full phone numbers appear only with `candidates.view_contact`, full passport numbers only with
   `candidates.view_documents`; otherwise they are masked (`XXXX1234`). Every export is logged with the filters used.

Rate limits protect the public form (5 per 10 minutes per IP, 3 per hour per phone), so a candidate who sends
twice quickly may be blocked for a while — that is expected.

### Applicants and Excel

People apply from a poster (**Apply now**, `/send-cv?requirement=<slug>`) in under a minute: only name, mobile
number and trade are required. Email, experience abroad and in India, passport number and expiry, preferred country,
notes and a CV (photo or PDF) are optional, so a worker without a CV can apply now and send it later on WhatsApp.

- **Per poster:** every poster on `/admin/requirements/posters` has an **Applicants (N)** button. It opens
  `/admin/requirements/posters/<id>/applicants`: S.No, Name, Trade, Passport No, Exp abroad, Exp India, Email,
  Phone (with **Call** and **WhatsApp**), Applied on and Status, newest first. Search by name, phone or the last 4
  of the passport number; filter by status. **Copy all phone numbers** copies every number of the list (one per
  line) for a WhatsApp broadcast; the copy is logged. If the phone's browser (for example on an iPhone) does not
  copy straight away, the numbers open in a sheet: tap **Copy numbers** once more. **Matching CVs** is still next
  to it.
- **Everyone:** `/admin/cv-submissions` has the same columns plus **Applied for**, and filters for the requirement,
  source (website or Excel import), **Has CV / No CV yet**, trade, country and passport expiry. On a phone each
  person is a card with big Call and WhatsApp buttons.
- **No CV yet:** the row says so. Tap **Ask for CV** (a WhatsApp message with the reference). When the CV arrives,
  save it from WhatsApp and use **Attach CV** on the detail page. Until then the CV pack has a "No CV file" page.
- **Download Excel** (both pages; the poster page adds `?requirement=<id>`): S.No, Name, Trade, Passport No, Exp
  Abroad (yrs), Exp India (yrs), Email, Phone, Applied for, Applied on, Status, Preferred country, Passport expiry,
  Candidate notes, Staff remarks, then Total exp (yrs) (the only figure for people who applied before experience
  was split) and the Reference, with the company name on the first row. Full phone numbers and emails need
  `candidates.view_contact`; full passport numbers need `candidates.view_documents` (otherwise `XXXX1234`), on
  screen and in Excel. Every download is logged.
- **Detail page extras:** "Referred with code …" when the person came from a refer-a-friend link; **Create invoice
  for this worker** from Selected onwards (needs `commercial.invoices`); **Ask for a review** once Departed.

### Import CVs from Excel (`/admin/cv-submissions/import`)

For the CVs the office already keeps in Excel. Needs `candidates.manage`. Imported people appear in the CV list
(filter **Excel import**), in CV matching and in the passport expiry reminders. Nobody gets a message.

1. **Download template.** One person per row. Name, Phone and Trade are needed; Passport No, Passport Expiry
   (day-month-year), Exp Abroad, Exp India, Email, Preferred Country and Remarks are optional. Pick the trade and
   country from the dropdowns so matching works (other trades are kept as typed). Instructions are on the second
   sheet. A CV list downloaded from this site, or your own sheet with Name / Phone / Trade columns, also works.
2. **Choose the file** (.xlsx, up to 4 MB and 2,000 people) and tap **Check file**. Nothing is saved yet. Only one
   sheet is read: if the file has more sheets with people, the check says so (put everyone on one sheet, or import
   each sheet as its own file).
3. **Check the result:** *Ready to add*, *Need fixing* (missing or wrong name, phone, trade, passport number or
   date — with the Excel row number), *Already in the CV list* (same phone, or same passport number when you have
   `candidates.view_documents`) and *Repeated in this file*. Only the ready rows are added. Tick **These people
   gave us their CV and agreed that we contact them about jobs** — only import people who did — then tap **Import**.
4. The summary links to the imported CVs. Fix the skipped rows in Excel and upload the same file again: people
   already added are skipped, so nobody is added twice.

The file is read in memory and never stored. Imported rows have no CV file (ask for it on WhatsApp), start at
**CV received**, and the import is recorded in the audit log (counts only).

## 3. Resume requests (`/admin/resume-requests`)

"Prepare my resume" (`/resume-service`) is the one **paid** candidate service. It is never a condition for a
job and never a placement fee. Statuses: Submitted → **Awaiting payment** → **Paid** / **Fee waived** → **Resume
ready** → **Delivered**, or Cancelled.

1. **Set the price once:** the Price card at the bottom (needs `settings.manage`). Amount + currency; `0` shows
   "Price on request" on the website and staff quote it on WhatsApp.
2. New requests arrive as **Awaiting payment**. Open `/admin/resume-requests/<id>`; the **WhatsApp** button
   prefills a message with the request code. Collect the fee (UPI, bank transfer, cash at the centre).
3. **Record payment** (with an optional reference such as the UPI id) or **Waive the fee and generate**. Either
   one generates the Word and PDF resume in the Venkat Sai layout at once.
4. Check the details; **edit** them if the candidate made a mistake, then **Generate again**.
5. **Copy download link** and send it on WhatsApp. The private link works for 30 days; the candidate's first
   download marks the request **Delivered**. Cancelling the request switches every link off.
6. **Blank templates** for walk-in candidates: `/admin/resume-requests/template?format=docx` or `?format=pdf`
   (buttons at the top of the list).
7. **Excel** of all requests: `/admin/resume-requests/export` (same masking rules as CVs).

Every view of a request and every download is logged; payments, generation and links are audited. Online
payment is off until Razorpay is set up (see `OPERATIONS.md` §7).

## 3a. Worker reviews (`/admin/reviews`)

Reviews from workers we placed, in their own words. A review shows on the website (Success stories, and the
homepage) only after you approve it, and only if the worker ticked "You may show my review on your website".
Needs `candidates.manage`; sending on WhatsApp also needs `candidates.view_contact`.

1. **Ask.** When a CV reaches **Departed**, the worker appears under **Ask for a review** (or open the CV page →
   **Ask for a review**). Tap **Send on WhatsApp**: WhatsApp opens with the worker's own number, a short message
   and their private link. **Copy link** sends it another way. The card shows who asked and when, so nobody asks
   twice. A link works for 30 days; if it expired, send a new one from the same card.
2. **The worker** opens the link (no account), taps 1 to 5 stars, writes a few words in any language, checks the
   name to show (for example "Ravi K."), trade and country, and chooses whether we may show it. One review per CV.
3. **To approve.** Read each review. **Approve** puts it on the website; **Reject** keeps it off (you can still
   approve it later under **Not shown**). A yellow note means the text may contain a phone number, email or link:
   do not approve it if those should not be public. Reviews without permission are marked **Private feedback**:
   read them, then tap **Done, keep private**.
4. **Published.** **Hide from website** takes a review down at once (for example when the worker asks); **Show
   again** puts it back.

Never write, edit or invent a review, and never offer anything in return for a good one. Every step is audited.

## 3b. Trade test and training bookings (`/admin/bookings`)

Dates with a fixed number of seats, for a trade test (for example a 6G pipe welding test) or a training day.
Workers book one seat on the website at `/book` (no account); travel agencies and companies book several seats
at once (up to 20 per booking). Two people can never take the last seat. Needs `recruitment.assessments` (Training
Coordinator, Recruiter, Operations Manager); phone numbers also need `candidates.view_contact`.

1. **Open a date:** **New date** → trade test or training, title, trade, date, start (and end) time, seats, what
   to bring. Leave **Place** empty for our office. **Fees** only if there is a fee: type it exactly as people
   should read it, with the currency. Never charge a candidate for a trade test that is part of a job application.
   For training, pick the course: its page on the website then shows **Book a training seat**.
2. **Share it:** **Share on WhatsApp** (list or date page) sends the booking link to your groups. The date shows on
   `/book` at once, with "N seats left" (or "Full").
3. **New bookings** arrive in the bell and (with the phone number) in the business inbox email. Each person gets a
   booking code (`VSG-BKG-000123`), the date, time, place, what to bring and an "Add to calendar" file. The same
   mobile number booking the same date again gets its existing booking back (with the same name; under another
   name the page only says the number is already booked, and asks them to WhatsApp you). Send booking details only
   to the number that booked.
4. **Someone phoned or walked in?** **Add a booking** on the date page.
5. **On the day:** **Print attendance sheet** (one line per seat, a signature column and spare lines for
   walk-ins; on a phone choose Save as PDF). Mark each person **Came** or **Did not come**; **Cancel** frees the
   seats, **Book again** takes them back if they are still free. **Download Excel** exports the list (same masking
   and logging as other exports).
6. **Close for booking** stops new bookings (existing ones stay); **Open for booking again** reverses it. **Edit**
   changes the details; seats can never go below what is booked. If you change the date, time or place, the
   page shows a WhatsApp button per person with the new details.
7. **Cancel date** asks for a reason (staff only). Every booking on it is cancelled and the page lists the people
   to tell, each with a WhatsApp button that opens a message with the reason. A cancelled date cannot be reopened:
   open a new date.

Every booking, status change and slot change is audited; viewing phone numbers, printing and exports are logged.

## 3c. Referral rewards (`/admin/referrals`)

Anyone (a worker or an agent) gets a personal link at `/refer` with their name and mobile number, for example
`https://<domain>/r/7KQ2MX`, and shares it on WhatsApp. A friend who opens it and sends a CV within 30 days counts
as referred. When that CV reaches **Departed**, the referrer's reward is **Due**. Needs `candidates.manage` (mobile
numbers also need `candidates.view_contact`).

1. **Set the reward wording once:** Settings → **Referrals** (needs `settings.manage`). Write it exactly as visitors
   should read it, with the currency. Leave it blank and `/refer` shows no amount: never promise a reward that the
   owner has not decided.
2. **Rewards due now** (top of the page) lists who to pay, oldest departure first. **WhatsApp referrer** opens a
   prefilled message. Pay only the person with the referrer's mobile number (call or WhatsApp first to confirm).
3. **Mark paid:** type the amount, **choose the currency** (there is no default) and add a note such as the UPI
   reference. One payment per referred CV. **Undo payment** removes a record made by mistake (it is audited).
4. **Referred without the link?** (walk-in, WhatsApp, Excel import) **Add a referral**: the CV reference
   (`VSG-CV-000123`) and the referrer's code. If the CV already had a referrer it moves to the new one, and the
   message names the old one. **Remove referral** takes a CV off a referrer. Both are refused once a payment is
   recorded; undo the payment first.
5. **Referrers** tab: name, mobile, code, how many sent a CV, placed, due and paid (totals per currency). Search
   by name, code or mobile number (paste it as WhatsApp shows it, for example `+91 98765 43210`). Someone who
   lost their link: find them here and tap **WhatsApp** (the message includes their link).
   **Block** a referrer who sends fake CVs or spam: their link stops working and they cannot be paid until you
   **Unblock** them. "Same number as the referrer" on a row means the person referred themselves: decide before
   paying.
6. **Download Excel** exports the tab you are on, with its filters (same masking and logging as other exports).

Referrers check their own list at `/refer` with their mobile number and code. They see only each friend's first
name and last initial, trade, a simple stage (CV received, In progress, Placed abroad, Closed) and the reward status;
never phone numbers, documents or staff notes. The referred person never pays anything.

## 4. Approval centre (`/admin/approvals`)

One inbox for everything that needs a second person: employer, partner and institution **verifications**,
**job** publications, **requirements** from employers and the website, **testimonials and case studies**,
**media that shows people**, content publication requests from editors, **partner announcements**, **refunds**,
**subscription exceptions**, **partner settlements**. Open a request to see the submitted snapshot, then
**Approve**, **Request changes** (with a note) or **Reject** (with a reason). The submitter is notified of every
decision. Approval is the only way into delivery for requirements and the only way a testimonial goes live.

## 5. Support desk and grievances (`/admin/support`)

Requests from candidates, employers, partners and institutions and from the public support page (`/support`).
Each ticket has a **first-response deadline** from the support settings (`/admin/settings` → Support): urgent
4 h, high 8 h, normal 24 h, low 72 h. `/admin/support/new` records a phone call or walk-in as a ticket.

On a ticket (`/admin/support/<id>`): reply (public, goes to the requester) or add an **internal note** (never
shown), assign, set priority, change status, escalate, add tags, attach files. Your first public reply stamps
the response time and assigns the ticket to you. Resolving needs a short resolution summary; the requester can
rate it afterwards.

**Grievances** (`/admin/support/grievances`) are formal complaints under the IT Rules and the DPDP Act. Mark a
ticket as a grievance (type: general, removal of unlawful content, impersonation or intimate content, personal
data, other) and it gets a `GRV` register number, at least high priority, an **acknowledgement deadline of
24 hours** and a **resolution deadline of 7 days** (72 h for content removal, 24 h for impersonation or intimate
content). The hourly SLA watch flags breaches, escalates and notifies the grievance officers. Timelines in force
are shown at the top of the register and come from the Privacy settings — confirm them with counsel, never
guess. The register needs the grievance permission (Compliance & Grievance Officer, Administrator, Super Admin).

## 6. Privacy (data) requests (`/admin/privacy`)

People can ask to **access/export**, **correct**, **delete** their data, withdraw consent, object, or nominate
someone (`/account/privacy`, `/talent/privacy`, and the public data-rights page). Each request has a **deadline
of 30 days** from creation (`privacy.data_request_sla_days`); the daily watch warns when one approaches it.

On `/admin/privacy/<id>`: assign, **verify identity** if the account has no verified email or phone (record how
you checked), **Start**, then **Queue export** (a private download the person gets by email, valid 7 days) or
**Queue erasure** (type `ERASE` to confirm), then **Complete** or **Reject** with a reason. Erasure anonymises
the account and deletes profile data but keeps what the law requires (invoices, placement and emigration
records, certificates, the grievance register, consent and audit logs) — the exceptions are written on the
request. Staff cannot process their own request, and staff accounts are not erased this way.

## 7. Requirements and the recruitment pipeline

- **Requirements** (`/admin/requirements`): manpower requests from the Employer Portal and the public form.
  Open one (`/admin/requirements/<id>`) to assign an owner, add a quotation, edit the lines (trade, count,
  salary), write internal notes. Approve it in the approval centre; then deliver role by role: link each line
  to a **job** and record how many are filled. Every status change notifies the employer.
- **Jobs** (`/admin/jobs`, `/admin/jobs/new`): review employer submissions, publish Venkat Sai-managed roles,
  keep listings current. Jobs past their deadline close automatically.
- **Candidates** (`/admin/candidates`): search every profile. Results are masked; revealing contact details or
  opening documents needs the permission and is logged with a reason. Candidate packs: `/admin/candidates/<id>/pack`.
- **Pipeline** (`/admin/pipeline`): every application across jobs and requirements. Move stages one by one or in
  bulk, share Venkat Sai-managed applications with the employer, export the list (`/admin/pipeline/export`,
  `?job=` for one job). Stage names come from the workflow at `/admin/settings/workflows`.
- **Interviews** (`/admin/interviews`, `/admin/interviews/new`): scheduled by employers or by Venkat Sai on their
  behalf; reminders go out automatically.
- **Assessment centre** (`/admin/assessments`): Venkat Sai trade, practical and theory assessments with their
  procedure reference — results are Venkat Sai assessments, never accredited certifications.
- **Mobilisation** (`/admin/mobilisation`, `/admin/mobilisation/<id>`): overseas joining after selection —
  checklist and secure documents, visa, medical, emigration clearance, **PDOT (Pre-Departure Orientation
  Training)**, travel and arrival, coordinator, instructions and notes.
- **Partner assignments** (`/admin/partners`, `/admin/partners/new`): which recruitment partners work which
  requirements and jobs, their submissions (`/admin/partners/submissions`, export), agreements, performance.
  Partners only see their own assignments and never Venkat Sai's commercial terms with employers.

## 8. Employers, partners and institutions

`/admin/organizations?type=employer`, `?type=recruitment_partner`, `?type=institution` list every organisation;
`/admin/organizations/<id>` shows its profile, members, documents, verification history and account manager.

**Verification:** an organisation completes its profile and uploads documents in its portal, then submits
verification; it arrives in the approval centre. Before approving, open the organisation, review each document
(mark it reviewed or rejected with a note) and, for partners, **verify the Recruiting Agent licence** (number,
expiry). Approve only what you have checked. Verified organisations get the "verified" mark and full portal
features; verifications and licences expire on their dates and the daily task warns before.

Other actions on the organisation page: **assign an account manager** (the staff member the organisation
hears from), **suspend** / **reactivate** (suspended organisations cannot post or submit), **expire** a
verification or licence, change a member's status. Users across all portals: `/admin/users`,
`/admin/users/<id>` (staff roles, status, sessions, two-factor reset; "Create staff user" on the list for new staff).

**Training oversight** (`/admin/training`): every course (`/admin/training/courses`), batch
(`/admin/training/batches`, with an Excel export per batch), enrolment and certificate
(`/admin/training/certificates` — revoking a certificate marks the linked credential rejected and notifies the
holder) across institutions (`/admin/training/institutions`), plus Venkat Sai's own training.

## 9. Website content (CMS)

`/admin/content` lists the collections. Each entry is edited at `/admin/content/<collection>/<id>`; changes are
**drafts** until published, every save keeps a version, and you can compare or roll back versions.

- **Pages, services, industries, destinations, FAQs, news, blog posts, events, success stories, team members,
  gallery albums, videos, legal pages** — collections with their own fields. "Required" fields are required to
  **publish**, not to save a draft.
- **Singletons** (one entry each): **Site settings** (contact details, phones, email, **WhatsApp number**,
  **WhatsApp group link** — the "Join our WhatsApp group" buttons disappear when it is empty — address and map,
  social links, **grievance officer**, legal entity, footer text), **Homepage**, **Navigation**, **About**
  (facts, registrations such as GSTIN — only numbers you have verified).
- **Preview** before publishing: "Create preview link" gives a private link (default 60 minutes) that shows the
  draft on the real page with a preview ribbon.
- **Schedule** a publish or an unpublish date; the 5-minute task does the rest.
- **Testimonials and success stories** need recorded consent (date + evidence) and always go through the
  approval centre. **Client logos** need an approved logo permission (`/admin/content/logo-permissions`).
- **Media library** (`/admin/media`, `/admin/media/<id>`): upload images, PDFs and video links (YouTube/Vimeo).
  Every image needs alt text. Items that **show people start internal** and can only be made public after
  consent is recorded and a second person approves. Withdrawn consent takes the item offline everywhere at once.
- **Public statistics** (`/admin/public-metrics`): the website shows only **live counters** computed from real
  data or **manual figures that a second person approved** with evidence. Hidden figures never show. There is
  no way to publish an unapproved number.
- **Announcements** (`/admin/announcements`, `/admin/announcements/new`): banners and notices for the website and
  portals with audience, placement, start and end; they end automatically. Partners' announcements come through
  approval.
- **Search** on the website only finds published content.

Improved default copy shipped with new versions is applied by an engineer with `npm run content:refresh`; it
never overwrites anything staff edited.

## 10. Leads and enquiries (`/admin/leads`)

Business prospects (employers, partners, institutions) and every message from the website contact form
(`/admin/leads/enquiries`, `/admin/leads/enquiries/<id>`). Assign, respond, mark spam, convert an enquiry into
a support ticket or a lead, record follow-ups with a next date — reminders go out automatically. Grievance
enquiries become grievance tickets immediately.

## 11. Commercial (`/admin/commercial`)

Amounts are always shown per currency and never added across currencies. Candidates are never charged for jobs.

- **Plans** (`/admin/commercial/plans`, `/new`, `/<id>`): employer, partner and institution plans with prices per
  currency and interval and limits per feature (job posts, team seats, candidate unlocks, …). Prices are data —
  nothing is hard-coded. Limits are only enforced when `commercial.enforce_limits` is on in `/admin/settings`.
- **Subscriptions** (`/admin/commercial/subscriptions`): each organisation's plan, period and renewal; staff can
  start one by hand (`/new`) and request exceptions (extend trial/period, reactivate) through approval.
- **Invoices** (`/admin/commercial/invoices`, `/new`, `/<id>`): draft → **issue** → paid. A **GST number** is
  assigned only at issue (`VSG/2627/000123`, consecutive per financial year); issued invoices are never edited —
  void and re-issue instead. Tax is automatic: no GST while the seller has no GSTIN ("Invoice" rather than "Tax
  invoice"); CGST+SGST within Andhra Pradesh, IGST for other states, zero-rated export for foreign buyers unless
  switched off. Due in 15 days by default. The printable document is at `/billing/invoices/<id>` ("Print or save
  as PDF").
- **Worker invoices** (`/admin/commercial/worker-invoices`, `/new`, `/<id>`): bill a travel agency or company for
  the workers we supplied, one line per worker ("Recruitment service charge - Name (Trade)"). Workers are never
  invoiced. On a phone:
  1. **New worker invoice** → choose who pays (search the name). `/new?org=<id>` opens it for one organisation,
     `/new?cv=<CV id>` ticks one worker (and picks the organisation the worker is marked as supplied to).
  2. Tick the workers. Only workers at **Selected, Medical, Visa, Ticket or Departed** appear; search by name,
     reference or the last 4 digits of the passport, filter by requirement or "only workers supplied to them".
  3. Enter the **amount per worker** once (it fills every ticked worker; change one line if it differs) and check the
     **currency** — it comes from the organisation's billing details; if they have none, choose it.
  4. **Issue invoice** (GST number, tax worked out automatically, the organisation is notified) or **Save draft**.
  If the organisation has no billing details yet, the page shows the form to add them; until then only a draft can
  be saved (the **Issue invoice** button appears once they are added). Missing GSTIN or address in **Seller
  details** is shown as a note. A worker already on a (draft or issued) invoice for the same organisation cannot be ticked again —
  void that invoice first if it was wrong. Saving the invoice marks the workers as supplied to that organisation.
  Open an invoice for **Download PDF** and **WhatsApp** (message to the organisation's number with the amount and
  where to download it); payments and voiding stay on **Payments and full record**. Organisations see these
  invoices with a PDF button under Billing (`/agency/billing` or `/employer/billing`).
- **Payments** (`/admin/commercial/payments`, `/new`): record bank transfers (UTR), UPI references, cheques and
  cash against invoices; online payments appear here automatically.
- **Refunds** (`/admin/commercial/refunds`): request a refund from a payment; a second person approves; a **credit
  note** with its own series (`VSGC/2627/000045`) is issued when it completes. Manual refunds need the reference
  and date.
- **Credit notes** are listed with invoices (document type filter). **Disputes** (`/admin/commercial/disputes`)
  record billing queries and chargebacks. **Coupons** (`/admin/commercial/coupons`).
- **Settlements** (`/admin/commercial/settlements`): placement fees owed to recruitment partners per period and
  currency, approved before they are paid.
- **Seller details** (`/admin/commercial/seller`): the legal name, address, GST state code (37) and **GSTIN**
  printed on invoices, plus bank/UPI instructions shown on unpaid invoices. Fill the GSTIN only when registered.
- **Tax rates** (`/admin/commercial/tax-rates`): the seeded India GST rows for services under **SAC 9985**
  (CGST 9 %, SGST 9 %, IGST 18 %) are marked "to be confirmed by finance" — open each and **Confirm** after your
  accountant agrees; add VAT/sales tax rows for other countries only when needed.

## 12. Notifications (`/admin/notifications`)

`/admin/notifications/templates` — the wording of every message by event, channel and language; preview with
sample data; versions are kept. `/admin/notifications/deliveries` — what was sent, to whom (masked), with status;
search an exact address to find a message. The dev outbox (`/admin/system/dev-outbox`) holds messages only
while email is in development mode.

## 13. Analytics (`/admin/analytics`)

Traffic, pages, sources, funnels, sessions, heatmaps and real-time views — only from visitors who **consented**
to analytics (`/cookie-preferences`). `/admin/analytics/settings` sets retention and which optional services may
load (Microsoft Clarity, GA4; both off by default and only with explicit consent). Exports at
`/admin/analytics/exports`.

## 14. Settings (`/admin/settings`)

Platform settings by group — Security, Privacy, Analytics, Commercial, Organisations, Recruitment, Platform,
Notifications (business inbox email), Resume service, Support (SLA hours). Changes apply immediately and are
audited. Security and Notifications need the Super Admin (`settings.security`): the business inbox receives every
new CV and, when no backup address is set, the daily backup of all business data.

- `/admin/settings/modules` — **feature flags**: switch portals, sign-in methods (Google, phone OTP, email OTP),
  services (internships, freelance, training, career services, the resume service and its online payment),
  employer self-serve jobs, subscriptions, online payments, email/SMS/WhatsApp notifications, analytics
  options, blog, events, gallery on or off without a code change.
- `/admin/settings/security` — require two-factor for staff, password length, lock-out; lists staff without 2FA.
- `/admin/settings/roles`, `/admin/settings/roles/<id>` — staff roles and the role templates every organisation
  starts with; choose permissions per role.
- `/admin/settings/integrations` — which external services are configured (values are never shown) and the test
  e-mail button.
- `/admin/settings/taxonomies` — trades/job categories, skills, industries, countries, destination flags,
  languages, education levels; records are deactivated, never deleted. Exports per list.
- `/admin/settings/workflows` — application stages.
- `/admin/audit` (every action), `/admin/audit/data-access` (every reveal, download, export or share of personal
  data, with the reason), `/admin/audit/security` (lock-outs, quarantined files), `/admin/audit/export`.
- `/admin/system`, `/admin/system/tasks` — health and the background queue (see `OPERATIONS.md` §4).
- `/admin/system/backup` — the daily backup email and **Download full backup** (§14a, Super Admin only).

## 14a. Backup (`/admin/system/backup`, Super Admin only)

One Excel file with everything: CVs and applicants (S.No, Name, Trade, Passport No, Exp Abroad, Exp India, Email,
Phone, Applied for, Status, Source, Applied on, Preferred country, Passport expiry, notes, Code), requirement posters
with how many applied, job applications, manpower requests, booking dates and bookings, referrers and rewards paid,
worker reviews, leads, enquiries, companies and travel agencies, and resume requests. One sheet each, newest first.
Menu: **Administration → Backup**. Needs the "Configure security policies" permission (only the Super Admin role by
default); the Administrator role cannot open it.

1. **Download now:** tap **Download full backup (Excel)**. It takes a few seconds. Full passport numbers are in it
   only if you may see them; every download is recorded in `/admin/audit/data-access`.
2. **Daily backup email** (on by default): every morning the same file is emailed to the business inbox, with
   passport numbers cut to the last 4 digits. To send it somewhere else, type the address under **Send it to** and
   tap **Save**; leave it blank for the business inbox. Untick **Email a backup every day** to stop it.
3. **Check it works:** tap **Email a backup now**. If the page shows "The last backup email did not go out", the
   email settings need fixing (usually the Gmail app password, `OPERATIONS.md` §5.1); until real email is set up
   the page says "Backup emails are not sent yet".
4. **Recent backups** lists the last emails, failures and downloads.

Keep the backup emails in a private folder or label and move the files to a private Drive folder. Never forward a
backup or share it on WhatsApp: it has workers' names and phone numbers.

## 15. Roles, exports and who can see what

Staff roles (default set; edit at `/admin/settings/roles`):

| Role | Typical person | Can |
|---|---|---|
| Super Admin | Owner, lead engineer | Everything, including roles and security policy |
| Administrator | Office manager | Everything except changing roles and the security policy |
| Operations Manager | Recruitment lead | Organisations and verification, jobs, requirements, candidates (contact **and** documents, so full passport numbers), pipeline, interviews, assessments, mobilisation, partners, leads, CVs, resume requests, approvals |
| Venkat Sai Recruiter | Recruiter | Jobs (view), candidates and CVs with contact reveals (**not** documents or full passport numbers), pipeline, assessments, mobilisation, requirements (view), resume requests — no settings, no billing |
| Content Manager | Website person | Content, media, posters, announcements, public statistics, content approvals |
| Finance | Accountant | Plans, invoices, payments, refunds, settlements, reports, refund approvals |
| Support Agent | Helpdesk | Support desk (not the grievance register), users and organisations (view), delivery logs |
| Compliance & Grievance Officer | Grievance officer | Grievance register, privacy requests and consents, verification oversight, audit logs |

**Contact details and documents.** Lists are masked. Revealing a phone or email needs `candidates.view_contact`;
opening documents, CV files and **full passport numbers** needs `candidates.view_documents`. Every reveal,
download, export and share is written to `/admin/audit/data-access` with who, what and why. Reveal only when you
are about to act on it.

**Excel exports** (all logged, 5,000 rows maximum, same masking as the screen):
`/admin/cv-submissions/export`, `/admin/candidates/export`, `/admin/pipeline/export` (`?job=` per job),
`/admin/resume-requests/export`, `/admin/partners/submissions/export`, `/admin/training/batches/<id>/export`,
`/admin/analytics/exports`, `/admin/audit/export`, taxonomy exports at `/admin/settings/taxonomies/<kind>/export`.
The full backup (`/admin/system/backup/download`, Super Admin, every area, 20,000 rows per sheet) is logged the same
way. Employers only get aggregate reports. Keep exported files on the office computer, delete them when done, never
forward them on WhatsApp.

## 16. Never do this

- **Never charge a candidate for a job, an application, a placement or an "interview fee".** The only paid
  candidate service is resume preparation, and it is never a condition of anything. Overseas recruitment law and
  the platform's terms both forbid it.
- **Never publish a figure that is not approved** — no "10,000 placements" in a poster, page or post unless it is
  a live counter or an approved manual metric with evidence. No invented testimonials, logos or partnerships.
- **Never tell an employer which partner sourced a candidate**, and never share Venkat Sai's commercial terms with
  partners. The platform hides both; do not undo that on the phone.
- **Never share a candidate's contact details, passport number or documents outside the platform without a
  logged reason** — reveal in the Command Centre (which logs it), use the WhatsApp/Call buttons, and send
  documents to employers through the pipeline share or the packs, not as loose forwards.
- **Never publish a photo showing a person without recorded consent** (media library) — posters with faces go
  through the media library, not the quick poster page.
- **Never edit an issued invoice** — void and re-issue. Never enter a GSTIN or registration you have not verified.
- **Never bypass the approval centre** for verifications, testimonials or refunds by asking someone to approve
  without reading the snapshot.
- **Never run database or seed commands against the live database** unless you are the engineer following
  `OPERATIONS.md` §3.
- **Never share your sign-in or the two-factor codes**, and never switch off "Require two-factor for staff".
