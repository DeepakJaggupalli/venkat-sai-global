# Documents module (`src/modules/documents`)

Certificates and letters for trainees and interns: course completion certificates, internship offer letters,
internship certificates and letters of recommendation (LOR). Tables: `internship_participants`, `issued_documents`
(see `src/db/schema/issued-documents.ts`).

| File | What it holds |
|---|---|
| `content.ts` | client-safe kinds, labels, the editable content schema and the default (pronoun-free) wording |
| `render-pdf.ts` | PDF with pdf-lib: framed landscape certificate or portrait letterhead, QR code to the check page, "DRAFT" mark until approved |
| `service.ts` | automatic creation (`ensureAutoDocuments`), staff edit / approve / reject / revoke, interns, People Portal list and requests, public lookup |
| `intern-lines.ts` | parse pasted intern lines (name, phone, email, college) |
| `tasks.ts` | `documents.auto_create` (daily) |

Flow: a finished Venkat Sai course (passed, or no assessed result) gives a course certificate; an intern who starts
gives an offer letter; an intern who finishes gives a certificate and an LOR. Each waits for approval by staff with
`training.certificates` at `/admin/documents` (interns at `/admin/documents/internships`). Approved documents are
downloaded at `/verify-certificate/<code>/pdf` (12-character random code, rate-limited) and appear on the same public
check page as platform certificates. People with an account see them at `/talent/certificates` and can request
missing ones. The PDF is rendered on demand from the stored wording, so edits never leave stale files.
